<?php

declare(strict_types=1);

namespace App\Middleware;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\AuthService;
use RuntimeException;

class AuthMiddleware
{
    public function handle(Request $request): void
    {
        $token = $request->bearerToken();
        if (!$token) {
            (new Response(['success' => false, 'message' => 'Unauthorized'], 401))->send();
            exit;
        }

        try {
            $db      = Application::getInstance()->container->make(Database::class);
            $auth    = new AuthService($db);
            $payload = $auth->verify($token);
            $_SERVER['AUTH_USER_ID']   = $payload['sub'];
            $_SERVER['AUTH_USER_ROLE'] = $payload['role'];
        } catch (RuntimeException $e) {
            (new Response(['success' => false, 'message' => $e->getMessage()], 401))->send();
            exit;
        }
    }
}

class RoleMiddleware
{
    private array $allowedRoles;

    public function __construct(array $roles)
    {
        $this->allowedRoles = $roles;
    }

    public function handle(Request $request): void
    {
        $role = $_SERVER['AUTH_USER_ROLE'] ?? '';
        if ($role !== 'super_admin' && !in_array($role, $this->allowedRoles)) {
            (new Response(['success' => false, 'message' => 'Forbidden'], 403))->send();
            exit;
        }
    }
}
