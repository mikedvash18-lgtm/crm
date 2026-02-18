-- ============================================================
-- 006 · Add registration_date column to lead_pool
-- ============================================================

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lead_pool' AND COLUMN_NAME = 'registration_date');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE lead_pool ADD COLUMN registration_date DATETIME DEFAULT NULL AFTER funnel', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
