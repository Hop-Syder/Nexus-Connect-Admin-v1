from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Any
from datetime import datetime
import logging

from app.middleware.jwt_auth import get_current_user, get_current_admin_user
from app.middleware.rbac import require_permission
from app.services.supabase_client import get_supabase_admin
from app.services.email_service import send_bulk_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/campaigns")


# =============================================================================
# Schemas
# =============================================================================


class CampaignCreate(BaseModel):
    name: str
    subject: str
    content: str
    targeting_type: str = Field(..., pattern="^(all|segment|premium|country)$")
    targeting_filters: Optional[Dict[str, Any]] = None
    scheduled_for: Optional[datetime] = None
    template_id: Optional[str] = None


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
    targeting_type: Optional[str] = Field(None, pattern="^(all|segment|premium|country)$")
    targeting_filters: Optional[Dict[str, Any]] = None
    scheduled_for: Optional[datetime] = None
    template_id: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(draft|scheduled|sending|sent|failed)$")


class CampaignSendRequest(BaseModel):
    test_email: Optional[str] = None


class CampaignScheduleRequest(BaseModel):
    scheduled_for: datetime


class EmailTemplateCreate(BaseModel):
    name: str
    subject: str
    content: str
    description: Optional[str] = None
    category: Optional[str] = None


class EmailTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None


# =============================================================================
# Helper functions
# =============================================================================


def _apply_targeting_filters(query, targeting_type: str, filters: Optional[Dict[str, Any]]):
    if targeting_type == "premium":
        query = query.eq("is_premium", True)
    elif targeting_type == "country" and filters:
        country_code = filters.get("country_code")
        if country_code:
            query = query.eq("country_code", country_code)
    elif targeting_type == "segment" and filters:
        for key, value in filters.items():
            if value is None:
                continue
            query = query.eq(key, value)
    return query


def _calculate_recipient_count(targeting_type: str, filters: Optional[Dict[str, Any]]) -> int:
    try:
        supabase = get_supabase_admin()
        query = supabase.table("user_profiles").select("user_id", count="exact")
        query = _apply_targeting_filters(query, targeting_type, filters)
        result = query.execute()
        return result.count or 0
    except Exception as exc:
        logger.warning("Recipient count failed: %s", exc)
        return 0


def _fetch_recipients(targeting_type: str, filters: Optional[Dict[str, Any]]) -> List[Dict[str, str]]:
    try:
        supabase = get_supabase_admin()
        profiles_query = supabase.table("user_profiles").select(
            "user_id, first_name, last_name"
        )
        profiles_query = _apply_targeting_filters(profiles_query, targeting_type, filters)
        profiles = profiles_query.execute().data or []

        user_ids = [profile["user_id"] for profile in profiles if profile.get("user_id")]
        if not user_ids:
            return []

        auth_resp = (
            supabase.table("auth.users")
            .select("id,email")
            .in_("id", user_ids)
            .execute()
        )
        email_map = {item["id"]: item.get("email") for item in auth_resp.data or []}

        recipients = []
        for profile in profiles:
            email = email_map.get(profile["user_id"])
            if not email:
                continue
            name = f"{profile.get('first_name') or ''} {profile.get('last_name') or ''}".strip()
            recipients.append({"email": email, "name": name or email})
        return recipients
    except Exception as exc:
        logger.warning("Recipient fetch failed: %s", exc)
        return []


def _campaign_response(item: Dict[str, Any]) -> Dict[str, Any]:
    return item


# =============================================================================
# Campaign endpoints
# =============================================================================


@router.get("")
@require_permission("campaigns:read")
async def list_campaigns(
    request: Request,
    status_filter: Optional[str] = Query(None),
    created_after: Optional[datetime] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    try:
        supabase = get_supabase_admin()
        query = (
            supabase.table("admin.email_campaigns")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
        )
        if status_filter:
            query = query.eq("status", status_filter)
        if created_after:
            query = query.gte("created_at", created_after.isoformat())
        result = query.execute()
        return [_campaign_response(item) for item in result.data or []]
    except Exception as exc:
        logger.exception("List campaigns error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list campaigns")


@router.post("")
@require_permission("campaigns:write")
async def create_campaign(
    request: Request,
    payload: CampaignCreate,
    current_user: dict = Depends(get_current_user),
):
    try:
        recipient_count = _calculate_recipient_count(payload.targeting_type, payload.targeting_filters)
        supabase = get_supabase_admin()
        inserted = (
            supabase.table("admin.email_campaigns")
            .insert(
                {
                    "name": payload.name,
                    "subject": payload.subject,
                    "content": payload.content,
                    "targeting_type": payload.targeting_type,
                    "targeting_filters": payload.targeting_filters,
                    "recipient_count": recipient_count,
                    "status": "scheduled" if payload.scheduled_for else "draft",
                    "scheduled_for": payload.scheduled_for.isoformat() if payload.scheduled_for else None,
                    "template_id": payload.template_id,
                    "created_by": current_user["id"],
                }
            )
            .execute()
        )
        return _campaign_response(inserted.data[0])
    except Exception as exc:
        logger.exception("Create campaign error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create campaign")


@router.put("/{campaign_id}")
@require_permission("campaigns:write")
async def update_campaign(
    campaign_id: str,
    payload: CampaignUpdate,
    current_user: dict = Depends(get_current_user),
):
    try:
        update_payload = payload.model_dump(exclude_none=True)
        if not update_payload:
            raise HTTPException(status_code=400, detail="No updates provided")

        supabase = get_supabase_admin()

        if any(key in update_payload for key in ("targeting_type", "targeting_filters")):
            targeting_type = update_payload.get("targeting_type")
            targeting_filters = update_payload.get("targeting_filters")
        else:
            campaign_resp = (
                supabase.table("admin.email_campaigns")
                .select("targeting_type, targeting_filters")
                .eq("id", campaign_id)
                .single()
                .execute()
            )
            if not campaign_resp.data:
                raise HTTPException(status_code=404, detail="Campaign not found")
            targeting_type = campaign_resp.data["targeting_type"]
            targeting_filters = campaign_resp.data.get("targeting_filters")

        update_payload["recipient_count"] = _calculate_recipient_count(
            targeting_type, targeting_filters
        )

        updated = (
            supabase.table("admin.email_campaigns")
            .update(update_payload)
            .eq("id", campaign_id)
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return _campaign_response(updated.data[0])
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Update campaign error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update campaign")


@router.get("/{campaign_id}")
@require_permission("campaigns:read")
async def get_campaign(
    campaign_id: str, current_user: dict = Depends(get_current_user)
):
    try:
        supabase = get_supabase_admin()
        campaign_resp = (
            supabase.table("admin.email_campaigns")
            .select("*")
            .eq("id", campaign_id)
            .single()
            .execute()
        )
        if not campaign_resp.data:
            raise HTTPException(status_code=404, detail="Campaign not found")

        stats_resp = (
            supabase.table("admin.campaign_stats")
            .select("*")
            .eq("campaign_id", campaign_id)
            .single()
            .execute()
        )
        return {
            "campaign": _campaign_response(campaign_resp.data),
            "stats": stats_resp.data if stats_resp.data else None,
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Get campaign error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load campaign")


@router.post("/{campaign_id}/schedule")
@require_permission("campaigns:write")
async def schedule_campaign(
    campaign_id: str,
    payload: CampaignScheduleRequest,
    current_user: dict = Depends(get_current_user),
):
    try:
        if payload.scheduled_for <= datetime.utcnow():
            raise HTTPException(status_code=400, detail="Schedule date must be in the future")
        supabase = get_supabase_admin()
        updated = (
            supabase.table("admin.email_campaigns")
            .update(
                {
                    "scheduled_for": payload.scheduled_for.isoformat(),
                    "status": "scheduled",
                }
            )
            .eq("id", campaign_id)
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return _campaign_response(updated.data[0])
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Schedule campaign error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to schedule campaign")


@router.post("/{campaign_id}/cancel")
@require_permission("campaigns:write")
async def cancel_scheduled_campaign(
    campaign_id: str, current_user: dict = Depends(get_current_user)
):
    try:
        supabase = get_supabase_admin()
        updated = (
            supabase.table("admin.email_campaigns")
            .update({"scheduled_for": None, "status": "draft"})
            .eq("id", campaign_id)
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return _campaign_response(updated.data[0])
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Cancel campaign error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to cancel campaign")


@router.post("/{campaign_id}/send")
@require_permission("campaigns:write")
async def send_campaign(
    campaign_id: str,
    payload: CampaignSendRequest,
    current_user: dict = Depends(get_current_user),
    admin_profile: dict = Depends(get_current_admin_user),
):
    try:
        supabase = get_supabase_admin()
        campaign_resp = (
            supabase.table("admin.email_campaigns")
            .select("*")
            .eq("id", campaign_id)
            .single()
            .execute()
        )
        if not campaign_resp.data:
            raise HTTPException(status_code=404, detail="Campaign not found")

        campaign = campaign_resp.data
        if campaign.get("status") in {"sending", "sent"} and not payload.test_email:
            raise HTTPException(status_code=400, detail="Campaign already sent")

        if payload.test_email:
            send_bulk_email(
                recipients=[{"email": payload.test_email, "name": "Test"}],
                subject=f"[TEST] {campaign['subject']}",
                content=campaign["content"],
            )
            return {"message": "Test email sent"}

        recipients = _fetch_recipients(campaign["targeting_type"], campaign.get("targeting_filters"))
        supabase.table("admin.email_campaigns").update(
            {"status": "sending", "recipient_count": len(recipients)}
        ).eq("id", campaign_id).execute()

        try:
            if not recipients:
                raise ValueError("No recipients found")

            send_bulk_email(
                recipients=recipients,
                subject=campaign["subject"],
                content=campaign["content"],
            )

            supabase.table("admin.email_campaigns").update(
                {"status": "sent", "sent_at": datetime.utcnow().isoformat()}
            ).eq("id", campaign_id).execute()

            supabase.table("admin.campaign_stats").upsert(
                {
                    "campaign_id": campaign_id,
                    "total_sent": len(recipients),
                    "updated_at": datetime.utcnow().isoformat(),
                }
            ).execute()

            supabase.table("admin.audit_logs").insert(
                {
                    "event_type": "campaign.sent",
                    "severity": "MED",
                    "admin_id": current_user["id"],
                    "metadata": {"campaign_id": campaign_id, "recipient_count": len(recipients)},
                }
            ).execute()

            return {"message": "Campaign sent", "recipient_count": len(recipients)}
        except Exception as send_exc:
            logger.error("Campaign send failed: %s", send_exc)
            supabase.table("admin.email_campaigns").update(
                {"status": "failed", "error_message": str(send_exc)}
            ).eq("id", campaign_id).execute()
            raise HTTPException(status_code=500, detail="Failed to send campaign")

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Send campaign error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to send campaign")


@router.get("/{campaign_id}/stats")
@require_permission("campaigns:read")
async def get_campaign_stats(campaign_id: str, current_user: dict = Depends(get_current_user)):
    try:
        supabase = get_supabase_admin()
        stats_resp = (
            supabase.table("admin.campaign_stats")
            .select("*")
            .eq("campaign_id", campaign_id)
            .single()
            .execute()
        )
        if not stats_resp.data:
            raise HTTPException(status_code=404, detail="Campaign stats not found")
        return stats_resp.data
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Campaign stats error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve stats")


@router.get("/stats/overview")
@require_permission("campaigns:read")
async def campaigns_overview():
    try:
        supabase = get_supabase_admin()
        total_resp = supabase.table("admin.email_campaigns").select("id", count="exact").execute()
        total_campaigns = total_resp.count or 0

        sent = (
            supabase.table("admin.email_campaigns")
            .select("id", count="exact")
            .eq("status", "sent")
            .execute()
            .count
            or 0
        )

        scheduled = (
            supabase.table("admin.email_campaigns")
            .select("id", count="exact")
            .eq("status", "scheduled")
            .execute()
            .count
            or 0
        )

        emails_sent_rows = (
            supabase.table("admin.campaign_stats")
            .select("total_sent")
            .execute()
        ).data or []
        emails_sent = sum(row.get("total_sent", 0) for row in emails_sent_rows)

        return {
            "total_campaigns": total_campaigns,
            "sent_campaigns": sent,
            "scheduled_campaigns": scheduled,
            "emails_sent": emails_sent,
        }
    except Exception as exc:
        logger.exception("Campaign overview error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load campaign stats")


# =============================================================================
# Template endpoints
# =============================================================================


@router.get("/templates")
@require_permission("campaigns:read")
async def list_templates(
    category: Optional[str] = Query(None), current_user: dict = Depends(get_current_user)
):
    try:
        supabase = get_supabase_admin()
        query = supabase.table("admin.email_templates").select("*").eq("is_active", True)
        if category:
            query = query.eq("category", category)
        result = query.order("updated_at", desc=True).execute()
        return result.data or []
    except Exception as exc:
        logger.exception("List templates error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list templates")


@router.post("/templates")
@require_permission("campaigns:write")
async def create_template(
    payload: EmailTemplateCreate, current_user: dict = Depends(get_current_user)
):
    try:
        supabase = get_supabase_admin()
        inserted = (
            supabase.table("admin.email_templates")
            .insert(
                {
                    "name": payload.name,
                    "subject": payload.subject,
                    "content": payload.content,
                    "description": payload.description,
                    "category": payload.category,
                    "is_active": True,
                    "created_by": current_user["id"],
                }
            )
            .execute()
        )
        return inserted.data[0]
    except Exception as exc:
        logger.exception("Create template error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to create template")


@router.put("/templates/{template_id}")
@require_permission("campaigns:write")
async def update_template(
    template_id: str,
    payload: EmailTemplateUpdate,
    current_user: dict = Depends(get_current_user),
):
    try:
        supabase = get_supabase_admin()
        update_payload = payload.model_dump(exclude_none=True)
        updated = (
            supabase.table("admin.email_templates")
            .update(update_payload)
            .eq("id", template_id)
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=404, detail="Template not found")
        return updated.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Update template error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update template")


@router.delete("/templates/{template_id}")
@require_permission("campaigns:write")
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    try:
        supabase = get_supabase_admin()
        supabase.table("admin.email_templates").delete().eq("id", template_id).execute()
        return {"message": "Template deleted"}
    except Exception as exc:
        logger.exception("Delete template error: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete template")
