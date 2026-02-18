ALTER TABLE campaign_stats ADD COLUMN early_hangup INT UNSIGNED DEFAULT 0 AFTER no_answer;
