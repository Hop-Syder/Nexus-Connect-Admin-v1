from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import logging

from app.middleware.jwt_auth import get_current_user, get_current_admin_user
from app.middleware.rbac import require_permission
from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/entrepreneurs")

# =============================================================================
# Schemas
# =============================================================================


class ModerationDecisionRequest(BaseModel):
    decision: str  # 'approved', 'rejected', 'changes_requested'
    reason: Optional[str] = None
    macro_used: Optional[str] = None
    notes: Optional[str] = None


class ModerationAssignmentRequest(BaseModel):
    queue_id: Optional[str] = None
    entrepreneur_id: Optional[str] = None
    moderator_id: Optional[str] = None


class ModerationStatusUpdate(BaseModel):
    status: str  # pending, in_review, paused
    notes: Optional[str] = None


class ModerationMacroCreate(BaseModel):
    name: str
    description: Optional[str] = None
    decision: str
    template: str
    tags: Optional[List[str]] = None
    sla_minutes: Optional[int] = None


class ModerationMacroUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    decision: Optional[str] = None
    template: Optional[str] = None
    tags: Optional[List[str]] = None
    sla_minutes: Optional[int] = None


# =============================================================================
# Helpers
# =============================================================================


def _hydrate_queue_items(supabase, queue_rows: List[Dict[str, Any]]):
    """Attach entrepreneur and user context to queue rows."""
    if not queue_rows:
        return

    entrepreneur_ids = [row["entrepreneur_id"] for row in queue_rows]
    entrepreneurs_resp = (
        supabase.table("entrepreneurs")
        .select(
            "id, user_id, company_name, first_name, last_name, type, description, "
            "country_code, city, status, rejection_reason, tags, logo_url, created_at, updated_at"
        )
        .in_("id", entrepreneur_ids)
        .execute()
    )
    entrepreneur_map = {item["id"]: item for item in entrepreneurs_resp.data or []}

    user_ids = [
        ent["user_id"] for ent in (entrepreneur_map.values()) if ent.get("user_id")
    ]
    auth_map: Dict[str, Dict[str, Any]] = {}
    profile_map: Dict[str, Dict[str, Any]] = {}

    if user_ids:
        auth_resp = (
            supabase.table("auth.users")
            .select("id,email,last_sign_in_at")
            .in_("id", user_ids)
            .execute()
        )
        auth_map = {item["id"]: item for item in auth_resp.data or []}

        profile_resp = (
            supabase.table("user_profiles")
            .select("user_id, first_name, last_name, is_premium, has_profile")
            .in_("user_id", user_ids)
            .execute()
        )
        profile_map = {item["user_id"]: item for item in profile_resp.data or []}

    for row in queue_rows:
        entrepreneur = entrepreneur_map.get(row["entrepreneur_id"])
        row["entrepreneur"] = entrepreneur
        if entrepreneur:
            profile = profile_map.get(entrepreneur["user_id"])
            auth = auth_map.get(entrepreneur["user_id"])
            row["entrepreneur"]["profile"] = profile
            row["entrepreneur"]["auth"] = auth

        submitted_at = row.get("submitted_at")
        sla_deadline = row.get("sla_deadline")
        if submitted_at and sla_deadline:
            submitted_dt = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
            deadline_dt = datetime.fromisoformat(sla_deadline.replace("Z", "+00:00"))
            row["time_elapsed_minutes"] = max(
                0, int((datetime.utcnow() - submitted_dt).total_seconds() / 60)
            )
            row["time_remaining_minutes"] = int(
                (deadline_dt - datetime.utcnow()).total_seconds() / 60
            )
            row["is_overdue"] = row["time_remaining_minutes"] < 0
        else:
            row["time_elapsed_minutes"] = None
            row["time_remaining_minutes"] = None
            row["is_overdue"] = False


# =============================================================================
# Queue and stats
# =============================================================================


@router.get("/moderation-queue")
@require_permission("moderation:read")
async def get_moderation_queue(
    request: Request,
    search: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    priority: Optional[int] = Query(None),
    assigned_to: Optional[str] = Query(None),
    sla_breach: Optional[bool] = Query(None),
    country_code: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    """Return moderation queue with enriched entrepreneur data."""
    try:
        supabase = get_supabase_admin()
        query = (
            supabase.table("admin.moderation_queue")
            .select(
                "id, entrepreneur_id, status, assigned_to, priority, ai_score, ai_flags, "
                "submitted_at, sla_deadline, sla_breach, decision, decision_reason, decision_at, "
                "notes, created_at, updated_at"
            )
            .order("priority", desc=True)
            .order("submitted_at")
            .limit(limit)
        )

        if status_filter:
            query = query.eq("status", status_filter)
        if priority is not None:
            query = query.eq("priority", priority)
        if assigned_to:
            query = query.eq("assigned_to", assigned_to)
        if sla_breach is not None:
            query = query.eq("sla_breach", sla_breach)
        if country_code:
            query = query.eq("country_code", country_code.upper())

        result = query.execute()
        rows = result.data or []

        _hydrate_queue_items(supabase, rows)

        if search:
            needle = search.lower()
            filtered = []
            for row in rows:
                entrepreneur = row.get("entrepreneur") or {}
                company = (entrepreneur.get("company_name") or "").lower()
                city = (entrepreneur.get("city") or "").lower()
                email = (entrepreneur.get("auth", {}) or {}).get("email", "").lower()
                if needle in company or needle in city or needle in email:
                    filtered.append(row)
            rows = filtered
        if assigned_to == "__unassigned__":
            rows = [row for row in rows if not row.get("assigned_to")]

        meta = {
            "count": len(rows),
            "filters": {
                "search": search,
                "status": status_filter,
                "priority": priority,
                "assigned_to": assigned_to,
                "country_code": country_code,
                "sla_breach": sla_breach,
            },
        }
        return {"data": rows, "meta": meta}

    except Exception as e:
        logger.exception("Get moderation queue error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get moderation queue",
        )


@router.get("/moderation/stats")
@require_permission("moderation:read")
async def get_moderation_stats(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Return moderation KPIs (pending, SLA breaches, approval rates, etc.)."""
    try:
        supabase = get_supabase_admin()

        def count_by_status(status_value: str) -> int:
            resp = (
                supabase.table("admin.moderation_queue")
                .select("id", count="exact")
                .eq("status", status_value)
                .execute()
            )
            return resp.count or 0

        pending = count_by_status("pending")
        in_review = count_by_status("in_review")

        sla_resp = (
            supabase.table("admin.moderation_queue")
            .select("id", count="exact")
            .eq("sla_breach", True)
            .execute()
        )
        sla_breaches = sla_resp.count or 0

        today_iso = datetime.utcnow().date().isoformat()
        # counting today's approvals/rejections from audit logs
        approvals_today = (
            supabase.table("audit_logs")
            .select("id", count="exact")
            .eq("event_type", "entrepreneur.approved")
            .gte("created_at", today_iso)
            .execute()
        ).count or 0
        rejections_today = (
            supabase.table("audit_logs")
            .select("id", count="exact")
            .eq("event_type", "entrepreneur.rejected")
            .gte("created_at", today_iso)
            .execute()
        ).count or 0

        # average review duration for last 7 days
        seven_days_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()
        duration_result = (
            supabase.table("admin.moderation_queue")
            .select("submitted_at, decision_at")
            .neq("decision_at", None)
            .gte("decision_at", seven_days_ago)
            .execute()
        )
        durations = []
        for row in duration_result.data or []:
            submitted = row.get("submitted_at")
            decision_at = row.get("decision_at")
            if submitted and decision_at:
                submitted_dt = datetime.fromisoformat(submitted.replace("Z", "+00:00"))
                decision_dt = datetime.fromisoformat(decision_at.replace("Z", "+00:00"))
                durations.append((decision_dt - submitted_dt).total_seconds() / 60)

        avg_duration = round(sum(durations) / len(durations), 2) if durations else 0.0

        return {
            "pending_count": pending,
            "in_review_count": in_review,
            "sla_breaches": sla_breaches,
            "approved_today": approvals_today,
            "rejected_today": rejections_today,
            "average_review_time_minutes": avg_duration,
        }

    except Exception as e:
        logger.exception("Moderation stats error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to compute moderation stats",
        )


# =============================================================================
# Macros management
# =============================================================================


@router.get("/moderation/macros")
@require_permission("moderation:read")
async def list_moderation_macros(
    request: Request, current_user: dict = Depends(get_current_user)
):
    try:
        supabase = get_supabase_admin()
        resp = (
            supabase.table("admin.moderation_macros")
            .select("*")
            .order("updated_at", desc=True)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.exception("List macros error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list moderation macros",
        )


@router.post("/moderation/macros")
@require_permission("moderation:macros")
async def create_moderation_macro(
    request: Request,
    payload: ModerationMacroCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        supabase = get_supabase_admin()
        inserted = (
            supabase.table("admin.moderation_macros")
            .insert(
                {
                    "name": payload.name,
                    "description": payload.description,
                    "decision": payload.decision,
                    "template": payload.template,
                    "tags": payload.tags or [],
                    "sla_minutes": payload.sla_minutes,
                    "created_by": current_user["id"],
                }
            )
            .execute()
        )
        return inserted.data[0]
    except Exception as e:
        logger.exception("Create macro error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create moderation macro",
        )


@router.put("/moderation/macros/{macro_id}")
@require_permission("moderation:macros")
async def update_moderation_macro(
    request: Request,
    macro_id: str,
    payload: ModerationMacroUpdate,
    current_user: dict = Depends(get_current_user),
):
    try:
        supabase = get_supabase_admin()
        update_payload = payload.model_dump(exclude_none=True)
        updated = (
            supabase.table("admin.moderation_macros")
            .update(update_payload)
            .eq("id", macro_id)
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=404, detail="Macro not found")
        return updated.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Update macro error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update moderation macro",
        )


@router.delete("/moderation/macros/{macro_id}")
@require_permission("moderation:macros")
async def delete_moderation_macro(
    request: Request,
    macro_id: str,
    current_user: dict = Depends(get_current_user),
):
    try:
        supabase = get_supabase_admin()
        supabase.table("admin.moderation_macros").delete().eq("id", macro_id).execute()
        return {"message": "Macro deleted"}
    except Exception as e:
        logger.exception("Delete macro error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete moderation macro",
        )


# =============================================================================
# Assignments and workflow
# =============================================================================


@router.post("/moderation/assign")
@require_permission("moderation:assign")
async def assign_moderation_item(
    request: Request,
    payload: ModerationAssignmentRequest,
    current_user: dict = Depends(get_current_user),
):
    """Assign a queue entry to a moderator."""
    if not payload.moderator_id:
        raise HTTPException(status_code=400, detail="moderator_id is required")
    if not payload.queue_id and not payload.entrepreneur_id:
        raise HTTPException(
            status_code=400, detail="queue_id or entrepreneur_id is required"
        )

    try:
        supabase = get_supabase_admin()
        query = supabase.table("admin.moderation_queue")
        if payload.queue_id:
            query = query.eq("id", payload.queue_id)
        else:
            query = query.eq("entrepreneur_id", payload.entrepreneur_id)

        query.update(
            {
                "assigned_to": payload.moderator_id,
                "status": "in_review",
                "assigned_at": datetime.utcnow().isoformat(),
            }
        ).execute()

        supabase.table("audit_logs").insert(
            {
                "event_type": "moderation.assigned",
                "severity": "LOW",
                "admin_id": current_user["id"],
                "metadata": {
                    "queue_id": payload.queue_id,
                    "entrepreneur_id": payload.entrepreneur_id,
                    "assigned_to": payload.moderator_id,
                },
            }
        ).execute()

        return {"message": "Assignment updated"}

    except Exception as e:
        logger.exception("Assign moderation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to assign moderation item",
        )


@router.post("/moderation/{queue_id}/status")
@require_permission("moderation:write")
async def update_moderation_status(
    request: Request,
    queue_id: str,
    payload: ModerationStatusUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update the workflow status (pending, in_review, paused)."""
    try:
        supabase = get_supabase_admin()
        update_payload = {
            "status": payload.status,
            "notes": payload.notes,
            "updated_at": datetime.utcnow().isoformat(),
        }
        if payload.status == "in_review":
            update_payload["assigned_to"] = current_user["id"]

        updated = (
            supabase.table("admin.moderation_queue")
            .update(update_payload)
            .eq("id", queue_id)
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=404, detail="Queue item not found")

        return {"message": "Status updated"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Update moderation status error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update moderation status",
        )


# =============================================================================
# Moderation actions
# =============================================================================


@router.get("/entrepreneurs/{entrepreneur_id}")
@require_permission("moderation:read")
async def get_entrepreneur_for_moderation(
    request: Request,
    entrepreneur_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Return entrepreneur details along with moderation queue record."""
    try:
        supabase = get_supabase_admin()

        entrepreneur = (
            supabase.table("entrepreneurs")
            .select("*")
            .eq("id", entrepreneur_id)
            .single()
            .execute()
        )
        if not entrepreneur.data:
            raise HTTPException(status_code=404, detail="Entrepreneur not found")

        queue = (
            supabase.table("admin.moderation_queue")
            .select("*")
            .eq("entrepreneur_id", entrepreneur_id)
            .single()
            .execute()
        )

        user_profile = (
            supabase.table("user_profiles")
            .select("*")
            .eq("user_id", entrepreneur.data["user_id"])
            .single()
            .execute()
        )

        audits = (
            supabase.table("audit_logs")
            .select("*")
            .eq("user_id", entrepreneur.data["user_id"])
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )

        return {
            "entrepreneur": entrepreneur.data,
            "queue": queue.data if queue.data else None,
            "user_profile": user_profile.data if user_profile.data else None,
            "activity": audits.data or [],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Get entrepreneur moderation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load entrepreneur details",
        )


@router.post("/entrepreneurs/{entrepreneur_id}/moderate")
@require_permission("moderation:write")
async def moderate_entrepreneur(
    request: Request,
    entrepreneur_id: str,
    payload: ModerationDecisionRequest,
    current_user: dict = Depends(get_current_user),
    admin_profile: dict = Depends(get_current_admin_user),
):
    """Apply a moderation decision to an entrepreneur."""
    valid_decisions = {"approved", "rejected", "changes_requested"}
    if payload.decision not in valid_decisions:
        raise HTTPException(status_code=400, detail="Invalid decision")

    try:
        supabase = get_supabase_admin()

        entrepreneur_resp = (
            supabase.table("entrepreneurs")
            .select("*")
            .eq("id", entrepreneur_id)
            .single()
            .execute()
        )
        if not entrepreneur_resp.data:
            raise HTTPException(status_code=404, detail="Entrepreneur not found")

        entrepreneur = entrepreneur_resp.data
        user_id = entrepreneur["user_id"]

        status_map = {
            "approved": "published",
            "rejected": "rejected",
            "changes_requested": "draft",
        }

        entrepreneur_update = {
            "status": status_map[payload.decision],
            "rejection_reason": payload.reason if payload.decision == "rejected" else None,
            "published_at": datetime.utcnow().isoformat()
            if payload.decision == "approved"
            else None,
            "updated_at": datetime.utcnow().isoformat(),
        }

        supabase.table("entrepreneurs").update(entrepreneur_update).eq("id", entrepreneur_id).execute()

        queue_update = {
            "status": payload.decision,
            "decision": payload.decision,
            "decision_reason": payload.reason,
            "decision_by": current_user["id"],
            "decision_at": datetime.utcnow().isoformat(),
            "macro_used": payload.macro_used,
            "notes": payload.notes,
            "assigned_to": admin_profile.get("user_id"),
        }

        queue_resp = (
            supabase.table("admin.moderation_queue")
            .update(queue_update)
            .eq("entrepreneur_id", entrepreneur_id)
            .execute()
        )
        queue_item = queue_resp.data[0] if queue_resp.data else None

        supabase.table("audit_logs").insert(
            {
                "event_type": f"entrepreneur.{payload.decision}",
                "severity": "MED" if payload.decision != "rejected" else "HIGH",
                "user_id": user_id,
                "admin_id": current_user["id"],
                "metadata": {
                    "entrepreneur_id": entrepreneur_id,
                    "decision": payload.decision,
                    "reason": payload.reason,
                    "macro_used": payload.macro_used,
                },
            }
        ).execute()

        return {
            "message": f"Entrepreneur {payload.decision} successfully",
            "entrepreneur_status": entrepreneur_update["status"],
            "queue": queue_item,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Moderate entrepreneur error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Moderation failed",
        )
