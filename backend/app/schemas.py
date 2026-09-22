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

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[a-zA-Z0-9._-]+$")
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=12, max_length=256)
    is_superadmin: bool = False
    division_id: str | None = None

class UserUpdate(BaseModel):
    email: EmailStr | None = None
    full_name: str | None = Field(default=None, min_length=1, max_length=160)
    status: str | None = Field(default=None, pattern=r"^(active|disabled|locked)$")
    is_superadmin: bool | None = None
    division_id: str | None = None

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

class PermissionCreate(BaseModel):
    application_code: str
    code: str = Field(min_length=3, max_length=160)
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
    username: str
    email: EmailStr
    full_name: str
    status: str
    is_superadmin: bool
    division: dict | None = None
    last_login_at: datetime | None
    created_at: datetime
    roles: list[dict] = []
    applications: list[dict] = []

class ApplicationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    description: str | None
    status: str

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

class DivisionCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None

class DivisionUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=40, pattern=r"^[A-Z0-9_-]+$")
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None

class DivisionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str
    description: str | None
    created_at: datetime
    updated_at: datetime
