import logging
import time
from typing import Callable
from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette import status
import redis
import json

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Redis client
try:
    redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
except Exception as e:
    logger.warning(f"Redis connection failed: {str(e)}. Rate limiting disabled.")
    redis_client = None

class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate Limiting Middleware
    
    Limite le nombre de requêtes par minute par admin
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Si Redis n'est pas disponible, ne pas limiter
        if not redis_client:
            return await call_next(request)
        
        # Skip routes publiques
        if request.url.path in ["/", "/health", "/api/health"]:
            return await call_next(request)
        
        # Identifier l'utilisateur (IP ou user_id)
        identifier = None
        if hasattr(request.state, "user"):
            identifier = f"user:{request.state.user.get('id')}"
        else:
            identifier = f"ip:{request.client.host}" if request.client else "unknown"
        
        # Clé Redis pour le rate limiting
        key = f"rate_limit:{identifier}"
        
        try:
            # Incrémenter le compteur
            current = redis_client.get(key)
            
            if current is None:
                # Premier appel dans cette minute
                redis_client.setex(key, 60, 1)
                current = 1
            else:
                current = int(current)
                if current >= settings.RATE_LIMIT_PER_MINUTE:
                    # Limite atteinte
                    return JSONResponse(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        content={
                            "detail": "Rate limit exceeded",
                            "retry_after": redis_client.ttl(key)
                        }
                    )
                redis_client.incr(key)
            
            # Ajouter les headers de rate limit
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(settings.RATE_LIMIT_PER_MINUTE)
            response.headers["X-RateLimit-Remaining"] = str(settings.RATE_LIMIT_PER_MINUTE - int(current))
            response.headers["X-RateLimit-Reset"] = str(int(time.time()) + redis_client.ttl(key))
            
            return response
            
        except Exception as e:
            logger.error(f"Rate limit error: {str(e)}")
            # En cas d'erreur, ne pas bloquer
            return await call_next(request)
