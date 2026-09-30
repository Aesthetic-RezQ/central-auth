import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
import httpx
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload
from ..audit import record_audit
from ..config import get_settings
from ..database import get_db
from ..dependencies import require_superadmin
from ..models import (
    ApiKey,
    Application,
    ApplicationRedirectUri,
    AuditLog,
    Division,
    Permission,
    Position,
    Role,
    SigningKey,
    SsoSession,
    User,
    UserApplication,
)
from ..schemas import (
    ApiKeyCreate,
    ApiKeyCreatedOut,
    ApiKeyOut,
    ApplicationCreate,
    ApplicationDetailOut,
    ApplicationOidcUpdate,
    ApplicationRedirectUriCreate,
    ApplicationRedirectUriOut,
    ClientSecretRegenerateOut,
    DivisionCreate,
    DivisionUpdate,
    PasswordReset,
    PermissionCreate,
    PermissionUpdate,
    PositionCreate,
    PositionOut,
    PositionUpdate,
    RoleAssignUsers,
    RoleClone,
    RoleCreate,
    RolePermissionUpdate,
    RoleUpdate,
    SsoSessionOut,
    UserApplicationUpdate,
    UserCreate,
    UserRoleUpdate,
    UserUpdate,
)
from ..security import generate_api_key, hash_password

router = APIRouter(prefix="/api/v1/admin", tags=["administration"], dependencies=[Depends(require_superadmin)])


def user_view(user: User) -> dict:
    if user.is_superadmin or (user.position and user.position.is_general_manager):
        org_role = "general_manager"
    elif user.position and user.position.is_manager:
        org_role = "manager"
    else:
        org_role = "employee"

    return {
        "id": user.id,
        "employee_id": user.employee_id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "status": user.status,
        "is_superadmin": user.is_superadmin,
        "org_role": org_role,
        "division": {"id": user.division.id, "code": user.division.code, "name": user.division.name} if user.division else None,
        "position": {"id": user.position.id, "code": user.position.code, "name": user.position.name, "is_manager": user.position.is_manager, "is_general_manager": user.position.is_general_manager} if user.position else None,
        "manager": {"id": user.manager.id, "employee_id": user.manager.employee_id, "username": user.manager.username, "full_name": user.manager.full_name, "email": user.manager.email} if user.manager else None,
        "last_login_at": user.last_login_at,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "roles": [{"id": role.id, "name": role.name, "application_code": role.application.code} for role in user.roles],
        "applications": [{"code": app.code, "name": app.name} for app in user.applications],
    }

@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db)):
    recent = db.scalars(select(AuditLog).where(AuditLog.event.in_(["LOGIN_SUCCESS", "LOGIN_FAILED", "ORGANIZATION_SYNC_QUERY"])).order_by(AuditLog.timestamp.desc()).limit(10))
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
    users = db.scalars(
        select(User).options(
            selectinload(User.roles).selectinload(Role.application),
            selectinload(User.applications),
            selectinload(User.division),
            selectinload(User.position),
            selectinload(User.manager),
        ).order_by(User.created_at.desc())
    )
    return [user_view(user) for user in users]

@router.post("/users", status_code=201)
def create_user(payload: UserCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    conditions = [User.username == payload.username, User.email == payload.email]
    if payload.employee_id:
        conditions.append(User.employee_id == payload.employee_id.strip())
    if db.scalar(select(User).where(or_(*conditions))):
        raise HTTPException(status_code=409, detail="Username, email, or employee ID already exists")

    division = db.get(Division, payload.division_id) if payload.division_id else None
    if payload.division_id and not division:
        raise HTTPException(status_code=404, detail="Division not found")
        
    position = db.get(Position, payload.position_id) if payload.position_id else None
    if payload.position_id and not position:
        raise HTTPException(status_code=404, detail="Position not found")

    manager = db.get(User, payload.manager_user_id) if payload.manager_user_id else None
    if payload.manager_user_id and not manager:
        raise HTTPException(status_code=404, detail="Manager user not found")

    user = User(
        username=payload.username.strip(),
        email=payload.email.strip(),
        full_name=payload.full_name.strip(),
        employee_id=payload.employee_id.strip() if payload.employee_id else None,
        password_hash=hash_password(payload.password),
        password_changed_at=datetime.now(timezone.utc),
        is_superadmin=payload.is_superadmin,
        division_id=division.id if division else None,
        position_id=position.id if position else None,
        manager_user_id=manager.id if manager else None,
    )
    db.add(user)
    db.flush()
    record_audit(db, request, "USER_CREATED", user_id=actor.id, metadata={"created_user_id": user.id, "username": user.username, "employee_id": user.employee_id})
    db.commit()
    db.refresh(user)
    return user_view(user)

@router.get("/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db)):
    user = db.scalar(
        select(User).where(User.id == user_id).options(
            selectinload(User.roles).selectinload(Role.application),
            selectinload(User.applications),
            selectinload(User.division),
            selectinload(User.position),
            selectinload(User.manager),
        )
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user_view(user)

@router.put("/users/{user_id}")
def update_user(user_id: str, payload: UserUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    updates = payload.model_dump(exclude_unset=True)

    if "employee_id" in updates:
        emp_id = updates["employee_id"].strip() if updates["employee_id"] else None
        if emp_id:
            duplicate = db.scalar(select(User).where(User.id != user.id, User.employee_id == emp_id))
            if duplicate:
                raise HTTPException(status_code=409, detail="Employee ID already belongs to another user")
        updates["employee_id"] = emp_id

    if "division_id" in updates and updates["division_id"]:
        if not db.get(Division, updates["division_id"]):
            raise HTTPException(status_code=404, detail="Division not found")

    if "position_id" in updates and updates["position_id"]:
        if not db.get(Position, updates["position_id"]):
            raise HTTPException(status_code=404, detail="Position not found")

    if "manager_user_id" in updates and updates["manager_user_id"]:
        if updates["manager_user_id"] == user.id:
            raise HTTPException(status_code=400, detail="User cannot be their own manager")
        if not db.get(User, updates["manager_user_id"]):
            raise HTTPException(status_code=404, detail="Manager user not found")

    for field, value in updates.items():
        setattr(user, field, value)
    
    user.updated_at = datetime.now(timezone.utc)
    record_audit(db, request, "USER_UPDATED", user_id=actor.id, metadata={"updated_user_id": user.id, "changes": list(updates.keys())})
    db.commit()
    db.refresh(user)
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
    user.updated_at = datetime.now(timezone.utc)
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
    user.updated_at = datetime.now(timezone.utc)
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
    user.updated_at = datetime.now(timezone.utc)
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
    user.updated_at = datetime.now(timezone.utc)
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
    user.updated_at = datetime.now(timezone.utc)
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
    user.updated_at = datetime.now(timezone.utc)
    record_audit(db, request, "APPLICATION_ACCESS_UPDATED", user_id=actor.id, application=app.code, metadata={"target_user_id": user.id, "enabled": False})
    db.commit()
    return {"application": app.code, "enabled": False}

# Divisions CRUD
@router.get("/divisions")
def list_divisions(db: Session = Depends(get_db)):
    divisions = db.scalars(select(Division).options(selectinload(Division.manager)).order_by(Division.name)).all()
    results = []
    for d in divisions:
        results.append({
            "id": d.id,
            "code": d.code,
            "name": d.name,
            "description": d.description,
            "manager_user_id": d.manager_user_id,
            "manager": {"id": d.manager.id, "employee_id": d.manager.employee_id, "username": d.manager.username, "full_name": d.manager.full_name, "email": d.manager.email} if d.manager else None,
            "created_at": d.created_at,
            "updated_at": d.updated_at,
        })
    return results

@router.post("/divisions", status_code=201)
def create_division(payload: DivisionCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    code = payload.code.upper()
    if db.scalar(select(Division).where((Division.code == code) | (Division.name == payload.name))):
        raise HTTPException(status_code=409, detail="Division code or name already exists")
    
    manager = None
    if payload.manager_user_id:
        manager = db.get(User, payload.manager_user_id)
        if not manager:
            raise HTTPException(status_code=404, detail="Division manager user not found")

    division = Division(
        code=code,
        name=payload.name.strip(),
        description=payload.description,
        manager_user_id=manager.id if manager else None,
    )
    db.add(division)
    db.flush()
    record_audit(db, request, "DIVISION_CREATED", user_id=actor.id, metadata={"division_id": division.id, "code": division.code, "manager_user_id": division.manager_user_id})
    db.commit()
    db.refresh(division)
    return {
        "id": division.id,
        "code": division.code,
        "name": division.name,
        "description": division.description,
        "manager_user_id": division.manager_user_id,
        "created_at": division.created_at,
        "updated_at": division.updated_at,
    }

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
    if "manager_user_id" in updates and updates["manager_user_id"]:
        if not db.get(User, updates["manager_user_id"]):
            raise HTTPException(status_code=404, detail="Division manager user not found")
            
    if updates:
        duplicate = db.scalar(select(Division).where(Division.id != division.id, (Division.code == updates.get("code", division.code)) | (Division.name == updates.get("name", division.name))))
        if duplicate:
            raise HTTPException(status_code=409, detail="Division code or name already exists")
            
    for field, value in updates.items():
        setattr(division, field, value)
    division.updated_at = datetime.now(timezone.utc)
    record_audit(db, request, "DIVISION_UPDATED", user_id=actor.id, metadata={"division_id": division.id, "manager_user_id": division.manager_user_id})
    db.commit()
    db.refresh(division)
    return {
        "id": division.id,
        "code": division.code,
        "name": division.name,
        "description": division.description,
        "manager_user_id": division.manager_user_id,
        "created_at": division.created_at,
        "updated_at": division.updated_at,
    }

@router.delete("/divisions/{division_id}")
def delete_division(division_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    division = db.get(Division, division_id)
    if not division:
        raise HTTPException(status_code=404, detail="Division not found")
    for user in db.scalars(select(User).where(User.division_id == division.id)):
        user.division_id = None
        user.updated_at = datetime.now(timezone.utc)
    record_audit(db, request, "DIVISION_DELETED", user_id=actor.id, metadata={"division_id": division.id, "code": division.code})
    db.delete(division)
    db.commit()
    return {"message": "Division deleted"}

# Positions CRUD
@router.get("/positions", response_model=list[PositionOut])
def list_positions(db: Session = Depends(get_db)):
    return db.scalars(select(Position).order_by(Position.level.desc(), Position.name.asc())).all()

@router.post("/positions", response_model=PositionOut, status_code=201)
def create_position(payload: PositionCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    code = payload.code.upper().strip()
    name = payload.name.strip()
    if db.scalar(select(Position).where((Position.code == code) | (Position.name == name))):
        raise HTTPException(status_code=409, detail="Position code or name already exists")
    pos = Position(
        code=code,
        name=name,
        level=payload.level,
        is_manager=payload.is_manager,
        is_general_manager=payload.is_general_manager,
        description=payload.description,
    )
    db.add(pos)
    db.flush()
    record_audit(db, request, "POSITION_CREATED", user_id=actor.id, metadata={"position_id": pos.id, "code": pos.code})
    db.commit()
    db.refresh(pos)
    return pos

@router.put("/positions/{position_id}", response_model=PositionOut)
def update_position(position_id: str, payload: PositionUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    pos = db.get(Position, position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    updates = payload.model_dump(exclude_unset=True)
    if "code" in updates:
        updates["code"] = updates["code"].upper().strip()
    if "name" in updates:
        updates["name"] = updates["name"].strip()
    if updates:
        duplicate = db.scalar(select(Position).where(Position.id != pos.id, (Position.code == updates.get("code", pos.code)) | (Position.name == updates.get("name", pos.name))))
        if duplicate:
            raise HTTPException(status_code=409, detail="Position code or name already exists")
    for field, value in updates.items():
        setattr(pos, field, value)
    pos.updated_at = datetime.now(timezone.utc)
    record_audit(db, request, "POSITION_UPDATED", user_id=actor.id, metadata={"position_id": pos.id})
    db.commit()
    db.refresh(pos)
    return pos

@router.delete("/positions/{position_id}")
def delete_position(position_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    pos = db.get(Position, position_id)
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found")
    for user in db.scalars(select(User).where(User.position_id == pos.id)):
        user.position_id = None
        user.updated_at = datetime.now(timezone.utc)
    record_audit(db, request, "POSITION_DELETED", user_id=actor.id, metadata={"position_id": pos.id, "code": pos.code})
    db.delete(pos)
    db.commit()
    return {"message": "Position deleted"}

# API Keys Management
@router.get("/api-keys", response_model=list[ApiKeyOut])
def list_api_keys(db: Session = Depends(get_db)):
    return db.scalars(select(ApiKey).order_by(ApiKey.created_at.desc())).all()

@router.post("/api-keys", response_model=ApiKeyCreatedOut, status_code=201)
def create_api_key(payload: ApiKeyCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    raw_key, key_prefix, key_hash = generate_api_key(prefix="cas")
    expires_at = datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days) if payload.expires_in_days else None
    
    api_key = ApiKey(
        name=payload.name.strip(),
        client_code=payload.client_code.upper().strip(),
        key_hash=key_hash,
        key_prefix=key_prefix,
        scopes=payload.scopes,
        expires_at=expires_at,
    )
    db.add(api_key)
    db.flush()
    record_audit(db, request, "API_KEY_CREATED", user_id=actor.id, metadata={"api_key_id": api_key.id, "client_code": api_key.client_code, "key_prefix": key_prefix})
    db.commit()
    db.refresh(api_key)

    return ApiKeyCreatedOut(
        id=api_key.id,
        name=api_key.name,
        client_code=api_key.client_code,
        key_prefix=api_key.key_prefix,
        scopes=api_key.scopes,
        is_active=api_key.is_active,
        expires_at=api_key.expires_at,
        created_at=api_key.created_at,
        api_key=raw_key,
    )

@router.delete("/api-keys/{key_id}")
def delete_api_key(key_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    api_key = db.get(ApiKey, key_id)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    record_audit(db, request, "API_KEY_DELETED", user_id=actor.id, metadata={"api_key_id": api_key.id, "client_code": api_key.client_code})
    db.delete(api_key)
    db.commit()
    return {"message": "API key revoked and deleted"}

# Applications, Roles, Permissions
@router.get("/applications")
def list_applications(db: Session = Depends(get_db)):
    apps = db.scalars(
        select(Application)
        .options(selectinload(Application.redirect_uris))
        .order_by(Application.code)
    ).all()
    results = []
    for app in apps:
        results.append({
            "id": app.id,
            "code": app.code,
            "name": app.name,
            "description": app.description,
            "status": app.status,
            "client_id": app.client_id or app.code.lower(),
            "client_type": app.client_type or "confidential",
            "require_consent": bool(app.require_consent),
            "allowed_scopes": app.allowed_scopes_list,
            "access_token_lifetime": app.access_token_lifetime or 3600,
            "id_token_lifetime": app.id_token_lifetime or 3600,
            "has_client_secret": bool(app.client_secret_hash),
            "redirect_uris": [
                {"id": r.id, "application_id": r.application_id, "uri": r.uri, "created_at": r.created_at}
                for r in app.redirect_uris
            ],
        })
    return results

@router.get("/applications/{app_id}")
def get_application(app_id: str, db: Session = Depends(get_db)):
    app = db.scalar(
        select(Application)
        .where(or_(Application.id == app_id, Application.code == app_id, Application.client_id == app_id))
        .options(selectinload(Application.redirect_uris))
    )
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return {
        "id": app.id,
        "code": app.code,
        "name": app.name,
        "description": app.description,
        "status": app.status,
        "client_id": app.client_id or app.code.lower(),
        "client_type": app.client_type or "confidential",
        "require_consent": bool(app.require_consent),
        "allowed_scopes": app.allowed_scopes_list,
        "access_token_lifetime": app.access_token_lifetime or 3600,
        "id_token_lifetime": app.id_token_lifetime or 3600,
        "has_client_secret": bool(app.client_secret_hash),
        "redirect_uris": [
            {"id": r.id, "application_id": r.application_id, "uri": r.uri, "created_at": r.created_at}
            for r in app.redirect_uris
        ],
    }

@router.post("/applications", status_code=201)
def create_application(payload: ApplicationCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    if db.scalar(select(Application).where(Application.code == payload.code)):
        raise HTTPException(status_code=409, detail="Application code already exists")
    app_data = payload.model_dump()
    client_id = app_data.get("code", "").lower()
    app = Application(**app_data, client_id=client_id, client_type="confidential", allowed_scopes="openid profile email roles org")
    db.add(app)
    db.flush()
    record_audit(db, request, "APPLICATION_CREATED", user_id=actor.id, application=app.code)
    db.commit()
    db.refresh(app)
    return app

@router.put("/applications/{app_id}")
def update_application(app_id: str, payload: ApplicationOidcUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    app = db.scalar(select(Application).where(or_(Application.id == app_id, Application.code == app_id)))
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if payload.name is not None:
        app.name = payload.name.strip()
    if payload.description is not None:
        app.description = payload.description.strip() if payload.description else None
    if payload.status is not None:
        app.status = payload.status
    if payload.client_type is not None:
        app.client_type = payload.client_type
    if payload.require_consent is not None:
        app.require_consent = payload.require_consent
    if payload.allowed_scopes is not None:
        app.allowed_scopes = " ".join(payload.allowed_scopes)
    if payload.access_token_lifetime is not None:
        app.access_token_lifetime = payload.access_token_lifetime
    if payload.id_token_lifetime is not None:
        app.id_token_lifetime = payload.id_token_lifetime

    record_audit(db, request, "APPLICATION_UPDATED", user_id=actor.id, application=app.code)
    db.commit()
    db.refresh(app)
    return {"message": f"Application {app.code} updated"}

@router.post("/applications/{app_id}/redirect-uris", status_code=201)
def add_redirect_uri(app_id: str, payload: ApplicationRedirectUriCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    app = db.scalar(select(Application).where(or_(Application.id == app_id, Application.code == app_id)))
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    uri = payload.uri.strip()
    if db.scalar(select(ApplicationRedirectUri).where(ApplicationRedirectUri.application_id == app.id, ApplicationRedirectUri.redirect_uri == uri)):
        raise HTTPException(status_code=409, detail="Redirect URI already registered for this application")
    red_uri = ApplicationRedirectUri(application_id=app.id, redirect_uri=uri)
    db.add(red_uri)
    db.flush()
    record_audit(db, request, "REDIRECT_URI_ADDED", user_id=actor.id, application=app.code, metadata={"uri": uri})
    db.commit()
    db.refresh(red_uri)
    return {"id": red_uri.id, "application_id": red_uri.application_id, "uri": red_uri.redirect_uri, "created_at": red_uri.created_at}

@router.delete("/applications/{app_id}/redirect-uris/{uri_id}")
def delete_redirect_uri(app_id: str, uri_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    red_uri = db.get(ApplicationRedirectUri, uri_id)
    if not red_uri:
        raise HTTPException(status_code=404, detail="Redirect URI not found")
    app = db.get(Application, red_uri.application_id)
    app_code = app.code if app else "UNKNOWN"
    record_audit(db, request, "REDIRECT_URI_DELETED", user_id=actor.id, application=app_code, metadata={"uri_id": uri_id, "uri": red_uri.uri})
    db.delete(red_uri)
    db.commit()
    return {"message": "Redirect URI removed"}

@router.post("/applications/{app_id}/regenerate-secret")
def regenerate_client_secret(app_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    app = db.scalar(select(Application).where(or_(Application.id == app_id, Application.code == app_id)))
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    raw_secret = secrets.token_urlsafe(32)
    app.client_secret_hash = hash_password(raw_secret)
    if not app.client_id:
        app.client_id = app.code.lower()
    record_audit(db, request, "CLIENT_SECRET_REGENERATED", user_id=actor.id, application=app.code)
    db.commit()
    return {"client_id": app.client_id, "client_secret": raw_secret}


@router.get("/roles")
def list_roles(db: Session = Depends(get_db)):
    roles = db.scalars(
        select(Role).options(
            selectinload(Role.application),
            selectinload(Role.permissions),
            selectinload(Role.users),
        ).order_by(Role.name)
    ).all()
    SYSTEM_ROLES = {"CENTRAL_SUPERADMIN", "NMS_ADMIN"}
    return [
        {
            "id": r.id,
            "name": r.name,
            "description": r.description,
            "application_id": r.application.id,
            "application_code": r.application.code,
            "application_name": r.application.name,
            "is_system": r.name in SYSTEM_ROLES,
            "role_type": "system" if r.name in SYSTEM_ROLES else ("organizational" if r.application.code == "CENTRAL_AUTH" and r.name in {"USER_ADMIN", "AUDITOR", "RBAC_ADMIN"} else "application"),
            "user_count": len(r.users),
            "permission_count": len(r.permissions),
            "permissions": [p.code for p in r.permissions],
            "permission_ids": [p.id for p in r.permissions],
            "created_at": r.created_at,
        }
        for r in roles
    ]

@router.get("/roles/{role_id}")
def get_role(role_id: str, db: Session = Depends(get_db)):
    role = db.scalar(
        select(Role).where(Role.id == role_id).options(
            selectinload(Role.application),
            selectinload(Role.permissions),
            selectinload(Role.users).selectinload(User.division),
            selectinload(Role.users).selectinload(User.position),
        )
    )
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    SYSTEM_ROLES = {"CENTRAL_SUPERADMIN", "NMS_ADMIN"}
    is_system = role.name in SYSTEM_ROLES

    def extract_module(code: str) -> str:
        parts = code.split(".")
        if len(parts) >= 2:
            return parts[1].replace("_", " ").title()
        return "General"

    permissions_detail = [
        {
            "id": p.id,
            "code": p.code,
            "description": p.description,
            "module": extract_module(p.code),
            "application_code": role.application.code,
        }
        for p in sorted(role.permissions, key=lambda x: x.code)
    ]

    users_detail = [
        {
            "id": u.id,
            "employee_id": u.employee_id,
            "username": u.username,
            "full_name": u.full_name,
            "email": u.email,
            "status": u.status,
            "division_name": u.division.name if u.division else None,
            "position_name": u.position.name if u.position else None,
        }
        for u in sorted(role.users, key=lambda x: (x.full_name or x.username).lower())
    ]

    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "application_id": role.application.id,
        "application_code": role.application.code,
        "application_name": role.application.name,
        "is_system": is_system,
        "role_type": "system" if is_system else ("organizational" if role.application.code == "CENTRAL_AUTH" and role.name in {"USER_ADMIN", "AUDITOR", "RBAC_ADMIN"} else "application"),
        "user_count": len(role.users),
        "permission_count": len(role.permissions),
        "permissions": permissions_detail,
        "permission_codes": [p.code for p in role.permissions],
        "permission_ids": [p.id for p in role.permissions],
        "users": users_detail,
        "created_at": role.created_at,
    }

@router.post("/roles", status_code=201)
def create_role(payload: RoleCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    app = db.scalar(select(Application).where(Application.code == payload.application_code))
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    name = payload.name.strip()
    if db.scalar(select(Role).where(Role.application_id == app.id, Role.name == name)):
        raise HTTPException(status_code=409, detail=f"Role '{name}' already exists in application {app.code}")
    role = Role(application_id=app.id, name=name, description=payload.description.strip() if payload.description else None)
    if payload.permission_ids:
        perms = db.scalars(select(Permission).where(Permission.id.in_(payload.permission_ids), Permission.application_id == app.id)).all()
        role.permissions = list(perms)
    db.add(role)
    db.flush()
    record_audit(db, request, "ROLE_CREATED", user_id=actor.id, application=app.code, metadata={"role_id": role.id, "role_name": role.name, "permission_count": len(role.permissions)})
    db.commit()
    db.refresh(role)
    return {"id": role.id, "name": role.name, "application_code": app.code, "permission_count": len(role.permissions)}

@router.put("/roles/{role_id}")
def update_role(role_id: str, payload: RoleUpdate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    role = db.scalar(select(Role).where(Role.id == role_id).options(selectinload(Role.application), selectinload(Role.permissions)))
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    SYSTEM_ROLES = {"CENTRAL_SUPERADMIN", "NMS_ADMIN"}
    if role.name in SYSTEM_ROLES and payload.name and payload.name.strip() != role.name:
        raise HTTPException(status_code=400, detail="Cannot rename a core system role")

    if payload.name and payload.name.strip() != role.name:
        new_name = payload.name.strip()
        dup = db.scalar(select(Role).where(Role.application_id == role.application_id, Role.name == new_name, Role.id != role.id))
        if dup:
            raise HTTPException(status_code=409, detail=f"Role '{new_name}' already exists in application {role.application.code}")
        role.name = new_name

    if payload.description is not None:
        role.description = payload.description.strip() if payload.description else None

    if payload.permission_ids is not None:
        perms = db.scalars(select(Permission).where(Permission.id.in_(payload.permission_ids), Permission.application_id == role.application_id)).all()
        role.permissions = list(perms)

    record_audit(db, request, "ROLE_UPDATED", user_id=actor.id, application=role.application.code, metadata={"role_id": role.id, "role_name": role.name, "permission_count": len(role.permissions)})
    db.commit()
    db.refresh(role)
    return {"id": role.id, "name": role.name, "application_code": role.application.code, "permission_count": len(role.permissions)}

@router.delete("/roles/{role_id}")
def delete_role(role_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    role = db.scalar(select(Role).where(Role.id == role_id).options(selectinload(Role.application)))
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    SYSTEM_ROLES = {"CENTRAL_SUPERADMIN", "NMS_ADMIN"}
    if role.name in SYSTEM_ROLES:
        raise HTTPException(status_code=400, detail="Cannot delete core system role")
    role_name = role.name
    app_code = role.application.code
    db.delete(role)
    record_audit(db, request, "ROLE_DELETED", user_id=actor.id, application=app_code, metadata={"role_id": role_id, "role_name": role_name})
    db.commit()
    return {"message": f"Role '{role_name}' deleted successfully"}

@router.post("/roles/{role_id}/clone", status_code=201)
def clone_role(role_id: str, payload: RoleClone, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    source = db.scalar(select(Role).where(Role.id == role_id).options(selectinload(Role.application), selectinload(Role.permissions)))
    if not source:
        raise HTTPException(status_code=404, detail="Source role not found")
    target_name = payload.name.strip()
    dup = db.scalar(select(Role).where(Role.application_id == source.application_id, Role.name == target_name))
    if dup:
        raise HTTPException(status_code=409, detail=f"Role '{target_name}' already exists in application {source.application.code}")
    cloned = Role(
        application_id=source.application_id,
        name=target_name,
        description=payload.description.strip() if payload.description else f"Cloned from {source.name}",
        permissions=list(source.permissions),
    )
    db.add(cloned)
    db.flush()
    record_audit(db, request, "ROLE_CLONED", user_id=actor.id, application=source.application.code, metadata={"source_role_id": source.id, "cloned_role_id": cloned.id, "role_name": cloned.name})
    db.commit()
    db.refresh(cloned)
    return {"id": cloned.id, "name": cloned.name, "application_code": source.application.code, "permission_count": len(cloned.permissions)}

@router.post("/roles/{role_id}/users")
def assign_users_to_role(role_id: str, payload: RoleAssignUsers, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    role = db.scalar(select(Role).where(Role.id == role_id).options(selectinload(Role.application), selectinload(Role.users)))
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    users = db.scalars(select(User).where(User.id.in_(payload.user_ids))).all()
    count = 0
    for user in users:
        if role not in user.roles:
            user.roles.append(role)
            count += 1
        app_link = db.scalar(select(UserApplication).where(UserApplication.user_id == user.id, UserApplication.application_id == role.application_id))
        if app_link is None:
            db.add(UserApplication(user_id=user.id, application_id=role.application_id, enabled=True))
        else:
            app_link.enabled = True
    record_audit(db, request, "ROLE_USERS_ASSIGNED", user_id=actor.id, application=role.application.code, metadata={"role_id": role.id, "assigned_count": count})
    db.commit()
    return {"message": f"{count} user(s) assigned to role {role.name}"}

@router.delete("/roles/{role_id}/users/{user_id}")
def remove_user_from_role(role_id: str, user_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    role = db.scalar(select(Role).where(Role.id == role_id).options(selectinload(Role.application), selectinload(Role.users)))
    user = db.get(User, user_id)
    if not role or not user:
        raise HTTPException(status_code=404, detail="Role or user not found")
    if role in user.roles:
        user.roles.remove(role)
    record_audit(db, request, "ROLE_USER_REMOVED", user_id=actor.id, application=role.application.code, metadata={"role_id": role.id, "user_id": user.id})
    db.commit()
    return {"message": f"User {user.username} removed from role {role.name}"}

@router.get("/permissions")
def list_permissions(db: Session = Depends(get_db)):
    permissions = db.scalars(select(Permission).options(selectinload(Permission.application), selectinload(Permission.roles)).order_by(Permission.code)).all()
    def extract_module(code: str) -> str:
        parts = code.split(".")
        if len(parts) >= 2:
            return parts[1].replace("_", " ").title()
        return "General"

    return [
        {
            "id": p.id,
            "code": p.code,
            "description": p.description,
            "module": extract_module(p.code),
            "application_id": p.application.id,
            "application_code": p.application.code,
            "application_name": p.application.name,
            "role_count": len(p.roles),
            "roles": [r.name for r in p.roles],
        }
        for p in permissions
    ]

@router.post("/permissions", status_code=201)
def create_permission(payload: PermissionCreate, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    app = db.scalar(select(Application).where(Application.code == payload.application_code))
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    code = payload.code.strip()
    if db.scalar(select(Permission).where(Permission.code == code)):
        raise HTTPException(status_code=409, detail=f"Permission code '{code}' already exists")
    permission = Permission(application_id=app.id, code=code, description=payload.description.strip() if payload.description else None)
    db.add(permission)
    db.flush()
    record_audit(db, request, "PERMISSION_CREATED", user_id=actor.id, application=app.code)
    db.commit()
    db.refresh(permission)
    return {"id": permission.id, "code": permission.code, "application_code": app.code}

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

@router.get("/audit-logs")
def audit_logs(event: str | None = None, application: str | None = None, db: Session = Depends(get_db)):
    query = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100)
    if event:
        query = query.where(AuditLog.event == event)
    if application:
        query = query.where(AuditLog.application == application)
    return [{"id": log.id, "event": log.event, "application": log.application, "source_ip": log.source_ip, "timestamp": log.timestamp, "metadata": log.metadata_json} for log in db.scalars(query)]

# SSO Sessions Monitor & Revocation
@router.get("/sso-sessions")
def list_sso_sessions(active_only: bool = True, db: Session = Depends(get_db)):
    query = select(SsoSession).options(selectinload(SsoSession.user)).order_by(SsoSession.last_activity_at.desc()).limit(100)
    if active_only:
        now = datetime.now(timezone.utc)
        query = query.where(SsoSession.revoked_at.is_(None), SsoSession.expires_at > now)
    sessions = db.scalars(query).all()
    return [
        {
            "id": s.id,
            "user_id": s.user_id,
            "username": s.user.username if s.user else "Unknown",
            "email": s.user.email if s.user else "",
            "full_name": s.user.full_name if s.user else "",
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "is_active": s.is_active,
            "expires_at": s.expires_at,
            "last_activity_at": s.last_activity_at,
            "created_at": s.created_at,
        }
        for s in sessions
    ]

@router.post("/sso-sessions/{session_id}/revoke")
def revoke_sso_session(session_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    sso_sess = db.get(SsoSession, session_id)
    if not sso_sess:
        raise HTTPException(status_code=404, detail="SSO Session not found")
    sso_sess.revoked_at = datetime.now(timezone.utc)
    record_audit(db, request, "SSO_SESSION_REVOKED", user_id=actor.id, metadata={"session_id": session_id, "target_user_id": sso_sess.user_id})
    db.commit()
    return {"message": "SSO session revoked"}

@router.post("/sso-sessions/revoke-all-user/{user_id}")
def revoke_all_user_sso_sessions(user_id: str, request: Request, db: Session = Depends(get_db), actor: User = Depends(require_superadmin)):
    now = datetime.now(timezone.utc)
    sessions = db.scalars(select(SsoSession).where(SsoSession.user_id == user_id, SsoSession.revoked_at.is_(None), SsoSession.expires_at > now)).all()
    count = 0
    for s in sessions:
        s.revoked_at = now
        count += 1
    record_audit(db, request, "USER_ALL_SSO_SESSIONS_REVOKED", user_id=actor.id, metadata={"target_user_id": user_id, "revoked_count": count})
    db.commit()
    return {"message": f"Revoked {count} active SSO sessions for user"}

# OIDC Diagnostics
@router.get("/oidc/diagnostics")
def oidc_diagnostics(db: Session = Depends(get_db)):
    settings = get_settings()
    issuer = settings.oidc_issuer.rstrip("/")
    active_keys = db.scalars(select(SigningKey).where(SigningKey.is_active.is_(True))).all()
    active_sessions_count = db.scalar(
        select(func.count(SsoSession.id)).where(
            SsoSession.revoked_at.is_(None),
            SsoSession.expires_at > datetime.now(timezone.utc)
        )
    )
    apps_count = db.scalar(select(func.count(Application.id)))
    redirect_uris_count = db.scalar(select(func.count(ApplicationRedirectUri.id)))

    return {
        "status": "healthy",
        "issuer": issuer,
        "discovery_url": f"{issuer}/.well-known/openid-configuration",
        "jwks_uri": f"{issuer}/oauth/jwks",
        "authorization_endpoint": f"{issuer}/oauth/authorize",
        "token_endpoint": f"{issuer}/oauth/token",
        "userinfo_endpoint": f"{issuer}/oauth/userinfo",
        "end_session_endpoint": f"{issuer}/oauth/logout",
        "active_signing_keys_count": len(active_keys),
        "signing_keys": [
            {"kid": k.kid, "algorithm": k.algorithm, "created_at": k.created_at, "is_active": k.is_active}
            for k in active_keys
        ],
        "registered_clients_count": apps_count,
        "total_redirect_uris": redirect_uris_count,
        "supported_response_types": ["code"],
        "supported_grant_types": ["authorization_code"],
        "supported_code_challenge_methods": ["S256"],
        "supported_scopes": ["openid", "profile", "email", "roles", "org"],
    }

