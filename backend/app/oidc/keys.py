import base64
import uuid
from datetime import datetime, timezone
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import SigningKey

def _int_to_base64url(val: int) -> str:
    byte_len = (val.bit_length() + 7) // 8
    val_bytes = val.to_bytes(byte_len, byteorder="big")
    return base64.urlsafe_b64encode(val_bytes).decode("ascii").rstrip("=")

def generate_rsa_keypair(kid: str | None = None) -> SigningKey:
    """Generate a new RSA 2048-bit keypair for RS256 token signing."""
    if not kid:
        kid = f"central-auth-{uuid.uuid4().hex[:8]}"

    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")

    return SigningKey(
        kid=kid,
        algorithm="RS256",
        private_key_pem=private_pem,
        public_key_pem=public_pem,
        is_active=True,
    )

def get_or_create_active_signing_key(db: Session) -> SigningKey:
    """Retrieve the current active signing key from DB or create one if none exists."""
    key = db.scalar(
        select(SigningKey)
        .where(SigningKey.is_active.is_(True), SigningKey.retired_at.is_(None))
        .order_by(SigningKey.created_at.desc())
    )
    if not key:
        key = generate_rsa_keypair()
        db.add(key)
        db.commit()
        db.refresh(key)
    return key

def rotate_signing_key(db: Session) -> SigningKey:
    """Retire current active keys and generate a brand new active RSA signing key."""
    active_keys = db.scalars(
        select(SigningKey).where(SigningKey.is_active.is_(True), SigningKey.retired_at.is_(None))
    ).all()
    now = datetime.now(timezone.utc)
    for k in active_keys:
        k.is_active = False
        k.retired_at = now

    new_key = generate_rsa_keypair()
    db.add(new_key)
    db.commit()
    db.refresh(new_key)
    return new_key

def signing_key_to_jwk(key: SigningKey) -> dict:
    """Convert a SigningKey public key into standard JWK format for /oauth/jwks."""
    public_key = serialization.load_pem_public_key(key.public_key_pem.encode("utf-8"))
    public_numbers = public_key.public_numbers()
    return {
        "kty": "RSA",
        "use": "sig",
        "alg": key.algorithm,
        "kid": key.kid,
        "n": _int_to_base64url(public_numbers.n),
        "e": _int_to_base64url(public_numbers.e),
    }

def get_jwks(db: Session) -> dict:
    """Return JSON Web Key Set containing public keys for all valid active and non-retired signing keys."""
    keys = db.scalars(
        select(SigningKey)
        .where(SigningKey.retired_at.is_(None))
        .order_by(SigningKey.created_at.desc())
    ).all()
    if not keys:
        active_key = get_or_create_active_signing_key(db)
        keys = [active_key]

    return {
        "keys": [signing_key_to_jwk(k) for k in keys]
    }
