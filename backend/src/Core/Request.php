<?php

declare(strict_types=1);

namespace App\Core;

class Request
{
    private array $routeParams = [];
    private ?array $parsedBody = null;

    public function method(): string
    {
        return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    }

    public function uri(): string
    {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        return rtrim($uri, '/') ?: '/';
    }

    public function body(): array
    {
        if ($this->parsedBody !== null) return $this->parsedBody;

        $raw = file_get_contents('php://input');
        $contentType = $_SERVER['CONTENT_TYPE'] ?? '';

        if (str_contains($contentType, 'application/json')) {
            $this->parsedBody = json_decode($raw, true) ?? [];
        } else {
            $this->parsedBody = $_POST;
        }

        return $this->parsedBody;
    }

    public function get(string $key, mixed $default = null): mixed
    {
        return $_GET[$key] ?? $default;
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body()[$key] ?? $default;
    }

    public function param(int $index, mixed $default = null): mixed
    {
        return $this->routeParams[$index] ?? $default;
    }

    public function setRouteParams(array $params): void
    {
        $this->routeParams = $params;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return $_SERVER[$key] ?? null;
    }

    public function bearerToken(): ?string
    {
        $auth = $this->header('Authorization')
            ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
            ?? $_SERVER['HTTP_AUTHORIZATION']
            ?? null;
        if ($auth && str_starts_with($auth, 'Bearer ')) {
            return substr($auth, 7);
        }
        return null;
    }

    public function ip(): string
    {
        return $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }

    public function rawBody(): string
    {
        return file_get_contents('php://input');
    }
}
