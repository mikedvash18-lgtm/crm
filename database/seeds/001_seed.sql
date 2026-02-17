-- ============================================================
-- SEED DATA
-- ============================================================

-- Roles
INSERT INTO `roles` (`name`, `slug`, `permissions`) VALUES
('Super Admin', 'super_admin', '["*"]'),
('Admin', 'admin', '["campaigns.*","leads.*","agents.*","stats.*","brokers.*"]'),
('Campaign Manager', 'campaign_manager', '["campaigns.*","leads.*","stats.read"]'),
('Agent', 'agent', '["agent.panel","transfers.handle"]');

-- Countries (sample)
INSERT INTO `countries` (`code`, `name`, `phone_prefix`, `language_code`, `timezone`) VALUES
('US', 'United States', '+1', 'en', 'America/New_York'),
('GB', 'United Kingdom', '+44', 'en', 'Europe/London'),
('DE', 'Germany', '+49', 'de', 'Europe/Berlin'),
('FR', 'France', '+33', 'fr', 'Europe/Paris'),
('ES', 'Spain', '+34', 'es', 'Europe/Madrid'),
('IT', 'Italy', '+39', 'it', 'Europe/Rome'),
('AU', 'Australia', '+61', 'en', 'Australia/Sydney'),
('CA', 'Canada', '+1', 'en', 'America/Toronto'),
('NL', 'Netherlands', '+31', 'nl', 'Europe/Amsterdam'),
('SE', 'Sweden', '+46', 'sv', 'Europe/Stockholm');

-- Super Admin user (password: Admin@123456 - change immediately!)
INSERT INTO `users` (`role_id`, `name`, `email`, `password_hash`) VALUES
(1, 'Super Admin', 'admin@platform.com', '$2y$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi');
