<?php

declare(strict_types=1);

namespace App\Core;

use App\Core\Database;
use App\Core\Container;

class Application
{
    private static Application $instance;
    public Container $container;

    public function __construct()
    {
        self::$instance = $this;
        $this->container = new Container();
        $this->registerBindings();
        $this->setErrorHandlers();
    }

    public static function getInstance(): Application
    {
        return self::$instance;
    }

    private function registerBindings(): void
    {
        $this->container->singleton(Database::class, fn() => new Database(
            host: $_ENV['DB_HOST'] ?? 'localhost',
            dbname: $_ENV['DB_NAME'] ?? 'ai_call_platform',
            user: $_ENV['DB_USER'] ?? 'root',
            pass: $_ENV['DB_PASS'] ?? '',
            port: (int)($_ENV['DB_PORT'] ?? 3306),
        ));
    }

    private function setErrorHandlers(): void
    {
        set_exception_handler(function (\Throwable $e) {
            $code = $e->getCode() ?: 500;
            http_response_code($code >= 400 && $code < 600 ? $code : 500);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false,
                'message' => $e->getMessage(),
                'code'    => $code,
            ]);
            exit;
        });
    }
}
