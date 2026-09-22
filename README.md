# Central Authentication Service

Central Auth is the authoritative identity, authentication, application-access, and authorization-policy service for internal IT applications. It does not store Helpdesk, NMS, or IT MIS operational data.

UI framework: BIC Internal IT Web UI Framework v1.0.0.

## Run locally with Docker

1. Copy `.env.example` to `.env`.
2. Set a long random `JWT_SECRET_KEY`, a strong `POSTGRES_PASSWORD`, and a temporary `DEFAULT_ADMIN_PASSWORD`.
3. Start the stack:

~~~powershell
docker compose up --build -d
~~~

Open http://localhost:8080. The API documentation is available at http://localhost:8080/docs. The API is available through the web container under `/api`.

## Authentication contract

- `POST /api/v1/auth/login` with `username`, `password`, and `application_code`.
- `POST /api/v1/auth/refresh` with a refresh token and `X-Application-Code`.
- `POST /api/v1/auth/logout` with a refresh token and a bearer access token.
- `GET /api/v1/auth/me`.
- `GET /api/v1/auth/permissions` with `X-Application-Code`.

Access tokens are short-lived JWTs. Refresh tokens are random, stored only as SHA-256 hashes, rotated on refresh, and revocable on logout. The JWT contains only the user id, username, issuer, audience, timestamps, and a token id.

Application integrations should call Central Auth APIs; they must not read the Central Auth database directly. A service can validate a JWT using the issuer, audience, signature, and expiry, then use the permissions endpoint or a backend policy check for authorization.

## Administration

The portal supports user creation, editing, enable/disable, password reset, superadmin status, application registration, application access assignments, role and permission registration, role assignment, filtered audit events, and dashboard counts.

The seeded administrator is controlled by the `DEFAULT_ADMIN_*` variables. Change that password before exposing the service to users.

## Application connectivity status

The Overview page performs live HTTP checks for NMS and Helpdesk through:

- `HELPDESK_HEALTH_URL`
- `NMS_HEALTH_URL`
- `CONNECTION_CHECK_TIMEOUT_SECONDS`

Set these to the real health/readiness endpoints exposed by the applications, for example:

```env
HELPDESK_HEALTH_URL=http://helpdesk.internal/health
NMS_HEALTH_URL=http://nms.internal/health
CONNECTION_CHECK_TIMEOUT_SECONDS=3
CONNECTION_CHECK_VERIFY_TLS=true
```

The dashboard reports `Connected`, `Unavailable`, `Not configured`, or `Not registered`. It never reports a service as connected based only on its Central Auth registration.

## Backups and restore

Create a daily logical backup from the host:

~~~powershell
docker compose exec -T db pg_dump -U auth -d central_auth | Out-File -Encoding utf8 backups\central_auth_$(Get-Date -Format yyyyMMdd).sql
~~~

Keep backups outside the Docker volume and apply an organizational retention policy. Restore into a maintenance instance or after stopping the API:

~~~powershell
Get-Content backups\central_auth_YYYYMMDD.sql | docker compose exec -T db psql -U auth -d central_auth
~~~

Test restores regularly. Production traffic should terminate TLS at a managed reverse proxy or at Nginx with certificates; the sample Compose stack is intended for internal development and staging.

## Layout

- `backend/app`: FastAPI service, models, security, API routes.
- `backend/migrations`: Alembic schema migrations.
- `frontend`: lightweight administration portal.
- `nginx`: internal reverse proxy and static asset server.
- `docker-compose.yml`: PostgreSQL, API, and web containers.
