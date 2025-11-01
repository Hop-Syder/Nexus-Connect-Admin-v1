import os
import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from dotenv import load_dotenv

from app.config import get_settings
from app.middleware.jwt_auth import JWTAuthMiddleware
from app.middleware.rbac import RBACMiddleware
from app.middleware.audit import AuditMiddleware
from app.middleware.rate_limit import RateLimitMiddleware

# Import routers
from app.api.admin.v1 import (
    auth,
    users,
    subscriptions,
    entrepreneurs,
    messages,
    campaigns,
    analytics,
    audit,
    settings as settings_router
)

# Load environment variables
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Get settings
settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Tableau de Bord d'Administration - Hop-Syder/News v2.1",
    docs_url="/api/admin/v1/docs",
    redoc_url="/api/admin/v1/redoc",
    openapi_url="/api/admin/v1/openapi.json"
)

# ===========================================
# MIDDLEWARE STACK (ordre important!)
# ===========================================

# 1. CORS (premier)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Trusted Host (sécurité domaine)
if settings.ENVIRONMENT == "production":
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=[settings.ADMIN_DOMAIN, "localhost"]
    )

# 3. Rate Limiting
app.add_middleware(RateLimitMiddleware)

# 4. JWT Authentication
app.add_middleware(JWTAuthMiddleware)

# 5. RBAC Authorization
app.add_middleware(RBACMiddleware)

# 6. Audit Logging (dernier)
app.add_middleware(AuditMiddleware)

# ===========================================
# ROUTERS (avec préfixe /api/admin/v1)
# ===========================================

API_PREFIX = "/api/admin/v1"

app.include_router(auth.router, prefix=API_PREFIX, tags=["Authentication"])
app.include_router(users.router, prefix=API_PREFIX, tags=["Users"])
app.include_router(subscriptions.router, prefix=API_PREFIX, tags=["Subscriptions"])
app.include_router(entrepreneurs.router, prefix=API_PREFIX, tags=["Moderation"])
app.include_router(messages.router, prefix=API_PREFIX, tags=["Support"])
app.include_router(campaigns.router, prefix=API_PREFIX, tags=["Campaigns"])
app.include_router(analytics.router, prefix=API_PREFIX, tags=["Analytics"])
app.include_router(audit.router, prefix=API_PREFIX, tags=["Audit"])
app.include_router(settings_router.router, prefix=API_PREFIX, tags=["Settings"])

# ===========================================
# ROOT ENDPOINTS
# ===========================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "operational",
        "environment": settings.ENVIRONMENT,
        "docs": f"{API_PREFIX}/docs"
    }

@app.get("/api/admin/v1")
async def api_root():
    """API v1 root endpoint"""
    return {
        "message": f"{settings.APP_NAME} - v1",
        "version": settings.APP_VERSION,
        "status": "operational",
        "endpoints": {
            "auth": f"{API_PREFIX}/auth",
            "users": f"{API_PREFIX}/users",
            "subscriptions": f"{API_PREFIX}/subscriptions",
            "moderation": f"{API_PREFIX}/entrepreneurs",
            "messages": f"{API_PREFIX}/messages",
            "campaigns": f"{API_PREFIX}/campaigns",
            "analytics": f"{API_PREFIX}/analytics",
            "audit": f"{API_PREFIX}/audit",
            "settings": f"{API_PREFIX}/settings",
            "docs": f"{API_PREFIX}/docs"
        }
    }

@app.get("/health")
@app.get("/api/health")
@app.get("/api/admin/v1/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT
    }

# ===========================================
# STARTUP & SHUTDOWN EVENTS
# ===========================================

@app.on_event("startup")
async def startup_event():
    logger.info(f"🚀 {settings.APP_NAME} v{settings.APP_VERSION} starting...")
    logger.info(f"📍 Environment: {settings.ENVIRONMENT}")
    logger.info(f"🔗 Supabase URL: {settings.SUPABASE_URL}")
    logger.info(f"🌐 CORS Origins: {settings.cors_origins_list}")
    logger.info(f"🔐 JWT Algorithm: {settings.JWT_ALGORITHM}")
    logger.info("✅ Admin API started successfully!")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("👋 Admin API shutting down...")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8002))
    reload_enabled = settings.ENVIRONMENT.lower() == "development"
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=port,
        reload=reload_enabled
    )
