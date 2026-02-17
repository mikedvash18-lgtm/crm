-- ============================================================
-- AI CALL PLATFORM - Full Database Schema
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ------------------------------------------------------------
-- ROLES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id` TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `slug` VARCHAR(50) NOT NULL,
  `permissions` JSON DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id` TINYINT UNSIGNED NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `last_login_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_role` (`role_id`),
  CONSTRAINT `fk_users_role` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- JWT REFRESH TOKENS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `jwt_refresh_tokens` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `token_hash` VARCHAR(255) NOT NULL,
  `expires_at` TIMESTAMP NOT NULL,
  `revoked` TINYINT(1) DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_token` (`token_hash`),
  CONSTRAINT `fk_jwt_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- COUNTRIES
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `countries` (
  `id` SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code` CHAR(2) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `phone_prefix` VARCHAR(10) NOT NULL,
  `language_code` CHAR(5) DEFAULT 'en',
  `timezone` VARCHAR(60) DEFAULT 'UTC',
  `is_active` TINYINT(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- BROKERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `brokers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `code` VARCHAR(50) NOT NULL,
  `crm_endpoint` VARCHAR(500) DEFAULT NULL,
  `crm_api_key` VARCHAR(255) DEFAULT NULL,
  `crm_payload_template` JSON DEFAULT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- SCRIPTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `scripts` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `version` CHAR(1) NOT NULL DEFAULT 'A' COMMENT 'A, B or C',
  `language_code` CHAR(5) DEFAULT 'en',
  `content` TEXT NOT NULL,
  `ai_prompt` TEXT DEFAULT NULL,
  `created_by` INT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_version` (`version`),
  CONSTRAINT `fk_scripts_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- CAMPAIGNS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `campaigns` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `broker_id` INT UNSIGNED NOT NULL,
  `country_id` SMALLINT UNSIGNED NOT NULL,
  `created_by` INT UNSIGNED NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `status` ENUM('draft','active','paused','completed','archived') DEFAULT 'draft',
  `script_a_id` INT UNSIGNED DEFAULT NULL,
  `script_b_id` INT UNSIGNED DEFAULT NULL,
  `script_c_id` INT UNSIGNED DEFAULT NULL,
  `concurrency_limit` SMALLINT UNSIGNED DEFAULT 10,
  `max_attempts` TINYINT UNSIGNED DEFAULT 3,
  `retry_interval_minutes` SMALLINT UNSIGNED DEFAULT 60,
  `call_window_start` TIME DEFAULT '09:00:00',
  `call_window_end` TIME DEFAULT '20:00:00',
  `call_window_timezone` VARCHAR(60) DEFAULT 'UTC',
  `caller_id` VARCHAR(30) DEFAULT NULL,
  `voximplant_app_id` VARCHAR(100) DEFAULT NULL,
  `started_at` TIMESTAMP NULL,
  `paused_at` TIMESTAMP NULL,
  `completed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_broker` (`broker_id`),
  KEY `idx_country` (`country_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_camp_broker` FOREIGN KEY (`broker_id`) REFERENCES `brokers`(`id`),
  CONSTRAINT `fk_camp_country` FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`),
  CONSTRAINT `fk_camp_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
  CONSTRAINT `fk_camp_script_a` FOREIGN KEY (`script_a_id`) REFERENCES `scripts`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_camp_script_b` FOREIGN KEY (`script_b_id`) REFERENCES `scripts`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_camp_script_c` FOREIGN KEY (`script_c_id`) REFERENCES `scripts`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- LEADS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `leads` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `campaign_id` INT UNSIGNED NOT NULL,
  `broker_id` INT UNSIGNED NOT NULL,
  `country_id` SMALLINT UNSIGNED NOT NULL,
  `first_name` VARCHAR(100) DEFAULT NULL,
  `last_name` VARCHAR(100) DEFAULT NULL,
  `phone` VARCHAR(30) NOT NULL,
  `phone_normalized` VARCHAR(30) NOT NULL,
  `email` VARCHAR(150) DEFAULT NULL,
  `language_code` CHAR(5) DEFAULT 'en',
  `status` ENUM(
    'new','queued','called','human','voicemail',
    'not_interested','curious','activation_requested',
    'transferred','closed','archived'
  ) DEFAULT 'new',
  `score` TINYINT UNSIGNED DEFAULT 0 COMMENT '0-100 lead quality score',
  `attempt_count` TINYINT UNSIGNED DEFAULT 0,
  `next_retry_at` TIMESTAMP NULL,
  `next_script_version` CHAR(1) DEFAULT 'A',
  `custom_data` JSON DEFAULT NULL COMMENT 'Extra CSV columns',
  `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_phone` (`phone_normalized`),
  KEY `idx_campaign` (`campaign_id`),
  KEY `idx_broker` (`broker_id`),
  KEY `idx_status` (`status`),
  KEY `idx_retry` (`next_retry_at`),
  CONSTRAINT `fk_lead_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`),
  CONSTRAINT `fk_lead_broker` FOREIGN KEY (`broker_id`) REFERENCES `brokers`(`id`),
  CONSTRAINT `fk_lead_country` FOREIGN KEY (`country_id`) REFERENCES `countries`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- LEAD ATTEMPTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `lead_attempts` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id` BIGINT UNSIGNED NOT NULL,
  `campaign_id` INT UNSIGNED NOT NULL,
  `script_version` CHAR(1) DEFAULT 'A',
  `attempt_number` TINYINT UNSIGNED NOT NULL,
  `call_id` VARCHAR(100) DEFAULT NULL COMMENT 'Voximplant call ID',
  `outcome` ENUM('pending','human','voicemail','no_answer','failed') DEFAULT 'pending',
  `duration_seconds` SMALLINT UNSIGNED DEFAULT 0,
  `started_at` TIMESTAMP NULL,
  `ended_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lead` (`lead_id`),
  KEY `idx_campaign` (`campaign_id`),
  CONSTRAINT `fk_attempt_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_attempt_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- CALL LOGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `call_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id` BIGINT UNSIGNED NOT NULL,
  `campaign_id` INT UNSIGNED NOT NULL,
  `broker_id` INT UNSIGNED NOT NULL,
  `attempt_id` BIGINT UNSIGNED DEFAULT NULL,
  `voximplant_call_id` VARCHAR(100) DEFAULT NULL,
  `event_type` VARCHAR(50) NOT NULL,
  `event_payload` JSON DEFAULT NULL,
  `ai_classification` VARCHAR(50) DEFAULT NULL,
  `ai_confidence` DECIMAL(5,4) DEFAULT NULL,
  `transcript` TEXT DEFAULT NULL,
  `ai_summary` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lead` (`lead_id`),
  KEY `idx_campaign` (`campaign_id`),
  KEY `idx_broker` (`broker_id`),
  KEY `idx_call_id` (`voximplant_call_id`),
  CONSTRAINT `fk_calllog_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`),
  CONSTRAINT `fk_calllog_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- AGENTS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `agents` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED NOT NULL,
  `broker_id` INT UNSIGNED NOT NULL,
  `extension` VARCHAR(20) DEFAULT NULL,
  `voximplant_user_id` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('offline','available','busy','on_call') DEFAULT 'offline',
  `language_codes` JSON DEFAULT NULL COMMENT '["en","es"]',
  `last_seen_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_broker` (`broker_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_agent_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_agent_broker` FOREIGN KEY (`broker_id`) REFERENCES `brokers`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- TRANSFERS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transfers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id` BIGINT UNSIGNED NOT NULL,
  `campaign_id` INT UNSIGNED NOT NULL,
  `agent_id` INT UNSIGNED DEFAULT NULL,
  `call_log_id` BIGINT UNSIGNED DEFAULT NULL,
  `status` ENUM('initiated','ringing','accepted','rejected','timeout','completed','failed') DEFAULT 'initiated',
  `outcome` ENUM('converted','not_interested','callback','no_answer') DEFAULT NULL,
  `agent_notes` TEXT DEFAULT NULL,
  `initiated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `accepted_at` TIMESTAMP NULL,
  `completed_at` TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  KEY `idx_lead` (`lead_id`),
  KEY `idx_agent` (`agent_id`),
  KEY `idx_status` (`status`),
  CONSTRAINT `fk_transfer_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`),
  CONSTRAINT `fk_transfer_agent` FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_transfer_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- CAMPAIGN STATS (aggregated, refreshed by cron)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `campaign_stats` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `campaign_id` INT UNSIGNED NOT NULL,
  `broker_id` INT UNSIGNED NOT NULL,
  `stat_date` DATE NOT NULL,
  `stat_hour` TINYINT UNSIGNED DEFAULT NULL COMMENT 'NULL = daily aggregate',
  `total_calls` INT UNSIGNED DEFAULT 0,
  `human_detected` INT UNSIGNED DEFAULT 0,
  `voicemail_detected` INT UNSIGNED DEFAULT 0,
  `no_answer` INT UNSIGNED DEFAULT 0,
  `not_interested` INT UNSIGNED DEFAULT 0,
  `curious` INT UNSIGNED DEFAULT 0,
  `activation_requested` INT UNSIGNED DEFAULT 0,
  `transferred` INT UNSIGNED DEFAULT 0,
  `converted` INT UNSIGNED DEFAULT 0,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stat` (`campaign_id`,`broker_id`,`stat_date`,`stat_hour`),
  KEY `idx_campaign` (`campaign_id`),
  KEY `idx_broker` (`broker_id`),
  KEY `idx_date` (`stat_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- CRM EVENT LOGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `crm_event_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id` BIGINT UNSIGNED NOT NULL,
  `broker_id` INT UNSIGNED NOT NULL,
  `event_type` VARCHAR(60) NOT NULL,
  `payload` JSON NOT NULL,
  `response_code` SMALLINT UNSIGNED DEFAULT NULL,
  `response_body` TEXT DEFAULT NULL,
  `status` ENUM('pending','sent','failed','retry') DEFAULT 'pending',
  `attempt_count` TINYINT UNSIGNED DEFAULT 0,
  `next_retry_at` TIMESTAMP NULL,
  `sent_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lead` (`lead_id`),
  KEY `idx_broker` (`broker_id`),
  KEY `idx_status` (`status`),
  KEY `idx_retry` (`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- RETRY QUEUE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `retry_queue` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id` BIGINT UNSIGNED NOT NULL,
  `campaign_id` INT UNSIGNED NOT NULL,
  `script_version` CHAR(1) DEFAULT 'A',
  `reason` VARCHAR(100) DEFAULT NULL,
  `scheduled_at` TIMESTAMP NOT NULL,
  `processed` TINYINT(1) DEFAULT 0,
  `processed_at` TIMESTAMP NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lead` (`lead_id`),
  KEY `idx_campaign` (`campaign_id`),
  KEY `idx_scheduled` (`scheduled_at`),
  KEY `idx_processed` (`processed`),
  CONSTRAINT `fk_retry_lead` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_retry_campaign` FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ------------------------------------------------------------
-- AUDIT LOGS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` INT UNSIGNED DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(60) DEFAULT NULL,
  `entity_id` VARCHAR(30) DEFAULT NULL,
  `old_value` JSON DEFAULT NULL,
  `new_value` JSON DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user` (`user_id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_action` (`action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
