"""Create central authentication schema."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("users", sa.Column("id", sa.String(36), primary_key=True), sa.Column("username", sa.String(80), nullable=False, unique=True), sa.Column("email", sa.String(255), nullable=False, unique=True), sa.Column("full_name", sa.String(160), nullable=False), sa.Column("password_hash", sa.String(255), nullable=False), sa.Column("status", sa.String(20), nullable=False, server_default="active"), sa.Column("is_superadmin", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("last_login_at", sa.DateTime(timezone=True)), sa.Column("password_changed_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("applications", sa.Column("id", sa.String(36), primary_key=True), sa.Column("code", sa.String(40), nullable=False, unique=True), sa.Column("name", sa.String(120), nullable=False), sa.Column("description", sa.Text()), sa.Column("status", sa.String(20), nullable=False, server_default="active"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("roles", sa.Column("id", sa.String(36), primary_key=True), sa.Column("application_id", sa.String(36), sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False), sa.Column("name", sa.String(80), nullable=False), sa.Column("description", sa.Text()), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("application_id", "name"))
    op.create_table("permissions", sa.Column("id", sa.String(36), primary_key=True), sa.Column("application_id", sa.String(36), sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False), sa.Column("code", sa.String(160), nullable=False, unique=True), sa.Column("description", sa.Text()))
    op.create_table("user_roles", sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True), sa.Column("role_id", sa.String(36), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True))
    op.create_table("role_permissions", sa.Column("role_id", sa.String(36), sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True), sa.Column("permission_id", sa.String(36), sa.ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True))
    op.create_table("user_applications", sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True), sa.Column("application_id", sa.String(36), sa.ForeignKey("applications.id", ondelete="CASCADE"), primary_key=True), sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table("refresh_tokens", sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("token_hash", sa.String(64), nullable=False, unique=True), sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False), sa.Column("revoked_at", sa.DateTime(timezone=True)), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False))
    op.create_table("audit_logs", sa.Column("id", sa.String(36), primary_key=True), sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("event", sa.String(80), nullable=False), sa.Column("application", sa.String(40)), sa.Column("source_ip", sa.String(64)), sa.Column("user_agent", sa.String(512)), sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False), sa.Column("metadata", sa.JSON()))
    op.create_index("ix_audit_logs_timestamp", "audit_logs", ["timestamp"])
    op.create_index("ix_audit_logs_event", "audit_logs", ["event"])

def downgrade():
    op.drop_table("audit_logs")
    op.drop_table("refresh_tokens")
    op.drop_table("user_applications")
    op.drop_table("role_permissions")
    op.drop_table("user_roles")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_table("applications")
    op.drop_table("users")

