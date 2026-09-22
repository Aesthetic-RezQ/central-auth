# Product Requirements Document
## Central Authentication Service for Internal IT Applications

**Version:** 1.0  
**Project Type:** Internal IT Platform  
**Deployment:** Docker / Internal Server  
**Priority:** Critical Foundation

---

## 1. Background

Saat ini beberapa aplikasi internal memiliki mekanisme autentikasi masing-masing. Pendekatan ini akan semakin sulit dikelola ketika jumlah aplikasi bertambah karena:

- User harus dikelola di beberapa database.
- Password tersimpan di beberapa aplikasi.
- Disable user harus dilakukan berulang kali.
- Role dan permission sulit distandardisasi.
- Aplikasi baru selalu membutuhkan pembangunan modul authentication baru.

Diperlukan satu **Central Authentication Service (CAS)** sebagai master identity platform untuk seluruh aplikasi internal.

---

## 2. Objective

Membangun Central Auth Service yang menyediakan:

1. Single master user database.
2. Authentication API terpusat.
3. Centralized user management.
4. Role-Based Access Control (RBAC).
5. Application-level access control.
6. JWT-based authentication.
7. Refresh-token mechanism.
8. Central audit log.
9. Account enable/disable.
10. Fondasi untuk Single Sign-On (SSO) antar aplikasi internal.

Central Auth harus dapat digunakan oleh:

- Helpdesk
- Network Monitoring System (NMS)
- IT MIS
- Future internal applications

---

## 3. Architecture

```text
                    USER
                      │
                      ▼
              CENTRAL AUTH SERVICE
              ┌──────────────────┐
              │ Authentication   │
              │ Authorization    │
              │ User Management  │
              │ Token Management │
              │ Audit Logging    │
              └────────┬─────────┘
                       │
                 Central Auth DB
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
     Helpdesk          NMS           IT MIS
        │              │              │
        ▼              ▼              ▼
   Helpdesk DB       NMS DB        IT MIS DB
```

Central Auth tidak boleh mengambil alih database operasional aplikasi.

---

## 4. Technology Recommendation

Preferred baseline:

- Backend: FastAPI
- Database: PostgreSQL
- ORM: SQLAlchemy
- Migration: Alembic
- Authentication: JWT
- Password hashing: Argon2id
- Reverse Proxy: Nginx
- Containerization: Docker Compose
- API Documentation: OpenAPI / Swagger

Alternative framework diperbolehkan selama seluruh security requirement tetap terpenuhi.

---

## 5. Core Database

### users

```text
id
username
email
full_name
password_hash
status
is_superadmin
last_login_at
password_changed_at
created_at
updated_at
```

`status`:

```text
active
disabled
locked
```

### applications

```text
id
code
name
description
status
created_at
```

Example:

```text
HELPDESK
NMS
ITMIS
```

### roles

```text
id
application_id
name
description
created_at
```

### permissions

```text
id
application_id
code
description
```

Permission naming convention:

```text
helpdesk.ticket.view
helpdesk.ticket.create
helpdesk.ticket.assign

nms.device.view
nms.device.manage

itmis.dashboard.view
itmis.report.manage
```

### user_roles

```text
user_id
role_id
```

### role_permissions

```text
role_id
permission_id
```

### user_applications

```text
user_id
application_id
enabled
```

### refresh_tokens

Store secure token metadata, not unnecessary plaintext credentials.

```text
id
user_id
token_hash
expires_at
revoked_at
created_at
```

### audit_logs

```text
id
user_id
event
application
source_ip
user_agent
timestamp
metadata
```

---

## 6. Authentication API

Minimum endpoints:

```text
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout

GET  /api/v1/auth/me
GET  /api/v1/auth/permissions
```

Administration:

```text
GET    /api/v1/admin/users
POST   /api/v1/admin/users
GET    /api/v1/admin/users/{id}
PUT    /api/v1/admin/users/{id}

POST   /api/v1/admin/users/{id}/disable
POST   /api/v1/admin/users/{id}/enable

GET    /api/v1/admin/applications
POST   /api/v1/admin/applications

GET    /api/v1/admin/roles
POST   /api/v1/admin/roles

GET    /api/v1/admin/permissions
POST   /api/v1/admin/permissions
```

---

## 7. Login Flow

```text
User
 │
 │ username/password
 ▼
Application
 │
 │ POST /auth/login
 ▼
Central Auth
 │
 ├─ validate user
 ├─ validate password
 ├─ validate account status
 ├─ validate application access
 │
 ▼
Access Token + Refresh Token
 │
 ▼
Application
```

---

## 8. JWT

Access token should contain only required identity information.

Example claims:

```json
{
  "sub": "USER_UUID",
  "username": "user01",
  "iss": "internal-auth",
  "aud": "nms",
  "exp": 1234567890
}
```

Do not store sensitive information inside JWT.

Authorization must still be validated securely rather than trusting UI visibility.

---

## 9. Security Requirements

Mandatory:

- Passwords MUST NOT be stored as plaintext.
- Use Argon2id password hashing.
- JWT signing secret/private key must not be hardcoded.
- Secrets must use environment variables or Docker secrets.
- Access token must have short expiration.
- Refresh token must support rotation/revocation.
- Logout must revoke the appropriate refresh session.
- Login endpoint requires rate limiting.
- Failed login attempts must be logged.
- Disabled users cannot authenticate.
- Backend must enforce authorization.
- Frontend hiding alone is NOT authorization.
- CORS must use an explicit allowlist.
- Production traffic must use HTTPS.
- Authentication errors must not reveal whether a username exists.
- Sensitive values must not appear in application logs.

---

## 10. Admin Portal

Provide web-based administration.

### Dashboard

Show:

- Total users
- Active users
- Disabled users
- Registered applications
- Recent authentication activity
- Failed login activity

### User Management

Administrator can:

- Create user
- Edit user
- Disable user
- Enable user
- Reset password
- Assign applications
- Assign roles

### Application Management

Administrator can register applications such as:

```text
NMS
Helpdesk
IT MIS
Future Application
```

### RBAC Management

Administrator can manage:

```text
Application
   ↓
Roles
   ↓
Permissions
   ↓
Users
```

---

## 11. Audit

Log security-sensitive actions including:

```text
LOGIN_SUCCESS
LOGIN_FAILED
LOGOUT
TOKEN_REFRESH
PASSWORD_CHANGED
PASSWORD_RESET
USER_CREATED
USER_DISABLED
USER_ENABLED
ROLE_ASSIGNED
ROLE_REMOVED
PERMISSION_CHANGED
```

Audit logs should be searchable by:

- User
- Event
- Application
- Date
- IP address

---

## 12. Health Monitoring

Provide:

```text
GET /health
GET /ready
```

Health endpoint should report service status without exposing sensitive configuration.

---

## 13. Docker Deployment

Recommended structure:

```text
central-auth/
├── backend/
├── frontend/
├── migrations/
├── nginx/
├── docker-compose.yml
├── .env.example
└── README.md
```

Containers:

```text
auth-api
auth-web
auth-db
auth-nginx
```

Do not expose PostgreSQL outside the Docker network unless operationally required.

---

## 14. Backup

Database must support scheduled backup.

Minimum:

```text
Daily database backup
+
Retention policy
+
Restore procedure documentation
```

---

## 15. Acceptance Criteria

Project is complete when:

- User can login through Central Auth.
- Password is securely hashed.
- Access and refresh tokens function correctly.
- Disabled users cannot login.
- Application access can be assigned per user.
- Roles can be assigned.
- Permissions can be assigned to roles.
- API can validate authenticated users.
- Audit logs record authentication events.
- NMS/Helpdesk can integrate without directly reading Auth DB.
- System runs successfully using Docker.
- Documentation and `.env.example` are provided.

---

# FINAL PRINCIPLE

Central Auth is the authoritative source for:

**Identity + Authentication + Application Access + Authorization Policy**

It must NOT become the operational database for Helpdesk, NMS, or other applications.