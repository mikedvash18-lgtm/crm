<?php

declare(strict_types=1);

namespace App\Core;

use PDO;
use PDOException;
use PDOStatement;

class Database
{
    private PDO $pdo;
    private static int $queryCount = 0;

    public function __construct(
        private string $host,
        private string $dbname,
        private string $user,
        private string $pass,
        private int $port = 3306
    ) {
        $this->connect();
    }

    private function connect(): void
    {
        $dsn = "mysql:host={$this->host};port={$this->port};dbname={$this->dbname};charset=utf8mb4";
        $this->pdo = new PDO($dsn, $this->user, $this->pass, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    }

    public function query(string $sql, array $params = []): PDOStatement
    {
        self::$queryCount++;
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public function fetch(string $sql, array $params = []): ?array
    {
        return $this->query($sql, $params)->fetch() ?: null;
    }

    public function fetchAll(string $sql, array $params = []): array
    {
        return $this->query($sql, $params)->fetchAll();
    }

    public function insert(string $table, array $data): int
    {
        $cols = implode(',', array_map(fn($k) => "`{$k}`", array_keys($data)));
        $placeholders = implode(',', array_fill(0, count($data), '?'));
        $this->query("INSERT INTO `{$table}` ({$cols}) VALUES ({$placeholders})", array_values($data));
        return (int)$this->pdo->lastInsertId();
    }

    public function update(string $table, array $data, string $where, array $whereParams = []): int
    {
        $set = implode(',', array_map(fn($k) => "`{$k}` = ?", array_keys($data)));
        $stmt = $this->query(
            "UPDATE `{$table}` SET {$set} WHERE {$where}",
            [...array_values($data), ...$whereParams]
        );
        return $stmt->rowCount();
    }

    public function beginTransaction(): void { $this->pdo->beginTransaction(); }
    public function commit(): void           { $this->pdo->commit(); }
    public function rollback(): void         { $this->pdo->rollBack(); }

    public function lastInsertId(): int { return (int)$this->pdo->lastInsertId(); }

    public static function getQueryCount(): int { return self::$queryCount; }
}
