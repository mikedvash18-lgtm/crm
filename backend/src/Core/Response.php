<?php

declare(strict_types=1);

namespace App\Core;

class Response
{
    public function __construct(
        private mixed $data = null,
        private int $statusCode = 200,
        private array $headers = []
    ) {}

    public static function json(mixed $data, int $code = 200): self
    {
        return new self($data, $code);
    }

    public static function success(mixed $data = null, string $message = 'OK', int $code = 200): self
    {
        return new self(['success' => true, 'message' => $message, 'data' => $data], $code);
    }

    public static function error(string $message, int $code = 400, mixed $errors = null): self
    {
        $body = ['success' => false, 'message' => $message];
        if ($errors !== null) $body['errors'] = $errors;
        return new self($body, $code);
    }

    public function send(): void
    {
        http_response_code($this->statusCode);
        header('Content-Type: application/json; charset=utf-8');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

        foreach ($this->headers as $name => $value) {
            header("{$name}: {$value}");
        }

        echo json_encode($this->data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
