from fastapi import Request
from sqlalchemy.orm import Session
from .models import AuditLog

def record_audit(db: Session, request: Request, event: str, *, user_id: str | None = None, application: str | None = None, metadata: dict | None = None) -> None:
    forwarded = request.headers.get("x-forwarded-for")
    source_ip = forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
    db.add(AuditLog(user_id=user_id, event=event, application=application, source_ip=source_ip, user_agent=request.headers.get("user-agent"), metadata_json=metadata))

