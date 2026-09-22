# Deploy Central Authentication Service to Ubuntu server (172.16.0.111)
$ErrorActionPreference = "Stop"

$serverHost = "172.16.0.111"
$serverUser = "it-admin"
$remotePath = "/opt/central-auth"

Write-Host "=== Deploying Central Authentication Service to $serverUser@$serverHost:$remotePath ===" -ForegroundColor Cyan

Write-Host "[1/2] Syncing frontend, css, js, nginx, and docker-compose.yml..." -ForegroundColor Yellow
scp -r frontend css js nginx docker-compose.yml "${serverUser}@${serverHost}:${remotePath}/"

Write-Host "[2/2] Restarting auth-web container on $serverHost..." -ForegroundColor Yellow
ssh -t "${serverUser}@${serverHost}" "cd $remotePath && docker compose restart auth-web"

Write-Host "=== Deployment successful! Hard refresh your browser (Ctrl+F5) at http://${serverHost}:8080 ===" -ForegroundColor Green
