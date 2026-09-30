import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from jose import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from .config import get_settings

password_hasher = PasswordHasher()
ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    return password_hasher.hash(password)

def verify_password(password: str, encoded: str) -> bool:
    try:
        return password_hasher.verify(encoded, password)
    except (VerifyMismatchError, InvalidHashError):
        return False

def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)

def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def new_password_reset_token() -> str:
    return secrets.token_urlsafe(48)

def hash_password_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def generate_api_key(prefix: str = "cas") -> tuple[str, str, str]:
    """Generates a secure API key, returns (full_key, key_prefix, key_hash)."""
    random_part = secrets.token_urlsafe(32)
    full_key = f"{prefix}_{random_part}"
    key_prefix = full_key[:10]
    key_hash = hashlib.sha256(full_key.encode("utf-8")).hexdigest()
    return full_key, key_prefix, key_hash

def hash_api_key(full_key: str) -> str:
    return hashlib.sha256(full_key.encode("utf-8")).hexdigest()

def create_access_token(*, user_id: str, username: str, application_code: str) -> tuple[str, int]:
    settings = get_settings()
    expires = timedelta(minutes=settings.access_token_expire_minutes)
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "username": username, "iss": settings.jwt_issuer, "aud": application_code, "iat": now, "exp": now + expires, "jti": secrets.token_hex(16)}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=ALGORITHM), int(expires.total_seconds())

def decode_access_token(token: str) -> dict:
    settings = get_settings()
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM], issuer=settings.jwt_issuer, options={"verify_aud": False})
