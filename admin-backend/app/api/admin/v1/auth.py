from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, EmailStr
from typing import Optional
import logging
import pyotp
from datetime import datetime, timedelta
from jose import jwt

from app.config import get_settings
from app.services.supabase_client import get_supabase_admin
from app.middleware.jwt_auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth")
settings = get_settings()

# ===================================
# SCHEMAS
# ===================================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    requires_2fa: bool
    user: dict

class Verify2FARequest(BaseModel):
    user_id: str
    code: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# ===================================
# ENDPOINTS
# ===================================

@router.post("/login", response_model=LoginResponse)
async def login(credentials: LoginRequest):
    """Login admin avec email/password
    
    1. Vérifie les credentials via Supabase Auth
    2. Vérifie que l'utilisateur est admin
    3. Retourne JWT + flag requires_2fa
    """
    try:
        supabase = get_supabase_admin()
        
        # Authentification via Supabase
        auth_response = supabase.auth.sign_in_with_password({
            "email": credentials.email,
            "password": credentials.password
        })
        
        if not auth_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials"
            )
        
        user = auth_response.user
        access_token = auth_response.session.access_token
        refresh_token = auth_response.session.refresh_token
        
        # Vérifier que l'utilisateur est admin
        admin_check = supabase.table('admin.admin_profiles') \
            .select('*') \
            .eq('user_id', user.id) \
            .eq('is_active', True) \
            .single() \
            .execute()
        
        if not admin_check.data:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access denied"
            )
        
        admin_profile = admin_check.data
        
        # Mettre à jour last_login, login_count et réinitialiser MFA si requis
        requires_2fa = admin_profile.get('requires_2fa', True)
        admin_update_payload = {
            'last_login': datetime.utcnow().isoformat(),
            'login_count': admin_profile.get('login_count', 0) + 1
        }
        if requires_2fa:
            admin_update_payload.update({
                'mfa_verified': False,
                'mfa_verified_at': None
            })
        
        supabase.table('admin.admin_profiles') \
            .update(admin_update_payload) \
            .eq('user_id', user.id) \
            .execute()
        
        # Mettre à jour l'objet profil retourné
        admin_profile.update(admin_update_payload)
        
        # Log audit
        supabase.table('admin.audit_logs').insert({
            'event_type': 'admin.login',
            'severity': 'LOW',
            'user_id': user.id,
            'admin_id': user.id,
            'metadata': {'email': credentials.email}
        }).execute()
        
        return LoginResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            requires_2fa=requires_2fa,
            user={
                "id": user.id,
                "email": user.email,
                "role": admin_profile.get('role'),
                "mfa_verified": admin_profile.get('mfa_verified', False)
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )

@router.post("/verify-2fa")
async def verify_2fa(request: Verify2FARequest):
    """Vérifier le code 2FA (TOTP)
    
    Vérifie le code OTP et marque mfa_verified = true
    """
    try:
        supabase = get_supabase_admin()
        
        # Récupérer le profil admin
        admin_profile = supabase.table('admin.admin_profiles') \
            .select('*') \
            .eq('user_id', request.user_id) \
            .single() \
            .execute()
        
        if not admin_profile.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin profile not found"
            )
        
        profile = admin_profile.data
        mfa_secret = profile.get('mfa_secret')
        
        if not mfa_secret:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="MFA not configured"
            )
        
        # Vérifier le code TOTP
        totp = pyotp.TOTP(mfa_secret)
        if not totp.verify(request.code, valid_window=1):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 2FA code"
            )
        
        # Marquer comme vérifié
        supabase.table('admin.admin_profiles') \
            .update({
                'mfa_verified': True,
                'mfa_verified_at': datetime.utcnow().isoformat()
            }) \
            .eq('user_id', request.user_id) \
            .execute()
        
        return {"message": "2FA verified successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"2FA verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="2FA verification failed"
        )

@router.post("/refresh")
async def refresh_token(request: RefreshTokenRequest):
    """Rafraîchir le JWT access token"""
    try:
        supabase = get_supabase_admin()
        
        # Rafraîchir la session Supabase
        auth_response = supabase.auth.refresh_session(request.refresh_token)
        
        if not auth_response.session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        return {
            "access_token": auth_response.session.access_token,
            "refresh_token": auth_response.session.refresh_token,
            "token_type": "bearer"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )

@router.post("/logout")
async def logout(current_user: dict = Depends(get_current_user)):
    """Logout admin"""
    try:
        supabase = get_supabase_admin()
        
        # Supabase logout
        supabase.auth.sign_out()
        
        # Log audit
        supabase.table('admin.audit_logs').insert({
            'event_type': 'admin.logout',
            'severity': 'LOW',
            'user_id': current_user['id'],
            'admin_id': current_user['id']
        }).execute()
        
        return {"message": "Logged out successfully"}
    
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )

@router.post("/setup-2fa")
async def setup_2fa(current_user: dict = Depends(get_current_user)):
    """Générer un secret TOTP pour configurer 2FA
    
    Retourne le secret + QR code URL
    """
    try:
        supabase = get_supabase_admin()
        
        # Générer un nouveau secret TOTP
        secret = pyotp.random_base32()
        
        # Sauvegarder le secret (temporairement non vérifié)
        supabase.table('admin.admin_profiles') \
            .update({
                'mfa_secret': secret,
                'mfa_verified': False
            }) \
            .eq('user_id', current_user['id']) \
            .execute()
        
        # Générer l'URL de provisioning (pour QR code)
        totp = pyotp.TOTP(secret)
        provisioning_uri = totp.provisioning_uri(
            name=current_user['email'],
            issuer_name="Nexus Connect Admin"
        )
        
        return {
            "secret": secret,
            "provisioning_uri": provisioning_uri,
            "message": "Scan this QR code with your authenticator app"
        }
    
    except Exception as e:
        logger.error(f"2FA setup error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="2FA setup failed"
        )

@router.get("/me")
async def get_current_admin(current_user: dict = Depends(get_current_user)):
    """Récupérer le profil admin courant"""
    try:
        supabase = get_supabase_admin()
        
        # Récupérer le profil complet
        admin_profile = supabase.table('admin.admin_profiles') \
            .select('*') \
            .eq('user_id', current_user['id']) \
            .single() \
            .execute()
        
        if not admin_profile.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin profile not found"
            )
        
        # Récupérer les infos user de auth.users
        user_info = supabase.table('auth.users') \
            .select('email, created_at') \
            .eq('id', current_user['id']) \
            .single() \
            .execute()
        
        profile = admin_profile.data
        profile['email'] = user_info.data.get('email') if user_info.data else None
        
        # Masquer le secret MFA
        if 'mfa_secret' in profile:
            profile['mfa_secret'] = '***'
        
        return profile
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get current admin error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get admin profile"
        )
