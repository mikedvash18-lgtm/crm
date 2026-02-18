ALTER TABLE campaigns
  ADD COLUMN lead_limit INT UNSIGNED DEFAULT NULL AFTER pool_date_to;
