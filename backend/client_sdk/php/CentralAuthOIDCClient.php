<?php
/**
 * CentralAuth OpenID Connect (OIDC) / OAuth 2.0 Client Middleware
 * 
 * Standalone, lightweight PHP Client for integrating web applications
 * (Helpdesk, NMS, IT MIS, Intranet, Asset Management, etc.)
 * with CentralAuth Identity Provider.
 * 
 * Features:
 * - OIDC Discovery via `/.well-known/openid-configuration`
 * - Authorization Code Flow with PKCE (S256)
 * - State & Nonce CSRF validation
 * - RS256 ID Token & Access Token verification via JWKS
 * - UserInfo endpoint claims retrieval
 * - Single Sign-On (SSO) and Single Logout (SLO) support
 * - Zero external Composer dependencies required (uses native ext-openssl & ext-curl)
 */

namespace CentralAuth\OIDC;

class CentralAuthOIDCClient
{
    private string $issuer;
    private string $clientId;
    private ?string $clientSecret;
    private ?array $discoveryConfig = null;
    private ?array $jwksKeys = null;
    private int $httpTimeout = 10;

    /**
     * Constructor
     *
     * @param string $issuer Base URL of CentralAuth IdP (e.g. 'http://172.16.0.111:8000' or 'https://auth.company.local')
     * @param string $clientId Client identifier registered in CentralAuth
     * @param string|null $clientSecret Client secret (optional for public clients, required for confidential clients)
     */
    public function __construct(string $issuer, string $clientId, ?string $clientSecret = null)
    {
        $this->issuer = rtrim($issuer, '/');
        $this->clientId = $clientId;
        $this->clientSecret = $clientSecret;

        if (session_status() === PHP_SESSION_NONE) {
            session_start();
        }
    }

    /**
     * Discover OIDC Configuration
     *
     * @return array
     * @throws \RuntimeException
     */
    public function getDiscoveryConfig(): array
    {
        if ($this->discoveryConfig !== null) {
            return $this->discoveryConfig;
        }

        $discoveryUrl = $this->issuer . '/.well-known/openid-configuration';
        $response = $this->httpGet($discoveryUrl);

        if (!$response || !isset($response['authorization_endpoint'], $response['token_endpoint'], $response['jwks_uri'])) {
            throw new \RuntimeException("Failed to fetch valid OIDC discovery configuration from {$discoveryUrl}");
        }

        $this->discoveryConfig = $response;
        return $this->discoveryConfig;
    }

    /**
     * Generate PKCE Code Verifier (43-128 chars random base64url)
     */
    public static function generateCodeVerifier(int $length = 64): string
    {
        $randomBytes = random_bytes($length);
        return self::base64UrlEncode($randomBytes);
    }

    /**
     * Generate PKCE Code Challenge (S256 = Base64Url(SHA256(verifier)))
     */
    public static function generateCodeChallenge(string $codeVerifier): string
    {
        $hash = hash('sha256', $codeVerifier, true);
        return self::base64UrlEncode($hash);
    }

    /**
     * Generate State & Nonce tokens for CSRF protection
     */
    public static function generateRandomToken(int $length = 32): string
    {
        return bin2hex(random_bytes($length));
    }

    /**
     * Build the Authorization URL to redirect the user to CentralAuth login
     *
     * @param string $redirectUri Registered callback URL
     * @param array $scopes Array of scopes to request (default: openid, profile, email, roles, org)
     * @param string|null $state Optional custom state
     * @return string Redirect URL
     */
    public function getAuthorizationUrl(
        string $redirectUri,
        array $scopes = ['openid', 'profile', 'email', 'roles', 'org'],
        ?string $state = null
    ): string {
        $config = $this->getDiscoveryConfig();

        $codeVerifier = self::generateCodeVerifier();
        $codeChallenge = self::generateCodeChallenge($codeVerifier);
        $stateToken = $state ?? self::generateRandomToken(16);
        $nonce = self::generateRandomToken(16);

        // Store PKCE verifier, state, and nonce in local session
        $_SESSION['central_auth_oidc'] = [
            'code_verifier' => $codeVerifier,
            'state' => $stateToken,
            'nonce' => $nonce,
            'redirect_uri' => $redirectUri,
            'created_at' => time()
        ];

        $params = [
            'response_type' => 'code',
            'client_id' => $this->clientId,
            'redirect_uri' => $redirectUri,
            'scope' => implode(' ', $scopes),
            'state' => $stateToken,
            'nonce' => $nonce,
            'code_challenge' => $codeChallenge,
            'code_challenge_method' => 'S256'
        ];

        return $config['authorization_endpoint'] . '?' . http_build_query($params);
    }

    /**
     * Redirect browser to CentralAuth login
     */
    public function initiateLogin(string $redirectUri, array $scopes = ['openid', 'profile', 'email', 'roles', 'org']): void
    {
        $url = $this->getAuthorizationUrl($redirectUri, $scopes);
        header("Location: " . $url);
        exit;
    }

    /**
     * Handle the OAuth2/OIDC Callback at the redirect URI
     *
     * @param array $queryParams Usually $_GET
     * @return array [ 'tokens' => array, 'userinfo' => array, 'id_token_claims' => array ]
     * @throws \InvalidArgumentException
     * @throws \RuntimeException
     */
    public function handleCallback(array $queryParams): array
    {
        if (isset($queryParams['error'])) {
            $desc = $queryParams['error_description'] ?? 'Unknown error';
            throw new \RuntimeException("CentralAuth authorization failed: {$queryParams['error']} - {$desc}");
        }

        if (empty($queryParams['code'])) {
            throw new \InvalidArgumentException("Missing 'code' parameter in authorization callback");
        }

        $sessionData = $_SESSION['central_auth_oidc'] ?? null;
        if (!$sessionData) {
            throw new \RuntimeException("No active OIDC session found. Please re-initiate login.");
        }

        // Verify state
        if (empty($queryParams['state']) || $queryParams['state'] !== $sessionData['state']) {
            throw new \RuntimeException("Invalid state token. Possible CSRF attack.");
        }

        $code = $queryParams['code'];
        $codeVerifier = $sessionData['code_verifier'];
        $redirectUri = $sessionData['redirect_uri'];
        $expectedNonce = $sessionData['nonce'];

        // Clean up one-time session state
        unset($_SESSION['central_auth_oidc']);

        // Exchange code for tokens
        $tokens = $this->exchangeCodeForTokens($code, $codeVerifier, $redirectUri);

        // Validate and decode ID Token
        $idTokenClaims = [];
        if (!empty($tokens['id_token'])) {
            $idTokenClaims = $this->validateAndDecodeJwt($tokens['id_token']);
            
            // Check nonce if present
            if (isset($idTokenClaims['nonce']) && $idTokenClaims['nonce'] !== $expectedNonce) {
                throw new \RuntimeException("ID Token nonce mismatch.");
            }
        }

        // Fetch UserInfo
        $userInfo = [];
        if (!empty($tokens['access_token'])) {
            $userInfo = $this->fetchUserInfo($tokens['access_token']);
        }

        return [
            'tokens' => $tokens,
            'userinfo' => $userInfo,
            'id_token_claims' => $idTokenClaims,
        ];
    }

    /**
     * Exchange authorization code for tokens (POST /oauth/token)
     */
    public function exchangeCodeForTokens(string $code, string $codeVerifier, string $redirectUri): array
    {
        $config = $this->getDiscoveryConfig();

        $postData = [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'redirect_uri' => $redirectUri,
            'client_id' => $this->clientId,
            'code_verifier' => $codeVerifier,
        ];

        if ($this->clientSecret) {
            $postData['client_secret'] = $this->clientSecret;
        }

        $response = $this->httpPost($config['token_endpoint'], $postData);

        if (!isset($response['access_token'])) {
            $err = $response['error_description'] ?? ($response['error'] ?? 'Unknown token exchange failure');
            throw new \RuntimeException("Token exchange failed: {$err}");
        }

        return $response;
    }

    /**
     * Fetch UserInfo claims (GET /oauth/userinfo)
     */
    public function fetchUserInfo(string $accessToken): array
    {
        $config = $this->getDiscoveryConfig();

        $headers = [
            "Authorization: Bearer {$accessToken}",
            "Accept: application/json"
        ];

        $response = $this->httpGet($config['userinfo_endpoint'], $headers);
        if (!$response || !isset($response['sub'])) {
            throw new \RuntimeException("Failed to fetch userinfo from CentralAuth");
        }

        return $response;
    }

    /**
     * Validate and decode an RS256 signed JWT (ID Token or Access Token)
     */
    public function validateAndDecodeJwt(string $jwt): array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            throw new \InvalidArgumentException("Malformed JWT format");
        }

        [$headerB64, $payloadB64, $signatureB64] = $parts;
        $header = json_decode(self::base64UrlDecode($headerB64), true);
        $payload = json_decode(self::base64UrlDecode($payloadB64), true);
        $signature = self::base64UrlDecode($signatureB64);

        if (!$header || !$payload) {
            throw new \InvalidArgumentException("Invalid JWT header or payload JSON");
        }

        if (($header['alg'] ?? '') !== 'RS256') {
            throw new \RuntimeException("Unsupported JWT algorithm: " . ($header['alg'] ?? 'none'));
        }

        // Verify expiration
        $now = time();
        if (isset($payload['exp']) && $payload['exp'] < ($now - 60)) {
            throw new \RuntimeException("JWT token has expired");
        }

        // Verify Issuer
        if (isset($payload['iss']) && rtrim($payload['iss'], '/') !== $this->issuer) {
            throw new \RuntimeException("JWT issuer mismatch: expected {$this->issuer}, got " . ($payload['iss'] ?? ''));
        }

        // Verify Signature against JWKS
        $kid = $header['kid'] ?? null;
        $publicKeyPem = $this->getSigningKeyPem($kid);
        if (!$publicKeyPem) {
            throw new \RuntimeException("No matching RSA public key found for kid: {$kid}");
        }

        $signedData = $headerB64 . '.' . $payloadB64;
        $verifyResult = openssl_verify($signedData, $signature, $publicKeyPem, OPENSSL_ALGO_SHA256);

        if ($verifyResult !== 1) {
            throw new \RuntimeException("JWT RS256 signature verification failed");
        }

        return $payload;
    }

    /**
     * Retrieve RSA Public Key PEM from CentralAuth JWKS endpoint
     */
    private function getSigningKeyPem(?string $kid): ?string
    {
        if ($this->jwksKeys === null) {
            $config = $this->getDiscoveryConfig();
            $jwksData = $this->httpGet($config['jwks_uri']);
            $this->jwksKeys = $jwksData['keys'] ?? [];
        }

        $targetKey = null;
        foreach ($this->jwksKeys as $k) {
            if ($kid === null || (isset($k['kid']) && $k['kid'] === $kid)) {
                $targetKey = $k;
                break;
            }
        }

        if (!$targetKey || ($targetKey['kty'] ?? '') !== 'RSA' || empty($targetKey['n']) || empty($targetKey['e'])) {
            return null;
        }

        return self::jwkToPem($targetKey['n'], $targetKey['e']);
    }

    /**
     * Convert JWK RSA components (n, e) into PEM format using ASN.1 encoding
     */
    public static function jwkToPem(string $nB64Url, string $eB64Url): string
    {
        $modulus = self::base64UrlDecode($nB64Url);
        $exponent = self::base64UrlDecode($eB64Url);

        // Prepend 0x00 if leading bit is 1 to maintain positive integer in ASN.1
        if (ord($modulus[0]) > 0x7f) {
            $modulus = chr(0) . $modulus;
        }
        if (ord($exponent[0]) > 0x7f) {
            $exponent = chr(0) . $exponent;
        }

        $modulusSeq = chr(0x02) . self::encodeLength(strlen($modulus)) . $modulus;
        $exponentSeq = chr(0x02) . self::encodeLength(strlen($exponent)) . $exponent;

        $rsaPublicKeySeq = chr(0x30) . self::encodeLength(strlen($modulusSeq . $exponentSeq)) . $modulusSeq . $exponentSeq;

        // Wrap into SubjectPublicKeyInfo (OID 1.2.840.113549.1.1.1 - rsaEncryption)
        $algorithmIdentifier = pack('H*', '300d06092a864886f70d0101010500');
        $bitString = chr(0x03) . self::encodeLength(strlen($rsaPublicKeySeq) + 1) . chr(0x00) . $rsaPublicKeySeq;

        $subjectPublicKeyInfo = chr(0x30) . self::encodeLength(strlen($algorithmIdentifier . $bitString)) . $algorithmIdentifier . $bitString;

        $pem = "-----BEGIN PUBLIC KEY-----\n" .
            chunk_split(base64_encode($subjectPublicKeyInfo), 64, "\n") .
            "-----END PUBLIC KEY-----\n";

        return $pem;
    }

    private static function encodeLength(int $length): string
    {
        if ($length <= 127) {
            return chr($length);
        }
        $temp = ltrim(pack('N', $length), chr(0));
        return chr(0x80 | strlen($temp)) . $temp;
    }

    /**
     * Build CentralAuth End-Session / Logout URL
     */
    public function getLogoutUrl(?string $postLogoutRedirectUri = null): string
    {
        $config = $this->getDiscoveryConfig();
        $url = $config['end_session_endpoint'] ?? ($this->issuer . '/oauth/logout');
        if ($postLogoutRedirectUri) {
            $url .= '?post_logout_redirect_uri=' . urlencode($postLogoutRedirectUri);
        }
        return $url;
    }

    public static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64UrlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        return base64_decode(strtr($data, '-_', '+/'));
    }

    private function httpGet(string $url, array $headers = []): ?array
    {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->httpTimeout);
        if (!empty($headers)) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }
        $raw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300 && $raw) {
            return json_decode($raw, true);
        }
        return null;
    }

    private function httpPost(string $url, array $params): ?array
    {
        $ch = curl_init($url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/x-www-form-urlencoded']);
        curl_setopt($ch, CURLOPT_TIMEOUT, $this->httpTimeout);
        $raw = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($raw) {
            return json_decode($raw, true);
        }
        return null;
    }
}
