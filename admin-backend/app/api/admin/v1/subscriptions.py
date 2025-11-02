from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import logging

from app.middleware.jwt_auth import get_current_user
from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subscriptions")

# ===================================
# SCHEMAS
# ===================================

class GrantPremiumRequest(BaseModel):
    user_id: str
    plan_code: str
    duration_days: Optional[int] = None
    payment_method: str = "manual"
    amount: Optional[float] = None
    payment_reference: Optional[str] = None
    reason: Optional[str] = None
    coupon_code: Optional[str] = None

class RevokePremiumRequest(BaseModel):
    user_id: str
    reason: str

class SubscriptionPlanCreate(BaseModel):
    plan_code: str
    plan_name: str
    description: Optional[str] = None
    price: float
    currency: str = "XOF"
    duration_days: int
    features: List[str] = []
    is_active: bool = True
    display_order: Optional[int] = None

class SubscriptionPlanUpdate(BaseModel):
    plan_name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    duration_days: Optional[int] = None
    features: Optional[List[str]] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None

class CouponCreate(BaseModel):
    code: str
    discount_type: str  # 'percentage' or 'fixed'
    discount_value: float
    valid_from: datetime
    valid_until: datetime
    max_uses: Optional[int] = None
    applicable_plans: Optional[List[str]] = None
    usage_limit_per_user: Optional[int] = None

class CouponUpdate(BaseModel):
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    max_uses: Optional[int] = None
    usage_limit_per_user: Optional[int] = None
    applicable_plans: Optional[List[str]] = None
    is_active: Optional[bool] = None

# ===================================
# ENDPOINTS - Plans
# ===================================

@router.get("/plans")
async def list_plans(
    include_inactive: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    """Liste des plans d'abonnement"""
    try:
        supabase = get_supabase_admin()
        
        query = (
            supabase.table("admin.subscription_plans")
            .select("*")
            .order("display_order")
        )
        if not include_inactive:
            query = query.eq("is_active", True)
        
        result = query.execute()
        
        return result.data
    
    except Exception as e:
        logger.error(f"List plans error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list plans"
        )

@router.post("/plans")
async def create_plan(
    plan: SubscriptionPlanCreate,
    current_user: dict = Depends(get_current_user)
):
    """Créer un nouveau plan"""
    try:
        supabase = get_supabase_admin()
        
        # S'assurer que le code plan est unique
        existing = (
            supabase.table("admin.subscription_plans")
            .select("id")
            .eq("plan_code", plan.plan_code)
            .execute()
        )
        if existing.data:
            raise HTTPException(status_code=400, detail="Plan code already exists")

        result = (
            supabase.table("admin.subscription_plans")
            .insert(
                {
                    "plan_code": plan.plan_code,
                    "plan_name": plan.plan_name,
                    "description": plan.description,
                    "price": plan.price,
                    "currency": plan.currency,
                    "duration_days": plan.duration_days,
                    "features": plan.features,
                    "is_active": plan.is_active,
                    "display_order": plan.display_order,
                }
            )
            .execute()
        )
        
        return result.data[0]
    
    except Exception as e:
        logger.error(f"Create plan error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create plan"
        )

# ENDPOINTS - Gestion Premium
# ===================================

@router.put("/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    payload: SubscriptionPlanUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Mettre à jour un plan existant"""
    try:
        supabase = get_supabase_admin()
        update_payload = payload.model_dump(exclude_none=True)
        if "plan_name" in update_payload:
            update_payload["plan_name"] = update_payload["plan_name"].strip()

        result = (
            supabase.table("admin.subscription_plans")
            .update(update_payload)
            .eq("id", plan_id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Plan not found")

        return result.data[0]
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update plan error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update plan"
        )


@router.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, current_user: dict = Depends(get_current_user)):
    """Supprimer un plan (soft delete via is_active=False)"""
    try:
        supabase = get_supabase_admin()
        supabase.table("admin.subscription_plans").update(
            {"is_active": False, "updated_at": datetime.utcnow().isoformat()}
        ).eq("id", plan_id).execute()
        return {"message": "Plan disabled"}
    except Exception as e:
        logger.error(f"Delete plan error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to disable plan"
        )


@router.post("/grant-premium")
async def grant_premium(
    request: GrantPremiumRequest,
    current_user: dict = Depends(get_current_user)
):
    """Attribuer un abonnement premium à un utilisateur"""
    try:
        supabase = get_supabase_admin()
        
        # Récupérer le plan
        plan_query = (
            supabase.table("admin.subscription_plans")
            .select("*")
            .eq("plan_code", request.plan_code)
            .single()
            .execute()
        )
        
        if not plan_query.data:
            raise HTTPException(status_code=404, detail="Plan not found")
        
        plan_data = plan_query.data
        if not plan_data.get("is_active"):
            raise HTTPException(status_code=400, detail="Plan is inactive")

        duration = request.duration_days or plan_data["duration_days"]
        amount = request.amount or plan_data["price"]
        currency = plan_data["currency"]

        coupon_metadata = None
        if request.coupon_code:
            coupon_resp = (
                supabase.table("admin.subscription_coupons")
                .select("*")
                .eq("code", request.coupon_code.upper())
                .eq("is_active", True)
                .single()
                .execute()
            )
            coupon = coupon_resp.data
            if not coupon:
                raise HTTPException(status_code=404, detail="Coupon not found")

            now_iso = datetime.utcnow().isoformat()
            if coupon["valid_from"] and coupon["valid_from"] > now_iso:
                raise HTTPException(status_code=400, detail="Coupon not yet valid")
            if coupon["valid_until"] and coupon["valid_until"] < now_iso:
                raise HTTPException(status_code=400, detail="Coupon expired")

            # Check plan applicability
            if coupon["applicable_plans"]:
                if request.plan_code not in coupon["applicable_plans"]:
                    raise HTTPException(status_code=400, detail="Coupon not valid for this plan")

            # Apply discount
            if coupon["discount_type"] == "percentage":
                amount = amount - (amount * coupon["discount_value"] / 100)
            else:
                amount = max(0, amount - coupon["discount_value"])

            coupon_metadata = {
                "coupon_code": coupon["code"],
                "discount_applied": plan_data["price"] - amount,
            }

            # Increment usage counter
            supabase.table("admin.subscription_coupons").update(
                {"usage_count": (coupon.get("usage_count") or 0) + 1}
            ).eq("id", coupon["id"]).execute()
        
        # Calculer la date d'expiration
        premium_until = datetime.utcnow() + timedelta(days=duration)
        
        # Mettre à jour le profil utilisateur
        supabase.table("user_profiles").update(
            {
                "is_premium": True,
                "premium_until": premium_until.isoformat(),
                "subscription_tier": request.plan_code,
                "updated_at": datetime.utcnow().isoformat(),
            }
        ).eq("user_id", request.user_id).execute()
        
        history_payload = {
            "user_id": request.user_id,
            "action": "granted",
            "plan": request.plan_code,
            "duration_days": duration,
            "premium_until": premium_until.isoformat(),
            "amount": amount,
            "currency": currency,
            "payment_method": request.payment_method,
            "payment_reference": request.payment_reference,
            "admin_id": current_user["id"],
            "reason": request.reason,
        }
        if coupon_metadata:
            history_payload["metadata"] = coupon_metadata
        
        # Enregistrer dans l'historique
        supabase.table("admin.subscription_history").insert(history_payload).execute()
        
        # Audit log
        supabase.table("audit_logs").insert(
            {
                "event_type": "subscription.granted",
                "severity": "MED",
                "user_id": request.user_id,
                "admin_id": current_user["id"],
                "metadata": {
                    "plan": request.plan_code,
                    "duration_days": duration,
                    "amount": amount,
                    **(coupon_metadata or {}),
                },
            }
        ).execute()
        
        return {
            "message": "Premium granted successfully",
            "premium_until": premium_until.isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Grant premium error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to grant premium"
        )

@router.post("/revoke-premium")
async def revoke_premium(
    request: RevokePremiumRequest,
    current_user: dict = Depends(get_current_user)
):
    """Révoquer l'abonnement premium d'un utilisateur"""
    try:
        supabase = get_supabase_admin()
        
        # Mettre à jour le profil
        supabase.table('user_profiles').update({
            'is_premium': False,
            'premium_until': None,
            'subscription_tier': 'free'
        }).eq('user_id', request.user_id).execute()
        
        # Historique
        supabase.table('admin.subscription_history').insert({
            'user_id': request.user_id,
            'action': 'revoked',
            'plan': 'free',
            'admin_id': current_user['id'],
            'reason': request.reason
        }).execute()
        
        # Audit
        supabase.table('audit_logs').insert({
            'event_type': 'subscription.revoked',
            'severity': 'MED',
            'user_id': request.user_id,
            'admin_id': current_user['id'],
            'metadata': {'reason': request.reason}
        }).execute()
        
        return {"message": "Premium revoked successfully"}
    
    except Exception as e:
        logger.error(f"Revoke premium error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to revoke premium"
        )


@router.get("/history/{user_id}")
async def get_subscription_history(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Historique des abonnements d'un utilisateur"""
    try:
        supabase = get_supabase_admin()
        
        result = supabase.table('admin.subscription_history') \
            .select('*') \
            .eq('user_id', user_id) \
            .order('created_at', desc=True) \
            .execute()
        
        return result.data
    
    except Exception as e:
        logger.error(f"Get subscription history error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get subscription history"
        )

@router.get("/expiring-soon")
async def get_expiring_subscriptions(
    days: int = Query(7, ge=1, le=60),
    limit: int = Query(100, ge=1, le=500),
    include_overdue: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    """Abonnements qui expirent bientôt"""
    try:
        supabase = get_supabase_admin()
        
        # Utilisateurs premium expirant dans X jours
        now = datetime.utcnow()
        target_date = now + timedelta(days=days)
        
        query = (
            supabase.table("user_profiles")
            .select(
                "user_id, first_name, last_name, premium_until, subscription_tier, email"
            )
            .eq("is_premium", True)
            .order("premium_until")
            .limit(limit)
        )

        if include_overdue:
            query = query.lte("premium_until", target_date.isoformat())
        else:
            query = query.lte("premium_until", target_date.isoformat()).gte(
                "premium_until", now.isoformat()
            )

        result = query.execute()
        
        return result.data
    
    except Exception as e:
        logger.error(f"Get expiring subscriptions error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get expiring subscriptions"
        )

# ===================================
# ENDPOINTS - Coupons
# ===================================

@router.post("/coupons")
async def create_coupon(
    coupon: CouponCreate,
    current_user: dict = Depends(get_current_user)
):
    """Créer un coupon de réduction"""
    try:
        supabase = get_supabase_admin()
        
        payload = {
            "code": coupon.code.upper(),
            "discount_type": coupon.discount_type,
            "discount_value": coupon.discount_value,
            "valid_from": coupon.valid_from.isoformat(),
            "valid_until": coupon.valid_until.isoformat(),
            "max_uses": coupon.max_uses,
            "usage_limit_per_user": coupon.usage_limit_per_user,
            "applicable_plans": coupon.applicable_plans,
            "is_active": True,
            "created_by": current_user["id"],
        }
        
        result = supabase.table("admin.subscription_coupons").insert(payload).execute()
        
        return result.data[0]
    
    except Exception as e:
        logger.error(f"Create coupon error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create coupon"
        )

@router.get("/coupons")
async def list_coupons(
    is_active: Optional[bool] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    """Liste des coupons"""
    try:
        supabase = get_supabase_admin()
        
        query = supabase.table("admin.subscription_coupons").select("*")
        
        if is_active is not None:
            query = query.eq("is_active", is_active)
        
        result = query.order("created_at", desc=True).execute()
        
        return result.data
    
    except Exception as e:
        logger.error(f"List coupons error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list coupons"
        )


@router.put("/coupons/{coupon_id}")
async def update_coupon(
    coupon_id: str,
    payload: CouponUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Mettre à jour un coupon"""
    try:
        supabase = get_supabase_admin()
        update_payload = payload.model_dump(exclude_none=True)
        if "valid_from" in update_payload:
            update_payload["valid_from"] = update_payload["valid_from"].isoformat()
        if "valid_until" in update_payload:
            update_payload["valid_until"] = update_payload["valid_until"].isoformat()

        updated = (
            supabase.table("admin.subscription_coupons")
            .update(update_payload)
            .eq("id", coupon_id)
            .execute()
        )
        if not updated.data:
            raise HTTPException(status_code=404, detail="Coupon not found")

        return updated.data[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update coupon error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update coupon"
        )


@router.get("/stats")
async def get_subscription_stats(current_user: dict = Depends(get_current_user)):
    """Statistiques des abonnements"""
    try:
        supabase = get_supabase_admin()
        
        total_users = (
            supabase.table("user_profiles").select("user_id", count="exact").execute().count
            or 0
        )
        total_premium = (
            supabase.table("user_profiles")
            .select("user_id", count="exact")
            .eq("is_premium", True)
            .execute()
            .count
            or 0
        )
        total_free = total_users - total_premium

        plan_totals = (
            supabase.table("admin.subscription_plans")
            .select("plan_code, price")
            .eq("is_active", True)
            .execute()
        )
        plan_price_map = {row["plan_code"]: row["price"] for row in plan_totals.data or []}

        mrr_result = (
            supabase.table("user_profiles")
            .select("subscription_tier")
            .eq("is_premium", True)
            .execute()
        )
        mrr = 0.0
        for row in mrr_result.data or []:
            tier = row.get("subscription_tier")
            mrr += plan_price_map.get(tier, 0)

        now = datetime.utcnow()
        in_three_days = now + timedelta(days=3)
        in_seven_days = now + timedelta(days=7)

        expiring_7days = (
            supabase.table("user_profiles")
            .select("user_id", count="exact")
            .eq("is_premium", True)
            .lte("premium_until", in_seven_days.isoformat())
            .gte("premium_until", now.isoformat())
            .execute()
            .count
            or 0
        )

        expiring_3days = (
            supabase.table("user_profiles")
            .select("user_id", count="exact")
            .eq("is_premium", True)
            .lte("premium_until", in_three_days.isoformat())
            .gte("premium_until", now.isoformat())
            .execute()
            .count
            or 0
        )

        expired_today = (
            supabase.table("user_profiles")
            .select("user_id", count="exact")
            .eq("is_premium", False)
            .gte("premium_until", (now - timedelta(days=1)).isoformat())
            .lte("premium_until", now.isoformat())
            .execute()
            .count
            or 0
        )

        return {
            "total_users": total_users,
            "total_premium": total_premium,
            "total_free": total_free,
            "mrr": round(mrr, 2),
            "expiring_7days": expiring_7days,
            "expiring_3days": expiring_3days,
            "expired_today": expired_today,
        }
    
    except Exception as e:
        logger.error(f"Get subscription stats error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get subscription stats"
        )
