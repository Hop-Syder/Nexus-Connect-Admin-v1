from fastapi import APIRouter, HTTPException, Depends, Query, Request, status
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional, List
from datetime import datetime
import logging
import hashlib
import json
from urllib import request as http_request
from urllib.error import URLError, HTTPError

import redis

from app.config import get_settings
from app.middleware.jwt_auth import get_current_admin_user
from app.middleware.rbac import require_permission
from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings")
settings = get_settings()

MAINTENANCE_ENABLED_KEY = "system.maintenance.enabled"
MAINTENANCE_MESSAGE_KEY = "system.maintenance.message"
CATEGORY_LABELS = {
    "general": "Général",
    "email": "E-mail",
    "security": "Sécurité",
    "storage": "Stockage",
    "notifications": "Notifications",
    "maintenance": "Maintenance",
}


# ===================================
# SCHEMAS
# ===================================

class SettingUpdate(BaseModel):
    value: Any = Field(alias="setting_value")

    class Config:
        populate_by_name = True


class SystemSettingsUpdate(BaseModel):
    settings: Dict[str, Any]


class MaintenanceToggleRequest(BaseModel):
    enabled: bool
    message: Optional[str] = None


class BackupTriggerRequest(BaseModel):
    reason: Optional[str] = "manual"
    include_storage: bool = False


# ===================================
# HELPERS
# ===================================

def _parse_setting_value(setting: Dict[str, Any]) -> Any:
    value = setting.get("setting_value")
    setting_type = setting.get("setting_type") or "string"

    if value is None:
        return None

    try:
        if setting_type == "boolean":
            if isinstance(value, bool):
                return value
            return str(value).lower() in {"1", "true", "yes", "on"}
        if setting_type == "number":
            return float(value)
        if setting_type == "json":
            if isinstance(value, (dict, list)):
                return value
            return json.loads(value)
    except Exception:
        logger.debug("Failed to parse setting value for %s", setting.get("setting_key"))
    return value


def _serialize_setting_value(value: Any, setting_type: Optional[str]) -> str:
    if setting_type == "boolean":
        return "true" if (value in [True, "true", "1", 1]) else "false"
    if setting_type == "number":
        return str(value)
    if setting_type == "json":
        return json.dumps(value)
    return str(value)


def _format_setting(setting: Dict[str, Any]) -> Dict[str, Any]:
    parsed_value = _parse_setting_value(setting)
    formatted = {
        **setting,
        "parsed_value": parsed_value,
        "category": setting.get("category") or "general",
        "description": setting.get("description"),
        "is_required": bool(setting.get("is_required")),
        "updated_at": setting.get("updated_at"),
    }
    return formatted


def _group_settings(settings_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for row in settings_rows or []:
        formatted = _format_setting(row)
        category = formatted["category"]
        if category not in grouped:
            grouped[category] = {
                "id": category,
                "label": CATEGORY_LABELS.get(category, category.replace("_", " ").title()),
                "settings": [],
            }
        grouped[category]["settings"].append(formatted)

    for category in grouped.values():
        category["settings"].sort(key=lambda item: item.get("display_order", 999))
    return {
        "categories": list(grouped.values()),
        "total": len(settings_rows or []),
        "last_updated_at": max(
            (row.get("updated_at") for row in settings_rows or [] if row.get("updated_at")), default=None
        ),
    }


def _compute_audit_hash(payload: Dict[str, Any]) -> str:
    base = {k: v for k, v in payload.items() if k != "log_hash"}

    def _serializer(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        return str(obj)

    try:
        serialized = json.dumps(base, sort_keys=True, default=_serializer)
    except Exception:
        serialized = json.dumps(json.loads(json.dumps(base, default=str)), sort_keys=True)
    return hashlib.sha256(serialized.encode()).hexdigest()


def _insert_audit_log(supabase, *, admin_id: str, event_type: str, severity: str, metadata: Dict[str, Any]):
    payload = {
        "event_type": event_type,
        "severity": severity,
        "admin_id": admin_id,
        "metadata": metadata or {},
    }
    payload["log_hash"] = _compute_audit_hash(payload)
    supabase.table("audit_logs").insert(payload).execute()


def _check_external_endpoint(url: str, timeout: int = 5) -> str:
    if not url:
        return "unconfigured"
    try:
        with http_request.urlopen(url, timeout=timeout) as response:
            status_code = response.getcode()
            if 200 <= status_code < 400:
                return "healthy"
            return "degraded"
    except (HTTPError, URLError) as exc:
        logger.debug("External service check failed for %s: %s", url, exc)
        return "unhealthy"
    except Exception as exc:
        logger.debug("External service check unexpected error for %s: %s", url, exc)
        return "unknown"


# ===================================
# ENDPOINTS
# ===================================

@router.get("/")
@require_permission("settings:read")
async def get_all_settings(
    request: Request,
    category: Optional[str] = Query(None),
    current_admin: dict = Depends(get_current_admin_user),
):
    """Récupérer tous les paramètres système, regroupés par catégorie."""
    try:
        supabase = get_supabase_admin()

        query = supabase.table("admin.system_settings").select("*")

        if category:
            query = query.eq("category", category)

        result = query.order("category").order("setting_key").execute()
        return _group_settings(result.data or [])

    except Exception as exc:
        logger.error("Get settings error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get settings",
        )


@router.get("/{setting_key}")
@require_permission("settings:read")
async def get_setting(
    request: Request,
    setting_key: str,
    current_admin: dict = Depends(get_current_admin_user),
):
    """Récupérer un paramètre spécifique."""
    try:
        supabase = get_supabase_admin()

        result = (
            supabase.table("admin.system_settings")
            .select("*")
            .eq("setting_key", setting_key)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Setting not found")

        return _format_setting(result.data)

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Get setting error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get setting",
        )


@router.put("/{setting_key}")
@require_permission("settings:write")
async def update_setting(
    request: Request,
    setting_key: str,
    update: SettingUpdate,
    current_admin: dict = Depends(get_current_admin_user),
):
    """Mettre à jour un paramètre."""
    try:
        supabase = get_supabase_admin()

        existing = (
            supabase.table("admin.system_settings")
            .select("*")
            .eq("setting_key", setting_key)
            .single()
            .execute()
        )

        if not existing.data:
            raise HTTPException(status_code=404, detail="Setting not found")

        value_to_store = _serialize_setting_value(update.value, existing.data.get("setting_type"))

        update_payload = {
            "setting_value": value_to_store,
            "last_updated_by": current_admin.get("user_id"),
            "updated_at": datetime.utcnow().isoformat(),
        }

        result = (
            supabase.table("admin.system_settings")
            .update(update_payload)
            .eq("setting_key", setting_key)
            .execute()
        )

        _insert_audit_log(
            supabase,
            admin_id=current_admin.get("user_id"),
            event_type="settings.updated",
            severity="HIGH",
            metadata={
                "setting_key": setting_key,
                "old_value": existing.data.get("setting_value"),
                "new_value": value_to_store,
            },
        )

        return _format_setting(result.data[0]) if result.data else {"setting_key": setting_key}

    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Update setting error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update setting",
        )


@router.put("/bulk-update")
@require_permission("settings:write")
async def bulk_update_settings(
    request: Request,
    update: SystemSettingsUpdate,
    current_admin: dict = Depends(get_current_admin_user),
):
    """Mettre à jour plusieurs paramètres en une seule requête."""
    try:
        supabase = get_supabase_admin()

        results = []
        for key, value in update.settings.items():
            try:
                existing = (
                    supabase.table("admin.system_settings")
                    .select("*")
                    .eq("setting_key", key)
                    .single()
                    .execute()
                )

                if not existing.data:
                    results.append({"key": key, "success": False, "error": "Setting not found"})
                    continue

                serialized_value = _serialize_setting_value(value, existing.data.get("setting_type"))

                supabase.table("admin.system_settings").update({
                    "setting_value": serialized_value,
                    "last_updated_by": current_admin.get("user_id"),
                    "updated_at": datetime.utcnow().isoformat(),
                }).eq("setting_key", key).execute()

                results.append({"key": key, "success": True})
            except Exception as inner_exc:
                logger.warning("Bulk update for %s failed: %s", key, inner_exc)
                results.append({"key": key, "success": False, "error": str(inner_exc)})

        _insert_audit_log(
            supabase,
            admin_id=current_admin.get("user_id"),
            event_type="settings.bulk_updated",
            severity="HIGH",
            metadata={"count": len(update.settings), "results": results},
        )

        return {"results": results}

    except Exception as exc:
        logger.error("Bulk update settings error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to bulk update settings",
        )


@router.post("/maintenance/toggle")
@require_permission("settings:write")
async def toggle_maintenance_mode(
    request: Request,
    payload: MaintenanceToggleRequest,
    current_admin: dict = Depends(get_current_admin_user),
):
    """Activer ou désactiver le mode maintenance."""
    try:
        supabase = get_supabase_admin()
        now_iso = datetime.utcnow().isoformat()

        supabase.table("admin.system_settings").update({
            "setting_value": "true" if payload.enabled else "false",
            "last_updated_by": current_admin.get("user_id"),
            "updated_at": now_iso,
        }).eq("setting_key", MAINTENANCE_ENABLED_KEY).execute()

        if payload.message is not None:
            supabase.table("admin.system_settings").update({
                "setting_value": payload.message,
                "last_updated_by": current_admin.get("user_id"),
                "updated_at": now_iso,
            }).eq("setting_key", MAINTENANCE_MESSAGE_KEY).execute()

        _insert_audit_log(
            supabase,
            admin_id=current_admin.get("user_id"),
            event_type="settings.maintenance_toggled",
            severity="CRIT" if payload.enabled else "HIGH",
            metadata={
                "enabled": payload.enabled,
                "message": payload.message,
            },
        )

        return {"enabled": payload.enabled, "message": payload.message}

    except Exception as exc:
        logger.error("Toggle maintenance error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to toggle maintenance mode",
        )


@router.get("/health/check")
@require_permission("settings:read")
async def health_check(
    request: Request,
    current_admin: dict = Depends(get_current_admin_user),
):
    """Vérification de santé du système."""
    supabase = get_supabase_admin()
    checks = {}
    status_overall = "healthy"

    # Database check
    try:
        supabase.table("admin.system_settings").select("id", count="exact").limit(1).execute()
        checks["database"] = "healthy"
    except Exception as exc:
        logger.warning("Database health check failed: %s", exc)
        checks["database"] = "unhealthy"
        status_overall = "degraded"

    # Redis check
    try:
        redis_client = redis.from_url(settings.REDIS_URL)
        redis_client.ping()
        checks["redis"] = "healthy"
    except Exception as exc:
        logger.warning("Redis health check failed: %s", exc)
        checks["redis"] = "unhealthy"
        status_overall = "degraded"

    # Email (SendGrid) check
    if settings.SENDGRID_API_KEY:
        checks["email_service"] = "configured"
    else:
        checks["email_service"] = "unconfigured"
        status_overall = "degraded"

    # Payment service check (Moneroo)
    if settings.MONEROO_BASE_URL:
        checks["payment_service"] = _check_external_endpoint(settings.MONEROO_BASE_URL)
        if checks["payment_service"] != "healthy":
            status_overall = "degraded"
    else:
        checks["payment_service"] = "unconfigured"
        status_overall = "degraded"

    return {
        "status": status_overall,
        "checks": checks,
        "timestamp": datetime.utcnow().isoformat(),
    }


@router.post("/backup/trigger")
@require_permission("settings:write")
async def trigger_backup(
    request: Request,
    payload: BackupTriggerRequest,
    current_admin: dict = Depends(get_current_admin_user),
):
    """Déclencher une sauvegarde manuelle."""
    try:
        supabase = get_supabase_admin()

        job_payload = {
            "job_type": "backup",
            "status": "queued",
            "triggered_by": current_admin.get("user_id"),
            "triggered_at": datetime.utcnow().isoformat(),
            "parameters": {
                "include_storage": payload.include_storage,
            },
            "metadata": {
                "reason": payload.reason,
            },
        }

        job_response = supabase.table("admin.system_jobs").insert(job_payload).execute()
        job = job_response.data[0] if job_response.data else None

        _insert_audit_log(
            supabase,
            admin_id=current_admin.get("user_id"),
            event_type="backup.triggered",
            severity="HIGH",
            metadata={"job_id": job.get("id") if job else None, "reason": payload.reason},
        )

        return {
            "status": "queued",
            "job": job,
        }

    except Exception as exc:
        logger.error("Trigger backup error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to trigger backup",
        )


@router.get("/notifications")
@require_permission("settings:read")
async def get_notifications(
    request: Request,
    is_read: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_admin: dict = Depends(get_current_admin_user),
):
    """Récupérer les notifications système pour l'admin courant."""
    try:
        supabase = get_supabase_admin()

        query = (
            supabase.table("admin.notifications")
            .select("*")
            .eq("admin_id", current_admin.get("user_id"))
        )

        if is_read is not None:
            query = query.eq("is_read", is_read)

        result = query.order("created_at", desc=True).limit(limit).execute()
        return result.data or []

    except Exception as exc:
        logger.error("Get notifications error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get notifications",
        )


@router.put("/notifications/{notification_id}/read")
@require_permission("settings:write")
async def mark_notification_read(
    request: Request,
    notification_id: str,
    current_admin: dict = Depends(get_current_admin_user),
):
    """Marquer une notification comme lue."""
    try:
        supabase = get_supabase_admin()

        supabase.table("admin.notifications").update({
            "is_read": True,
            "read_at": datetime.utcnow().isoformat(),
        }).eq("id", notification_id).eq("admin_id", current_admin.get("user_id")).execute()

        return {"message": "Notification marked as read"}

    except Exception as exc:
        logger.error("Mark notification read error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to mark notification as read",
        )
