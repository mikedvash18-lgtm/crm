CREATE TABLE IF NOT EXISTS campaign_activity_log (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    campaign_id INT UNSIGNED NOT NULL,
    event_type  VARCHAR(50) NOT NULL,
    lead_id     INT UNSIGNED NULL,
    user_id     INT UNSIGNED NULL,
    message     VARCHAR(500) NOT NULL DEFAULT '',
    details     JSON NULL,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_campaign_created (campaign_id, created_at),
    INDEX idx_campaign_event   (campaign_id, event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
