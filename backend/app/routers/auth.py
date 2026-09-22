import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session
from ..audit import record_audit
from ..config import get_settings
from ..database import get_db
from ..dependencies import current_user, ensure_application_access
from ..email import send_password_reset_email
from ..models import Application, PasswordResetToken, RefreshToken, User
from ..schemas import ForgotPasswordRequest, LoginRequest, LogoutRequest, RefreshRequest, ResetPasswordRequest, TokenResponse
from ..security import create_access_token, hash_password, hash_password_reset_token, hash_refresh_token, new_password_reset_token, new_refresh_token, verify_password
from ..rate_limit import limiter

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
logger = logging.getLogger(__name__)
PASSWORD_RESET_MESSAGE = "If an active account matches that email address, a password reset link has been sent."

@router.get("/applications")
async def applications(db: Session = Depends(get_db)):
    return [{"code": app.code, "name": app.name, "description": app.description} for app in db.scalars(select(Application).where(Application.status == "active").order_by(Application.name))]

def issue_tokens(db: Session, user: User, application_code: str) -> TokenResponse:
    settings = get_settings()
    access_token, expires_in = create_access_token(user_id=user.id, username=user.username, application_code=application_code)
    raw_refresh = new_refresh_token()
    db.add(RefreshToken(user_id=user.id, token_hash=hash_refresh_token(raw_refresh), expires_at=datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)))
    return TokenResponse(access_token=access_token, refresh_token=raw_refresh, expires_in=expires_in)

@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    app = db.scalar(select(Application).where(Application.code == payload.application_code, Application.status == "active"))
    valid = bool(user and verify_password(payload.password, user.password_hash) and user.status == "active" and app)
    if not valid:
        record_audit(db, request, "LOGIN_FAILED", user_id=user.id if user else None, application=payload.application_code, metadata={"username": payload.username})
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password")
    try:
        ensure_application_access(db, user, payload.application_code)
    except HTTPException:
        record_audit(db, request, "LOGIN_FAILED", user_id=user.id, application=payload.application_code, metadata={"reason": "application_access_denied"})
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or password")
    user.last_login_at = datetime.now(timezone.utc)
    result = issue_tokens(db, user, payload.application_code)
    record_audit(db, request, "LOGIN_SUCCESS", user_id=user.id, application=payload.application_code)
    db.commit()
    return result

@router.post("/forgot-password")
@limiter.limit("5/minute")
async def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    settings = get_settings()
    now = datetime.now(timezone.utc)
    user = db.scalar(select(User).where(func.lower(User.email) == str(payload.email).lower()))
    if not user or user.status != "active":
        record_audit(db, request, "PASSWORD_RESET_REQUESTED", metadata={"account_found": False})
        db.commit()
        return {"message": PASSWORD_RESET_MESSAGE}

    db.execute(
        update(PasswordResetToken)
        .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
        .values(used_at=now)
    )
    raw_token = new_password_reset_token()
    reset_token = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_password_reset_token(raw_token),
        expires_at=now + timedelta(minutes=settings.password_reset_token_expire_minutes),
    )
    db.add(reset_token)
    db.flush()
    reset_url = f"{settings.password_reset_url_base.rstrip('/')}/?reset_token={quote(raw_token, safe='')}"
    try:
        send_password_reset_email(
            recipient=user.email,
            recipient_name=user.full_name,
            reset_url=reset_url,
            expires_minutes=settings.password_reset_token_expire_minutes,
        )
    except Exception:
        reset_token.used_at = now
        record_audit(db, request, "PASSWORD_RESET_EMAIL_FAILED", user_id=user.id, metadata={"account_found": True})
        db.commit()
        logger.exception("Password reset email delivery failed")
        return {"message": PASSWORD_RESET_MESSAGE}

    record_audit(db, request, "PASSWORD_RESET_REQUESTED", user_id=user.id, metadata={"account_found": True})
    db.commit()
    return {"message": PASSWORD_RESET_MESSAGE}

@router.post("/reset-password")
@limiter.limit("10/minute")
async def reset_password(request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    reset_token = db.scalar(select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_password_reset_token(payload.token)))
    if not reset_token or reset_token.used_at or reset_token.expires_at <= now:
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired")
    user = db.get(User, reset_token.user_id)
    if not user or user.status != "active":
        raise HTTPException(status_code=400, detail="This password reset link is invalid or expired")

    user.password_hash = hash_password(payload.password)
    user.password_changed_at = now
    db.execute(update(PasswordResetToken).where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None)).values(used_at=now))
    db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None)).values(revoked_at=now))
    record_audit(db, request, "PASSWORD_RESET_COMPLETED", user_id=user.id)
    db.commit()
    return {"message": "Password reset successfully. You can now sign in."}

@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(payload.refresh_token)))
    now = datetime.now(timezone.utc)
    if not token or token.revoked_at or token.expires_at <= now:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = db.get(User, token.user_id)
    if not user or user.status != "active":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    application_code = request.headers.get("x-application-code", "CENTRAL_AUTH")
    try:
        ensure_application_access(db, user, application_code)
    except HTTPException:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    token.revoked_at = now
    result = issue_tokens(db, user, application_code)
    record_audit(db, request, "TOKEN_REFRESH", user_id=user.id, application=application_code)
    db.commit()
    return result

@router.post("/logout")
async def logout(payload: LogoutRequest, request: Request, db: Session = Depends(get_db), user: User = Depends(current_user)):
    token = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(payload.refresh_token), RefreshToken.user_id == user.id))
    if token and not token.revoked_at:
        token.revoked_at = datetime.now(timezone.utc)
    record_audit(db, request, "LOGOUT", user_id=user.id)
    db.commit()
    return {"message": "Logged out"}

@router.get("/me")
async def me(user: User = Depends(current_user)):
    return {"id": user.id, "username": user.username, "email": user.email, "full_name": user.full_name, "status": user.status, "is_superadmin": user.is_superadmin}

@router.get("/permissions")
async def permissions(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    application_code = request.headers.get("x-application-code", "CENTRAL_AUTH")
    application = ensure_application_access(db, user, application_code)
    codes = set()
    roles = []
    for role in user.roles:
        if role.application_id == application.id:
            roles.append({"id": role.id, "name": role.name, "description": role.description})
            codes.update(permission.code for permission in role.permissions)
    return {
        "application": application.code,
        "roles": sorted(roles, key=lambda role: role["name"]),
        "permissions": sorted(codes),
        "is_superadmin": user.is_superadmin,
    }
