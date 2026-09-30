from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

class Base(DeclarativeBase):
    pass

user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True),
)

user_groups = Table(
    "user_groups",
    Base.metadata,
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("group_id", ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
)

class Position(Base):
    __tablename__ = "positions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    level: Mapped[int] = mapped_column(Integer, default=1)
    is_manager: Mapped[bool] = mapped_column(Boolean, default=False)
    is_general_manager: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    users: Mapped[list["User"]] = relationship(back_populates="position")

class ApiKey(Base):
    __tablename__ = "api_keys"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name: Mapped[str] = mapped_column(String(100))
    client_code: Mapped[str] = mapped_column(String(40), index=True)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    key_prefix: Mapped[str] = mapped_column(String(12))
    scopes: Mapped[list[str]] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

class Group(Base):
    __tablename__ = "groups"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    code: Mapped[str] = mapped_column(String(60), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    users: Mapped[list["User"]] = relationship(secondary=user_groups, back_populates="groups")

class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    employee_id: Mapped[str | None] = mapped_column(String(64), unique=True, index=True, nullable=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="active")
    is_superadmin: Mapped[bool] = mapped_column(Boolean, default=False)
    division_id: Mapped[str | None] = mapped_column(ForeignKey("divisions.id", ondelete="SET NULL"), nullable=True, index=True)
    position_id: Mapped[str | None] = mapped_column(ForeignKey("positions.id", ondelete="SET NULL"), nullable=True, index=True)
    manager_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, index=True)

    roles: Mapped[list["Role"]] = relationship(secondary=user_roles, back_populates="users")
    groups: Mapped[list["Group"]] = relationship(secondary=user_groups, back_populates="users")
    applications: Mapped[list["Application"]] = relationship(secondary="user_applications", back_populates="users")
    division: Mapped["Division | None"] = relationship("Division", foreign_keys=[division_id], back_populates="users")
    position: Mapped["Position | None"] = relationship("Position", foreign_keys=[position_id], back_populates="users")
    manager: Mapped["User | None"] = relationship("User", remote_side=[id], foreign_keys=[manager_user_id], back_populates="direct_reports")
    direct_reports: Mapped[list["User"]] = relationship("User", foreign_keys=[manager_user_id], back_populates="manager")
    sso_sessions: Mapped[list["SsoSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")

class Division(Base):
    __tablename__ = "divisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    manager_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    users: Mapped[list["User"]] = relationship("User", foreign_keys=[User.division_id], back_populates="division")
    manager: Mapped["User | None"] = relationship("User", foreign_keys=[manager_user_id])

class Application(Base):
    __tablename__ = "applications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="active")
    
    # OIDC IdP Client configurations
    client_id: Mapped[str | None] = mapped_column(String(80), unique=True, index=True, nullable=True)
    client_secret_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    client_type: Mapped[str] = mapped_column(String(20), default="confidential")  # 'confidential' | 'public'
    require_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    allowed_scopes: Mapped[list[str]] = mapped_column(JSON, default=lambda: ["openid", "profile", "email", "groups"])
    access_token_lifetime: Mapped[int] = mapped_column(Integer, default=600)  # 10 min
    id_token_lifetime: Mapped[int] = mapped_column(Integer, default=300)  # 5 min

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    roles: Mapped[list["Role"]] = relationship(back_populates="application", cascade="all, delete-orphan")
    permissions: Mapped[list["Permission"]] = relationship(back_populates="application", cascade="all, delete-orphan")
    users: Mapped[list["User"]] = relationship(secondary="user_applications", back_populates="applications")
    redirect_uris: Mapped[list["ApplicationRedirectUri"]] = relationship(back_populates="application", cascade="all, delete-orphan")

    @property
    def allowed_scopes_list(self) -> list[str]:
        if isinstance(self.allowed_scopes, list):
            return self.allowed_scopes
        if isinstance(self.allowed_scopes, str):
            return [s.strip() for s in self.allowed_scopes.split() if s.strip()]
        return ["openid", "profile", "email", "groups"]

class ApplicationRedirectUri(Base):
    __tablename__ = "application_redirect_uris"
    __table_args__ = (UniqueConstraint("application_id", "redirect_uri"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    redirect_uri: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    application: Mapped["Application"] = relationship(back_populates="redirect_uris")

    @property
    def uri(self) -> str:
        return self.redirect_uri

    @uri.setter
    def uri(self, value: str):
        self.redirect_uri = value

class UserApplication(Base):
    __tablename__ = "user_applications"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)

class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("application_id", "name"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    application: Mapped["Application"] = relationship(back_populates="roles")
    users: Mapped[list["User"]] = relationship(secondary=user_roles, back_populates="roles")
    permissions: Mapped[list["Permission"]] = relationship(secondary=role_permissions, back_populates="roles")

class Permission(Base):
    __tablename__ = "permissions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    application_id: Mapped[str] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    code: Mapped[str] = mapped_column(String(160), unique=True)
    description: Mapped[str | None] = mapped_column(Text)

    application: Mapped["Application"] = relationship(back_populates="permissions")
    roles: Mapped[list["Role"]] = relationship(secondary=role_permissions, back_populates="permissions")

class SigningKey(Base):
    __tablename__ = "signing_keys"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    kid: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    algorithm: Mapped[str] = mapped_column(String(20), default="RS256")
    private_key_pem: Mapped[str] = mapped_column(Text)
    public_key_pem: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

class SsoSession(Base):
    __tablename__ = "sso_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user: Mapped["User"] = relationship(back_populates="sso_sessions")


    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and self.expires_at > datetime.now(timezone.utc)


class AuthorizationCode(Base):
    __tablename__ = "authorization_codes"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    client_id: Mapped[str] = mapped_column(String(80), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    redirect_uri: Mapped[str] = mapped_column(String(500))
    scope: Mapped[str] = mapped_column(String(255))
    nonce: Mapped[str | None] = mapped_column(String(255), nullable=True)
    code_challenge: Mapped[str] = mapped_column(String(128))
    code_challenge_method: Mapped[str] = mapped_column(String(20), default="S256")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship()

class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    event: Mapped[str] = mapped_column(String(80), index=True)
    application: Mapped[str | None] = mapped_column(String(40))
    source_ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(512))
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, index=True)
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSON)
