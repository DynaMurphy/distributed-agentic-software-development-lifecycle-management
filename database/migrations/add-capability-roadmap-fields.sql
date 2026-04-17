-- =============================================================================
-- Migration: Add Roadmap fields to capabilities table
-- Makes capabilities first-class plannable items on the roadmap timeline/kanban
-- =============================================================================

-- Add roadmap fields to the capabilities table
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS planned_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS planned_end TIMESTAMP WITH TIME ZONE;
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS roadmap_horizon VARCHAR(20)
    CHECK (roadmap_horizon IS NULL OR roadmap_horizon IN ('now', 'next', 'later'));
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'medium'
    CHECK (priority IS NULL OR priority IN ('critical', 'high', 'medium', 'low'));

-- Update the current_capabilities view to include the new columns
-- Must DROP first because column order changes
DROP VIEW IF EXISTS current_capabilities CASCADE;
CREATE VIEW current_capabilities AS
SELECT id, version_id, name, description, sdlc_phase, sort_order, status,
       planned_start, planned_end, roadmap_horizon, priority,
       maintained_by, valid_from, valid_to
FROM capabilities
WHERE transaction_to = 'infinity';
