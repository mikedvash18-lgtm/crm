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

// Boot application
$app = new Application();
$router = new Router();

require_once ROOT_PATH . '/routes/api.php';
require_once ROOT_PATH . '/routes/webhook.php';

$request = new Request();
$router->dispatch($request);
