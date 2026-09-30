import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from ..config import get_settings
from ..models import SsoSession, User

settings = get_settings()

def _hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_sso_session(
    db: Session,
    user: User,
    request: Request,
    response: Response,
) -> tuple[SsoSession, str]:
    """Create a new CentralAuth SSO browser session and attach secure cookie."""
    raw_token = secrets.token_urlsafe(36)
    token_hash = _hash_session_token(raw_token)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=settings.sso_session_expire_hours)

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:500]

    session = SsoSession(
        user_id=user.id,
        session_token_hash=token_hash,
        ip_address=ip_address,
        user_agent=user_agent,
        created_at=now,
        last_activity_at=now,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # Set secure HTTP-only cookie on response
    max_age = int(settings.sso_session_expire_hours * 3600)
    response.set_cookie(
        key=settings.sso_cookie_name,
        value=raw_token,
        max_age=max_age,
        expires=max_age,
        path="/",
        domain=settings.sso_cookie_domain,
        secure=settings.sso_cookie_secure,
        httponly=True,
        samesite=settings.sso_cookie_samesite,
    )

    return session, raw_token

def get_sso_user(db: Session, request: Request) -> User | None:
    """Retrieve authenticated User from request SSO cookie if valid and active."""
    raw_token = request.cookies.get(settings.sso_cookie_name)
    if not raw_token:
        return None

    token_hash = _hash_session_token(raw_token)
    now = datetime.now(timezone.utc)

    session = db.scalar(
        select(SsoSession)
        .where(
            SsoSession.session_token_hash == token_hash,
            SsoSession.revoked_at.is_(None),
            SsoSession.expires_at > now,
        )
        .options(
            selectinload(SsoSession.user).selectinload(User.roles),
            selectinload(SsoSession.user).selectinload(User.division),
            selectinload(SsoSession.user).selectinload(User.position),
            selectinload(SsoSession.user).selectinload(User.groups),
        )
    )

    if not session or not session.user or session.user.status != "active":
        return None

    # Update last activity
    session.last_activity_at = now
    db.commit()

    return session.user

def revoke_sso_session(db: Session, request: Request, response: Response) -> bool:
    """Revoke active SSO session from cookie and clear browser cookie."""
    raw_token = request.cookies.get(settings.sso_cookie_name)
    if raw_token:
        token_hash = _hash_session_token(raw_token)
        session = db.scalar(select(SsoSession).where(SsoSession.session_token_hash == token_hash))
        if session:
            session.revoked_at = datetime.now(timezone.utc)
            db.commit()

    response.delete_cookie(
        key=settings.sso_cookie_name,
        path="/",
        domain=settings.sso_cookie_domain,
    )
    return True

def revoke_all_user_sso_sessions(db: Session, user_id: str) -> int:
    """Revoke all active SSO sessions for a specific user."""
    sessions = db.scalars(
        select(SsoSession).where(SsoSession.user_id == user_id, SsoSession.revoked_at.is_(None))
    ).all()
    now = datetime.now(timezone.utc)
    for s in sessions:
        s.revoked_at = now
    db.commit()
    return len(sessions)
