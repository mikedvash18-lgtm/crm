-- ============================================================
-- 004 · Lead Pool, Campaign Pool Filters & Attempt AI Data
-- ============================================================

-- Central lead pool (bulk uploads go here)
CREATE TABLE IF NOT EXISTS lead_pool (
  id                      BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone                   VARCHAR(30) NOT NULL,
  phone_normalized        VARCHAR(30) NOT NULL,
  first_name              VARCHAR(100) DEFAULT NULL,
  last_name               VARCHAR(100) DEFAULT NULL,
  email                   VARCHAR(150) DEFAULT NULL,
  country_id              SMALLINT UNSIGNED NOT NULL,
  source                  VARCHAR(200) DEFAULT NULL,
  status                  ENUM('available','claimed') DEFAULT 'available',
  claimed_by_campaign_id  INT UNSIGNED DEFAULT NULL,
  claimed_at              TIMESTAMP NULL DEFAULT NULL,
  uploaded_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_phone (phone_normalized),
  KEY idx_available (status, country_id, source, uploaded_at),
  FOREIGN KEY (country_id) REFERENCES countries(id),
  FOREIGN KEY (claimed_by_campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Campaign pool filter columns (safe: skip if already exists)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'pool_source_filter');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE campaigns ADD COLUMN pool_source_filter VARCHAR(200) DEFAULT NULL AFTER voximplant_app_id, ADD COLUMN pool_date_from DATE DEFAULT NULL AFTER pool_source_filter, ADD COLUMN pool_date_to DATE DEFAULT NULL AFTER pool_date_from', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Link leads back to pool for traceability + release
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leads' AND COLUMN_NAME = 'lead_pool_id');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE leads ADD COLUMN lead_pool_id BIGINT UNSIGNED DEFAULT NULL AFTER id, ADD KEY idx_pool_id (lead_pool_id)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Attempt-level AI data (so each attempt has its own classification/transcript)
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_attempts' AND COLUMN_NAME = 'ai_classification');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE lead_attempts ADD COLUMN ai_classification VARCHAR(50) DEFAULT NULL AFTER outcome, ADD COLUMN ai_confidence DECIMAL(5,4) DEFAULT NULL AFTER ai_classification, ADD COLUMN transcript TEXT DEFAULT NULL AFTER ai_confidence, ADD COLUMN ai_summary TEXT DEFAULT NULL AFTER transcript', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
