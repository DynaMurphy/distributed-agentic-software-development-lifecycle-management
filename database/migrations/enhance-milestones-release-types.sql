-- =============================================================================
-- Migration: Enhance Milestones with Release Types
-- Adds major/minor release types, capability assignment support,
-- and release sequence ordering for structured release planning.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add release_type and release_sequence to milestones
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE milestones
  ADD COLUMN IF NOT EXISTS release_type VARCHAR(10) DEFAULT 'minor'
    CHECK (release_type IN ('major', 'minor')),
  ADD COLUMN IF NOT EXISTS release_sequence INTEGER DEFAULT 0;

COMMENT ON COLUMN milestones.release_type IS 'major = capabilities/features, minor = features/bugfixes';
COMMENT ON COLUMN milestones.release_sequence IS 'Ordering within a year (e.g. 1..12 for chronological)';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Extend milestone_items to support capabilities
-- ─────────────────────────────────────────────────────────────────────────────
-- Drop the old constraint
ALTER TABLE milestone_items
  DROP CONSTRAINT IF EXISTS milestone_items_item_type_check;

-- Add updated constraint allowing 'capability'
ALTER TABLE milestone_items
  ADD CONSTRAINT milestone_items_item_type_check
    CHECK (item_type IN ('feature', 'bug', 'capability'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update the current_milestones view to include new columns
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS current_milestones CASCADE;
CREATE VIEW current_milestones AS
SELECT id, version_id, title, description, version_label, target_date, start_date,
       status, capacity_limit, capacity_unit, tags, ai_metadata,
       maintained_by, repository_id, release_type, release_sequence,
       valid_from, valid_to
FROM milestones
WHERE transaction_to = 'infinity';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update insert function to accept release_type + release_sequence
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION insert_milestone_version(
    p_id UUID,
    p_title VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_version_label VARCHAR(50) DEFAULT NULL,
    p_target_date DATE DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT 'planning',
    p_capacity_limit INTEGER DEFAULT NULL,
    p_capacity_unit VARCHAR(20) DEFAULT 'items',
    p_tags JSONB DEFAULT '[]'::jsonb,
    p_ai_metadata JSONB DEFAULT '{}'::jsonb,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL,
    p_repository_id UUID DEFAULT NULL,
    p_release_type VARCHAR(10) DEFAULT 'minor',
    p_release_sequence INTEGER DEFAULT 0
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO milestones (
        id, title, description, version_label, target_date, start_date,
        status, capacity_limit, capacity_unit, tags, ai_metadata,
        maintained_by, repository_id, release_type, release_sequence,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_title, p_description, p_version_label, p_target_date, p_start_date,
        p_status, p_capacity_limit, p_capacity_unit, p_tags, p_ai_metadata,
        p_maintained_by, p_repository_id, p_release_type, p_release_sequence,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Update update function to accept release_type + release_sequence
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_milestone_version(
    p_id UUID,
    p_title VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_version_label VARCHAR(50) DEFAULT NULL,
    p_target_date DATE DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL,
    p_capacity_limit INTEGER DEFAULT NULL,
    p_capacity_unit VARCHAR(20) DEFAULT NULL,
    p_tags JSONB DEFAULT NULL,
    p_ai_metadata JSONB DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL,
    p_release_type VARCHAR(10) DEFAULT NULL,
    p_release_sequence INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    c_title VARCHAR(255);
    c_description TEXT;
    c_version_label VARCHAR(50);
    c_target_date DATE;
    c_start_date DATE;
    c_status VARCHAR(20);
    c_capacity_limit INTEGER;
    c_capacity_unit VARCHAR(20);
    c_tags JSONB;
    c_ai_metadata JSONB;
    c_maintained_by UUID;
    c_repository_id UUID;
    c_release_type VARCHAR(10);
    c_release_sequence INTEGER;
BEGIN
    update_timestamp := p_valid_from;

    SELECT version_id INTO current_version_id
    FROM current_milestones WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        SELECT insert_milestone_version(
            p_id, COALESCE(p_title, 'Untitled Milestone'), p_description,
            p_version_label, p_target_date, p_start_date,
            COALESCE(p_status, 'planning'), p_capacity_limit,
            COALESCE(p_capacity_unit, 'items'),
            COALESCE(p_tags, '[]'::jsonb), COALESCE(p_ai_metadata, '{}'::jsonb),
            update_timestamp, p_maintained_by, NULL,
            COALESCE(p_release_type, 'minor'), COALESCE(p_release_sequence, 0)
        ) INTO new_version_id;
        RETURN new_version_id;
    END IF;

    SELECT m.title, m.description, m.version_label, m.target_date, m.start_date,
           m.status, m.capacity_limit, m.capacity_unit, m.tags, m.ai_metadata,
           m.maintained_by, m.repository_id, m.release_type, m.release_sequence
    INTO c_title, c_description, c_version_label, c_target_date, c_start_date,
         c_status, c_capacity_limit, c_capacity_unit, c_tags, c_ai_metadata,
         c_maintained_by, c_repository_id, c_release_type, c_release_sequence
    FROM milestones m WHERE m.version_id = current_version_id;

    -- Close old version
    UPDATE milestones
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    -- Insert new version with merged values
    INSERT INTO milestones (
        id, title, description, version_label, target_date, start_date,
        status, capacity_limit, capacity_unit, tags, ai_metadata,
        maintained_by, repository_id, release_type, release_sequence,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        COALESCE(p_title, c_title),
        COALESCE(p_description, c_description),
        COALESCE(p_version_label, c_version_label),
        COALESCE(p_target_date, c_target_date),
        COALESCE(p_start_date, c_start_date),
        COALESCE(p_status, c_status),
        COALESCE(p_capacity_limit, c_capacity_limit),
        COALESCE(p_capacity_unit, c_capacity_unit),
        COALESCE(p_tags, c_tags),
        COALESCE(p_ai_metadata, c_ai_metadata),
        COALESCE(p_maintained_by, c_maintained_by),
        c_repository_id,
        COALESCE(p_release_type, c_release_type),
        COALESCE(p_release_sequence, c_release_sequence),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;
