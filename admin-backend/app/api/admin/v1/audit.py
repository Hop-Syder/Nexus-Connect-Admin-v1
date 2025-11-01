from fastapi import APIRouter, HTTPException, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import logging
import csv
import io
import hashlib
import json

from app.middleware.jwt_auth import get_current_admin_user
from app.middleware.rbac import require_permission
from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audit")

# ===================================
# CONSTANTES & HELPERS
# ===================================

DEFAULT_LIMIT = 100
MAX_LIMIT = 500


def _normalize_list_param(value: Optional[List[str]]) -> Optional[List[str]]:
    """Handle list query params coming as comma-separated strings."""
    if not value:
        return None
    normalized: List[str] = []
    for item in value:
        if not item:
            continue
        if isinstance(item, str) and "," in item:
            normalized.extend([sub.strip() for sub in item.split(",") if sub.strip()])
        else:
            normalized.append(item.strip() if isinstance(item, str) else item)
    return normalized or None


def _apply_filters(
    query,
    *,
    severities: Optional[List[str]],
    event_types: Optional[List[str]],
    actor: Optional[str],
    search: Optional[str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Any:
    """Apply shared filters to a Supabase/Postgrest query."""
    if severities:
        query = query.in_("severity", severities)
    if event_types:
        query = query.in_("event_type", event_types)
    if actor:
        # Apply filter on admin or user id
        actor_value = actor.strip()
        query = query.or_(
            ",".join(
                [
                    f"admin_id.eq.{actor_value}",
                    f"user_id.eq.{actor_value}",
                ]
            )
        )
    if start_date:
        query = query.gte("created_at", start_date.isoformat())
    if end_date:
        query = query.lte("created_at", end_date.isoformat())

    if search:
        term = search.strip()
        if term:
            pattern = f"%{term.replace(' ', '%')}%"
            query = query.or_(
                ",".join(
                    [
                        f"event_type.ilike.{pattern}",
                        f"metadata::text.ilike.{pattern}",
                        f"changes::text.ilike.{pattern}",
                        f"endpoint.ilike.{pattern}",
                        f"ip_address.ilike.{pattern}",
                    ]
                )
            )
    return query


def _compute_log_hash(log: Dict[str, Any]) -> Optional[str]:
    """Recompute the integrity hash from a log record."""
    if not log:
        return None
    payload = {
        key: value
        for key, value in log.items()
        if key not in {"id", "created_at", "log_hash", "integrity_chain"}
    }

    def _serializer(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return str(obj)

    try:
        serialized = json.dumps(payload, sort_keys=True, default=_serializer)
    except Exception:
        serialized = json.dumps(
            json.loads(json.dumps(payload, default=str)), sort_keys=True
        )
    return hashlib.sha256(serialized.encode()).hexdigest()


def _format_log(log: Dict[str, Any]) -> Dict[str, Any]:
    """Attach verification metadata to a raw log item."""
    if not log:
        return log
    stored_hash = log.get("log_hash")
    computed_hash = _compute_log_hash(log)
    verified = bool(stored_hash and computed_hash and stored_hash == computed_hash)
    return {
        **log,
        "hash_valid": verified,
        "computed_hash": computed_hash,
    }


def _fetch_summary(
    supabase,
    *,
    severities: Optional[List[str]],
    event_types: Optional[List[str]],
    actor: Optional[str],
    search: Optional[str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
) -> Dict[str, Any]:
    """Return severity distribution and last critical event timestamp."""
    summary: Dict[str, Any] = {"by_severity": {}, "last_critical_at": None}
    try:
        base_query = supabase.table("admin.audit_logs").select(
            "severity, count:id", count="exact", group="severity"
        )
        base_query = _apply_filters(
            base_query,
            severities=severities,
            event_types=event_types,
            actor=actor,
            search=search,
            start_date=start_date,
            end_date=end_date,
        )
        groups = base_query.execute()
        for row in groups.data or []:
            sev = row.get("severity")
            try:
                count_value = int(row.get("count") or 0)
            except (TypeError, ValueError):
                count_value = 0
            summary["by_severity"][sev] = count_value

        critical_query = supabase.table("admin.audit_logs").select("created_at").eq(
            "severity", "CRIT"
        )
        critical_query = _apply_filters(
            critical_query,
            severities=None,
            event_types=event_types,
            actor=actor,
            search=search,
            start_date=start_date,
            end_date=end_date,
        ).order("created_at", desc=True)
        critical_resp = critical_query.limit(1).execute()
        if critical_resp.data:
            summary["last_critical_at"] = critical_resp.data[0].get("created_at")
    except Exception as exc:
        logger.debug("Failed to build audit summary: %s", exc)
    return summary


def _parse_cursor(cursor: Optional[str]) -> Optional[str]:
    if not cursor:
        return None
    try:
        # Validate datetime format; Supabase expects ISO strings
        datetime.fromisoformat(cursor.replace("Z", "+00:00"))
        return cursor
    except ValueError:
        return None


# ===================================
# ENDPOINTS
# ===================================


@router.get("/logs")
@require_permission("audit:read")
async def get_audit_logs(
    request: Request,
    event_type: Optional[str] = Query(None),
    event_types: Optional[List[str]] = Query(None),
    severity: Optional[str] = Query(None),
    severities: Optional[List[str]] = Query(None),
    actor: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    admin_id: Optional[str] = Query(None),
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    limit: int = Query(DEFAULT_LIMIT, ge=10, le=MAX_LIMIT),
    cursor: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_admin_user),
):
    """Liste des logs d'audit avec filtres"""
    try:
        supabase = get_supabase_admin()

        # Normalize list parameters (support both singular + array forms)
        normalized_severities = _normalize_list_param(severities) or _normalize_list_param(
            [severity] if severity else None
        )
        normalized_event_types = _normalize_list_param(event_types) or _normalize_list_param(
            [event_type] if event_type else None
        )

        # Backwards compatibility with user_id/admin_id params
        actor_value = actor or admin_id or user_id

        query = supabase.table("admin.audit_logs").select("*")

        query = _apply_filters(
            query,
            severities=normalized_severities,
            event_types=normalized_event_types,
            actor=actor_value,
            search=search,
            start_date=start_date,
            end_date=end_date,
        )

        cursor_value = _parse_cursor(cursor)
        query = query.order("created_at", desc=True).limit(limit)
        if cursor_value:
            query = query.lt("created_at", cursor_value)

        result = query.execute()

        records = [_format_log(item) for item in result.data or []]

        summary = _fetch_summary(
            supabase,
            severities=normalized_severities,
            event_types=normalized_event_types,
            actor=actor_value,
            search=search,
            start_date=start_date,
            end_date=end_date,
        )

        next_cursor = None
        if records and len(records) == limit:
            next_cursor = records[-1].get("created_at")

        return {
            "data": records,
            "next_cursor": next_cursor,
            "summary": summary,
        }

    except Exception as e:
        logger.error(f"Get audit logs error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get audit logs"
        )

@router.get("/logs/{log_id}")
@require_permission("audit:read")
async def get_audit_log(
    log_id: str,
    request: Request,
    current_user: dict = Depends(get_current_admin_user)
):
    """Détails d'un log d'audit"""
    try:
        supabase = get_supabase_admin()

        result = (
            supabase.table("admin.audit_logs")
            .select("*")
            .eq("id", log_id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Audit log not found")

        return _format_log(result.data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get audit log error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get audit log"
        )

@router.get("/export")
@require_permission("audit:export")
async def export_audit_logs(
    request: Request,
    start_date: Optional[datetime] = Query(None),
    end_date: Optional[datetime] = Query(None),
    severity: Optional[str] = Query(None),
    severities: Optional[List[str]] = Query(None),
    event_type: Optional[str] = Query(None),
    event_types: Optional[List[str]] = Query(None),
    actor: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_admin_user)
):
    """Exporter les logs d'audit (CSV signé)"""
    try:
        supabase = get_supabase_admin()

        normalized_severities = _normalize_list_param(severities) or _normalize_list_param(
            [severity] if severity else None
        )
        normalized_event_types = _normalize_list_param(event_types) or _normalize_list_param(
            [event_type] if event_type else None
        )

        query = supabase.table("admin.audit_logs").select("*")
        query = _apply_filters(
            query,
            severities=normalized_severities,
            event_types=normalized_event_types,
            actor=actor,
            search=search,
            start_date=start_date,
            end_date=end_date,
        ).order("created_at", desc=True)

        result = query.execute()

        # Créer CSV
        output = io.StringIO()
        if result.data:
            # Flatten metadata/changes for CSV
            flat_data = []
            for item in result.data:
                flat_item = {k: v for k, v in item.items() if k not in ['metadata', 'changes']}
                flat_item['metadata'] = json.dumps(item.get('metadata'))
                flat_item['changes'] = json.dumps(item.get('changes'))
                flat_data.append(flat_item)

            writer = csv.DictWriter(output, fieldnames=flat_data[0].keys())
            writer.writeheader()
            writer.writerows(flat_data)

        csv_content = output.getvalue()

        # Générer signature (hash)
        export_hash = hashlib.sha256(csv_content.encode()).hexdigest()

        # Ajouter signature au début du fichier
        signed_content = f"# Export Hash: {export_hash}\n" + csv_content

        # Audit de l'export (avec hash calculé)
        export_event = {
            "event_type": "audit.exported",
            "severity": "CRIT",
            "admin_id": current_user.get("user_id"),
            "metadata": {
                "count": len(result.data),
                "export_hash": export_hash,
                "start_date": start_date.isoformat() if start_date else None,
                "end_date": end_date.isoformat() if end_date else None,
                "filters": {
                    "severities": normalized_severities,
                    "event_types": normalized_event_types,
                    "actor": actor,
                    "search": search,
                },
            },
        }
        export_event["log_hash"] = _compute_log_hash(export_event)
        supabase.table("admin.audit_logs").insert(export_event).execute()

        filename = f"audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        return StreamingResponse(
            iter([signed_content]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )

    except Exception as e:
        logger.error(f"Export audit logs error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Audit export failed"
        )

@router.get("/stats")
@require_permission("audit:read")
async def get_audit_stats(
    period: str = Query('7d'),
    request: Request = None,
    current_user: dict = Depends(get_current_admin_user)
):
    """Statistiques des logs d'audit"""
    try:
        supabase = get_supabase_admin()

        # Période
        days_map = {'7d': 7, '30d': 30, '90d': 90}
        days = days_map.get(period, 7)
        start_date = datetime.utcnow() - timedelta(days=days)

        # Events critiques
        critical = (
            supabase.table("admin.audit_logs")
            .select("id", count="exact")
            .eq("severity", "CRIT")
            .gte("created_at", start_date.isoformat())
            .execute()
        )

        # Événements par type (groupés)
        event_counts_resp = (
            supabase.table("admin.audit_logs")
            .select("event_type, count:id", count="exact", group="event_type")
            .gte("created_at", start_date.isoformat())
            .execute()
        )
        event_counts = []
        for item in event_counts_resp.data or []:
            try:
                count_value = int(item.get("count") or 0)
            except (TypeError, ValueError):
                count_value = 0
            event_counts.append(
                {"event_type": item.get("event_type"), "count": count_value}
            )
        event_counts_sorted = sorted(
            event_counts, key=lambda item: item.get("count", 0), reverse=True
        )[:10]

        # Distribution par sévérité
        severity_counts_resp = (
            supabase.table("admin.audit_logs")
            .select("severity, count:id", count="exact", group="severity")
            .gte("created_at", start_date.isoformat())
            .execute()
        )
        severity_counts = {}
        for row in severity_counts_resp.data or []:
            try:
                count_value = int(row.get("count") or 0)
            except (TypeError, ValueError):
                count_value = 0
            severity_counts[row.get("severity")] = count_value

        return {
            "critical_events_count": critical.count or 0,
            "total_events": sum(item.get("count", 0) for item in event_counts),
            "top_event_types": event_counts_sorted,
            "severity_breakdown": severity_counts,
            "period_start": start_date.isoformat(),
            "period_end": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error(f"Get audit stats error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get audit stats"
        )

@router.get("/event-types")
@require_permission("audit:read")
async def get_event_types(
    request: Request,
    current_user: dict = Depends(get_current_admin_user)
):
    """Liste des types d'événements disponibles"""
    return [
        {'value': 'admin.login', 'label': 'Admin Login'},
        {'value': 'admin.logout', 'label': 'Admin Logout'},
        {'value': 'user.created', 'label': 'User Created'},
        {'value': 'user.updated', 'label': 'User Updated'},
        {'value': 'user.deleted', 'label': 'User Deleted'},
        {'value': 'user.blocked', 'label': 'User Blocked'},
        {'value': 'entrepreneur.approved', 'label': 'Entrepreneur Approved'},
        {'value': 'entrepreneur.rejected', 'label': 'Entrepreneur Rejected'},
        {'value': 'subscription.granted', 'label': 'Subscription Granted'},
        {'value': 'subscription.revoked', 'label': 'Subscription Revoked'},
        {'value': 'campaign.sent', 'label': 'Campaign Sent'},
        {'value': 'data.exported', 'label': 'Data Exported'},
        {'value': 'audit.exported', 'label': 'Audit Exported'},
        {'value': 'settings.updated', 'label': 'Settings Updated'},
        {'value': 'auth.failed', 'label': 'Auth Failed'},
        {'value': 'access.denied', 'label': 'Access Denied'},
    ]
