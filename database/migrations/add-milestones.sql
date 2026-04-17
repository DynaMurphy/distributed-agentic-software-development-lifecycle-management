-- =============================================================================
-- Migration: Release Milestone Management
-- Phase 1 of Roadmap v1: Core CRUD + Status Lifecycle + Feature Assignment
-- =============================================================================
-- Adds milestones table with bitemporal versioning, milestone-feature
-- assignments junction table, and all supporting functions/views.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Milestones table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    version_label VARCHAR(50),
    target_date DATE,
    start_date DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'planning'
        CHECK (status IN ('planning', 'active', 'frozen', 'released', 'archived')),
    capacity_limit INTEGER,
    capacity_unit VARCHAR(20) DEFAULT 'items'
        CHECK (capacity_unit IN ('items', 'story_points')),
    tags JSONB DEFAULT '[]'::jsonb,
    ai_metadata JSONB DEFAULT '{}'::jsonb,
    maintained_by UUID REFERENCES "User"(id),
    repository_id UUID DEFAULT NULL,
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity',
    transaction_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    transaction_to TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT 'infinity'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_milestones_id_valid ON milestones (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones (status) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_milestones_target_date ON milestones (target_date) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_milestones_repo ON milestones (repository_id) WHERE transaction_to = 'infinity';

-- Current view
CREATE OR REPLACE VIEW current_milestones AS
SELECT id, version_id, title, description, version_label, target_date, start_date,
       status, capacity_limit, capacity_unit, tags, ai_metadata,
       maintained_by, repository_id, valid_from, valid_to
FROM milestones
WHERE transaction_to = 'infinity';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Insert function
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
    p_repository_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO milestones (
        id, title, description, version_label, target_date, start_date,
        status, capacity_limit, capacity_unit, tags, ai_metadata,
        maintained_by, repository_id,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_title, p_description, p_version_label, p_target_date, p_start_date,
        p_status, p_capacity_limit, p_capacity_unit, p_tags, p_ai_metadata,
        p_maintained_by, p_repository_id,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Update function (merge-on-null pattern)
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
    p_maintained_by UUID DEFAULT NULL
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
            update_timestamp, p_maintained_by, NULL
        ) INTO new_version_id;
        RETURN new_version_id;
    END IF;

    SELECT m.title, m.description, m.version_label, m.target_date, m.start_date,
           m.status, m.capacity_limit, m.capacity_unit, m.tags, m.ai_metadata,
           m.maintained_by, m.repository_id
    INTO c_title, c_description, c_version_label, c_target_date, c_start_date,
         c_status, c_capacity_limit, c_capacity_unit, c_tags, c_ai_metadata,
         c_maintained_by, c_repository_id
    FROM milestones m WHERE m.version_id = current_version_id;

    -- Close old version
    UPDATE milestones
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    -- Insert new version with merged values
    INSERT INTO milestones (
        id, title, description, version_label, target_date, start_date,
        status, capacity_limit, capacity_unit, tags, ai_metadata,
        maintained_by, repository_id,
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
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Milestone-Item assignments (which features/bugs belong to a milestone)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestone_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    milestone_id UUID NOT NULL,
    item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('feature', 'bug')),
    item_id UUID NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    added_by UUID REFERENCES "User"(id),
    repository_id UUID DEFAULT NULL,
    UNIQUE (milestone_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_milestone_items_milestone ON milestone_items (milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_items_item ON milestone_items (item_type, item_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add milestone_id to features table for direct reference (optional fast lookup)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'features' AND column_name = 'milestone_id'
  ) THEN
    ALTER TABLE features ADD COLUMN milestone_id UUID DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_features_milestone ON features (milestone_id) WHERE transaction_to = 'infinity';
  END IF;
END $$;
