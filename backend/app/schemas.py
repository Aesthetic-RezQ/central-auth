from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)
    application_code: str = Field(default="CENTRAL_AUTH", min_length=2, max_length=40)

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20)

class LogoutRequest(RefreshRequest):
    pass

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=40, max_length=160)
    password: str = Field(min_length=12, max_length=256)

# Position Schemas
class PositionCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    level: int = Field(default=1, ge=1, le=100)
    is_manager: bool = False
    is_general_manager: bool = False
    description: str | None = None

class PositionUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    level: int | None = Field(default=None, ge=1, le=100)
    is_manager: bool | None = None
    is_general_manager: bool | None = None
    description: str | None = None

class PositionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    level: int
    is_manager: bool
    is_general_manager: bool
    description: str | None
    created_at: datetime
    updated_at: datetime

# API Key Schemas
class ApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    client_code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    scopes: list[str] = Field(default_factory=lambda: ["users:read", "organization:read"])
    expires_in_days: int | None = Field(default=None, ge=1, le=3650)

class ApiKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    client_code: str
    key_prefix: str
    scopes: list[str]
    is_active: bool
    expires_at: datetime | None
    created_at: datetime

class ApiKeyCreatedOut(ApiKeyOut):
    api_key: str

# Division Schemas
class DivisionCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    manager_user_id: str | None = None

class DivisionUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    manager_user_id: str | None = None

class ManagerSummary(BaseModel):
    id: str
    employee_id: str | None
    username: str
    full_name: str
    email: EmailStr

class DivisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    description: str | None
    manager_user_id: str | None = None
    manager: ManagerSummary | None = None
    created_at: datetime
    updated_at: datetime

# User Schemas
class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9._-]+$")
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=12, max_length=256)
    employee_id: str | None = Field(default=None, max_length=64)
    division_id: str | None = None
    position_id: str | None = None
    manager_user_id: str | None = None
    is_superadmin: bool = False

class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    employee_id: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, pattern=r"^(active|disabled|locked)$")
    division_id: str | None = None
    position_id: str | None = None
    manager_user_id: str | None = None
    is_superadmin: bool | None = None

class PasswordReset(BaseModel):
    password: str = Field(min_length=12, max_length=256)

class ApplicationCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None

class RoleCreate(BaseModel):
    application_code: str
    name: str = Field(min_length=1, max_length=80)
    description: str | None = None
    permission_ids: list[str] = Field(default_factory=list)

class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = None
    permission_ids: list[str] | None = None

class RoleClone(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = None

class RoleAssignUsers(BaseModel):
    user_ids: list[str]

class PermissionCreate(BaseModel):
    application_code: str
    code: str = Field(min_length=3, max_length=160)
    description: str | None = None

class PermissionUpdate(BaseModel):
    description: str | None = None

class UserApplicationUpdate(BaseModel):
    application_code: str
    enabled: bool = True

class UserRoleUpdate(BaseModel):
    role_id: str

class RolePermissionUpdate(BaseModel):
    permission_id: str

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    employee_id: str | None = None
    username: str
    email: EmailStr
    full_name: str
    status: str
    is_superadmin: bool
    division: dict | None = None
    position: dict | None = None
    manager: dict | None = None
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime
    roles: list[dict] = []
    applications: list[dict] = []

class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    description: str | None
    status: str

class ApplicationRedirectUriCreate(BaseModel):
    uri: str = Field(min_length=5, max_length=500)

class ApplicationRedirectUriOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    application_id: str
    uri: str
    created_at: datetime

class ApplicationOidcUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    client_type: str | None = None
    require_consent: bool | None = None
    allowed_scopes: list[str] | None = None
    access_token_lifetime: int | None = None
    id_token_lifetime: int | None = None

class ApplicationDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    description: str | None
    status: str
    client_id: str | None = None
    client_type: str | None = "confidential"
    require_consent: bool = False
    allowed_scopes: list[str] = ["openid", "profile", "email", "roles", "org"]
    access_token_lifetime: int = 3600
    id_token_lifetime: int = 3600
    has_client_secret: bool = False
    redirect_uris: list[ApplicationRedirectUriOut] = []

class ClientSecretRegenerateOut(BaseModel):
    client_id: str
    client_secret: str

class SsoSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    username: str
    email: str
    full_name: str
    ip_address: str | None = None
    user_agent: str | None = None
    is_active: bool
    expires_at: datetime
    last_activity_at: datetime
    created_at: datetime


class RoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str | None
    application_code: str
    permissions: list[str]

class PermissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    description: str | None
    application_code: str

# Helpdesk Integration Specific Data Contracts
class PersonReference(BaseModel):
    user_id: str
    employee_id: str | None
    username: str
    name: str
    email: EmailStr

class DivisionDetail(BaseModel):
    id: str
    code: str
    name: str
    manager: PersonReference | None = None

class PositionDetail(BaseModel):
    id: str
    code: str
    name: str
    level: int
    is_manager: bool
    is_general_manager: bool

class OrganizationHierarchy(BaseModel):
    division: DivisionDetail | None
    position: PositionDetail | None
    role: str  # "employee", "manager", "general_manager"
    is_manager: bool
    is_general_manager: bool
    manager: PersonReference | None
    general_manager: PersonReference | None

class UserHelpdeskOut(BaseModel):
    central_auth_user_id: str
    id: str  # Alias matching central_auth_user_id
    employee_id: str | None
    username: str
    full_name: str
    name: str  # Convenient alias for full_name
    email: EmailStr
    division_id: str | None
    division_code: str | None
    division_name: str | None
    position_id: str | None
    position_name: str | None
    role: str  # "employee", "manager", "general_manager"
    is_manager: bool
    is_general_manager: bool
    is_active: bool
    status: str  # "active", "disabled", "locked"
    manager_user_id: str | None
    manager_employee_id: str | None
    manager_name: str | None
    manager_email: EmailStr | None
    general_manager_user_id: str | None
    general_manager_employee_id: str | None
    general_manager_name: str | None
    general_manager_email: EmailStr | None
    organization: OrganizationHierarchy
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime

class UserListResponse(BaseModel):
    items: list[UserHelpdeskOut]
    total: int
    page: int
    limit: int
    has_more: bool

class GeneralManagerOut(BaseModel):
    user_id: str
    employee_id: str | None
    username: str
    name: str
    email: EmailStr
    position_name: str | None
    division_name: str | None
    is_active: bool
