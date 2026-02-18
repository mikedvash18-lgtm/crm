ALTER TABLE `brokers`
  ADD COLUMN `agent_phone` VARCHAR(30) DEFAULT NULL AFTER `code`;
