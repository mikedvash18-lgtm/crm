<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Models\User;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use RuntimeException;
use UnexpectedValueException;

class AuthService
{
    private string $secret;
    private int $accessTtl;
    private int $refreshTtl;

    public function __construct(private Database $db)
    {
        $this->secret     = $_ENV['JWT_SECRET'] ?? 'change_me_in_production';
        $this->accessTtl  = (int)($_ENV['JWT_ACCESS_TTL']  ?? 900);   // 15 min
        $this->refreshTtl = (int)($_ENV['JWT_REFRESH_TTL'] ?? 604800); // 7 days
    }

    public function login(string $email, string $password): array
    {
        $user = $this->db->fetch(
            'SELECT u.*, r.slug as role_slug, r.permissions FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.email = ? AND u.is_active = 1',
            [$email]
        );

        if (!$user || !password_verify($password, $user['password_hash'])) {
            throw new RuntimeException('Invalid credentials', 401);
        }

        $accessToken  = $this->issueAccessToken($user);
        $refreshToken = $this->issueRefreshToken($user['id']);

        $this->db->update('users', ['last_login_at' => date('Y-m-d H:i:s')], 'id = ?', [$user['id']]);

        return [
            'access_token'  => $accessToken,
            'refresh_token' => $refreshToken,
            'expires_in'    => $this->accessTtl,
            'user'          => [
                'id'    => $user['id'],
                'name'  => $user['name'],
                'email' => $user['email'],
                'role'  => $user['role_slug'],
            ],
        ];
    }

    public function refresh(string $refreshToken): array
    {
        $hash = hash('sha256', $refreshToken);
        $record = $this->db->fetch(
            'SELECT * FROM jwt_refresh_tokens WHERE token_hash = ? AND revoked = 0 AND expires_at > NOW()',
            [$hash]
        );

        if (!$record) {
            throw new RuntimeException('Invalid or expired refresh token', 401);
        }

        $user = $this->db->fetch(
            'SELECT u.*, r.slug as role_slug FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
            [$record['user_id']]
        );

        // Revoke old token
        $this->db->update('jwt_refresh_tokens', ['revoked' => 1], 'id = ?', [$record['id']]);

        $newAccess  = $this->issueAccessToken($user);
        $newRefresh = $this->issueRefreshToken($user['id']);

        return ['access_token' => $newAccess, 'refresh_token' => $newRefresh, 'expires_in' => $this->accessTtl];
    }

    public function verify(string $token): array
    {
        try {
            $payload = JWT::decode($token, new Key($this->secret, 'HS256'));
            return (array)$payload;
        } catch (UnexpectedValueException $e) {
            throw new RuntimeException('Invalid or expired token', 401);
        }
    }

    private function issueAccessToken(array $user): string
    {
        $now = time();
        return JWT::encode([
            'iss'  => 'ai-call-platform',
            'iat'  => $now,
            'exp'  => $now + $this->accessTtl,
            'sub'  => $user['id'],
            'role' => $user['role_slug'],
        ], $this->secret, 'HS256');
    }

    private function issueRefreshToken(int $userId): string
    {
        $token = bin2hex(random_bytes(40));
        $hash  = hash('sha256', $token);
        $this->db->insert('jwt_refresh_tokens', [
            'user_id'    => $userId,
            'token_hash' => $hash,
            'expires_at' => date('Y-m-d H:i:s', time() + $this->refreshTtl),
        ]);
        return $token;
    }
}
