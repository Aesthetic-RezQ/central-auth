from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "Central Authentication Service"
    environment: str = "development"
    database_url: str = "postgresql+psycopg://auth:change-me@localhost:5432/central_auth"
    jwt_secret_key: str = "development-only-change-me"
    jwt_issuer: str = "internal-auth"
    access_token_expire_minutes: int = 10
    refresh_token_expire_days: int = 14
    cors_origins: str = "http://localhost:8080"
    default_admin_username: str = "admin"
    default_admin_email: str = "admin@example.internal"
    default_admin_password: str = "change-this-immediately"
    default_admin_full_name: str = "Central Auth Administrator"
    helpdesk_health_url: str | None = None
    nms_health_url: str | None = None
    attendance_health_url: str | None = None
    intranet_health_url: str | None = None
    bic_mailer_health_url: str | None = None
    password_reset_token_expire_minutes: int = 30
    password_reset_url_base: str = "http://localhost:8080"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_from_name: str = "Central Authentication Service"
    smtp_use_tls: bool = True
    connection_check_timeout_seconds: float = 3.0
    connection_check_verify_tls: bool = True

    # OIDC IdP & SSO Configuration
    oidc_issuer: str = "http://localhost:8080"
    sso_session_expire_hours: int = 8
    authorization_code_expire_seconds: int = 60
    sso_cookie_name: str = "central_auth_sso"
    sso_cookie_secure: bool = False
    sso_cookie_samesite: str = "lax"
    sso_cookie_domain: str | None = None

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [value.strip() for value in self.cors_origins.split(",") if value.strip()]

@lru_cache
def get_settings() -> Settings:
    return Settings()
