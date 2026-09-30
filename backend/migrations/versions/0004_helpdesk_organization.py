"""Add positions, api_keys, and organizational fields to users and divisions.

Revision ID: 0004_helpdesk_organization
Revises: 0003_password_reset_tokens
Create Date: 2026-09-26
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_helpdesk_organization"
down_revision = "0003_password_reset_tokens"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create positions table
    op.create_table(
        "positions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(40), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False, unique=True),
        sa.Column("level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_manager", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_general_manager", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_positions_code", "positions", ["code"], unique=False)

    # 2. Create api_keys table for service-to-service integrations
    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("client_code", sa.String(40), nullable=False, index=True),
        sa.Column("key_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("key_prefix", sa.String(12), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # 3. Add manager_user_id to divisions
    op.add_column("divisions", sa.Column("manager_user_id", sa.String(36), nullable=True))
    op.create_index("ix_divisions_manager_user_id", "divisions", ["manager_user_id"], unique=False)
    op.create_foreign_key("fk_divisions_manager_user_id", "divisions", "users", ["manager_user_id"], ["id"], ondelete="SET NULL")

    # 4. Add organizational fields to users
    op.add_column("users", sa.Column("employee_id", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("position_id", sa.String(36), nullable=True))
    op.add_column("users", sa.Column("manager_user_id", sa.String(36), nullable=True))

    op.create_unique_constraint("uq_users_employee_id", "users", ["employee_id"])
    op.create_index("ix_users_employee_id", "users", ["employee_id"], unique=False)
    op.create_index("ix_users_position_id", "users", ["position_id"], unique=False)
    op.create_index("ix_users_manager_user_id", "users", ["manager_user_id"], unique=False)
    op.create_index("ix_users_updated_at", "users", ["updated_at"], unique=False)

    op.create_foreign_key("fk_users_position_id", "users", "positions", ["position_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_users_manager_user_id", "users", "users", ["manager_user_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_users_manager_user_id", "users", type_="foreignkey")
    op.drop_constraint("fk_users_position_id", "users", type_="foreignkey")
    op.drop_index("ix_users_updated_at", table_name="users")
    op.drop_index("ix_users_manager_user_id", table_name="users")
    op.drop_index("ix_users_position_id", table_name="users")
    op.drop_index("ix_users_employee_id", table_name="users")
    op.drop_constraint("uq_users_employee_id", "users", type_="unique")
    op.drop_column("users", "manager_user_id")
    op.drop_column("users", "position_id")
    op.drop_column("users", "employee_id")

    op.drop_constraint("fk_divisions_manager_user_id", "divisions", type_="foreignkey")
    op.drop_index("ix_divisions_manager_user_id", table_name="divisions")
    op.drop_column("divisions", "manager_user_id")

    op.drop_table("api_keys")
    op.drop_index("ix_positions_code", table_name="positions")
    op.drop_table("positions")
