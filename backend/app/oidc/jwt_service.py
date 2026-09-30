from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from ..config import get_settings
from ..models import Application, SigningKey, User

settings = get_settings()

def create_id_token(
    user: User,
    client: Application,
    scopes: list[str],
    signing_key: SigningKey,
    nonce: str | None = None,
    auth_time: int | None = None,
    issuer: str | None = None,
) -> str:
    """Generate a signed OIDC RS256 ID Token for the client application."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=client.id_token_lifetime or 300)
    effective_issuer = issuer or settings.oidc_issuer

    claims = {
        "iss": effective_issuer,
        "sub": user.id,
        "aud": client.client_id,
        "exp": int(expires_at.timestamp()),
        "iat": int(now.timestamp()),
        "auth_time": auth_time or int(now.timestamp()),
    }

    if nonce:
        claims["nonce"] = nonce

    # Profile claims
    if "profile" in scopes:
        claims["name"] = user.full_name
        claims["preferred_username"] = user.username
        parts = user.full_name.split(" ", 1)
        claims["given_name"] = parts[0]
        claims["family_name"] = parts[1] if len(parts) > 1 else ""
        if user.employee_id:
            claims["employee_id"] = user.employee_id
        if user.division:
            claims["division"] = user.division.name
            claims["division_code"] = user.division.code
        if user.position:
            claims["position"] = user.position.name
            claims["is_manager"] = user.position.is_manager
            claims["is_general_manager"] = user.position.is_general_manager
        claims["roles"] = [r.name for r in user.roles if r.application_id == client.id or (r.application and r.application.code == "CENTRAL_AUTH")]

    # Email claims
    if "email" in scopes:
        claims["email"] = user.email
        claims["email_verified"] = True

    # Groups claims
    if "groups" in scopes:
        claims["groups"] = [g.code for g in user.groups] if hasattr(user, "groups") and user.groups else []

    headers = {
        "kid": signing_key.kid,
        "alg": "RS256",
        "typ": "JWT",
    }

    return jwt.encode(claims, signing_key.private_key_pem, algorithm="RS256", headers=headers)

def create_access_token(
    user: User,
    client: Application,
    scopes: list[str],
    signing_key: SigningKey,
    issuer: str | None = None,
) -> str:
    """Generate an RS256 Access Token for /oauth/userinfo and API interactions."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=client.access_token_lifetime or 600)
    effective_issuer = issuer or settings.oidc_issuer

    claims = {
        "iss": effective_issuer,
        "sub": user.id,
        "aud": client.client_id,
        "client_id": client.client_id,
        "scope": " ".join(scopes),
        "exp": int(expires_at.timestamp()),
        "iat": int(now.timestamp()),
        "token_type": "Bearer",
    }

    headers = {
        "kid": signing_key.kid,
        "alg": "RS256",
        "typ": "JWT",
    }

    return jwt.encode(claims, signing_key.private_key_pem, algorithm="RS256", headers=headers)

def decode_access_token(token: str, signing_key: SigningKey) -> dict:
    """Decode and validate an RS256 Access Token."""
    return jwt.decode(
        token,
        signing_key.public_key_pem,
        algorithms=["RS256"],
        options={"verify_aud": False, "verify_iss": False},
    )
