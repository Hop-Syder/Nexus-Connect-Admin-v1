from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import logging

from app.middleware.jwt_auth import get_current_user, get_current_admin_user
from app.middleware.rbac import require_permission
from app.services.supabase_client import get_supabase_admin
from app.services.email_service import send_email

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/messages")


# =============================================================================
# Schemas
# =============================================================================


class MessageReplyRequest(BaseModel):
    response_content: str
    template_id: Optional[str] = None
    subject: Optional[str] = None


class UpdateMessageRequest(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    category: Optional[str] = None
    assigned_to: Optional[str] = None
    tags: Optional[List[str]] = None
    internal_notes: Optional[str] = None
    sla_due_at: Optional[datetime] = None


class SupportTemplateCreate(BaseModel):
    name: str
    subject: str
    content: str
    category: Optional[str] = None


class SupportTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None


# =============================================================================
# Helpers
# =============================================================================


def _enrich_messages_with_metadata(messages: List[Dict[str, Any]]):
    enriched = []
    for msg in messages:
        metadata = msg.pop("admin_metadata", {}) or {}
        msg["metadata"] = metadata
        enriched.append(msg)
    return enriched


def _requires_assignment_refresh(update_payload: Dict[str, Any]) -> bool:
    return any(key in update_payload for key in ("status", "assigned_to", "priority"))


# =============================================================================
# Message listing & details
# =============================================================================


@router.get("")
@require_permission("messages:read")
async def list_messages(
    request: Request,
    status_filter: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    assigned_to: Optional[str] = Query(None),
    sla_breach: Optional[bool] = Query(None),
    tag: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    """Liste paginée des messages avec métadonnées enrichies."""
    try:
        supabase = get_supabase_admin()

        query = (
            supabase.table("contact_messages")
            .select(
                "id, name, email, subject, message, status, created_at, updated_at,"
                "admin_metadata:admin.contact_messages_metadata!inner(*)"
            )
            .order("created_at", desc=True)
            .limit(limit)
        )

        if status_filter:
            query = query.eq("status", status_filter)
        if priority:
            query = query.eq("admin_metadata.priority", priority)
        if category:
            query = query.eq("admin_metadata.category", category)
        if assigned_to:
            query = query.eq("admin_metadata.assigned_to", assigned_to)
        if sla_breach is not None:
            query = query.eq("admin_metadata.sla_breach", sla_breach)
        if tag:
            query = query.contains("admin_metadata.tags", [tag])

        result = query.execute()
        items = result.data or []

        if search:
            needle = search.lower()
            filtered = []
            for item in items:
                if (
                    needle in (item.get("name", "").lower())
                    or needle in (item.get("email", "").lower())
                    or needle in (item.get("subject", "").lower())
                    or needle in (item.get("message", "").lower())
                ):
                    filtered.append(item)
            items = filtered

        return _enrich_messages_with_metadata(items)

    except Exception as e:
        logger.exception("List messages error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list messages",
        )


@router.get("/stats/summary")
@require_permission("messages:read")
async def get_messages_stats(current_user: dict = Depends(get_current_user)):
    """Statistiques synthétiques (Nouveaux messages, SLA)."""
    try:
        supabase = get_supabase_admin()

        new_count = (
            supabase.table("contact_messages")
            .select("id", count="exact")
            .eq("status", "new")
            .execute()
            .count
            or 0
        )

        sla_breaches = (
            supabase.table("admin.contact_messages_metadata")
            .select("message_id", count="exact")
            .eq("sla_breach", True)
            .execute()
            .count
            or 0
        )

        pending_assignments = (
            supabase.table("admin.contact_messages_metadata")
            .select("message_id", count="exact")
            .is_("assigned_to", None)
            .execute()
            .count
            or 0
        )

        return {
            "new_messages": new_count,
            "sla_breaches": sla_breaches,
            "unassigned": pending_assignments,
        }

    except Exception as e:
        logger.exception("Message stats error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get message stats",
        )


@router.get("/{message_id}")
@require_permission("messages:read")
async def get_message(
    request: Request, message_id: str, current_user: dict = Depends(get_current_user)
):
    """Retourne le message et ses métadonnées admin."""
    try:
        supabase = get_supabase_admin()

        message_resp = (
            supabase.table("contact_messages")
            .select("*")
            .eq("id", message_id)
            .single()
            .execute()
        )

        if not message_resp.data:
            raise HTTPException(status_code=404, detail="Message not found")

        metadata_resp = (
            supabase.table("admin.contact_messages_metadata")
            .select("*")
            .eq("message_id", message_id)
            .single()
            .execute()
        )

        return {
            "message": message_resp.data,
            "metadata": metadata_resp.data if metadata_resp.data else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Get message error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get message",
        )


# =============================================================================
# Message updates & replies
# =============================================================================


@router.put("/{message_id}")
@require_permission("messages:write")
async def update_message(
    request: Request,
    message_id: str,
    payload: UpdateMessageRequest,
    current_user: dict = Depends(get_current_user),
):
    """Met à jour le statut/metadata du message."""
    try:
        supabase = get_supabase_admin()

        update_payload = payload.model_dump(exclude_none=True)
        message_update = {}

        if "status" in update_payload:
            message_update["status"] = update_payload.pop("status")

        if message_update:
            supabase.table("contact_messages").update(message_update).eq("id", message_id).execute()

        if update_payload:
            existing = (
                supabase.table("admin.contact_messages_metadata")
                .select("message_id")
                .eq("message_id", message_id)
                .execute()
            )

            if existing.data:
                supabase.table("admin.contact_messages_metadata").update(update_payload).eq("message_id", message_id).execute()
            else:
                supabase.table("admin.contact_messages_metadata").insert({"message_id": message_id, **update_payload}).execute()

        if _requires_assignment_refresh(update_payload):
            supabase.table("admin.audit_logs").insert(
                {
                    "event_type": "message.updated",
                    "severity": "LOW",
                    "admin_id": current_user["id"],
                    "metadata": {"message_id": message_id, **update_payload},
                }
            ).execute()

        return {"message": "Message updated"}

    except Exception as e:
        logger.exception("Update message error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update message",
        )


@router.post("/{message_id}/reply")
@require_permission("messages:write")
async def reply_to_message(
    request: Request,
    message_id: str,
    reply: MessageReplyRequest,
    current_user: dict = Depends(get_current_user),
    admin_profile: dict = Depends(get_current_admin_user),
):
    """Envoie une réponse au message et journalise l'action."""
    try:
        supabase = get_supabase_admin()

        message_resp = (
            supabase.table("contact_messages")
            .select("*")
            .eq("id", message_id)
            .single()
            .execute()
        )

        if not message_resp.data:
            raise HTTPException(status_code=404, detail="Message not found")

        message = message_resp.data

        send_email(
            to_email=message["email"],
            to_name=message.get("name"),
            subject=reply.subject or f"Re: {message.get('subject', 'Votre demande')}",
            content=reply.response_content,
        )

        supabase.table("contact_messages").update({"status": "replied"}).eq("id", message_id).execute()
        supabase.table("admin.contact_messages_metadata").update(
            {
                "response_content": reply.response_content,
                "response_template_id": reply.template_id,
                "responded_by": current_user["id"],
                "response_sent_at": datetime.utcnow().isoformat(),
                "status": "replied",
            }
        ).eq("message_id", message_id).execute()

        supabase.table("admin.audit_logs").insert(
            {
                "event_type": "message.replied",
                "severity": "LOW",
                "admin_id": current_user["id"],
                "metadata": {"message_id": message_id, "template_id": reply.template_id},
            }
        ).execute()

        return {"message": "Reply sent"}

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Reply to message error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to reply to message",
        )


@router.post("/{message_id}/archive")
@require_permission("messages:write")
async def archive_message(
    request: Request,
    message_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Archive le message et marque comme résolu."""
    try:
        supabase = get_supabase_admin()

        supabase.table("contact_messages").update({"status": "archived"}).eq("id", message_id).execute()
        supabase.table("admin.contact_messages_metadata").update(
            {
                "status": "archived",
                "resolved_at": datetime.utcnow().isoformat(),
                "resolved_by": current_user["id"],
            }
        ).eq("message_id", message_id).execute()

        return {"message": "Message archived"}

    except Exception as e:
        logger.exception("Archive message error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to archive message",
        )


# =============================================================================
# Templates
# =============================================================================


@router.get("/templates")
@require_permission("messages:read")
async def list_templates(current_user: dict = Depends(get_current_user)):
    """Liste les modèles de réponse support."""
    try:
        supabase = get_supabase_admin()
        resp = (
            supabase.table("admin.support_templates")
            .select("*")
            .order("updated_at", desc=True)
            .execute()
        )
        return resp.data or []
    except Exception as e:
        logger.exception("List templates error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list templates",
        )


@router.post("/templates")
@require_permission("messages:write")
async def create_template(
    payload: SupportTemplateCreate, current_user: dict = Depends(get_current_user)
):
    try:
        supabase = get_supabase_admin()
        inserted = (
            supabase.table("admin.support_templates")
            .insert(
                {
                    "name": payload.name,
                    "subject": payload.subject,
                    "content": payload.content,
                    "category": payload.category,
                    "created_by": current_user["id"],
                }
            )
            .execute()
        )
        return inserted.data[0]
    except Exception as e:
        logger.exception("Create template error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create template",
        )


@router.put("/templates/{template_id}")
@require_permission("messages:write")
async def update_template(
    template_id: str,
    payload: SupportTemplateUpdate,
    current_user: dict = Depends(get_current_user),
):
    try:
        supabase = get_supabase_admin()
        update_payload = payload.model_dump(exclude_none=True)
        updated = (
            supabase.table("admin.support_templates")
            .update(update_payload)
            .eq("id", template_id)
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=404, detail="Template not found")
        return updated.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Update template error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update template",
        )


@router.delete("/templates/{template_id}")
@require_permission("messages:write")
async def delete_template(template_id: str, current_user: dict = Depends(get_current_user)):
    try:
        supabase = get_supabase_admin()
        supabase.table("admin.support_templates").delete().eq("id", template_id).execute()
        return {"message": "Template deleted"}
    except Exception as e:
        logger.exception("Delete template error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete template",
        )
