# app/api/admin/v1/health.py (ou créez-le)
from fastapi import APIRouter, Request

router = APIRouter()

@router.get("/health")
async def health_check():
    """Endpoint de santé pour vérifier CORS"""
    return {
        "status": "healthy",
        "service": "nexus-admin-api",
        "cors": "enabled"
    }

@router.options("/health")
async def health_options():
    """Préflight CORS pour /health"""
    return {"status": "ok"}
