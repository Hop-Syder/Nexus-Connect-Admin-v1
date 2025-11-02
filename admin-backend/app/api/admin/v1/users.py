from fastapi import APIRouter, HTTPException, Depends, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import logging
import csv
import io
from jose import jwt

from app.middleware.jwt_auth import get_current_user, get_current_admin_user
from app.middleware.rbac import require_permission
from app.services.supabase_client import get_supabase_admin
from app.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users")
settings = get_settings()

# ===================================
# SCHEMAS
# ===================================


class UserListResponse(BaseModel):
    data: List[Dict[str, Any]]
    total: int
    page: int
    limit: int
    next_cursor: Optional[str] = None
    summary: Optional[Dict[str, Any]] = None


class UserUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    is_blocked: Optional[bool] = None
    block_reason: Optional[str] = None
    subscription_tier: Optional[str] = None


class BulkActionRequest(BaseModel):
    user_ids: List[str]
    action: str  # 'block', 'unblock', 'tag', 'untag', 'segment_add', 'segment_remove'
    params: Optional[Dict[str, Any]] = None


class UserSegmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    filters: Dict[str, Any]
    is_shared: bool = False


class UserSegmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    is_shared: Optional[bool] = None


class ImpersonationRevokeRequest(BaseModel):
    session_id: Optional[str] = None


# ===================================
# HELPERS
# ===================================


def _sanitize_search_term(term: Optional[str]) -> Optional[str]:
    if not term:
        return None
    cleaned = term.replace(",", " ").strip()
    return cleaned or None


def _apply_user_filters(
    query,
    *,
    search: Optional[str],
    role: Optional[str],
    is_premium: Optional[bool],
    is_blocked: Optional[bool],
    country_code: Optional[str],
    has_profile: Optional[bool],
):
    """Apply common filters to a Supabase Postgrest query."""
    if role:
        query = query.eq("role", role)
    if is_premium is not None:
        query = query.eq("is_premium", is_premium)
    if is_blocked is not None:
        query = query.eq("is_blocked", is_blocked)
    if has_profile is not None:
        query = query.eq("has_profile", has_profile)
    if country_code:
        query = query.eq("country_code", country_code.upper())

    sanitized = _sanitize_search_term(search)
    if sanitized:
        pattern = f"%{sanitized}%"
        # Remove reserved characters for the OR clause
        safe_pattern = pattern.replace(" ", "%")
        query = query.or_(
            ",".join(
                [
                    f"first_name.ilike.{safe_pattern}",
                    f"last_name.ilike.{safe_pattern}",
                    f"email.ilike.{safe_pattern}",
                ]
            )
        )
    return query


def _attach_user_metadata(supabase, users: List[Dict[str, Any]]):
    """Enrich user list with emails, tags and segments."""
    if not users:
        return

    user_ids = [u.get("user_id") for u in users if u.get("user_id")]
    if not user_ids:
        return

    # Emails
    try:
        email_resp = (
            supabase.table("auth.users")
            .select("id,email")
            .in_("id", user_ids)
            .execute()
        )
        email_map = {item["id"]: item.get("email") for item in email_resp.data or []}
    except Exception:
        email_map = {}

    # Tags
    try:
        tags_resp = (
            supabase.table("admin.user_tags")
            .select("user_id,tag,color")
            .in_("user_id", user_ids)
            .execute()
        )
        tags_map: Dict[str, List[Dict[str, Any]]] = {}
        for item in tags_resp.data or []:
            tags_map.setdefault(item["user_id"], []).append(
                {"tag": item.get("tag"), "color": item.get("color")}
            )
    except Exception:
        tags_map = {}

    # Segments
    segments_map: Dict[str, List[Dict[str, Any]]] = {}
    try:
        membership_resp = (
            supabase.table("admin.user_segment_members")
            .select("user_id,segment_id")
            .in_("user_id", user_ids)
            .execute()
        )
        segment_ids = {row["segment_id"] for row in membership_resp.data or []}
        segment_meta = {}
        if segment_ids:
            segments_resp = (
                supabase.table("admin.user_segments")
                .select("id,name")
                .in_("id", list(segment_ids))
                .execute()
            )
            segment_meta = {seg["id"]: seg.get("name") for seg in segments_resp.data or []}

        for row in membership_resp.data or []:
            segments_map.setdefault(row["user_id"], []).append(
                {
                    "id": row["segment_id"],
                    "name": segment_meta.get(row["segment_id"]),
                }
            )
    except Exception:
        segments_map = {}

    for user in users:
        uid = user.get("user_id")
        if not uid:
            continue
        user["email"] = email_map.get(uid)
        user["tags"] = tags_map.get(uid, [])
        user["segments"] = segments_map.get(uid, [])


# ===================================
# ENDPOINTS
# ===================================


@router.get("", response_model=UserListResponse)
@require_permission("users:read")
async def list_users(
    request: Request,
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_premium: Optional[bool] = Query(None),
    is_blocked: Optional[bool] = Query(None),
    country_code: Optional[str] = Query(None),
    has_profile: Optional[bool] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    cursor: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Liste des utilisateurs avec filtres et pagination cursor."""
    try:
        supabase = get_supabase_admin()

        def base_query(columns: str, count: bool = False):
            return supabase.table("user_profiles").select(
                columns, count="exact" if count else None
            )

        # Main query
        query = base_query(
            "id, user_id, first_name, last_name, email, role, country_code, city, "
            "has_profile, is_premium, premium_until, subscription_tier, "
            "is_blocked, blocked_at, block_reason, last_login, login_count, "
            "created_at, updated_at"
        )
        query = _apply_user_filters(
            query,
            search=search,
            role=role,
            is_premium=is_premium,
            is_blocked=is_blocked,
            country_code=country_code,
            has_profile=has_profile,
        )

        if cursor:
            query = query.lt("created_at", cursor)

        query = query.order("created_at", desc=True).limit(limit)
        result = query.execute()
        data = result.data or []

        _attach_user_metadata(supabase, data)

        next_cursor = data[-1]["created_at"] if len(data) == limit else None

        # Counts for filtered results
        count_query = base_query("id", count=True)
        count_query = _apply_user_filters(
            count_query,
            search=search,
            role=role,
            is_premium=is_premium,
            is_blocked=is_blocked,
            country_code=country_code,
            has_profile=has_profile,
        )
        count_result = count_query.execute()
        total = count_result.count or 0

        # Global summary (non filtrée)
        try:
            overall_total = base_query("id", count=True).execute().count or 0
            premium_total = (
                base_query("id", count=True).eq("is_premium", True).execute().count or 0
            )
            blocked_total = (
                base_query("id", count=True).eq("is_blocked", True).execute().count or 0
            )
            profile_total = (
                base_query("id", count=True).eq("has_profile", True).execute().count or 0
            )
        except Exception:
            overall_total = premium_total = blocked_total = profile_total = 0

        summary = {
            "overall_total": overall_total,
            "filtered_total": total,
            "premium_total": premium_total,
            "blocked_total": blocked_total,
            "with_profile_total": profile_total,
        }

        return UserListResponse(
            data=data,
            total=total,
            page=1,
            limit=limit,
            next_cursor=next_cursor,
            summary=summary,
        )

    except Exception as e:
        logger.exception("List users error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list users",
        )


@router.get("/{user_id}")
@require_permission("users:read")
async def get_user(
    request: Request,
    user_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Détails complets d'un utilisateur."""
    try:
        supabase = get_supabase_admin()

        profile = (
            supabase.table("user_profiles").select("*").eq("user_id", user_id).single().execute()
        )
        if not profile.data:
            raise HTTPException(status_code=404, detail="User not found")

        # Auth user (email / status)
        auth_user = (
            supabase.table("auth.users")
            .select("id,email,last_sign_in_at")
            .eq("id", user_id)
            .single()
            .execute()
        )

        entrepreneur = (
            supabase.table("entrepreneurs").select("*").eq("user_id", user_id).execute()
        )

        subscription_history = (
            supabase.table("admin.subscription_history")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )

        tags = (
            supabase.table("admin.user_tags")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )

        custom_fields = (
            supabase.table("admin.user_custom_fields")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )

        memberships = (
            supabase.table("admin.user_segment_members")
            .select("segment_id")
            .eq("user_id", user_id)
            .execute()
        )
        segments = []
        segment_ids = [m["segment_id"] for m in memberships.data or []]
        if segment_ids:
            segments_resp = (
                supabase.table("admin.user_segments")
                .select("id,name,description")
                .in_("id", segment_ids)
                .execute()
            )
            segments = segments_resp.data or []

        audit_logs = (
            supabase.table("audit_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(25)
            .execute()
        )

        impersonation_sessions = (
            supabase.table("admin.impersonation_sessions")
            .select("*")
            .eq("target_user_id", user_id)
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )

        return {
            "profile": profile.data,
            "auth_user": auth_user.data if auth_user.data else None,
            "entrepreneur_profile": entrepreneur.data[0] if entrepreneur.data else None,
            "subscription_history": subscription_history.data or [],
            "tags": tags.data or [],
            "custom_fields": custom_fields.data or [],
            "segments": segments,
            "activity": audit_logs.data or [],
            "impersonation_sessions": impersonation_sessions.data or [],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Get user error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get user",
        )


@router.put("/{user_id}")
@require_permission("users:write")
async def update_user(
    request: Request,
    user_id: str,
    update_data: UserUpdateRequest,
    current_user: dict = Depends(get_current_user),
):
    """Mettre à jour un utilisateur."""
    try:
        supabase = get_supabase_admin()
        payload = update_data.model_dump(exclude_none=True)

        if update_data.is_blocked is not None:
            if update_data.is_blocked:
                payload.update(
                    {
                        "blocked_at": datetime.utcnow().isoformat(),
                        "blocked_by": current_user["id"],
                    }
                )
            else:
                payload.update(
                    {
                        "blocked_at": None,
                        "blocked_by": None,
                        "block_reason": None,
                    }
                )

        result = (
            supabase.table("user_profiles")
            .update(payload)
            .eq("user_id", user_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        supabase.table("audit_logs").insert(
            {
                "event_type": "user.blocked" if update_data.is_blocked else "user.updated",
                "severity": "HIGH" if update_data.is_blocked else "LOW",
                "user_id": user_id,
                "admin_id": current_user["id"],
                "metadata": payload,
            }
        ).execute()

        return result.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Update user error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update user",
        )


@router.delete("/{user_id}")
@require_permission("users:write")
async def delete_user(
    request: Request,
    user_id: str,
    hard_delete: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    """Supprimer un utilisateur (soft ou hard)."""
    try:
        supabase = get_supabase_admin()

        if hard_delete:
            supabase.table("user_profiles").delete().eq("user_id", user_id).execute()
        else:
            supabase.table("user_profiles").update(
                {
                    "first_name": "Deleted",
                    "last_name": "User",
                    "is_blocked": True,
                    "block_reason": "Account deleted",
                    "blocked_at": datetime.utcnow().isoformat(),
                    "blocked_by": current_user["id"],
                }
            ).eq("user_id", user_id).execute()

        supabase.table("audit_logs").insert(
            {
                "event_type": "user.deleted",
                "severity": "CRIT",
                "user_id": user_id,
                "admin_id": current_user["id"],
                "metadata": {"hard_delete": hard_delete},
            }
        ).execute()

        return {"message": "User deleted successfully"}

    except Exception as e:
        logger.exception("Delete user error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete user",
        )


@router.post("/bulk-action")
@require_permission("users:write")
async def bulk_action(
    request: Request,
    payload: BulkActionRequest,
    current_user: dict = Depends(get_current_user),
):
    """Actions groupées sur plusieurs utilisateurs."""
    try:
        supabase = get_supabase_admin()
        results = []

        if not payload.user_ids:
            raise HTTPException(status_code=400, detail="No users selected")

        for user_id in payload.user_ids:
            try:
                if payload.action == "block":
                    reason = payload.params.get("reason") if payload.params else None
                    supabase.table("user_profiles").update(
                        {
                            "is_blocked": True,
                            "blocked_at": datetime.utcnow().isoformat(),
                            "blocked_by": current_user["id"],
                            "block_reason": reason or "Bulk action",
                        }
                    ).eq("user_id", user_id).execute()

                elif payload.action == "unblock":
                    supabase.table("user_profiles").update(
                        {
                            "is_blocked": False,
                            "blocked_at": None,
                            "blocked_by": None,
                            "block_reason": None,
                        }
                    ).eq("user_id", user_id).execute()

                elif payload.action == "tag":
                    params = payload.params or {}
                    tag = params.get("tag")
                    if not tag:
                        raise ValueError("Tag is required")
                    color = params.get("color", "#3B82F6")
                    supabase.table("admin.user_tags").insert(
                        {
                            "user_id": user_id,
                            "tag": tag,
                            "color": color,
                            "added_by": current_user["id"],
                        }
                    ).execute()

                elif payload.action == "untag":
                    params = payload.params or {}
                    tag = params.get("tag")
                    if not tag:
                        raise ValueError("Tag is required")
                    supabase.table("admin.user_tags").delete().eq("user_id", user_id).eq(
                        "tag", tag
                    ).execute()

                elif payload.action == "segment_add":
                    params = payload.params or {}
                    segment_id = params.get("segment_id")
                    if not segment_id:
                        raise ValueError("segment_id is required")
                    supabase.table("admin.user_segment_members").upsert(
                        {
                            "user_id": user_id,
                            "segment_id": segment_id,
                            "added_by": current_user["id"],
                        }
                    ).execute()

                elif payload.action == "segment_remove":
                    params = payload.params or {}
                    segment_id = params.get("segment_id")
                    if not segment_id:
                        raise ValueError("segment_id is required")
                    supabase.table("admin.user_segment_members").delete().eq(
                        "user_id", user_id
                    ).eq("segment_id", segment_id).execute()

                else:
                    raise ValueError(f"Unsupported action: {payload.action}")

                results.append({"user_id": user_id, "success": True})

            except Exception as inner:
                logger.warning("Bulk action failed for %s: %s", user_id, inner)
                results.append({"user_id": user_id, "success": False, "error": str(inner)})

        supabase.table("audit_logs").insert(
            {
                "event_type": f"user.bulk_{payload.action}",
                "severity": "MED",
                "admin_id": current_user["id"],
                "metadata": {"count": len(payload.user_ids), "results": results},
            }
        ).execute()

        return {"results": results}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Bulk action error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Bulk action failed",
        )


@router.get("/export/csv")
@require_permission("users:export")
async def export_users_csv(
    request: Request,
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_premium: Optional[bool] = Query(None),
    is_blocked: Optional[bool] = Query(None),
    country_code: Optional[str] = Query(None),
    has_profile: Optional[bool] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Exporter les utilisateurs en CSV."""
    try:
        supabase = get_supabase_admin()

        query = supabase.table("user_profiles").select("*")
        query = _apply_user_filters(
            query,
            search=search,
            role=role,
            is_premium=is_premium,
            is_blocked=is_blocked,
            country_code=country_code,
            has_profile=has_profile,
        )

        result = query.execute()
        rows = result.data or []

        output = io.StringIO()
        if rows:
            writer = csv.DictWriter(output, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)

        supabase.table("audit_logs").insert(
            {
                "event_type": "data.exported",
                "severity": "HIGH",
                "admin_id": current_user["id"],
                "metadata": {"type": "users_csv", "count": len(rows)},
            }
        ).execute()

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=users_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
            },
        )

    except Exception as e:
        logger.exception("Export CSV error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Export failed",
        )


# Segments --------------------------------------------------------------------


@router.post("/segments")
@require_permission("users:segments")
async def create_segment(
    request: Request,
    segment: UserSegmentCreate,
    current_user: dict = Depends(get_current_user),
):
    """Créer un segment utilisateurs."""
    try:
        supabase = get_supabase_admin()
        inserted = (
            supabase.table("admin.user_segments")
            .insert(
                {
                    "name": segment.name,
                    "description": segment.description,
                    "filters": segment.filters,
                    "is_shared": segment.is_shared,
                    "created_by": current_user["id"],
                }
            )
            .execute()
        )
        return inserted.data[0]

    except Exception as e:
        logger.exception("Create segment error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create segment",
        )


@router.get("/segments")
@require_permission("users:segments")
async def list_segments(
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """Liste des segments disponibles."""
    try:
        supabase = get_supabase_admin()
        result = (
            supabase.table("admin.user_segments")
            .select("*")
            .or_(f"created_by.eq.{current_user['id']},is_shared.eq.true")
            .order("created_at", desc=True)
            .execute()
        )
        return result.data or []

    except Exception as e:
        logger.exception("List segments error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list segments",
        )


@router.put("/segments/{segment_id}")
@require_permission("users:segments")
async def update_segment(
    request: Request,
    segment_id: str,
    payload: UserSegmentUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Mettre à jour un segment."""
    try:
        supabase = get_supabase_admin()
        update_payload = payload.model_dump(exclude_none=True)

        updated = (
            supabase.table("admin.user_segments")
            .update(update_payload)
            .eq("id", segment_id)
            .execute()
        )

        if not updated.data:
            raise HTTPException(status_code=404, detail="Segment not found")

        return updated.data[0]

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Update segment error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update segment",
        )


@router.delete("/segments/{segment_id}")
@require_permission("users:segments")
async def delete_segment(
    request: Request,
    segment_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Supprimer un segment."""
    try:
        supabase = get_supabase_admin()
        supabase.table("admin.user_segments").delete().eq("id", segment_id).execute()
        supabase.table("admin.user_segment_members").delete().eq("segment_id", segment_id).execute()
        return {"message": "Segment deleted"}

    except Exception as e:
        logger.exception("Delete segment error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete segment",
        )


# Impersonation ---------------------------------------------------------------


@router.post("/{user_id}/impersonate")
@require_permission("users:impersonate")
async def start_impersonation(
    request: Request,
    user_id: str,
    current_user: dict = Depends(get_current_user),
    admin_profile: dict = Depends(get_current_admin_user),
):
    """Démarrer une session d'impersonation et retourner un token JWT."""
    try:
        if admin_profile.get("requires_2fa") and not admin_profile.get("mfa_verified"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="MFA verification required before impersonation",
            )

        supabase = get_supabase_admin()

        expires_at = datetime.utcnow() + timedelta(
            minutes=settings.IMPERSONATION_TOKEN_EXPIRE_MINUTES
        )

        token_payload = {
            "sub": user_id,
            "role": "authenticated",
            "aud": "authenticated",
            "exp": int(expires_at.timestamp()),
            "impersonated": True,
            "impersonated_by": current_user["id"],
        }

        token = jwt.encode(
            token_payload,
            settings.SUPABASE_JWT_SECRET,
            algorithm=settings.JWT_ALGORITHM,
        )

        session_insert = (
            supabase.table("admin.impersonation_sessions")
            .insert(
                {
                    "admin_id": current_user["id"],
                    "target_user_id": user_id,
                    "jwt_token": token,
                    "expires_at": expires_at.isoformat(),
                }
            )
            .execute()
        )
        session = session_insert.data[0] if session_insert.data else None

        supabase.table("audit_logs").insert(
            {
                "event_type": "user.impersonation_started",
                "severity": "HIGH",
                "user_id": user_id,
                "admin_id": current_user["id"],
                "metadata": {"expires_at": expires_at.isoformat()},
            }
        ).execute()

        return {
            "token": token,
            "expires_at": expires_at.isoformat(),
            "session": session,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Impersonation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start impersonation",
        )


@router.post("/{user_id}/impersonate/revoke")
@require_permission("users:impersonate")
async def revoke_impersonation(
    request: Request,
    user_id: str,
    body: ImpersonationRevokeRequest,
    current_user: dict = Depends(get_current_user),
):
    """Révoquer une session d'impersonation."""
    try:
        supabase = get_supabase_admin()
        update_payload = {
            "revoked_at": datetime.utcnow().isoformat(),
            "revoked_by": current_user["id"],
        }

        query = supabase.table("admin.impersonation_sessions").update(update_payload).eq(
            "target_user_id", user_id
        )
        if body.session_id:
            query = query.eq("id", body.session_id)

        query.execute()

        supabase.table("audit_logs").insert(
            {
                "event_type": "user.impersonation_revoked",
                "severity": "MED",
                "user_id": user_id,
                "admin_id": current_user["id"],
                "metadata": {"session_id": body.session_id},
            }
        ).execute()

        return {"message": "Impersonation revoked"}

    except Exception as e:
        logger.exception("Revoke impersonation error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke impersonation",
        )
