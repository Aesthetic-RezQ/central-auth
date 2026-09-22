from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select
from .config import get_settings
from .database import SessionLocal
from .models import Application, Permission, Role, User
from .rate_limit import limiter
from .routers import admin, auth
from .security import hash_password

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
                },
            ),
            "RBAC_ADMIN": (
                "Manage applications, roles, and permissions",
                {
                    "centralauth.applications.manage", "centralauth.roles.manage",
                    "centralauth.permissions.manage",
                },
            ),
            "AUDITOR": (
                "Read directory and authentication audit information",
                {"centralauth.users.view", "centralauth.audit.view"},
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

def seed_defaults() -> None:
    db = SessionLocal()
    try:
        defaults = [
            ("CENTRAL_AUTH", "Central Authentication", "Administrative access to Central Auth"),
            ("HELPDESK", "Helpdesk", "Internal helpdesk application"),
            ("NMS", "Network Monitoring System", "Network monitoring application"),
            ("INTRANET", "BIC Intranet", "BIC internal intranet"),
            ("BIC_MAILER", "BIC Mailer", "BIC internal mail service"),
        ]
        deprecated = db.scalar(select(Application).where(Application.code == "ITMIS"))
        if deprecated:
            db.delete(deprecated)
            db.flush()
        for code, name, description in defaults:
            if not db.scalar(select(Application).where(Application.code == code)):
                db.add(Application(code=code, name=name, description=description))
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
        if not db.scalar(select(User).where(User.username == settings.default_admin_username)):
            db.add(User(username=settings.default_admin_username, email=settings.default_admin_email, full_name=settings.default_admin_full_name, password_hash=hash_password(settings.default_admin_password), is_superadmin=True))
        db.flush()

        central_auth = db.scalar(select(Application).where(Application.code == "CENTRAL_AUTH"))
        central_superadmin = db.scalar(select(Role).where(Role.application_id == central_auth.id, Role.name == "CENTRAL_SUPERADMIN"))
        for superadmin in db.scalars(select(User).where(User.is_superadmin.is_(True))):
            if central_superadmin not in superadmin.roles:
                superadmin.roles.append(central_superadmin)
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
    allow_headers=["Authorization", "Content-Type", "X-Application-Code"],
)

@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "service": settings.app_name}

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

app.include_router(auth.router)
app.include_router(admin.router)
