"""
Automated Integration and Data Contract Verification Test Suite for CentralAuth.
Runs against FastAPI test client using SQLite in-memory or PostgreSQL.
"""
import os
import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Set test environment
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET_KEY"] = "test-secret-key-1234567890"

from app.database import get_db
from app.main import app, seed_defaults
from app.models import ApiKey, Base, Division, Position, Role, User
from app.security import generate_api_key, hash_api_key, hash_password

test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    Base.metadata.create_all(bind=test_engine)
    # Seed default data
    db = TestingSessionLocal()
    try:
        # Standard Positions
        gm_pos = Position(code="GENERAL_MANAGER", name="General Manager", level=4, is_manager=True, is_general_manager=True)
        mgr_pos = Position(code="MANAGER", name="Manager", level=3, is_manager=True, is_general_manager=False)
        staff_pos = Position(code="STAFF", name="Staff", level=1, is_manager=False, is_general_manager=False)
        db.add_all([gm_pos, mgr_pos, staff_pos])
        db.flush()

        # General Manager User
        gm_user = User(
            id="gm-uuid-001",
            employee_id="EMP00001",
            username="general.manager",
            email="gm@bic.co.id",
            full_name="General Manager",
            password_hash=hash_password("Password1234!"),
            position_id=gm_pos.id,
            is_superadmin=True,
            status="active",
        )
        db.add(gm_user)
        db.flush()

        # Division Head (Jane Smith)
        jane = User(
            id="jane-uuid-002",
            employee_id="EMP00567",
            username="jane.smith",
            email="jane.smith@bic.co.id",
            full_name="Jane Smith",
            password_hash=hash_password("Password1234!"),
            position_id=mgr_pos.id,
            status="active",
        )
        db.add(jane)
        db.flush()

        # Division (Finance)
        fin_div = Division(
            id="div-uuid-fin",
            code="FIN",
            name="Finance",
            description="Finance & Accounting",
            manager_user_id=jane.id,
        )
        db.add(fin_div)
        db.flush()
        jane.division_id = fin_div.id

        # Normal Employee (John Doe)
        john = User(
            id="john-uuid-003",
            employee_id="EMP00123",
            username="john.doe",
            email="john.doe@bic.co.id",
            full_name="John Doe",
            password_hash=hash_password("Password1234!"),
            division_id=fin_div.id,
            position_id=staff_pos.id,
            status="active",
        )
        db.add(john)
        db.flush()

        # Service API Key
        raw_key = "cas_helpdesk_test_key_secret"
        api_key = ApiKey(
            id="api-key-001",
            name="Helpdesk Test Key",
            client_code="HELPDESK",
            key_prefix="cas_helpdes",
            key_hash=hash_api_key(raw_key),
            scopes=["users:read", "organization:read"],
            is_active=True,
        )
        db.add(api_key)
        db.commit()
    finally:
        db.close()

client = TestClient(app)
API_KEY = "cas_helpdesk_test_key_secret"

def test_api_key_authentication_success():
    response = client.get("/api/v1/users", headers={"X-API-Key": API_KEY})
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert data["total"] >= 3

def test_api_key_authentication_failure():
    response = client.get("/api/v1/users", headers={"X-API-Key": "invalid-key"})
    assert response.status_code == 401

def test_unauthenticated_request_failure():
    response = client.get("/api/v1/users")
    assert response.status_code == 401

def test_employee_contract_and_division_manager_resolution():
    """Verify John Doe is an employee whose division manager is Jane Smith and GM is General Manager."""
    response = client.get("/api/v1/users/john.doe", headers={"X-API-Key": API_KEY})
    assert response.status_code == 200
    user = response.json()
    
    assert user["central_auth_user_id"] == "john-uuid-003"
    assert user["employee_id"] == "EMP00123"
    assert user["username"] == "john.doe"
    assert user["full_name"] == "John Doe"
    assert user["email"] == "john.doe@bic.co.id"
    assert user["division_code"] == "FIN"
    assert user["division_name"] == "Finance"
    assert user["position_name"] == "Staff"
    assert user["role"] == "employee"
    assert user["is_manager"] is False
    assert user["is_general_manager"] is False
    assert user["is_active"] is True
    
    # Manager resolution -> Jane Smith
    assert user["manager_user_id"] == "jane-uuid-002"
    assert user["manager_employee_id"] == "EMP00567"
    assert user["manager_name"] == "Jane Smith"
    assert user["manager_email"] == "jane.smith@bic.co.id"
    
    # General Manager resolution -> GM
    assert user["general_manager_user_id"] == "gm-uuid-001"
    assert user["general_manager_name"] == "General Manager"

def test_manager_contract_and_gm_resolution():
    """Verify Jane Smith is a manager whose 1st-level approval escalates to General Manager."""
    response = client.get("/api/v1/users/jane.smith", headers={"X-API-Key": API_KEY})
    assert response.status_code == 200
    user = response.json()
    
    assert user["central_auth_user_id"] == "jane-uuid-002"
    assert user["employee_id"] == "EMP00567"
    assert user["role"] == "manager"
    assert user["is_manager"] is True
    assert user["is_general_manager"] is False
    
    # Manager for Jane Smith resolves to General Manager
    assert user["manager_user_id"] == "gm-uuid-001"
    assert user["manager_name"] == "General Manager"

def test_general_manager_endpoint():
    response = client.get("/api/v1/organization/general-manager", headers={"X-API-Key": API_KEY})
    assert response.status_code == 200
    gm = response.json()
    assert gm["user_id"] == "gm-uuid-001"
    assert gm["employee_id"] == "EMP00001"
    assert gm["name"] == "General Manager"
    assert gm["email"] == "gm@bic.co.id"

def test_divisions_endpoint_with_managers():
    response = client.get("/api/v1/divisions", headers={"X-API-Key": API_KEY})
    assert response.status_code == 200
    divisions = response.json()
    assert len(divisions) >= 1
    fin = next(d for d in divisions if d["code"] == "FIN")
    assert fin["name"] == "Finance"
    assert fin["manager"] is not None
    assert fin["manager"]["full_name"] == "Jane Smith"
    assert fin["manager"]["employee_id"] == "EMP00567"

def test_user_organization_hierarchy_endpoint():
    response = client.get("/api/v1/users/john.doe/organization", headers={"X-API-Key": API_KEY})
    assert response.status_code == 200
    org = response.json()
    assert org["role"] == "employee"
    assert org["division"]["name"] == "Finance"
    assert org["manager"]["name"] == "Jane Smith"
    assert org["general_manager"]["name"] == "General Manager"

def test_incremental_sync_filter():
    future_time = datetime(2030, 1, 1, tzinfo=timezone.utc).isoformat()
    response = client.get(f"/api/v1/users?updated_since={future_time}", headers={"X-API-Key": API_KEY})
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 0

if __name__ == "__main__":
    pytest.main(["-v", __file__])
