from supabase import create_client, Client
from functools import lru_cache
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

@lru_cache()
def get_supabase_admin() -> Client:
    """Get Supabase admin client with service role key"""
    try:
        client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_ROLE_KEY
        )
        return client
    except Exception as e:
        logger.error(f"Failed to create Supabase client: {str(e)}")
        raise

@lru_cache()
def get_supabase_anon() -> Client:
    """Get Supabase client with anon key (pour les opérations publiques)"""
    try:
        client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY
        )
        return client
    except Exception as e:
        logger.error(f"Failed to create Supabase anon client: {str(e)}")
        raise
