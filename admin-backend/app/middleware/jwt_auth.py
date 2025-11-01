import time
import logging
from typing import Callable, Optional
from fastapi import Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from jose import jwt, JWTError

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Routes publiques (sans authentification)
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

class JWTAuthMiddleware(BaseHTTPMiddleware):
    """JWT Authentication Middleware
    
    Vérifie le JWT Supabase et extrait l'utilisateur
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip public routes
        if request.url.path in PUBLIC_ROUTES or request.url.path.startswith("/api/admin/v1/auth/"):
            return await call_next(request)
        
        # Extract token from Authorization header
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Missing or invalid Authorization header"}
            )
        
        token = auth_header.split(" ")[1]
        
        try:
            # Verify JWT signature with Supabase JWT secret
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=[settings.JWT_ALGORITHM],
                options={"verify_aud": False}
            )
            
            # Extract user info
            user_id = payload.get("sub")
            email = payload.get("email")
            role = payload.get("role", "authenticated")
            
            if not user_id:
                raise JWTError("Missing user ID in token")
            
            # Store user context in request state
            request.state.user = {
                "id": user_id,
                "email": email,
                "role": role,
                "token_payload": payload
            }
            
            # Store token for forwarding
            request.state.token = token
            
        except JWTError as e:
            logger.warning(f"JWT verification failed: {str(e)}")
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Invalid or expired token"}
            )
        except Exception as e:
            logger.error(f"JWT middleware error: {str(e)}")
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={"detail": "Authentication error"}
            )
        
        response = await call_next(request)
        return response


def get_current_user(request: Request) -> dict:
    """Dependency pour extraire l'utilisateur courant"""
    if not hasattr(request.state, "user"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    return request.state.user


def get_current_admin_user(request: Request) -> dict:
    """Dependency pour extraire l'admin courant avec vérification"""
    user = get_current_user(request)
    
    # Vérifier si l'utilisateur est admin
    # (sera enrichi par RBACMiddleware)
    if not hasattr(request.state, "admin_profile"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    return request.state.admin_profile
