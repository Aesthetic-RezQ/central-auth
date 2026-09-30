import base64
import hashlib
import secrets

def compute_pkce_s256_challenge(verifier: str) -> str:
    """Compute S256 code challenge from code_verifier."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

def verify_pkce(code_verifier: str, code_challenge: str, method: str = "S256") -> bool:
    """Validate a PKCE code_verifier against a stored code_challenge."""
    if not code_verifier or not code_challenge:
        return False
    if method != "S256":
        return False

    computed_challenge = compute_pkce_s256_challenge(code_verifier)
    return secrets.compare_digest(computed_challenge, code_challenge)
