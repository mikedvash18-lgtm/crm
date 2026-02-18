-- 011_detectors.sql
-- Separate detectors from scripts into their own entity

CREATE TABLE IF NOT EXISTS `detectors` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `language_code` CHAR(5) DEFAULT 'en',
  `content` TEXT NOT NULL,
  `created_by` INT UNSIGNED DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_detectors_user` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE campaigns ADD COLUMN `detector_id` INT UNSIGNED DEFAULT NULL AFTER `script_c_id`;
