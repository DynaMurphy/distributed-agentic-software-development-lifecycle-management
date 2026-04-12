-- =============================================================================
-- SPLM (Software Product Lifecycle Management) Bitemporal Schema
-- =============================================================================
-- Extends the existing bitemporal document system with Feature, Bug, Task,
-- Backlog, and Item-Document linking tables.
-- All tables use the PostgreSQL `periods` extension for full bitemporal support
-- (valid time + system/transaction time).
-- =============================================================================

-- Ensure the periods extension is available
CREATE EXTENSION IF NOT EXISTS periods;

-- =============================================================================
-- 1. FEATURES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS features (
    id UUID NOT NULL,                                           -- Business key (not unique alone)
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),      -- Surrogate key per version
    title VARCHAR(255) NOT NULL,
    description TEXT,                                           -- Rich text / markdown description
    feature_type VARCHAR(20) NOT NULL DEFAULT 'feature'         -- 'feature' | 'sub_feature'
        CHECK (feature_type IN ('feature', 'sub_feature')),
    parent_id UUID,                                             -- Self-ref for sub-features (NULL for top-level)
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'triage', 'backlog', 'spec_generation', 'implementation', 'testing', 'done', 'rejected')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    effort_estimate VARCHAR(50),                                -- e.g. 'S', 'M', 'L', 'XL' or story points
    created_by UUID,                                            -- FK to User.id (not enforced across systems)
    assigned_to UUID,                                           -- FK to User.id
    tags JSONB DEFAULT '[]'::jsonb,                             -- Array of tag strings
    ai_metadata JSONB DEFAULT '{}'::jsonb,                      -- AI triage notes, duplicate candidates, impact analysis
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

-- Add bitemporal periods
SELECT periods.add_period('features', 'validity', 'valid_from', 'valid_to');
SELECT periods.add_system_time_period('features', 'transaction_from', 'transaction_to');
SELECT periods.add_unique_key('features', ARRAY['id'], 'validity');

-- Current features view
CREATE OR REPLACE VIEW current_features AS
SELECT id, version_id, title, description, feature_type, parent_id, status, priority,
       effort_estimate, created_by, assigned_to, tags, ai_metadata, maintained_by, valid_from, valid_to
FROM features
WHERE transaction_to = 'infinity';

-- Insert function
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
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO features (
        id, title, description, feature_type, parent_id, status, priority,
        effort_estimate, created_by, assigned_to, tags, ai_metadata, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_title, p_description, p_feature_type, p_parent_id, p_status, p_priority,
        p_effort_estimate, p_created_by, p_assigned_to, p_tags, p_ai_metadata, p_maintained_by,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- Update function
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
    p_maintained_by UUID DEFAULT NULL
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
            COALESCE(p_ai_metadata, '{}'::jsonb), update_timestamp, p_maintained_by
        ) INTO new_version_id;
        RETURN new_version_id;
    END IF;

    -- Get current values to preserve fields not being updated
    SELECT f.title, f.description, f.feature_type, f.parent_id, f.status, f.priority,
           f.effort_estimate, f.created_by, f.assigned_to, f.tags, f.ai_metadata, f.maintained_by
    INTO c_title, c_description, c_feature_type, c_parent_id, c_status, c_priority,
         c_effort_estimate, c_created_by, c_assigned_to, c_tags, c_ai_metadata, c_maintained_by
    FROM features f WHERE f.version_id = current_version_id;

    -- Close old version
    UPDATE features
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    -- Insert new version with merged values
    INSERT INTO features (
        id, title, description, feature_type, parent_id, status, priority,
        effort_estimate, created_by, assigned_to, tags, ai_metadata, maintained_by,
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
        c_created_by,  -- Never change the creator
        COALESCE(p_assigned_to, c_assigned_to),
        COALESCE(p_tags, c_tags),
        COALESCE(p_ai_metadata, c_ai_metadata),
        COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 2. BUGS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS bugs (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(10) NOT NULL DEFAULT 'major'
        CHECK (severity IN ('blocker', 'critical', 'major', 'minor', 'trivial')),
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'triage', 'backlog', 'spec_generation', 'implementation', 'testing', 'done', 'rejected')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    steps_to_reproduce TEXT,
    expected_behavior TEXT,
    actual_behavior TEXT,
    environment JSONB DEFAULT '{}'::jsonb,        -- { browser, os, version, etc. }
    created_by UUID,
    assigned_to UUID,
    tags JSONB DEFAULT '[]'::jsonb,
    ai_metadata JSONB DEFAULT '{}'::jsonb,
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

SELECT periods.add_period('bugs', 'validity', 'valid_from', 'valid_to');
SELECT periods.add_system_time_period('bugs', 'transaction_from', 'transaction_to');
SELECT periods.add_unique_key('bugs', ARRAY['id'], 'validity');

CREATE OR REPLACE VIEW current_bugs AS
SELECT id, version_id, title, description, severity, status, priority,
       steps_to_reproduce, expected_behavior, actual_behavior, environment,
       created_by, assigned_to, tags, ai_metadata, maintained_by, valid_from, valid_to
FROM bugs
WHERE transaction_to = 'infinity';

CREATE OR REPLACE FUNCTION insert_bug_version(
    p_id UUID,
    p_title VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_severity VARCHAR(10) DEFAULT 'major',
    p_status VARCHAR(30) DEFAULT 'draft',
    p_priority VARCHAR(10) DEFAULT 'medium',
    p_steps_to_reproduce TEXT DEFAULT NULL,
    p_expected_behavior TEXT DEFAULT NULL,
    p_actual_behavior TEXT DEFAULT NULL,
    p_environment JSONB DEFAULT '{}'::jsonb,
    p_created_by UUID DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_tags JSONB DEFAULT '[]'::jsonb,
    p_ai_metadata JSONB DEFAULT '{}'::jsonb,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO bugs (
        id, title, description, severity, status, priority,
        steps_to_reproduce, expected_behavior, actual_behavior, environment,
        created_by, assigned_to, tags, ai_metadata, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_title, p_description, p_severity, p_status, p_priority,
        p_steps_to_reproduce, p_expected_behavior, p_actual_behavior, p_environment,
        p_created_by, p_assigned_to, p_tags, p_ai_metadata, p_maintained_by,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_bug_version(
    p_id UUID,
    p_title VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_severity VARCHAR(10) DEFAULT NULL,
    p_status VARCHAR(30) DEFAULT NULL,
    p_priority VARCHAR(10) DEFAULT NULL,
    p_steps_to_reproduce TEXT DEFAULT NULL,
    p_expected_behavior TEXT DEFAULT NULL,
    p_actual_behavior TEXT DEFAULT NULL,
    p_environment JSONB DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_tags JSONB DEFAULT NULL,
    p_ai_metadata JSONB DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    c_title VARCHAR(255); c_description TEXT; c_severity VARCHAR(10);
    c_status VARCHAR(30); c_priority VARCHAR(10);
    c_steps_to_reproduce TEXT; c_expected_behavior TEXT; c_actual_behavior TEXT;
    c_environment JSONB; c_created_by UUID; c_assigned_to UUID;
    c_tags JSONB; c_ai_metadata JSONB; c_maintained_by UUID;
BEGIN
    update_timestamp := p_valid_from;

    SELECT version_id INTO current_version_id
    FROM current_bugs WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        SELECT insert_bug_version(
            p_id, COALESCE(p_title, 'Untitled Bug'), p_description,
            COALESCE(p_severity, 'major'), COALESCE(p_status, 'draft'),
            COALESCE(p_priority, 'medium'), p_steps_to_reproduce,
            p_expected_behavior, p_actual_behavior,
            COALESCE(p_environment, '{}'::jsonb), NULL, p_assigned_to,
            COALESCE(p_tags, '[]'::jsonb), COALESCE(p_ai_metadata, '{}'::jsonb),
            update_timestamp, p_maintained_by
        ) INTO new_version_id;
        RETURN new_version_id;
    END IF;

    SELECT b.title, b.description, b.severity, b.status, b.priority,
           b.steps_to_reproduce, b.expected_behavior, b.actual_behavior,
           b.environment, b.created_by, b.assigned_to, b.tags, b.ai_metadata, b.maintained_by
    INTO c_title, c_description, c_severity, c_status, c_priority,
         c_steps_to_reproduce, c_expected_behavior, c_actual_behavior,
         c_environment, c_created_by, c_assigned_to, c_tags, c_ai_metadata, c_maintained_by
    FROM bugs b WHERE b.version_id = current_version_id;

    UPDATE bugs
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO bugs (
        id, title, description, severity, status, priority,
        steps_to_reproduce, expected_behavior, actual_behavior, environment,
        created_by, assigned_to, tags, ai_metadata, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        COALESCE(p_title, c_title),
        COALESCE(p_description, c_description),
        COALESCE(p_severity, c_severity),
        COALESCE(p_status, c_status),
        COALESCE(p_priority, c_priority),
        COALESCE(p_steps_to_reproduce, c_steps_to_reproduce),
        COALESCE(p_expected_behavior, c_expected_behavior),
        COALESCE(p_actual_behavior, c_actual_behavior),
        COALESCE(p_environment, c_environment),
        c_created_by,
        COALESCE(p_assigned_to, c_assigned_to),
        COALESCE(p_tags, c_tags),
        COALESCE(p_ai_metadata, c_ai_metadata),
        COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 3. TASKS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    parent_type VARCHAR(10) NOT NULL
        CHECK (parent_type IN ('feature', 'bug')),
    parent_id UUID NOT NULL,                                  -- FK to feature or bug business ID
    status VARCHAR(20) NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'in_progress', 'done', 'blocked')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    effort_estimate VARCHAR(50),
    assigned_to UUID,
    tags JSONB DEFAULT '[]'::jsonb,
    ai_metadata JSONB DEFAULT '{}'::jsonb,
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

SELECT periods.add_period('tasks', 'validity', 'valid_from', 'valid_to');
SELECT periods.add_system_time_period('tasks', 'transaction_from', 'transaction_to');
SELECT periods.add_unique_key('tasks', ARRAY['id'], 'validity');

CREATE OR REPLACE VIEW current_tasks AS
SELECT id, version_id, title, description, parent_type, parent_id, status, priority,
       effort_estimate, assigned_to, tags, ai_metadata, maintained_by, valid_from, valid_to
FROM tasks
WHERE transaction_to = 'infinity';

CREATE OR REPLACE FUNCTION insert_task_version(
    p_id UUID,
    p_title VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_parent_type VARCHAR(10) DEFAULT 'feature',
    p_parent_id UUID DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT 'todo',
    p_priority VARCHAR(10) DEFAULT 'medium',
    p_effort_estimate VARCHAR(50) DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_tags JSONB DEFAULT '[]'::jsonb,
    p_ai_metadata JSONB DEFAULT '{}'::jsonb,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO tasks (
        id, title, description, parent_type, parent_id, status, priority,
        effort_estimate, assigned_to, tags, ai_metadata, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_title, p_description, p_parent_type, p_parent_id, p_status, p_priority,
        p_effort_estimate, p_assigned_to, p_tags, p_ai_metadata, p_maintained_by,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_task_version(
    p_id UUID,
    p_title VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL,
    p_priority VARCHAR(10) DEFAULT NULL,
    p_effort_estimate VARCHAR(50) DEFAULT NULL,
    p_assigned_to UUID DEFAULT NULL,
    p_tags JSONB DEFAULT NULL,
    p_ai_metadata JSONB DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    c_title VARCHAR(255); c_description TEXT; c_parent_type VARCHAR(10);
    c_parent_id UUID; c_status VARCHAR(20); c_priority VARCHAR(10);
    c_effort_estimate VARCHAR(50); c_assigned_to UUID;
    c_tags JSONB; c_ai_metadata JSONB; c_maintained_by UUID;
BEGIN
    update_timestamp := p_valid_from;

    SELECT version_id INTO current_version_id
    FROM current_tasks WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Task not found: %', p_id;
    END IF;

    SELECT t.title, t.description, t.parent_type, t.parent_id, t.status, t.priority,
           t.effort_estimate, t.assigned_to, t.tags, t.ai_metadata, t.maintained_by
    INTO c_title, c_description, c_parent_type, c_parent_id, c_status, c_priority,
         c_effort_estimate, c_assigned_to, c_tags, c_ai_metadata, c_maintained_by
    FROM tasks t WHERE t.version_id = current_version_id;

    UPDATE tasks
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO tasks (
        id, title, description, parent_type, parent_id, status, priority,
        effort_estimate, assigned_to, tags, ai_metadata, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        COALESCE(p_title, c_title),
        COALESCE(p_description, c_description),
        c_parent_type,   -- Never change parent type
        c_parent_id,     -- Never change parent
        COALESCE(p_status, c_status),
        COALESCE(p_priority, c_priority),
        COALESCE(p_effort_estimate, c_effort_estimate),
        COALESCE(p_assigned_to, c_assigned_to),
        COALESCE(p_tags, c_tags),
        COALESCE(p_ai_metadata, c_ai_metadata),
        COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 4. BACKLOG ITEMS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS backlog_items (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type VARCHAR(10) NOT NULL
        CHECK (item_type IN ('feature', 'bug')),
    item_id UUID NOT NULL,                                    -- FK to feature or bug business ID
    rank INTEGER NOT NULL DEFAULT 0,                          -- Lower = higher priority in backlog
    sprint_label VARCHAR(100),                                -- Optional sprint/iteration label
    notes TEXT,                                                -- PM notes
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

SELECT periods.add_period('backlog_items', 'validity', 'valid_from', 'valid_to');
SELECT periods.add_system_time_period('backlog_items', 'transaction_from', 'transaction_to');
SELECT periods.add_unique_key('backlog_items', ARRAY['id'], 'validity');

CREATE OR REPLACE VIEW current_backlog_items AS
SELECT id, version_id, item_type, item_id, rank, sprint_label, notes, maintained_by, valid_from, valid_to
FROM backlog_items
WHERE transaction_to = 'infinity';

CREATE OR REPLACE FUNCTION insert_backlog_item_version(
    p_id UUID,
    p_item_type VARCHAR(10),
    p_item_id UUID,
    p_rank INTEGER DEFAULT 0,
    p_sprint_label VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO backlog_items (
        id, item_type, item_id, rank, sprint_label, notes, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_item_type, p_item_id, p_rank, p_sprint_label, p_notes, p_maintained_by,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_backlog_item_version(
    p_id UUID,
    p_rank INTEGER DEFAULT NULL,
    p_sprint_label VARCHAR(100) DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    c_item_type VARCHAR(10); c_item_id UUID; c_rank INTEGER;
    c_sprint_label VARCHAR(100); c_notes TEXT; c_maintained_by UUID;
BEGIN
    update_timestamp := p_valid_from;

    SELECT version_id INTO current_version_id
    FROM current_backlog_items WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Backlog item not found: %', p_id;
    END IF;

    SELECT bi.item_type, bi.item_id, bi.rank, bi.sprint_label, bi.notes, bi.maintained_by
    INTO c_item_type, c_item_id, c_rank, c_sprint_label, c_notes, c_maintained_by
    FROM backlog_items bi WHERE bi.version_id = current_version_id;

    UPDATE backlog_items
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO backlog_items (
        id, item_type, item_id, rank, sprint_label, notes, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        c_item_type,    -- Never change type
        c_item_id,      -- Never change referenced item
        COALESCE(p_rank, c_rank),
        COALESCE(p_sprint_label, c_sprint_label),
        COALESCE(p_notes, c_notes),
        COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 5. ITEM-DOCUMENT LINKS TABLE (many-to-many, bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS item_document_links (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type VARCHAR(10) NOT NULL
        CHECK (item_type IN ('feature', 'bug', 'task')),
    item_id UUID NOT NULL,                                    -- FK to feature, bug, or task business ID
    document_id UUID NOT NULL,                                -- FK to documents.id (bitemporal spec docs)
    link_type VARCHAR(20) NOT NULL DEFAULT 'specification'
        CHECK (link_type IN ('specification', 'test_plan', 'design', 'reference')),
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

SELECT periods.add_period('item_document_links', 'validity', 'valid_from', 'valid_to');
SELECT periods.add_system_time_period('item_document_links', 'transaction_from', 'transaction_to');
SELECT periods.add_unique_key('item_document_links', ARRAY['id'], 'validity');

CREATE OR REPLACE VIEW current_item_document_links AS
SELECT id, version_id, item_type, item_id, document_id, link_type, maintained_by, valid_from, valid_to
FROM item_document_links
WHERE transaction_to = 'infinity';

CREATE OR REPLACE FUNCTION insert_item_document_link_version(
    p_id UUID,
    p_item_type VARCHAR(10),
    p_item_id UUID,
    p_document_id UUID,
    p_link_type VARCHAR(20) DEFAULT 'specification',
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO item_document_links (
        id, item_type, item_id, document_id, link_type, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_item_type, p_item_id, p_document_id, p_link_type, p_maintained_by,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- "Delete" a link by closing its validity period
CREATE OR REPLACE FUNCTION delete_item_document_link(
    p_id UUID,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) RETURNS VOID AS $$
DECLARE
    current_version_id UUID;
BEGIN
    SELECT version_id INTO current_version_id
    FROM current_item_document_links WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Item-document link not found: %', p_id;
    END IF;

    UPDATE item_document_links
    SET valid_to = p_valid_from, transaction_to = p_valid_from
    WHERE version_id = current_version_id AND valid_to = 'infinity';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- INDEXES for common query patterns
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_features_id_valid ON features (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_features_status ON features (status) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_features_parent ON features (parent_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_bugs_id_valid ON bugs (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs (status) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bugs (severity) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_tasks_id_valid ON tasks (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (parent_type, parent_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_backlog_rank ON backlog_items (rank) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_backlog_item ON backlog_items (item_type, item_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_links_item ON item_document_links (item_type, item_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_links_document ON item_document_links (document_id) WHERE transaction_to = 'infinity';
