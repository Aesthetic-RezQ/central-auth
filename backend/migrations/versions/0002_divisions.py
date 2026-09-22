"""Add divisions and link users to a division."""

from alembic import op
import sqlalchemy as sa


revision = "0002_divisions"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "divisions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(40), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("code"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_divisions_code", "divisions", ["code"], unique=False)
    op.add_column("users", sa.Column("division_id", sa.String(36), nullable=True))
    op.create_index("ix_users_division_id", "users", ["division_id"], unique=False)
    op.create_foreign_key("fk_users_division_id", "users", "divisions", ["division_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_users_division_id", "users", type_="foreignkey")
    op.drop_index("ix_users_division_id", table_name="users")
    op.drop_column("users", "division_id")
    op.drop_index("ix_divisions_code", table_name="divisions")
    op.drop_table("divisions")
