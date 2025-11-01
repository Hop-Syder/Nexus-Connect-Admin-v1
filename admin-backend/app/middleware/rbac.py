import logging
from typing import Callable
from fastapi import Request, Response, HTTPException
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette import status

from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)

# Routes publiques (sans RBAC)
PUBLIC_ROUTES = [
    "/",
    "/health",
    "/api/health",
    "/api/admin/v1/health",
    "/api/admin/v1",
    "/api/admin/v1/docs",
    "/api/admin/v1/redoc",
    "/api/admin/v1/openapi.json",
    "/api/admin/v1/auth/login",
    "/api/admin/v1/auth/verify-2fa",
    "/api/admin/v1/auth/refresh",
]

# Permissions par rôle
ROLE_PERMISSIONS = {
    "admin": ["*"],  # Accès complet
    "moderator": [
        "users:read",
        "entrepreneurs:read",
        "entrepreneurs:write",
        "moderation:read",
        "moderation:write",
        "moderation:macros",
        "moderation:assign",
    ],
    "support": [
        "users:read",
        "messages:read",
        "messages:write",
        "settings:read",
    ],
    "viewer": [
        "analytics:read",
        "audit:read",
        "settings:read",
    ],
}

class RBACMiddleware(BaseHTTPMiddleware):
    """Role-Based Access Control Middleware
    
    Vérifie les permissions admin et enrichit le contexte
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip public routes
        if request.url.path in PUBLIC_ROUTES or request.url.path.startswith("/api/admin/v1/auth/"):
            return await call_next(request)
        
        # Vérifier que l'authentification JWT a été passée
        if not hasattr(request.state, "user"):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Authentication required"}
            )
        
        user = request.state.user
        user_id = user.get("id")
        
        try:
            # Récupérer le profil admin de l'utilisateur
            supabase = get_supabase_admin()
            result = supabase.table('admin.admin_profiles') \
                .select('*') \
                .eq('user_id', user_id) \
                .eq('is_active', True) \
                .single() \
                .execute()
            
            if not result.data:
                logger.warning(f"No active admin profile found for user {user_id}")
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Admin access denied"}
                )
            
            admin_profile = result.data
            
            # Vérifier MFA si requis
            if admin_profile.get('requires_2fa') and not admin_profile.get('mfa_verified'):
                # Permettre uniquement les routes MFA
                if not request.url.path.startswith("/api/admin/v1/auth/2fa"):
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content={"detail": "MFA verification required"}
                    )
            
            # Stocker le profil admin dans request.state
            request.state.admin_profile = admin_profile
            request.state.admin_role = admin_profile.get('role')
            request.state.admin_scopes = admin_profile.get('scopes', [])
            
            # Vérifier les permissions pour cette route (simplifié)
            # TODO: Implémenter une vérification granulaire par endpoint
            role = admin_profile.get('role')
            if role not in ROLE_PERMISSIONS:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Invalid role"}
                )
            
            # Admins ont accès à tout
            if role == "admin":
                pass  # Accès complet
            else:
                # Vérifier les permissions spécifiques (exemple simplifié)
                # Dans une vraie implémentation, mapper les routes aux permissions
                pass
            
        except Exception as e:
            logger.error(f"RBAC middleware error: {str(e)}")
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "Authorization error"}
            )
        
        response = await call_next(request)
        return response


def require_permission(permission: str):
    """Décorateur pour vérifier une permission spécifique"""
    def decorator(func):
        async def wrapper(request: Request, *args, **kwargs):
            admin_profile = getattr(request.state, "admin_profile", None)
            if not admin_profile:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Admin access required"
                )
            
            role = admin_profile.get('role')
            scopes = admin_profile.get('scopes', [])
            
            # Admin a tous les accès
            if role == "admin":
                return await func(request, *args, **kwargs)
            
            # Vérifier permission dans scopes
            if permission not in scopes and "*" not in scopes:
                # Vérifier permission dans le rôle
                role_perms = ROLE_PERMISSIONS.get(role, [])
                if permission not in role_perms and "*" not in role_perms:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Permission denied: {permission}"
                    )
            
            return await func(request, *args, **kwargs)
        return wrapper
    return decorator
