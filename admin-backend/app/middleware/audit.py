import logging
import time
import hashlib
import json
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.services.supabase_client import get_supabase_admin

logger = logging.getLogger(__name__)

# Routes à ignorer pour l'audit (health checks, etc.)
SKIP_AUDIT_ROUTES = [
    "/",
    "/health",
    "/api/health",
    "/api/admin/v1/health",
    "/api/admin/v1",
    "/api/admin/v1/docs",
    "/api/admin/v1/redoc",
    "/api/admin/v1/openapi.json",
]

# Événements critiques
CRITICAL_EVENTS = [
    "user.blocked",
    "user.deleted",
    "admin.created",
    "admin.deleted",
    "settings.updated",
    "data.exported",
]

class AuditMiddleware(BaseHTTPMiddleware):
    """Audit Logging Middleware
    
    Enregistre toutes les actions admin de manière immuable
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip routes non auditées
        if request.url.path in SKIP_AUDIT_ROUTES:
            return await call_next(request)
        
        # Capturer les informations de la requête
        start_time = time.time()
        
        # Context
        user_id = None
        admin_id = None
        admin_profile = None
        
        if hasattr(request.state, "user"):
            user_id = request.state.user.get("id")
        
        if hasattr(request.state, "admin_profile"):
            admin_profile = request.state.admin_profile
            admin_id = admin_profile.get("user_id")
        
        # Exécuter la requête
        response = await call_next(request)
        
        # Calculer la durée
        duration = time.time() - start_time
        
        # Déterminer le type d'événement et la sévérité
        event_type = self._get_event_type(request.method, request.url.path, response.status_code)
        severity = self._get_severity(response.status_code, event_type)
        
        # Préparer les métadonnées
        metadata = {
            "method": request.method,
            "path": request.url.path,
            "query_params": dict(request.query_params),
            "duration_ms": round(duration * 1000, 2),
        }
        
        # Log l'événement de manière asynchrone (ne pas bloquer la réponse)
        try:
            self._log_audit_event(
                event_type=event_type,
                severity=severity,
                user_id=user_id,
                admin_id=admin_id,
                ip_address=request.client.host if request.client else None,
                user_agent=request.headers.get("user-agent"),
                endpoint=request.url.path,
                http_method=request.method,
                status_code=response.status_code,
                metadata=metadata
            )
        except Exception as e:
            logger.error(f"Failed to log audit event: {str(e)}")
        
        return response
    
    def _get_event_type(self, method: str, path: str, status_code: int) -> str:
        """Déterminer le type d'événement"""
        if status_code >= 400:
            if status_code == 401:
                return "auth.failed"
            elif status_code == 403:
                return "access.denied"
            else:
                return "request.error"
        
        # Mapper par path
        if "/auth/login" in path:
            return "admin.login"
        elif "/auth/logout" in path:
            return "admin.logout"
        elif "/users" in path:
            if method == "POST":
                return "user.created"
            elif method == "PUT" or method == "PATCH":
                return "user.updated"
            elif method == "DELETE":
                return "user.deleted"
            else:
                return "user.viewed"
        elif "/entrepreneurs" in path and method in ["POST", "PUT", "PATCH"]:
            return "entrepreneur.moderated"
        elif "/campaigns" in path and method == "POST":
            return "campaign.created"
        elif "/export" in path:
            return "data.exported"
        
        return "request.success"
    
    def _get_severity(self, status_code: int, event_type: str) -> str:
        """Déterminer la sévérité"""
        if event_type in CRITICAL_EVENTS:
            return "CRIT"
        
        if status_code >= 500:
            return "HIGH"
        elif status_code >= 400:
            return "MED"
        else:
            return "LOW"
    
    def _log_audit_event(self, **kwargs):
        """Enregistrer l'événement d'audit"""
        try:
            supabase = get_supabase_admin()
            
            # Créer un hash pour l'immuabilité
            log_data = json.dumps(kwargs, sort_keys=True, default=str)
            log_hash = hashlib.sha256(log_data.encode()).hexdigest()
            
            # Insérer dans la table audit_logs
            supabase.table('admin.audit_logs').insert({
                **kwargs,
                'log_hash': log_hash
            }).execute()
            
            # Si critique, créer une notification
            if kwargs.get('severity') == 'CRIT' and kwargs.get('admin_id'):
                self._create_notification(
                    admin_id=kwargs['admin_id'],
                    event_type=kwargs['event_type'],
                    metadata=kwargs.get('metadata')
                )
        except Exception as e:
            logger.error(f"Audit log insertion failed: {str(e)}")
    
    def _create_notification(self, admin_id: str, event_type: str, metadata: dict):
        """Créer une notification pour les admins"""
        try:
            supabase = get_supabase_admin()
            
            # Notifier tous les admins de niveau "admin"
            admins = supabase.table('admin.admin_profiles') \
                .select('user_id') \
                .eq('role', 'admin') \
                .eq('is_active', True) \
                .execute()
            
            for admin in admins.data:
                supabase.table('admin.notifications').insert({
                    'admin_id': admin['user_id'],
                    'type': 'warning',
                    'title': f'Critical Event: {event_type}',
                    'message': f'A critical action was performed',
                    'metadata': metadata
                }).execute()
        except Exception as e:
            logger.error(f"Failed to create notification: {str(e)}")
