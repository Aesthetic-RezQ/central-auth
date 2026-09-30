"""Add OIDC Identity Provider tables and fields for SSO.

Revision ID: 0005_oidc_identity_provider
Revises: 0004_helpdesk_organization
Create Date: 2026-09-26
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_oidc_identity_provider"
down_revision = "0004_helpdesk_organization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Extend applications table for OIDC Client specifications
    op.add_column("applications", sa.Column("client_id", sa.String(80), nullable=True))
    op.add_column("applications", sa.Column("client_secret_hash", sa.String(255), nullable=True))
    op.add_column("applications", sa.Column("client_type", sa.String(20), nullable=False, server_default="confidential"))
    op.add_column("applications", sa.Column("require_consent", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("applications", sa.Column("allowed_scopes", sa.JSON(), nullable=False, server_default='["openid", "profile", "email", "groups"]'))
    op.add_column("applications", sa.Column("access_token_lifetime", sa.Integer(), nullable=False, server_default="600"))
    op.add_column("applications", sa.Column("id_token_lifetime", sa.Integer(), nullable=False, server_default="300"))
    op.create_unique_constraint("uq_applications_client_id", "applications", ["client_id"])
    op.create_index("ix_applications_client_id", "applications", ["client_id"], unique=False)

    # Populate client_id for existing applications matching their code in lowercase
    op.execute("UPDATE applications SET client_id = LOWER(code) WHERE client_id IS NULL")

    # 2. Create application_redirect_uris table
    op.create_table(
        "application_redirect_uris",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("application_id", sa.String(36), sa.ForeignKey("applications.id", ondelete="CASCADE"), nullable=False),
        sa.Column("redirect_uri", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_application_redirect_uris_app_id", "application_redirect_uris", ["application_id"])
    op.create_unique_constraint("uq_app_redirect_uri", "application_redirect_uris", ["application_id", "redirect_uri"])

    # 3. Create signing_keys table (for RS256 asymmetric token signing)
    op.create_table(
        "signing_keys",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kid", sa.String(64), nullable=False, unique=True),
        sa.Column("algorithm", sa.String(20), nullable=False, server_default="RS256"),
        sa.Column("private_key_pem", sa.Text(), nullable=False),
        sa.Column("public_key_pem", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("retired_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_signing_keys_kid", "signing_keys", ["kid"])

    # 4. Create sso_sessions table (for CentralAuth browser SSO session tracking)
    op.create_table(
        "sso_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_sso_sessions_user_id", "sso_sessions", ["user_id"])
    op.create_index("ix_sso_sessions_session_token_hash", "sso_sessions", ["session_token_hash"])
    op.create_index("ix_sso_sessions_expires_at", "sso_sessions", ["expires_at"])

    # 5. Create authorization_codes table (PKCE-bound single-use authorization codes)
    op.create_table(
        "authorization_codes",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("client_id", sa.String(80), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("redirect_uri", sa.String(500), nullable=False),
        sa.Column("scope", sa.String(255), nullable=False),
        sa.Column("nonce", sa.String(255), nullable=True),
        sa.Column("code_challenge", sa.String(128), nullable=False),
        sa.Column("code_challenge_method", sa.String(20), nullable=False, server_default="S256"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_auth_codes_code_hash", "authorization_codes", ["code_hash"])
    op.create_index("ix_auth_codes_client_id", "authorization_codes", ["client_id"])
    op.create_index("ix_auth_codes_expires_at", "authorization_codes", ["expires_at"])

    # 6. Create groups and user_groups tables
    op.create_table(
        "groups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(60), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_groups_code", "groups", ["code"])

    op.create_table(
        "user_groups",
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("group_id", sa.String(36), sa.ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    )


def downgrade() -> None:
    op.drop_table("user_groups")
    op.drop_table("groups")
    op.drop_table("authorization_codes")
    op.drop_table("sso_sessions")
    op.drop_table("signing_keys")
    op.drop_table("application_redirect_uris")
    op.drop_column("applications", "id_token_lifetime")
    op.drop_column("applications", "access_token_lifetime")
    op.drop_column("applications", "allowed_scopes")
    op.drop_column("applications", "require_consent")
    op.drop_column("applications", "client_type")
    op.drop_column("applications", "client_secret_hash")
    op.drop_column("applications", "client_id")
