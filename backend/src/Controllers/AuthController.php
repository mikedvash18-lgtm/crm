<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Request;
use App\Core\Response;
use App\Core\Application;
use App\Core\Database;
use App\Services\AuthService;

class AuthController
{
    private AuthService $auth;

    public function __construct()
    {
        $db = Application::getInstance()->container->make(Database::class);
        $this->auth = new AuthService($db);
    }

    public function login(Request $request): Response
    {
        $email    = trim($request->input('email', ''));
        $password = $request->input('password', '');

        if (!$email || !$password) {
            return Response::error('Email and password are required', 422);
        }

        try {
            $result = $this->auth->login($email, $password);
            return Response::success($result, 'Login successful');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), (int)($e->getCode() ?: 401));
        }
    }

    public function refresh(Request $request): Response
    {
        $token = $request->input('refresh_token', '');
        if (!$token) {
            return Response::error('Refresh token required', 422);
        }

        try {
            $result = $this->auth->refresh($token);
            return Response::success($result, 'Token refreshed');
        } catch (\RuntimeException $e) {
            return Response::error($e->getMessage(), 401);
        }
    }

    public function me(Request $request): Response
    {
        $userId = (int)($_SERVER['AUTH_USER_ID'] ?? 0);
        $db = Application::getInstance()->container->make(Database::class);
        $user = $db->fetch(
            'SELECT u.id, u.name, u.email, r.slug as role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?',
            [$userId]
        );
        return Response::success($user);
    }
}
