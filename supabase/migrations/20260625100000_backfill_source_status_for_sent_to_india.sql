-- Phase 1 backfill: inquiries sent to India via GmailLikeComposer never had
-- source_status or last_sourcing_sent_at set (the code only wrote sent_to_india*
-- fields). This aligns them with the SourcingOutbox follow-up workflow.
UPDATE crm_inquiries
SET
  source_status        = 'sent',
  last_sourcing_sent_at = sent_to_india_at,
  updated_at           = NOW()
WHERE
  sent_to_india   = true
  AND source_status = 'not_sent'
  AND sent_to_india_at IS NOT NULL;
