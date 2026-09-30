import logging
from datetime import datetime, timezone
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload
from ..audit import record_audit
from ..database import get_db
from ..dependencies import AuthenticatedClient, require_organization_read
from ..models import Division, Position, User
from ..schemas import (
    DivisionDetail,
    DivisionOut,
    GeneralManagerOut,
    ManagerSummary,
    OrganizationHierarchy,
    PersonReference,
    PositionDetail,
    PositionOut,
    UserHelpdeskOut,
    UserListResponse,
)

router = APIRouter(prefix="/api/v1", tags=["organization-integration"])
logger = logging.getLogger(__name__)

def find_general_manager(db: Session) -> User | None:
    """Resolves the authoritative General Manager in the organization."""
    # 1. Position marked as is_general_manager
    gm = db.scalar(
        select(User)
        .join(Position, User.position_id == Position.id)
        .where(Position.is_general_manager.is_(True), User.status == "active")
        .order_by(Position.level.desc(), User.created_at.asc())
        .limit(1)
    )
    if gm:
        return gm
    
    # 2. Position code GM / GENERAL_MANAGER
    gm = db.scalar(
        select(User)
        .join(Position, User.position_id == Position.id)
        .where(
            or_(Position.code.in_(["GM", "GENERAL_MANAGER"]), Position.name.ilike("%general manager%")),
            User.status == "active"
        )
        .limit(1)
    )
    if gm:
        return gm
    
    # 3. Fallback: Superadmin user
    gm = db.scalar(
        select(User)
        .where(User.is_superadmin.is_(True), User.status == "active")
        .order_by(User.created_at.asc())
        .limit(1)
    )
    return gm

def resolve_user_contract(user: User, general_manager: User | None) -> UserHelpdeskOut:
    """Builds the comprehensive, standardized Helpdesk integration user contract."""
    # Division information
    division = user.division
    div_manager = division.manager if division and division.manager else None
    
    # Position information
    position = user.position
    
    # Determine Manager status and General Manager status
    is_admin = bool(user.is_superadmin)
    is_gm = bool(position and position.is_general_manager)
    if not is_gm and general_manager and user.id == general_manager.id:
        is_gm = True
        
    is_mgr = bool(
        is_admin
        or is_gm
        or (position and position.is_manager)
        or (division and division.manager_user_id == user.id)
    )
    
    # Normalized organizational role: system_administrator > general_manager > manager > employee
    if is_admin:
        role_str = "system_administrator"
    elif is_gm:
        role_str = "general_manager"
    elif is_mgr:
        role_str = "manager"
    else:
        role_str = "employee"
        
    # Direct manager resolution: user.manager -> division.manager (if not self) -> general_manager (if not self)
    effective_manager: User | None = None
    if user.manager and user.manager.id != user.id:
        effective_manager = user.manager
    elif div_manager and div_manager.id != user.id:
        effective_manager = div_manager
    elif general_manager and general_manager.id != user.id and not is_gm:
        effective_manager = general_manager

    # Manager reference
    manager_ref = PersonReference(
        user_id=effective_manager.id,
        employee_id=effective_manager.employee_id,
        username=effective_manager.username,
        name=effective_manager.full_name,
        email=effective_manager.email,
    ) if effective_manager else None

    # General manager reference
    gm_ref = PersonReference(
        user_id=general_manager.id,
        employee_id=general_manager.employee_id,
        username=general_manager.username,
        name=general_manager.full_name,
        email=general_manager.email,
    ) if general_manager else None

    # Division detail
    division_detail = DivisionDetail(
        id=division.id,
        code=division.code,
        name=division.name,
        manager=PersonReference(
            user_id=div_manager.id,
            employee_id=div_manager.employee_id,
            username=div_manager.username,
            name=div_manager.full_name,
            email=div_manager.email,
        ) if div_manager else None,
    ) if division else None

    # Position detail
    position_detail = PositionDetail(
        id=position.id,
        code=position.code,
        name=position.name,
        level=position.level,
        is_manager=position.is_manager,
        is_general_manager=position.is_general_manager,
    ) if position else None

    hierarchy = OrganizationHierarchy(
        division=division_detail,
        position=position_detail,
        role=role_str,
        is_manager=is_mgr,
        is_general_manager=is_gm,
        manager=manager_ref,
        general_manager=gm_ref,
    )

    return UserHelpdeskOut(
        central_auth_user_id=user.id,
        id=user.id,
        employee_id=user.employee_id,
        username=user.username,
        full_name=user.full_name,
        name=user.full_name,
        email=user.email,
        division_id=division.id if division else None,
        division_code=division.code if division else None,
        division_name=division.name if division else None,
        position_id=position.id if position else None,
        position_name=position.name if position else None,
        role=role_str,
        is_manager=is_mgr,
        is_general_manager=is_gm,
        is_active=(user.status == "active"),
        status=user.status,
        manager_user_id=effective_manager.id if effective_manager else None,
        manager_employee_id=effective_manager.employee_id if effective_manager else None,
        manager_name=effective_manager.full_name if effective_manager else None,
        manager_email=effective_manager.email if effective_manager else None,
        general_manager_user_id=general_manager.id if general_manager else None,
        general_manager_employee_id=general_manager.employee_id if general_manager else None,
        general_manager_name=general_manager.full_name if general_manager else None,
        general_manager_email=general_manager.email if general_manager else None,
        organization=hierarchy,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )

@router.get("/users", response_model=UserListResponse)
def list_users(
    request: Request,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=250),
    updated_since: datetime | None = Query(default=None, description="Filter users updated at or after this ISO timestamp"),
    status: str | None = Query(default=None, pattern=r"^(active|disabled|locked)$"),
    division_id: str | None = Query(default=None),
    position_id: str | None = Query(default=None),
    role: str | None = Query(default=None, description="Filter by organizational role: employee, manager, general_manager"),
    search: str | None = Query(default=None),
    client: AuthenticatedClient = Depends(require_organization_read),
    db: Session = Depends(get_db),
):
    """
    Authoritative list and synchronization endpoint for Helpdesk and external systems.
    Supports incremental sync via updated_since, status filtering, and search.
    """
    gm = find_general_manager(db)
    query = select(User).options(
        selectinload(User.division).selectinload(Division.manager),
        selectinload(User.position),
        selectinload(User.manager),
    )

    if updated_since:
        query = query.where(User.updated_at >= updated_since)
    if status:
        query = query.where(User.status == status)
    if division_id:
        query = query.where(User.division_id == division_id)
    if position_id:
        query = query.where(User.position_id == position_id)
    if search:
        s = f"%{search.strip()}%"
        query = query.where(
            or_(
                User.username.ilike(s),
                User.full_name.ilike(s),
                User.email.ilike(s),
                User.employee_id.ilike(s),
            )
        )

    # Count total
    total_count = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    
    # Order and paginate
    query = query.order_by(User.updated_at.desc(), User.created_at.desc())
    offset = (page - 1) * limit
    users = db.scalars(query.offset(offset).limit(limit)).all()

    items = [resolve_user_contract(u, gm) for u in users]
    
    # Optional role filtering in memory if queried
    if role:
        target_role = role.lower().strip()
        items = [item for item in items if item.role == target_role]

    record_audit(
        db,
        request,
        "ORGANIZATION_SYNC_QUERY",
        application=client.client_code,
        metadata={"count": len(items), "page": page, "updated_since": updated_since.isoformat() if updated_since else None},
    )
    db.commit()

    return UserListResponse(
        items=items,
        total=total_count,
        page=page,
        limit=limit,
        has_more=(offset + len(users) < total_count),
    )

@router.get("/users/{user_id}", response_model=UserHelpdeskOut)
def get_user(
    user_id: str,
    request: Request,
    client: AuthenticatedClient = Depends(require_organization_read),
    db: Session = Depends(get_db),
):
    """
    Authoritative single-user lookup for Helpdesk by CentralAuth ID, employee_id, or username.
    """
    gm = find_general_manager(db)
    user = db.scalar(
        select(User)
        .where(or_(User.id == user_id, User.employee_id == user_id, User.username == user_id))
        .options(
            selectinload(User.division).selectinload(Division.manager),
            selectinload(User.position),
            selectinload(User.manager),
        )
    )
    if not user:
        raise HTTPException(status_code=404, detail="CentralAuth user was not found.")

    return resolve_user_contract(user, gm)

@router.get("/users/{user_id}/organization", response_model=OrganizationHierarchy)
def get_user_organization(
    user_id: str,
    client: AuthenticatedClient = Depends(require_organization_read),
    db: Session = Depends(get_db),
):
    """
    Returns only the organizational hierarchy and manager relations for a given user.
    """
    gm = find_general_manager(db)
    user = db.scalar(
        select(User)
        .where(or_(User.id == user_id, User.employee_id == user_id, User.username == user_id))
        .options(
            selectinload(User.division).selectinload(Division.manager),
            selectinload(User.position),
            selectinload(User.manager),
        )
    )
    if not user:
        raise HTTPException(status_code=404, detail="CentralAuth user was not found.")

    contract = resolve_user_contract(user, gm)
    return contract.organization

@router.get("/organization/general-manager", response_model=GeneralManagerOut)
def get_general_manager(
    client: AuthenticatedClient = Depends(require_organization_read),
    db: Session = Depends(get_db),
):
    """
    Authoritative endpoint returning the current General Manager.
    Used by Helpdesk approval workflow for manager-level ticket submissions.
    """
    gm = find_general_manager(db)
    if not gm:
        raise HTTPException(status_code=404, detail="No active General Manager currently designated.")
    
    return GeneralManagerOut(
        user_id=gm.id,
        employee_id=gm.employee_id,
        username=gm.username,
        name=gm.full_name,
        email=gm.email,
        position_name=gm.position.name if gm.position else "General Manager",
        division_name=gm.division.name if gm.division else None,
        is_active=(gm.status == "active"),
    )

@router.get("/divisions", response_model=list[DivisionOut])
def list_divisions(
    client: AuthenticatedClient = Depends(require_organization_read),
    db: Session = Depends(get_db),
):
    """
    Authoritative list of organizational divisions with designated division managers.
    """
    divisions = db.scalars(
        select(Division).options(selectinload(Division.manager)).order_by(Division.name)
    ).all()
    
    results = []
    for div in divisions:
        mgr = div.manager
        mgr_summary = ManagerSummary(
            id=mgr.id,
            employee_id=mgr.employee_id,
            username=mgr.username,
            full_name=mgr.full_name,
            email=mgr.email,
        ) if mgr else None
        
        results.append(
            DivisionOut(
                id=div.id,
                code=div.code,
                name=div.name,
                description=div.description,
                manager_user_id=div.manager_user_id,
                manager=mgr_summary,
                created_at=div.created_at,
                updated_at=div.updated_at,
            )
        )
    return results

@router.get("/divisions/{division_id}", response_model=DivisionOut)
def get_division(
    division_id: str,
    client: AuthenticatedClient = Depends(require_organization_read),
    db: Session = Depends(get_db),
):
    """
    Retrieve single division by ID or Code.
    """
    div = db.scalar(
        select(Division)
        .where(or_(Division.id == division_id, Division.code == division_id.upper()))
        .options(selectinload(Division.manager))
    )
    if not div:
        raise HTTPException(status_code=404, detail="Division not found.")
        
    mgr = div.manager
    mgr_summary = ManagerSummary(
        id=mgr.id,
        employee_id=mgr.employee_id,
        username=mgr.username,
        full_name=mgr.full_name,
        email=mgr.email,
    ) if mgr else None

    return DivisionOut(
        id=div.id,
        code=div.code,
        name=div.name,
        description=div.description,
        manager_user_id=div.manager_user_id,
        manager=mgr_summary,
        created_at=div.created_at,
        updated_at=div.updated_at,
    )

@router.get("/positions", response_model=list[PositionOut])
def list_positions(
    client: AuthenticatedClient = Depends(require_organization_read),
    db: Session = Depends(get_db),
):
    """
    List all standard organizational positions.
    """
    positions = db.scalars(select(Position).order_by(Position.level.desc(), Position.name.asc())).all()
    return positions

@router.get("/positions/{position_id}", response_model=PositionOut)
def get_position(
    position_id: str,
    client: AuthenticatedClient = Depends(require_organization_read),
    db: Session = Depends(get_db),
):
    """
    Get single position by ID or Code.
    """
    pos = db.scalar(
        select(Position).where(or_(Position.id == position_id, Position.code == position_id.upper()))
    )
    if not pos:
        raise HTTPException(status_code=404, detail="Position not found.")
    return pos
