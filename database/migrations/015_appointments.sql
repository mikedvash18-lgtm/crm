-- Add appointment_booked to leads.status ENUM
ALTER TABLE leads MODIFY COLUMN `status` ENUM(
    'new','queued','called','human','voicemail',
    'not_interested','curious','activation_requested',
    'transferred','converted','closed','archived',
    'do_not_call','wrong_number','no_engagement',
    'appointment_booked'
) DEFAULT 'new';

-- Add appointment_booked column to campaign_stats
ALTER TABLE campaign_stats ADD COLUMN `appointment_booked` INT UNSIGNED DEFAULT 0 AFTER `converted`;

-- Create appointments table
CREATE TABLE IF NOT EXISTS `appointments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lead_id` BIGINT UNSIGNED NOT NULL,
  `campaign_id` INT UNSIGNED NOT NULL,
  `appointment_date` DATETIME NOT NULL,
  `notes` TEXT DEFAULT NULL,
  `status` ENUM('pending','completed','cancelled') DEFAULT 'pending',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_lead` (`lead_id`),
  KEY `idx_campaign` (`campaign_id`),
  KEY `idx_date` (`appointment_date`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
