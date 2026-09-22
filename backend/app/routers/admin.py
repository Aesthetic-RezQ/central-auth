from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload
from ..audit import record_audit
from ..config import get_settings
from ..database import get_db
from ..dependencies import require_superadmin
from ..models import Application, AuditLog, Division, Permission, Role, User, UserApplication
from ..schemas import ApplicationCreate, DivisionCreate, DivisionUpdate, PermissionCreate, PasswordReset, RoleCreate, RolePermissionUpdate, UserApplicationUpdate, UserCreate, UserRoleUpdate, UserUpdate
from ..security import hash_password

router = APIRouter(prefix="/api/v1/admin", tags=["administration"], dependencies=[Depends(require_superadmin)])

def user_view(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "status": user.status,
        "is_superadmin": user.is_superadmin,
        "division": {"id": user.division.id, "code": user.division.code, "name": user.division.name} if user.division else None,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "roles": [{"id": role.id, "name": role.name, "application_code": role.application.code} for role in user.roles],
        "applications": [{"code": app.code, "name": app.name} for app in user.applications],
    }

@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    recent = db.scalars(select(AuditLog).where(AuditLog.event.in_([ "LOGIN_SUCCESS", "LOGIN_FAILED" ])).order_by(AuditLog.timestamp.desc()).limit(10))
    return {
        "total_users": db.scalar(select(func.count(User.id))),
        "active_users": db.scalar(select(func.count(User.id)).where(User.status == "active")),
        "disabled_users": db.scalar(select(func.count(User.id)).where(User.status == "disabled")),
        "registered_applications": db.scalar(select(func.count(Application.id))),
        "recent_authentication_activity": [{"event": log.event, "application": log.application, "timestamp": log.timestamp, "source_ip": log.source_ip} for log in recent],
    }

@router.get("/application-status")
def application_status(db: Session = Depends(get_db)):
    settings = get_settings()
    configured_urls = {
        "ATTENDANCE": settings.attendance_health_url,
        "HELPDESK": settings.helpdesk_health_url,
        "INTRANET": settings.intranet_health_url,
        "BIC_MAILER": settings.bic_mailer_health_url,
        "NMS": settings.nms_health_url,
    }
    registered = db.scalars(select(Application).where(Application.status == "active").order_by(Application.name))
    checked_at = datetime.now(timezone.utc)
    results = []
    for app in registered:
        if app.code == "CENTRAL_AUTH":
            continue
        code = app.code
        health_url = configured_urls.get(code)
        if not health_url:
            results.append({"code": code, "name": app.name, "status": "not_configured", "message": "Health URL is not configured", "checked_at": checked_at})
            continue
        started = datetime.now(timezone.utc)
        try:
            response = httpx.get(
                health_url,
                timeout=settings.connection_check_timeout_seconds,
                follow_redirects=False,
                verify=settings.connection_check_verify_tls,
            )
            latency_ms = round((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            state = "connected" if 200 <= response.status_code < 400 else "unavailable"
            results.append({"code": code, "name": app.name, "status": state, "message": "HTTP " + str(response.status_code), "latency_ms": latency_ms, "checked_at": checked_at})
        except httpx.HTTPError:
            latency_ms = round((datetime.now(timezone.utc) - started).total_seconds() * 1000)
            results.append({"code": code, "name": app.name, "status": "unavailable", "message": "Health endpoint did not respond", "latency_ms": latency_ms, "checked_at": checked_at})
    return {"checked_at": checked_at, "applications": results}

@router.get("/users")
def list_users(db: Session = Depends(get_db)):
    users = db.scalars(select(User).options(selectinload(User.roles).selectinload(Role.application), selectinload(User.applications), selectinload(User.division)).order_by(User.created_at.desc()))
    return [user_view(user) for user in users]

@router.post("/users", status_code=201)
def create_user(payload: UserCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    if db.scalar(select(User).where((User.username == payload.username) | (User.email == payload.email))):
        raise HTTPException(status_code=409, detail="Username or email already exists")
    division = db.get(Division, payload.division_id) if payload.division_id else None
    if payload.division_id and not division:
        raise HTTPException(status_code=404, detail="Division not found")
    user = User(username=payload.username, email=payload.email, full_name=payload.full_name, password_hash=hash_password(payload.password), password_changed_at=datetime.now(timezone.utc), is_superadmin=payload.is_superadmin, division_id=division.id if division else None)
    db.add(user)
    db.flush()
    record_audit(db, request, "USER_CREATED", user_id=actor.id, metadata={"created_user_id": user.id, "username": user.username})
    db.commit()
    db.refresh(user)
    return user_view(user)

@router.get("/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.id == user_id).options(selectinload(User.roles).selectinload(Role.application), selectinload(User.applications), selectinload(User.division)))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_view(user)

@router.put("/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    updates = payload.model_dump(exclude_unset=True)
    if "division_id" in updates and updates["division_id"]:
        if not db.get(Division, updates["division_id"]):
            raise HTTPException(status_code=404, detail="Division not found")
    for field, value in updates.items():
        setattr(user, field, value)
    record_audit(db, request, "USER_UPDATED", user_id=actor.id, metadata={"updated_user_id": user.id})
    db.commit()
    return user_view(user)

@router.delete("/users/{user_id}")
def delete_user(user_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == actor.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    record_audit(db, request, "USER_DELETED", user_id=actor.id, metadata={"deleted_user_id": user.id, "username": user.username})
    db.delete(user)
    db.commit()
    return {"message": "User deleted"}

def set_status(user_id: str, new_status: str, request: Request, db: Session, actor: User):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.status = new_status
    record_audit(db, request, "USER_DISABLED" if new_status == "disabled" else "USER_ENABLED", user_id=actor.id, metadata={"target_user_id": user.id})
    db.commit()
    return {"id": user.id, "status": user.status}

@router.post("/users/{user_id}/disable")
def disable_user(user_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    return set_status(user_id, "disabled", request, db, actor)

@router.post("/users/{user_id}/enable")
def enable_user(user_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    return set_status(user_id, "active", request, db, actor)

@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: str, payload: PasswordReset, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.password_hash = hash_password(payload.password)
    user.password_changed_at = datetime.now(timezone.utc)
    record_audit(db, request, "PASSWORD_RESET", user_id=actor.id, metadata={"target_user_id": user.id})
    db.commit()
    return {"message": "Password reset"}

@router.post("/users/{user_id}/applications")
def update_user_application(user_id: str, payload: UserApplicationUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    user = db.get(User, user_id)
    app = db.scalar(select(Application).where(Application.code == payload.application_code))
    if not user or not app:
        raise HTTPException(status_code=404, detail="User or application not found")
    link = db.scalar(select(UserApplication).where(UserApplication.user_id == user.id, UserApplication.application_id == app.id))
    if link:
        link.enabled = payload.enabled
    else:
        db.add(UserApplication(user_id=user.id, application_id=app.id, enabled=payload.enabled))
    record_audit(db, request, "APPLICATION_ACCESS_UPDATED", user_id=actor.id, application=app.code, metadata={"target_user_id": user.id, "enabled": payload.enabled})
    db.commit()
    return {"application": app.code, "enabled": payload.enabled}

@router.post("/users/{user_id}/roles")
def assign_role(user_id: str, payload: UserRoleUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    user = db.get(User, user_id)
    role = db.scalar(select(Role).where(Role.id == payload.role_id).options(selectinload(Role.application)))
    if not user or not role:
        raise HTTPException(status_code=404, detail="User or role not found")
    application_link = db.scalar(select(UserApplication).where(UserApplication.user_id == user.id, UserApplication.application_id == role.application_id))
    if application_link is None:
        db.add(UserApplication(user_id=user.id, application_id=role.application_id, enabled=True))
    else:
        application_link.enabled = True
    if role not in user.roles:
        user.roles.append(role)
    record_audit(db, request, "ROLE_ASSIGNED", user_id=actor.id, application=role.application.code, metadata={"target_user_id": user.id, "role_id": role.id})
    db.commit()
    return {"message": "Role assigned"}

@router.delete("/users/{user_id}/roles/{role_id}")
def remove_role(user_id: str, role_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    user = db.get(User, user_id)
    role = db.scalar(select(Role).where(Role.id == role_id).options(selectinload(Role.application)))
    if not user or not role:
        raise HTTPException(status_code=404, detail="User or role not found")
    if role in user.roles:
        user.roles.remove(role)
    record_audit(db, request, "ROLE_REMOVED", user_id=actor.id, application=role.application.code, metadata={"target_user_id": user.id, "role_id": role.id})
    db.commit()
    return {"message": "Role removed"}

@router.delete("/users/{user_id}/applications/{application_code}")
def remove_application_access(user_id: str, application_code: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    user = db.get(User, user_id)
    app = db.scalar(select(Application).where(Application.code == application_code))
    if not user or not app:
        raise HTTPException(status_code=404, detail="User or application not found")
    link = db.scalar(select(UserApplication).where(UserApplication.user_id == user.id, UserApplication.application_id == app.id))
    if link:
        db.delete(link)
    record_audit(db, request, "APPLICATION_ACCESS_UPDATED", user_id=actor.id, application=app.code, metadata={"target_user_id": user.id, "enabled": False})
    db.commit()
    return {"application": app.code, "enabled": False}

@router.get("/divisions")
def list_divisions(db: Session = Depends(get_db)):
    divisions = db.scalars(select(Division).order_by(Division.name))
    return [{"id": division.id, "code": division.code, "name": division.name, "description": division.description, "created_at": division.created_at, "updated_at": division.updated_at} for division in divisions]

@router.post("/divisions", status_code=201)
def create_division(payload: DivisionCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    code = payload.code.upper()
    if db.scalar(select(Division).where((Division.code == code) | (Division.name == payload.name))):
        raise HTTPException(status_code=409, detail="Division code or name already exists")
    division = Division(code=code, name=payload.name.strip(), description=payload.description)
    db.add(division)
    db.flush()
    record_audit(db, request, "DIVISION_CREATED", user_id=actor.id, metadata={"division_id": division.id, "code": division.code})
    db.commit()
    db.refresh(division)
    return {"id": division.id, "code": division.code, "name": division.name, "description": division.description, "created_at": division.created_at, "updated_at": division.updated_at}

@router.put("/divisions/{division_id}")
def update_division(division_id: str, payload: DivisionUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    division = db.get(Division, division_id)
    if not division:
        raise HTTPException(status_code=404, detail="Division not found")
    updates = payload.model_dump(exclude_unset=True)
    if "code" in updates:
        updates["code"] = updates["code"].upper()
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if updates:
        duplicate = db.scalar(select(Division).where(Division.id != division.id, (Division.code == updates.get("code", division.code)) | (Division.name == updates.get("name", division.name))))
        if duplicate:
            raise HTTPException(status_code=409, detail="Division code or name already exists")
    for field, value in updates.items():
        setattr(division, field, value)
    record_audit(db, request, "DIVISION_UPDATED", user_id=actor.id, metadata={"division_id": division.id})
    db.commit()
    db.refresh(division)
    return {"id": division.id, "code": division.code, "name": division.name, "description": division.description, "created_at": division.created_at, "updated_at": division.updated_at}

@router.delete("/divisions/{division_id}")
def delete_division(division_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    division = db.get(Division, division_id)
    if not division:
        raise HTTPException(status_code=404, detail="Division not found")
    for user in db.scalars(select(User).where(User.division_id == division.id)):
        user.division_id = None
    record_audit(db, request, "DIVISION_DELETED", user_id=actor.id, metadata={"division_id": division.id, "code": division.code})
    db.delete(division)
    db.commit()
    return {"message": "Division deleted"}

@router.post("/roles/{role_id}/permissions")
def assign_permission(role_id: str, payload: RolePermissionUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    role = db.scalar(select(Role).where(Role.id == role_id).options(selectinload(Role.application), selectinload(Role.permissions)))
    permission = db.scalar(select(Permission).where(Permission.id == payload.permission_id).options(selectinload(Permission.application)))
    if not role or not permission:
        raise HTTPException(status_code=404, detail="Role or permission not found")
    if role.application_id != permission.application_id:
        raise HTTPException(status_code=400, detail="Role and permission must belong to the same application")
    if permission not in role.permissions:
        role.permissions.append(permission)
    record_audit(db, request, "PERMISSION_CHANGED", user_id=actor.id, application=role.application.code, metadata={"role_id": role.id, "permission_id": permission.id})
    db.commit()
    return {"message": "Permission assigned"}

@router.get("/applications")
def list_applications(db: Session = Depends(get_db)):
    return db.scalars(select(Application).order_by(Application.code)).all()

@router.post("/applications", status_code=201)
def create_application(payload: ApplicationCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    if db.scalar(select(Application).where(Application.code == payload.code)):
        raise HTTPException(status_code=409, detail="Application code already exists")
    app = Application(**payload.model_dump())
    db.add(app)
    db.flush()
    record_audit(db, request, "APPLICATION_CREATED", user_id=actor.id, application=app.code)
    db.commit()
    db.refresh(app)
    return app

@router.get("/roles")
def list_roles(db: Session = Depends(get_db)):
    roles = db.scalars(select(Role).options(selectinload(Role.application), selectinload(Role.permissions)).order_by(Role.name))
    return [{"id": r.id, "name": r.name, "description": r.description, "application_code": r.application.code, "permissions": [p.code for p in r.permissions]} for r in roles]

@router.post("/roles", status_code=201)
def create_role(payload: RoleCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    app = db.scalar(select(Application).where(Application.code == payload.application_code))
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    role = Role(application_id=app.id, name=payload.name, description=payload.description)
    db.add(role)
    db.flush()
    record_audit(db, request, "ROLE_CREATED", user_id=actor.id, application=app.code)
    db.commit()
    db.refresh(role)
    return {"id": role.id, "name": role.name, "application_code": app.code}

@router.get("/permissions")
def list_permissions(db: Session = Depends(get_db)):
    permissions = db.scalars(select(Permission).options(selectinload(Permission.application)).order_by(Permission.code))
    return [{"id": p.id, "code": p.code, "description": p.description, "application_code": p.application.code} for p in permissions]

@router.post("/permissions", status_code=201)
def create_permission(payload: PermissionCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    app = db.scalar(select(Application).where(Application.code == payload.application_code))
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    permission = Permission(application_id=app.id, code=payload.code, description=payload.description)
    db.add(permission)
    db.flush()
    record_audit(db, request, "PERMISSION_CREATED", user_id=actor.id, application=app.code)
    db.commit()
    db.refresh(permission)
    return {"id": permission.id, "code": permission.code, "application_code": app.code}

@router.get("/audit-logs")
def audit_logs(event: str | None = None, application: str | None = None, db: Session = Depends(get_db)):
    query = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100)
    if event:
        query = query.where(AuditLog.event == event)
    if application:
        query = query.where(AuditLog.application == application)
    return [{"id": log.id, "event": log.event, "application": log.application, "source_ip": log.source_ip, "timestamp": log.timestamp, "metadata": log.metadata_json} for log in db.scalars(query)]
