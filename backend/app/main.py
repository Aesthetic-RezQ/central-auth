from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select
from .config import get_settings
from .database import SessionLocal
from .models import ApiKey, Application, ApplicationRedirectUri, Group, Permission, Position, Role, SigningKey, User
from .oidc.keys import get_or_create_active_signing_key
from .rate_limit import limiter
from .routers import admin, auth, oidc, organization
from .security import hash_api_key, hash_password

settings = get_settings()

APPLICATION_POLICIES = {
    "CENTRAL_AUTH": {
        "permissions": {
            "centralauth.users.view": "View directory users",
            "centralauth.users.manage": "Create and update directory users",
            "centralauth.users.delete": "Delete directory users",
            "centralauth.password.reset": "Reset user passwords",
            "centralauth.application_access.manage": "Manage application access",
            "centralauth.applications.manage": "Register and manage applications",
            "centralauth.roles.manage": "Create and manage roles",
            "centralauth.permissions.manage": "Create and manage permissions",
            "centralauth.audit.view": "View authentication audit logs",
            "centralauth.organization.view": "View organization and hierarchy data",
            "centralauth.organization.manage": "Manage divisions and positions",
        },
        "roles": {
            "CENTRAL_SUPERADMIN": (
                "Full Central Auth administration",
                set(),
            ),
            "USER_ADMIN": (
                "Manage users, access, and password resets",
                {
                    "centralauth.users.view", "centralauth.users.manage", "centralauth.users.delete",
                    "centralauth.password.reset", "centralauth.application_access.manage",
                    "centralauth.organization.view",
                },
            ),
            "RBAC_ADMIN": (
                "Manage applications, roles, and permissions",
                {
                    "centralauth.applications.manage", "centralauth.roles.manage",
                    "centralauth.permissions.manage", "centralauth.organization.manage",
                },
            ),
            "AUDITOR": (
                "Read directory and authentication audit information",
                {"centralauth.users.view", "centralauth.audit.view", "centralauth.organization.view"},
            ),
            "HELPDESK_SERVICE": (
                "Service integration role for Helpdesk synchronization",
                {"centralauth.users.view", "centralauth.organization.view"},
            ),
        },
    },
    "NMS": {
        "permissions": {
            "nms.alert.manage": "Manage monitoring alerts",
            "nms.alert.view": "View monitoring alerts",
            "nms.api.dashboard": "Access dashboard API",
            "nms.config.manage": "Manage NMS configuration",
            "nms.config.view": "View NMS configuration",
            "nms.dashboard.view": "View the NMS dashboard",
            "nms.device.delete": "Delete monitored devices",
            "nms.device.edit": "Edit monitored devices",
            "nms.device.view": "View monitored devices",
            "nms.notifications": "Manage monitoring notifications",
        },
        "roles": {
            "NMS_ADMIN": ("NMS administrator", set()),
            "NMS_OPERATOR": (
                "Operate devices, alerts, and visible configuration",
                {
                    "nms.dashboard.view", "nms.device.view", "nms.device.edit",
                    "nms.alert.view", "nms.alert.manage", "nms.config.view",
                },
            ),
            "NMS_VIEWER": (
                "Read-only monitoring access",
                {"nms.dashboard.view", "nms.device.view", "nms.alert.view", "nms.config.view"},
            ),
        },
    },
    "HELPDESK": {
        "permissions": {
            "helpdesk.ticket.create": "Create tickets",
            "helpdesk.ticket.view_own": "View own tickets",
            "helpdesk.ticket.view_all": "View all tickets",
            "helpdesk.ticket.assign": "Assign tickets",
            "helpdesk.ticket.update": "Update ticket status and details",
            "helpdesk.ticket.close": "Resolve or close tickets",
            "helpdesk.ticket.attach": "Attach files to tickets",
            "helpdesk.ticket.categorize": "Categorize tickets",
            "helpdesk.ticket.approval_request": "Request ticket approvals",
            "helpdesk.ticket.override_priority": "Override ticket priority",
            "helpdesk.comment.create": "Add ticket comments",
            "helpdesk.report.view": "View reports",
            "helpdesk.audit.view": "View audit history",
            "helpdesk.config.manage": "Manage Helpdesk configuration",
            "helpdesk.knowledge.view": "View knowledge articles",
            "helpdesk.knowledge.manage": "Manage knowledge articles",
            "helpdesk.dashboard.management": "View management dashboards",
        },
        "roles": {
            "Employee": (
                "Submit and follow up on own requests",
                {"helpdesk.ticket.create", "helpdesk.ticket.view_own", "helpdesk.comment.create", "helpdesk.ticket.attach", "helpdesk.knowledge.view"},
            ),
            "Manager": (
                "View and comment on own requests",
                {"helpdesk.ticket.view_own", "helpdesk.comment.create", "helpdesk.ticket.attach", "helpdesk.knowledge.view"},
            ),
            "IT Helpdesk": (
                "Triage, assign, categorize, and resolve tickets",
                {"helpdesk.ticket.view_all", "helpdesk.comment.create", "helpdesk.ticket.assign", "helpdesk.ticket.categorize", "helpdesk.ticket.update", "helpdesk.ticket.close", "helpdesk.ticket.attach", "helpdesk.ticket.approval_request", "helpdesk.knowledge.view", "helpdesk.knowledge.manage"},
            ),
            "IT Technician": (
                "Work assigned tickets and maintain knowledge articles",
                {"helpdesk.ticket.view_all", "helpdesk.comment.create", "helpdesk.ticket.update", "helpdesk.ticket.close", "helpdesk.ticket.attach", "helpdesk.knowledge.view", "helpdesk.knowledge.manage"},
            ),
            "IT Engineer": (
                "Work advanced tickets and maintain knowledge articles",
                {"helpdesk.ticket.view_all", "helpdesk.comment.create", "helpdesk.ticket.update", "helpdesk.ticket.close", "helpdesk.ticket.attach", "helpdesk.knowledge.view", "helpdesk.knowledge.manage"},
            ),
            "IT Manager": (
                "Oversee tickets, priorities, reports, and audit history",
                {"helpdesk.ticket.view_all", "helpdesk.comment.create", "helpdesk.ticket.update", "helpdesk.ticket.close", "helpdesk.ticket.override_priority", "helpdesk.report.view", "helpdesk.audit.view", "helpdesk.knowledge.view", "helpdesk.knowledge.manage"},
            ),
            "Administrator": (
                "Administer Helpdesk and its authorization-sensitive workflows",
                {"helpdesk.ticket.view_all", "helpdesk.comment.create", "helpdesk.ticket.assign", "helpdesk.ticket.update", "helpdesk.ticket.close", "helpdesk.ticket.override_priority", "helpdesk.report.view", "helpdesk.audit.view", "helpdesk.ticket.approval_request", "helpdesk.config.manage", "helpdesk.knowledge.view", "helpdesk.knowledge.manage"},
            ),
            "Management": (
                "View management dashboards and knowledge articles",
                {"helpdesk.dashboard.management", "helpdesk.knowledge.view"},
            ),
        },
    },
}

DEFAULT_POSITIONS = [
    ("STAFF", "Staff", 1, False, False, "Standard individual contributor employee"),
    ("SUPERVISOR", "Supervisor", 2, False, False, "Operational supervisor"),
    ("MANAGER", "Manager", 3, True, False, "Department or division manager"),
    ("GENERAL_MANAGER", "General Manager", 4, True, True, "Executive General Manager"),
]

DEFAULT_GROUPS = [
    ("IT", "Information Technology", "IT and infrastructure personnel"),
    ("MANAGEMENT", "Management", "Company executive and managerial leadership"),
    ("FINANCE", "Finance & Accounting", "Finance and accounting department"),
    ("HR", "Human Resources", "HR and administration personnel"),
    ("ENGINEERING", "Engineering", "Technical engineering and operations"),
]

def seed_defaults() -> None:
    db = SessionLocal()
    try:
        # Initialize RSA signing key for RS256 token issuance
        get_or_create_active_signing_key(db)

        # Seed standard groups
        for code, name, desc in DEFAULT_GROUPS:
            if not db.scalar(select(Group).where(Group.code == code)):
                db.add(Group(code=code, name=name, description=desc))
        db.flush()

        defaults = [
            ("CENTRAL_AUTH", "Central Authentication", "Administrative access to Central Auth", "central_auth", "confidential", None),
            ("HELPDESK", "Helpdesk", "Internal helpdesk application", "helpdesk", "confidential", hash_password("9UIdCYBcPVVx_yQZiugPimyUleVOW_NePdlfUExa9-w")),
            ("NMS", "Network Monitoring System", "Network monitoring application", "nms", "confidential", hash_password("nms_secret_2026")),
            ("INTRANET", "BIC Intranet", "BIC internal intranet", "intranet", "confidential", hash_password("intranet_secret_2026")),
            ("BIC_MAILER", "BIC Mailer", "BIC internal mail service", "bic_mailer", "confidential", hash_password("mailer_secret_2026")),
        ]
        for code, name, description, client_id, client_type, secret_hash in defaults:
            app = db.scalar(select(Application).where(Application.code == code))
            if not app:
                app = Application(
                    code=code,
                    name=name,
                    description=description,
                    client_id=client_id,
                    client_type=client_type,
                    client_secret_hash=secret_hash,
                )
                db.add(app)
            else:
                if not app.client_id:
                    app.client_id = client_id
                if secret_hash:
                    app.client_secret_hash = secret_hash
        db.flush()

        # Seed standard redirect URIs for client applications
        DEFAULT_REDIRECT_URIS = {
            "HELPDESK": [
                "https://172.16.0.111:9444/auth/callback",
                "http://172.16.0.111:9180/auth/callback",
                "http://localhost:8081/auth/callback",
                "https://172.16.0.111:9444/login",
                "http://172.16.0.111:9180/login",
            ],
            "NMS": [
                "http://172.16.0.111:8082/auth/callback",
                "http://localhost:8082/auth/callback",
            ],
            "INTRANET": [
                "http://172.16.0.111:8083/auth/callback",
                "http://localhost:8083/auth/callback",
            ],
        }
        for app_code, uris in DEFAULT_REDIRECT_URIS.items():
            app = db.scalar(select(Application).where(Application.code == app_code))
            if app:
                for u in uris:
                    if not db.scalar(select(ApplicationRedirectUri).where(ApplicationRedirectUri.application_id == app.id, ApplicationRedirectUri.redirect_uri == u)):
                        db.add(ApplicationRedirectUri(application_id=app.id, redirect_uri=u))
        db.flush()

        # Seed standard positions
        for code, name, level, is_mgr, is_gm, desc in DEFAULT_POSITIONS:
            pos = db.scalar(select(Position).where(Position.code == code))
            if not pos:
                db.add(Position(code=code, name=name, level=level, is_manager=is_mgr, is_general_manager=is_gm, description=desc))
        db.flush()

        for application_code, policy in APPLICATION_POLICIES.items():
            application = db.scalar(select(Application).where(Application.code == application_code))
            permissions = {}
            for permission_code, description in policy["permissions"].items():
                permission = db.scalar(select(Permission).where(Permission.code == permission_code))
                if permission is None:
                    permission = Permission(application_id=application.id, code=permission_code, description=description)
                    db.add(permission)
                    db.flush()
                else:
                    permission.application_id = application.id
                    permission.description = description
                permissions[permission_code] = permission

            for role_name, (description, role_permissions) in policy["roles"].items():
                role = db.scalar(select(Role).where(Role.application_id == application.id, Role.name == role_name))
                if role is None:
                    role = Role(application_id=application.id, name=role_name, description=description)
                    db.add(role)
                    db.flush()
                else:
                    role.description = description
                desired_permissions = set(policy["permissions"]) if role_name in {"NMS_ADMIN", "CENTRAL_SUPERADMIN"} else role_permissions
                for permission_code in desired_permissions:
                    permission = permissions[permission_code]
                    if permission not in role.permissions:
                        role.permissions.append(permission)

        # Seed default admin user
        admin_user = db.scalar(select(User).where(User.username == settings.default_admin_username))
        if not admin_user:
            gm_pos = db.scalar(select(Position).where(Position.code == "GENERAL_MANAGER"))
            it_group = db.scalar(select(Group).where(Group.code == "IT"))
            admin_user = User(
                username=settings.default_admin_username,
                email=settings.default_admin_email,
                full_name=settings.default_admin_full_name,
                employee_id="EMP00001",
                password_hash=hash_password(settings.default_admin_password),
                is_superadmin=True,
                position_id=gm_pos.id if gm_pos else None,
            )
            if it_group:
                admin_user.groups.append(it_group)
            db.add(admin_user)
        db.flush()

        central_auth = db.scalar(select(Application).where(Application.code == "CENTRAL_AUTH"))
        central_superadmin = db.scalar(select(Role).where(Role.application_id == central_auth.id, Role.name == "CENTRAL_SUPERADMIN"))
        for superadmin in db.scalars(select(User).where(User.is_superadmin.is_(True))):
            if central_superadmin not in superadmin.roles:
                superadmin.roles.append(central_superadmin)

        # Seed default Helpdesk service API key if none exists
        helpdesk_key = db.scalar(select(ApiKey).where(ApiKey.client_code == "HELPDESK"))
        if not helpdesk_key:
            default_key = "cas_helpdesk_service_key_2026"
            db.add(ApiKey(
                name="Helpdesk Integration Service Key",
                client_code="HELPDESK",
                key_prefix="cas_helpdes",
                key_hash=hash_api_key(default_key),
                scopes=["users:read", "organization:read"],
                is_active=True,
            ))

        db.commit()
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_defaults()
    yield

app = FastAPI(title=settings.app_name, version="1.0.0", description="Central identity, authentication, authorization, and audit service", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Application-Code", "X-API-Key"],
)

@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": settings.app_name}

@app.get("/health/oidc", tags=["system"])
def health_oidc():
    db = SessionLocal()
    try:
        signing_key = get_or_create_active_signing_key(db)
        return {
            "status": "ok",
            "oidc_issuer": settings.oidc_issuer,
            "signing_key_id": signing_key.kid,
            "signing_algorithm": signing_key.algorithm,
            "sso_session_expire_hours": settings.sso_session_expire_hours,
        }
    finally:
        db.close()

@app.get("/ready", tags=["system"])
def ready():
    db = SessionLocal()
    try:
        db.execute(select(1))
        return {"status": "ready"}
    finally:
        db.close()

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response

app.include_router(oidc.router)
app.include_router(auth.router)
app.include_router(organization.router)
app.include_router(admin.router)
