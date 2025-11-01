from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    """Admin Backend Settings"""
    
    # Supabase
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str
    SUPABASE_JWT_SECRET: str
    
    # App
    APP_NAME: str = "Nexus Connect Admin API"
    APP_VERSION: str = "2.1.0"
    ENVIRONMENT: str = "development"
    ADMIN_DOMAIN: str = "admin-connect.nexus-partners.xyz"
    
    # CORS
    CORS_ORIGINS: str = "http://localhost:3001"
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string"""
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]
    
    # Security
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    SECRET_KEY: str
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 100
    RATE_LIMIT_BURST: int = 20
    
    # Email
    SENDGRID_API_KEY: str = ""
    EMAIL_FROM: str = "noreply@nexus-partners.xyz"
    EMAIL_FROM_NAME: str = "Nexus Connect"
    
    # Impersonation
    IMPERSONATION_TOKEN_EXPIRE_MINUTES: int = 15
    
    # Payment (Moneroo)
    MONEROO_API_KEY: str = ""
    MONEROO_SECRET_KEY: str = ""
    MONEROO_WEBHOOK_SECRET: str = ""
    MONEROO_BASE_URL: str = "https://api.moneroo.io"
    
    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"
    
    # Monitoring
    LOG_LEVEL: str = "INFO"
    ENABLE_OPENTELEMETRY: bool = False
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
