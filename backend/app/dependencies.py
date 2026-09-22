from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session
from .database import get_db
from .models import Application, User, UserApplication
from .security import decode_access_token
from jose import JWTError

bearer = HTTPBearer(auto_error=False)

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

