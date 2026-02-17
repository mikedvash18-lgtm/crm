-- Broker Routes: Voximplant credentials per broker+country pair
CREATE TABLE IF NOT EXISTS broker_routes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    broker_id       INT UNSIGNED NOT NULL,
    country_id      SMALLINT UNSIGNED NOT NULL,
    voximplant_account_id VARCHAR(255) NOT NULL,
    voximplant_api_key    VARCHAR(255) NOT NULL,
    voximplant_rule_name  VARCHAR(255) NOT NULL,
    caller_id       VARCHAR(50)  DEFAULT NULL,
    is_active       TINYINT(1)   NOT NULL DEFAULT 1,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_broker_country (broker_id, country_id),
    FOREIGN KEY (broker_id)  REFERENCES brokers(id)   ON DELETE CASCADE,
    FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Active Calls: tracks in-flight calls for concurrency limiting
CREATE TABLE IF NOT EXISTS active_calls (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    lead_id         BIGINT UNSIGNED NOT NULL,
    campaign_id     INT UNSIGNED NOT NULL,
    voximplant_call_id VARCHAR(255) DEFAULT NULL,
    started_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_lead (lead_id),
    FOREIGN KEY (lead_id)     REFERENCES leads(id)     ON DELETE CASCADE,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
