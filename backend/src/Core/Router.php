<?php

declare(strict_types=1);

namespace App\Core;

class Router
{
    private array $routes = [];

    public function get(string $pattern, string $controller, string $method, array $middlewares = []): void
    {
        $this->addRoute('GET', $pattern, $controller, $method, $middlewares);
    }

    public function post(string $pattern, string $controller, string $method, array $middlewares = []): void
    {
        $this->addRoute('POST', $pattern, $controller, $method, $middlewares);
    }

    public function put(string $pattern, string $controller, string $method, array $middlewares = []): void
    {
        $this->addRoute('PUT', $pattern, $controller, $method, $middlewares);
    }

    public function delete(string $pattern, string $controller, string $method, array $middlewares = []): void
    {
        $this->addRoute('DELETE', $pattern, $controller, $method, $middlewares);
    }

    private function addRoute(string $httpMethod, string $pattern, string $controller, string $method, array $middlewares): void
    {
        $this->routes[] = compact('httpMethod', 'pattern', 'controller', 'method', 'middlewares');
    }

    public function dispatch(Request $request): void
    {
        $httpMethod = $request->method();
        $uri = $request->uri();

        foreach ($this->routes as $route) {
            if ($route['httpMethod'] !== $httpMethod) continue;

            $regex = preg_replace('/\{([a-z_]+)\}/', '([^/]+)', $route['pattern']);
            $regex = '#^' . $regex . '$#';

            if (!preg_match($regex, $uri, $matches)) continue;

            array_shift($matches);
            $request->setRouteParams($matches);

            // Run middlewares
            foreach ($route['middlewares'] as $mw) {
                (new $mw())->handle($request);
            }

            $controller = new $route['controller']();
            $response = $controller->{$route['method']}($request);

            if ($response instanceof Response) {
                $response->send();
            }
            return;
        }

        (new Response(['message' => 'Route not found'], 404))->send();
    }
}
