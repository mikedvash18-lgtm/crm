<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Application;
use App\Core\Database;

class CampaignActivityLogger
{
    public static function log(
        int $campaignId,
        string $eventType,
        string $message,
        ?int $leadId = null,
        ?int $userId = null,
        ?array $details = null,
    ): void {
        try {
            $db = Application::getInstance()->container->make(Database::class);
            $db->insert('campaign_activity_log', [
                'campaign_id' => $campaignId,
                'event_type'  => $eventType,
                'message'     => $message,
                'lead_id'     => $leadId,
                'user_id'     => $userId,
                'details'     => $details ? json_encode($details) : null,
            ]);
        } catch (\Throwable $e) {
            error_log("CampaignActivityLogger error: " . $e->getMessage());
        }
    }
}
