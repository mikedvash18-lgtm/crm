<?php

declare(strict_types=1);

define('ROOT_PATH', dirname(__DIR__));
define('APP_PATH', ROOT_PATH . '/src');
define('CONFIG_PATH', ROOT_PATH . '/config');

require_once ROOT_PATH . '/vendor/autoload.php';

use App\Core\Application;
use App\Core\Request;
use App\Core\Router;

// Load environment
$dotenv = Dotenv\Dotenv::createImmutable(ROOT_PATH);
$dotenv->safeLoad();

// CORS headers
$origin = $_ENV['FRONTEND_URL'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Headers: Authorization, Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Boot application
$app = new Application();
$router = new Router();

require_once ROOT_PATH . '/routes/api.php';
require_once ROOT_PATH . '/routes/webhook.php';

$request = new Request();
$router->dispatch($request);
