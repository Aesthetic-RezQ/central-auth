from datetime import datetime, timezone
from typing import NamedTuple
from fastapi import Depends, Header, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from .models import ApiKey, Application, User, UserApplication
from .security import decode_access_token, hash_api_key

bearer = HTTPBearer(auto_error=False)

class AuthenticatedClient(NamedTuple):
    client_type: str  # "user" or "api_key"
    client_code: str
    scopes: list[str]
    user: User | None = None
    api_key: ApiKey | None = None

def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        claims = decode_access_token(credentials.credentials)
        user_id = claims.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = db.get(User, user_id)
    if not user or user.status != "active":
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user

def require_superadmin(user: User = Depends(current_user)) -> User:
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return user

def ensure_application_access(db: Session, user: User, application_code: str) -> Application:
    application = db.scalar(select(Application).where(Application.code == application_code, Application.status == "active"))
    if not application:
        raise HTTPException(status_code=403, detail="Application access denied")
    if user.is_superadmin:
        return application
    link = db.scalar(select(UserApplication).where(UserApplication.user_id == user.id, UserApplication.application_id == application.id, UserApplication.enabled.is_(True)))
    if not link:
        raise HTTPException(status_code=403, detail="Application access denied")
    return application

def require_organization_read(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    db: Session = Depends(get_db),
) -> AuthenticatedClient:
    """
    Authenticates requests for the Helpdesk and external organizational identity endpoints.
    Accepts either:
    1. X-API-Key header (or API Key passed as Bearer token).
    2. Valid User JWT token with directory read access (or superadmin).
    """
    now = datetime.now(timezone.utc)
    token_candidate = x_api_key or (credentials.credentials if credentials else None)
    
    if not token_candidate:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a valid Bearer token or X-API-Key header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Try API Key verification
    key_hash = hash_api_key(token_candidate)
    api_key = db.scalar(select(ApiKey).where(ApiKey.key_hash == key_hash))
    if api_key:
        if not api_key.is_active:
            raise HTTPException(status_code=401, detail="API key is inactive")
        if api_key.expires_at and api_key.expires_at <= now:
            raise HTTPException(status_code=401, detail="API key has expired")
        
        # Check required scopes
        scopes = api_key.scopes or []
        if "organization:read" not in scopes and "users:read" not in scopes and "*" not in scopes:
            raise HTTPException(status_code=403, detail="Insufficient API key permissions for organizational data")
        
        return AuthenticatedClient(
            client_type="api_key",
            client_code=api_key.client_code,
            scopes=scopes,
            api_key=api_key,
        )

    # 2. Try User JWT token verification
    try:
        claims = decode_access_token(token_candidate)
        user_id = claims.get("sub")
        user = db.get(User, user_id)
        if not user or user.status != "active":
            raise HTTPException(status_code=401, detail="Invalid or inactive user token")
        
        # Allow superadmin or user with directory read permission
        return AuthenticatedClient(
            client_type="user",
            client_code="USER",
            scopes=["organization:read", "users:read"],
            user=user,
        )
    except JWTError:
        pass

    raise HTTPException(status_code=401, detail="Invalid authentication credentials")
