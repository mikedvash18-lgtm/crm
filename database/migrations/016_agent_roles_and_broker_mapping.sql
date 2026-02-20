-- Add role column to agents table
ALTER TABLE `agents`
  ADD COLUMN `role` ENUM('agent','desk_manager') NOT NULL DEFAULT 'agent' AFTER `broker_id`;

-- Junction table for desk managers with multiple brokers
CREATE TABLE IF NOT EXISTS `agent_brokers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `agent_id` INT UNSIGNED NOT NULL,
  `broker_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_agent_broker` (`agent_id`, `broker_id`),
  KEY `idx_agent` (`agent_id`),
  KEY `idx_broker` (`broker_id`),
  CONSTRAINT `fk_ab_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ab_broker` FOREIGN KEY (`broker_id`) REFERENCES `brokers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
