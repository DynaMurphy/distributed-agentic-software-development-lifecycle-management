-- =============================================================================
-- Migration: Add Roadmap Timeline & Visualization fields to features table
-- Adds planned_start, planned_end, roadmap_horizon columns for timeline/kanban views
-- =============================================================================

-- Add roadmap fields to the features table
ALTER TABLE features ADD COLUMN IF NOT EXISTS planned_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE features ADD COLUMN IF NOT EXISTS planned_end TIMESTAMP WITH TIME ZONE;
ALTER TABLE features ADD COLUMN IF NOT EXISTS roadmap_horizon VARCHAR(20)
    CHECK (roadmap_horizon IS NULL OR roadmap_horizon IN ('now', 'next', 'later'));

-- Update the current_features view to include the new columns
CREATE OR REPLACE VIEW current_features AS
SELECT id, version_id, title, description, feature_type, parent_id, status, priority,
       effort_estimate, created_by, assigned_to, tags, ai_metadata, maintained_by,
       repository_id, planned_start, planned_end, roadmap_horizon,
       valid_from, valid_to
FROM features
WHERE transaction_to = 'infinity';

-- Update insert_feature_version to accept new fields
CREATE OR REPLACE FUNCTION insert_feature_version(
    p_id UUID,
    p_title VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_feature_type VARCHAR(20) DEFAULT 'feature',
    p_parent_id UUID DEFAULT NULL,
    p_status VARCHAR(30) DEFAULT 'draft',
    p_priority VARCHAR(10) DEFAULT 'medium',
    p_effort_estimate VARCHAR(50) DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_tags JSONB DEFAULT '[]'::jsonb,
    p_ai_metadata JSONB DEFAULT '{}'::jsonb,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL,
    p_repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    p_planned_start TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_planned_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_roadmap_horizon VARCHAR(20) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO features (
        id, title, description, feature_type, parent_id, status, priority,
        effort_estimate, created_by, assigned_to, tags, ai_metadata, maintained_by,
        repository_id, planned_start, planned_end, roadmap_horizon,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_title, p_description, p_feature_type, p_parent_id, p_status, p_priority,
        p_effort_estimate, p_created_by, p_assigned_to, p_tags, p_ai_metadata, p_maintained_by,
        p_repository_id, p_planned_start, p_planned_end, p_roadmap_horizon,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- Update update_feature_version to handle new fields
CREATE OR REPLACE FUNCTION update_feature_version(
    p_id UUID,
    p_title VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_feature_type VARCHAR(20) DEFAULT NULL,
    p_parent_id UUID DEFAULT NULL,
    p_status VARCHAR(30) DEFAULT NULL,
    p_priority VARCHAR(10) DEFAULT NULL,
    p_effort_estimate VARCHAR(50) DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_tags JSONB DEFAULT NULL,
    p_ai_metadata JSONB DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL,
    p_repository_id UUID DEFAULT NULL,
    p_planned_start TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_planned_end TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    p_roadmap_horizon VARCHAR(20) DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    -- Current values
    c_title VARCHAR(255);
    c_description TEXT;
    c_feature_type VARCHAR(20);
    c_parent_id UUID;
    c_status VARCHAR(30);
    c_priority VARCHAR(10);
    c_effort_estimate VARCHAR(50);
    c_created_by UUID;
    c_assigned_to UUID;
    c_tags JSONB;
    c_ai_metadata JSONB;
    c_maintained_by UUID;
    c_repository_id UUID;
    c_planned_start TIMESTAMP WITH TIME ZONE;
    c_planned_end TIMESTAMP WITH TIME ZONE;
    c_roadmap_horizon VARCHAR(20);
BEGIN
    update_timestamp := p_valid_from;

    SELECT version_id INTO current_version_id
    FROM current_features WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        SELECT insert_feature_version(
            p_id, COALESCE(p_title, 'Untitled Feature'), p_description,
            COALESCE(p_feature_type, 'feature'), p_parent_id,
            COALESCE(p_status, 'draft'), COALESCE(p_priority, 'medium'),
            p_effort_estimate, NULL, p_assigned_to, COALESCE(p_tags, '[]'::jsonb),
            COALESCE(p_ai_metadata, '{}'::jsonb), update_timestamp, p_maintained_by,
            COALESCE(p_repository_id, '00000000-0000-0000-0000-000000000001'::uuid),
            p_planned_start, p_planned_end, p_roadmap_horizon
        ) INTO new_version_id;
        RETURN new_version_id;
    END IF;

    -- Get current values to preserve fields not being updated
    SELECT f.title, f.description, f.feature_type, f.parent_id, f.status, f.priority,
           f.effort_estimate, f.created_by, f.assigned_to, f.tags, f.ai_metadata, f.maintained_by,
           f.repository_id, f.planned_start, f.planned_end, f.roadmap_horizon
    INTO c_title, c_description, c_feature_type, c_parent_id, c_status, c_priority,
         c_effort_estimate, c_created_by, c_assigned_to, c_tags, c_ai_metadata, c_maintained_by,
         c_repository_id, c_planned_start, c_planned_end, c_roadmap_horizon
    FROM features f WHERE f.version_id = current_version_id;

    -- Close old version
    UPDATE features
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    -- Insert new version with merged values
    INSERT INTO features (
        id, title, description, feature_type, parent_id, status, priority,
        effort_estimate, created_by, assigned_to, tags, ai_metadata, maintained_by,
        repository_id, planned_start, planned_end, roadmap_horizon,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        COALESCE(p_title, c_title),
        COALESCE(p_description, c_description),
        COALESCE(p_feature_type, c_feature_type),
        COALESCE(p_parent_id, c_parent_id),
        COALESCE(p_status, c_status),
        COALESCE(p_priority, c_priority),
        COALESCE(p_effort_estimate, c_effort_estimate),
        c_created_by,
        COALESCE(p_assigned_to, c_assigned_to),
        COALESCE(p_tags, c_tags),
        COALESCE(p_ai_metadata, c_ai_metadata),
        COALESCE(p_maintained_by, c_maintained_by),
        COALESCE(p_repository_id, c_repository_id),
        COALESCE(p_planned_start, c_planned_start),
        COALESCE(p_planned_end, c_planned_end),
        COALESCE(p_roadmap_horizon, c_roadmap_horizon),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;
