<?php
/**
 * Example PHP Web Application integrating with CentralAuth OIDC SSO
 * 
 * Flow:
 * 1. User clicks "Login with CentralAuth SSO" -> redirects to CentralAuth IdP
 * 2. User logs in (or if already logged in via SSO cookie, automatically redirected back)
 * 3. CentralAuth redirects back to http://your-app/callback.php with authorization code
 * 4. Application exchanges code for RS256 ID Token & Access Token via PKCE
 * 5. Application establishes local PHP session with authenticated user profile & roles
 */

require_once __DIR__ . '/CentralAuthOIDCClient.php';

use CentralAuth\OIDC\CentralAuthOIDCClient;

// Configuration
$issuer = getenv('CENTRAL_AUTH_ISSUER') ?: 'http://172.16.0.111:8000';
$clientId = getenv('OIDC_CLIENT_ID') ?: 'helpdesk';
$clientSecret = getenv('OIDC_CLIENT_SECRET') ?: 'helpdesk_secret_2026';
$redirectUri = 'http://' . $_SERVER['HTTP_HOST'] . strtok($_SERVER['REQUEST_URI'], '?');

$oidcClient = new CentralAuthOIDCClient($issuer, $clientId, $clientSecret);

$action = $_GET['action'] ?? 'home';

// 1. Initiate Login
if ($action === 'login') {
    $oidcClient->initiateLogin($redirectUri, ['openid', 'profile', 'email', 'roles', 'org']);
}

// 2. Handle Callback
if (isset($_GET['code'])) {
    try {
        $result = $oidcClient->handleCallback($_GET);
        
        // Store user in local application session
        $_SESSION['user'] = $result['userinfo'];
        $_SESSION['id_token'] = $result['tokens']['id_token'];
        $_SESSION['access_token'] = $result['tokens']['access_token'];

        header("Location: " . strtok($_SERVER['REQUEST_URI'], '?'));
        exit;
    } catch (\Exception $e) {
        die("SSO Login Error: " . htmlspecialchars($e->getMessage()));
    }
}

// 3. Logout
if ($action === 'logout') {
    unset($_SESSION['user'], $_SESSION['id_token'], $_SESSION['access_token']);
    session_destroy();
    
    // Redirect to CentralAuth SSO Logout
    $postLogoutUri = 'http://' . $_SERVER['HTTP_HOST'] . strtok($_SERVER['REQUEST_URI'], '?');
    header("Location: " . $oidcClient->getLogoutUrl($postLogoutUri));
    exit;
}

// 4. Render App UI
$user = $_SESSION['user'] ?? null;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Internal Client App - CentralAuth OIDC SSO Demo</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/core@latest/dist/css/tabler.min.css">
</head>
<body class="bg-light">
<div class="page page-center">
    <div class="container container-tight py-4">
        <div class="card card-md">
            <div class="card-body">
                <h2 class="card-title text-center mb-4">CentralAuth SSO Client</h2>
                <?php if ($user): ?>
                    <div class="alert alert-success">
                        <strong>Logged in as:</strong> <?= htmlspecialchars($user['name'] ?? $user['preferred_username']) ?>
                    </div>
                    <ul class="list-group mb-3">
                        <li class="list-group-item"><strong>Username:</strong> <?= htmlspecialchars($user['preferred_username']) ?></li>
                        <li class="list-group-item"><strong>Email:</strong> <?= htmlspecialchars($user['email'] ?? 'N/A') ?></li>
                        <li class="list-group-item"><strong>Division:</strong> <?= htmlspecialchars($user['division'] ?? 'N/A') ?></li>
                        <li class="list-group-item"><strong>Position:</strong> <?= htmlspecialchars($user['position'] ?? 'N/A') ?></li>
                        <li class="list-group-item"><strong>Org Role:</strong> <span class="badge bg-blue text-white"><?= htmlspecialchars($user['org_role'] ?? 'employee') ?></span></li>
                        <li class="list-group-item"><strong>App Roles:</strong> <?= htmlspecialchars(implode(', ', $user['roles'] ?? [])) ?></li>
                    </ul>
                    <div class="d-grid">
                        <a href="?action=logout" class="btn btn-outline-danger">Sign Out (SSO Logout)</a>
                    </div>
                <?php else: ?>
                    <p class="text-muted text-center mb-4">Click below to authenticate using CentralAuth Single Sign-On.</p>
                    <div class="d-grid">
                        <a href="?action=login" class="btn btn-primary btn-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-shield-lock me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /><path d="M12 11m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" /><path d="M12 12l0 2.5" /></svg>
                            Log in with CentralAuth SSO
                        </a>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>
</body>
</html>
