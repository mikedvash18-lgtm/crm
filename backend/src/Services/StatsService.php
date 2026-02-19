<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Database;

class StatsService
{
    public function __construct(private Database $db) {}

    public function getCampaignStats(int $campaignId, string $from = null, string $to = null): array
    {
        $from = $from ?? date('Y-m-d', strtotime('-30 days'));
        $to   = $to   ?? date('Y-m-d');

        $daily = $this->db->fetchAll(
            "SELECT stat_date,
                    SUM(total_calls) as total_calls,
                    SUM(human_detected) as human_detected,
                    SUM(voicemail_detected) as voicemail_detected,
                    SUM(no_answer) as no_answer,
                    SUM(not_interested) as not_interested,
                    SUM(curious) as curious,
                    SUM(activation_requested) as activation_requested,
                    SUM(transferred) as transferred,
                    SUM(converted) as converted,
                    SUM(appointment_booked) as appointment_booked
             FROM campaign_stats
             WHERE campaign_id = ? AND stat_date BETWEEN ? AND ?
             GROUP BY stat_date
             ORDER BY stat_date ASC",
            [$campaignId, $from, $to]
        );

        $hourly = $this->db->fetchAll(
            "SELECT stat_date, stat_hour, SUM(total_calls) as calls
             FROM campaign_stats
             WHERE campaign_id = ? AND stat_date = CURDATE() AND stat_hour IS NOT NULL
             GROUP BY stat_date, stat_hour",
            [$campaignId]
        );

        $totals = $this->db->fetch(
            "SELECT
                SUM(total_calls) as total_calls,
                SUM(human_detected) as human_detected,
                SUM(voicemail_detected) as voicemail_detected,
                SUM(no_answer) as no_answer,
                SUM(early_hangup) as early_hangup,
                SUM(not_interested) as not_interested,
                SUM(curious) as curious,
                SUM(activation_requested) as activation_requested,
                SUM(transferred) as transferred,
                SUM(converted) as converted,
                SUM(appointment_booked) as appointment_booked,
                ROUND(SUM(human_detected)/NULLIF(SUM(total_calls),0)*100,2) as human_rate,
                ROUND(SUM(transferred)/NULLIF(SUM(human_detected),0)*100,2) as transfer_rate,
                ROUND(SUM(converted)/NULLIF(SUM(transferred),0)*100,2) as conversion_rate
             FROM campaign_stats
             WHERE campaign_id = ? AND stat_date BETWEEN ? AND ?",
            [$campaignId, $from, $to]
        );

        // No-answer breakdown by attempt number
        $noAnswerByAttempt = $this->db->fetchAll(
            "SELECT attempt_number, COUNT(*) as cnt
             FROM lead_attempts
             WHERE campaign_id = ? AND outcome = 'no_answer'
               AND started_at BETWEEN ? AND CONCAT(?, ' 23:59:59')
             GROUP BY attempt_number
             ORDER BY attempt_number",
            [$campaignId, $from, $to . ' 23:59:59']
        );
        $noAnswerBreakdown = [];
        foreach ($noAnswerByAttempt as $row) {
            $noAnswerBreakdown[(int)$row['attempt_number']] = (int)$row['cnt'];
        }

        return ['totals' => $totals, 'daily' => $daily, 'hourly' => $hourly, 'no_answer_by_attempt' => $noAnswerBreakdown];
    }

    public function getDashboard(): array
    {
        $activeCampaigns = $this->db->fetch(
            "SELECT COUNT(*) as cnt FROM campaigns WHERE status = 'active'"
        )['cnt'];

        $todayStats = $this->db->fetch(
            "SELECT
                SUM(total_calls) as total_calls,
                SUM(human_detected) as human_detected,
                SUM(transferred) as transferred,
                SUM(converted) as converted,
                SUM(appointment_booked) as appointment_booked
             FROM campaign_stats
             WHERE stat_date = CURDATE()"
        );

        $agentStats = $this->db->fetchAll(
            "SELECT status, COUNT(*) as cnt FROM agents GROUP BY status"
        );

        $recentActivity = $this->db->fetchAll(
            "SELECT l.first_name, l.last_name, l.status, c.name as campaign, l.updated_at
             FROM leads l JOIN campaigns c ON c.id = l.campaign_id
             WHERE l.updated_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)
             ORDER BY l.updated_at DESC LIMIT 20"
        );

        return [
            'active_campaigns' => (int)$activeCampaigns,
            'today'            => $todayStats,
            'agents'           => $agentStats,
            'recent_activity'  => $recentActivity,
        ];
    }

    public function getBrokerStats(int $brokerId, string $from = null, string $to = null): array
    {
        $from = $from ?? date('Y-m-d', strtotime('-30 days'));
        $to   = $to   ?? date('Y-m-d');

        return $this->db->fetchAll(
            "SELECT cs.stat_date,
                    c.name as campaign_name,
                    SUM(cs.total_calls) as total_calls,
                    SUM(cs.converted) as converted,
                    ROUND(SUM(cs.converted)/NULLIF(SUM(cs.total_calls),0)*100,2) as conversion_rate
             FROM campaign_stats cs
             JOIN campaigns c ON c.id = cs.campaign_id
             WHERE cs.broker_id = ? AND cs.stat_date BETWEEN ? AND ?
             GROUP BY cs.stat_date, cs.campaign_id, c.name
             ORDER BY cs.stat_date DESC",
            [$brokerId, $from, $to]
        );
    }
}
