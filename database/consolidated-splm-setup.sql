-- =============================================================================
-- CONSOLIDATED SPLM SCHEMA SETUP
-- =============================================================================
-- This script creates ALL SPLM tables, views, and functions in the splm schema.
-- Run this in the Supabase SQL Editor against your database.
--
-- PREREQUISITES:
--   - The "splm" schema must already exist
--   - The "User" table must already exist in the splm schema
--   - The "periods" extension must be available
--
-- This script ONLY touches the splm schema. It does NOT touch public schema.
-- =============================================================================

-- Set search path to splm for this entire session
SET search_path TO splm;

-- Ensure the periods extension is available
CREATE EXTENSION IF NOT EXISTS periods;

-- =============================================================================
-- 1. DOCUMENTS TABLE (bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity',
    parent_id UUID NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- Only add periods if they don't exist yet (idempotent)
DO $$ BEGIN
  PERFORM periods.add_period('documents', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('documents', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('documents', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Insert function
CREATE OR REPLACE FUNCTION insert_document_version(
    p_id UUID,
    p_title VARCHAR(255),
    p_content TEXT,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL,
    p_parent_id UUID DEFAULT NULL,
    p_sort_order INTEGER DEFAULT 0
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO documents (id, title, content, maintained_by, valid_from, valid_to, transaction_from, transaction_to, parent_id, sort_order)
    VALUES (p_id, p_title, p_content, p_maintained_by, p_valid_from, 'infinity', p_valid_from, 'infinity', p_parent_id, p_sort_order)
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_document_version(
    p_id UUID,
    p_title VARCHAR(255) DEFAULT NULL,
    p_content TEXT DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    cur_parent_id UUID;
    cur_sort_order INTEGER;
BEGIN
    update_timestamp := COALESCE(p_valid_from, CURRENT_TIMESTAMP);
    SELECT version_id, parent_id, sort_order
    INTO current_version_id, cur_parent_id, cur_sort_order
    FROM documents
    WHERE id = p_id AND transaction_to = 'infinity'
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        SELECT insert_document_version(p_id, p_title, p_content, update_timestamp, p_maintained_by, NULL, 0) INTO new_version_id;
        RETURN new_version_id;
    END IF;

    UPDATE documents
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO documents (id, title, content, maintained_by, valid_from, valid_to, transaction_from, transaction_to, parent_id, sort_order)
    VALUES (
        p_id,
        COALESCE(p_title, (SELECT title FROM documents WHERE version_id = current_version_id)),
        COALESCE(p_content, (SELECT content FROM documents WHERE version_id = current_version_id)),
        COALESCE(p_maintained_by, (SELECT maintained_by FROM documents WHERE version_id = current_version_id)),
        update_timestamp, 'infinity', update_timestamp, 'infinity',
        cur_parent_id, cur_sort_order
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 2. FEATURES TABLE (bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS features (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    feature_type VARCHAR(20) NOT NULL DEFAULT 'feature'
        CHECK (feature_type IN ('feature', 'sub_feature')),
    parent_id UUID,
    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'triage', 'backlog', 'spec_generation', 'implementation', 'testing', 'done', 'rejected')),
    priority VARCHAR(10) NOT NULL DEFAULT 'medium'
        CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    effort_estimate VARCHAR(50),
    created_by UUID,
    assigned_to UUID,
    tags JSONB DEFAULT '[]'::jsonb,
    ai_metadata JSONB DEFAULT '{}'::jsonb,
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

DO $$ BEGIN
  PERFORM periods.add_period('features', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('features', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('features', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 3. BUGS TABLE (bitemporal)
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
    environment JSONB DEFAULT '{}'::jsonb,
    created_by UUID,
    assigned_to UUID,
    tags JSONB DEFAULT '[]'::jsonb,
    ai_metadata JSONB DEFAULT '{}'::jsonb,
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

DO $$ BEGIN
  PERFORM periods.add_period('bugs', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('bugs', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('bugs', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 4. TASKS TABLE (bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS tasks (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    parent_type VARCHAR(10) NOT NULL CHECK (parent_type IN ('feature', 'bug')),
    parent_id UUID NOT NULL,
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

DO $$ BEGIN
  PERFORM periods.add_period('tasks', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('tasks', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('tasks', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 5. BACKLOG ITEMS TABLE (bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS backlog_items (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('feature', 'bug')),
    item_id UUID NOT NULL,
    rank INTEGER NOT NULL DEFAULT 0,
    sprint_label VARCHAR(100),
    notes TEXT,
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

DO $$ BEGIN
  PERFORM periods.add_period('backlog_items', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('backlog_items', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('backlog_items', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 6. ITEM-DOCUMENT LINKS TABLE (bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS item_document_links (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('feature', 'bug', 'task')),
    item_id UUID NOT NULL,
    document_id UUID NOT NULL,
    link_type VARCHAR(20) NOT NULL DEFAULT 'specification'
        CHECK (link_type IN ('specification', 'test_plan', 'design', 'reference')),
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

DO $$ BEGIN
  PERFORM periods.add_period('item_document_links', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('item_document_links', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('item_document_links', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 7. CAPABILITIES TABLE (bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS capabilities (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sdlc_phase VARCHAR(50) NOT NULL DEFAULT 'platform'
        CHECK (sdlc_phase IN ('strategy_planning', 'prioritization', 'specification', 'implementation', 'verification', 'delivery', 'post_delivery', 'platform')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

DO $$ BEGIN
  PERFORM periods.add_period('capabilities', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('capabilities', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('capabilities', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 8. CAPABILITY ITEMS TABLE (many-to-many, bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS capability_items (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capability_id UUID NOT NULL,
    item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('feature', 'bug', 'task')),
    item_id UUID NOT NULL,
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

DO $$ BEGIN
  PERFORM periods.add_period('capability_items', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('capability_items', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('capability_items', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 9. MILESTONES TABLE (bitemporal, with transaction columns inline)
-- =============================================================================
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


-- =============================================================================
-- 10. MILESTONE ITEMS TABLE (junction)
-- =============================================================================
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


-- =============================================================================
-- 11. REPOSITORIES TABLE (bitemporal)
-- =============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'repository_status') THEN
    CREATE TYPE repository_status AS ENUM ('active', 'archived');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS repositories (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    full_name VARCHAR(500),
    description TEXT,
    github_url VARCHAR(1000),
    default_branch VARCHAR(255) DEFAULT 'main',
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    settings JSONB DEFAULT '{}'::jsonb,
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

DO $$ BEGIN
  PERFORM periods.add_period('repositories', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('repositories', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('repositories', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Default repository
INSERT INTO repositories (
    id, name, full_name, description, status,
    valid_from, valid_to, transaction_from, transaction_to
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'local',
    'Local / Default Repository',
    'Default repository for items not yet assigned to a specific GitHub repository.',
    'active',
    CURRENT_TIMESTAMP, 'infinity', CURRENT_TIMESTAMP, 'infinity'
) ON CONFLICT DO NOTHING;


-- =============================================================================
-- 12. PRODUCTS TABLE (bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    settings JSONB DEFAULT '{}'::jsonb,
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

DO $$ BEGIN
  PERFORM periods.add_period('products', 'validity', 'valid_from', 'valid_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_system_time_period('products', 'transaction_from', 'transaction_to');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  PERFORM periods.add_unique_key('products', ARRAY['id'], 'validity');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 13. ADD repository_id AND product_id COLUMNS TO ALL TABLES
-- =============================================================================
ALTER TABLE features            ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE bugs                ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE tasks               ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE backlog_items       ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE documents           ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE item_document_links ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE repositories        ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE features            ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE bugs                ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE tasks               ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE backlog_items       ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE documents           ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE item_document_links ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE milestones          ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE milestone_items     ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE capabilities        ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE capability_items    ADD COLUMN IF NOT EXISTS product_id UUID;

-- Roadmap fields on features
ALTER TABLE features ADD COLUMN IF NOT EXISTS planned_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE features ADD COLUMN IF NOT EXISTS planned_end TIMESTAMP WITH TIME ZONE;
ALTER TABLE features ADD COLUMN IF NOT EXISTS roadmap_horizon VARCHAR(20);
ALTER TABLE features ADD COLUMN IF NOT EXISTS milestone_id UUID DEFAULT NULL;
ALTER TABLE features ADD COLUMN IF NOT EXISTS primary_capability_id UUID;

-- Roadmap fields on capabilities
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS planned_start TIMESTAMP WITH TIME ZONE;
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS planned_end TIMESTAMP WITH TIME ZONE;
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS roadmap_horizon VARCHAR(20);
ALTER TABLE capabilities ADD COLUMN IF NOT EXISTS priority VARCHAR(10) DEFAULT 'medium';

-- Enhanced milestone fields
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS release_type VARCHAR(20) DEFAULT 'minor';
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS release_sequence INTEGER;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS parent_milestone_id UUID;
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS release_cadence VARCHAR(20);

-- Milestone items: capability support
ALTER TABLE milestone_items ADD COLUMN IF NOT EXISTS product_id UUID;
DO $$ BEGIN
  ALTER TABLE milestone_items DROP CONSTRAINT IF EXISTS milestone_items_item_type_check;
  ALTER TABLE milestone_items ADD CONSTRAINT milestone_items_item_type_check
    CHECK (item_type IN ('feature', 'bug', 'capability'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;


-- =============================================================================
-- 14. DROP AND RECREATE ALL VIEWS (final versions with all columns)
-- =============================================================================
DROP VIEW IF EXISTS current_features CASCADE;
DROP VIEW IF EXISTS current_bugs CASCADE;
DROP VIEW IF EXISTS current_tasks CASCADE;
DROP VIEW IF EXISTS current_backlog_items CASCADE;
DROP VIEW IF EXISTS current_documents CASCADE;
DROP VIEW IF EXISTS current_milestones CASCADE;
DROP VIEW IF EXISTS current_capabilities CASCADE;
DROP VIEW IF EXISTS current_repositories CASCADE;
DROP VIEW IF EXISTS current_products CASCADE;
DROP VIEW IF EXISTS current_item_document_links CASCADE;
DROP VIEW IF EXISTS current_capability_items CASCADE;

CREATE VIEW current_products AS
SELECT id, version_id, name, description, status, settings, maintained_by, valid_from, valid_to
FROM products
WHERE transaction_to = 'infinity';

CREATE VIEW current_repositories AS
SELECT id, version_id, name, full_name, description, github_url, default_branch,
       status, settings, maintained_by, product_id, valid_from, valid_to
FROM repositories
WHERE transaction_to = 'infinity';

CREATE VIEW current_features AS
SELECT id, version_id, title, description, feature_type, parent_id, status, priority,
       effort_estimate, created_by, assigned_to, tags, ai_metadata,
       maintained_by, repository_id, product_id,
       planned_start, planned_end, roadmap_horizon, milestone_id, primary_capability_id,
       valid_from, valid_to
FROM features
WHERE transaction_to = 'infinity';

CREATE VIEW current_bugs AS
SELECT id, version_id, title, description, severity, status, priority,
       steps_to_reproduce, expected_behavior, actual_behavior, environment,
       created_by, assigned_to, tags, ai_metadata,
       maintained_by, repository_id, product_id,
       valid_from, valid_to
FROM bugs
WHERE transaction_to = 'infinity';

CREATE VIEW current_tasks AS
SELECT id, version_id, title, description, parent_type, parent_id, status, priority,
       effort_estimate, assigned_to, tags, ai_metadata,
       maintained_by, repository_id, product_id,
       valid_from, valid_to
FROM tasks
WHERE transaction_to = 'infinity';

CREATE VIEW current_backlog_items AS
SELECT id, version_id, item_type, item_id, rank, sprint_label, notes,
       maintained_by, repository_id, product_id,
       valid_from, valid_to
FROM backlog_items
WHERE transaction_to = 'infinity';

CREATE VIEW current_documents AS
SELECT id, version_id, title, content, maintained_by, valid_from, valid_to,
       parent_id, sort_order, repository_id, product_id
FROM documents
WHERE transaction_to = 'infinity';

CREATE VIEW current_item_document_links AS
SELECT id, version_id, item_type, item_id, document_id, link_type,
       maintained_by, repository_id, product_id, valid_from, valid_to
FROM item_document_links
WHERE transaction_to = 'infinity';

CREATE VIEW current_milestones AS
SELECT id, version_id, title, description, version_label, target_date, start_date,
       status, capacity_limit, capacity_unit, tags, ai_metadata,
       maintained_by, repository_id, product_id,
       release_type, release_sequence,
       valid_from, valid_to
FROM milestones
WHERE transaction_to = 'infinity';

CREATE VIEW current_capabilities AS
SELECT id, version_id, name, description, sdlc_phase, sort_order, status,
       planned_start, planned_end, roadmap_horizon, priority,
       maintained_by, product_id,
       valid_from, valid_to
FROM capabilities
WHERE transaction_to = 'infinity';

CREATE VIEW current_capability_items AS
SELECT id, version_id, capability_id, item_type, item_id, maintained_by, valid_from, valid_to
FROM capability_items
WHERE transaction_to = 'infinity';


-- =============================================================================
-- 15. ALL FUNCTIONS (final versions)
-- =============================================================================

-- --- Features ---
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
    p_roadmap_horizon VARCHAR(20) DEFAULT NULL,
    p_primary_capability_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO features (
        id, title, description, feature_type, parent_id, status, priority,
        effort_estimate, created_by, assigned_to, tags, ai_metadata, maintained_by,
        repository_id, planned_start, planned_end, roadmap_horizon, primary_capability_id,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_title, p_description, p_feature_type, p_parent_id, p_status, p_priority,
        p_effort_estimate, p_created_by, p_assigned_to, p_tags, p_ai_metadata, p_maintained_by,
        p_repository_id, p_planned_start, p_planned_end, p_roadmap_horizon, p_primary_capability_id,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

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
    p_roadmap_horizon VARCHAR(20) DEFAULT NULL,
    p_primary_capability_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    c_title VARCHAR(255); c_description TEXT; c_feature_type VARCHAR(20);
    c_parent_id UUID; c_status VARCHAR(30); c_priority VARCHAR(10);
    c_effort_estimate VARCHAR(50); c_created_by UUID; c_assigned_to UUID;
    c_tags JSONB; c_ai_metadata JSONB; c_maintained_by UUID;
    c_repository_id UUID; c_planned_start TIMESTAMP WITH TIME ZONE;
    c_planned_end TIMESTAMP WITH TIME ZONE; c_roadmap_horizon VARCHAR(20);
    c_primary_capability_id UUID;
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
            p_planned_start, p_planned_end, p_roadmap_horizon, p_primary_capability_id
        ) INTO new_version_id;
        RETURN new_version_id;
    END IF;

    SELECT f.title, f.description, f.feature_type, f.parent_id, f.status, f.priority,
           f.effort_estimate, f.created_by, f.assigned_to, f.tags, f.ai_metadata, f.maintained_by,
           f.repository_id, f.planned_start, f.planned_end, f.roadmap_horizon, f.primary_capability_id
    INTO c_title, c_description, c_feature_type, c_parent_id, c_status, c_priority,
         c_effort_estimate, c_created_by, c_assigned_to, c_tags, c_ai_metadata, c_maintained_by,
         c_repository_id, c_planned_start, c_planned_end, c_roadmap_horizon, c_primary_capability_id
    FROM features f WHERE f.version_id = current_version_id;

    UPDATE features
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO features (
        id, title, description, feature_type, parent_id, status, priority,
        effort_estimate, created_by, assigned_to, tags, ai_metadata, maintained_by,
        repository_id, planned_start, planned_end, roadmap_horizon, primary_capability_id,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        COALESCE(p_title, c_title), COALESCE(p_description, c_description),
        COALESCE(p_feature_type, c_feature_type), COALESCE(p_parent_id, c_parent_id),
        COALESCE(p_status, c_status), COALESCE(p_priority, c_priority),
        COALESCE(p_effort_estimate, c_effort_estimate), c_created_by,
        COALESCE(p_assigned_to, c_assigned_to), COALESCE(p_tags, c_tags),
        COALESCE(p_ai_metadata, c_ai_metadata), COALESCE(p_maintained_by, c_maintained_by),
        COALESCE(p_repository_id, c_repository_id),
        COALESCE(p_planned_start, c_planned_start), COALESCE(p_planned_end, c_planned_end),
        COALESCE(p_roadmap_horizon, c_roadmap_horizon),
        COALESCE(p_primary_capability_id, c_primary_capability_id),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- --- Bugs ---
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
        COALESCE(p_title, c_title), COALESCE(p_description, c_description),
        COALESCE(p_severity, c_severity), COALESCE(p_status, c_status),
        COALESCE(p_priority, c_priority),
        COALESCE(p_steps_to_reproduce, c_steps_to_reproduce),
        COALESCE(p_expected_behavior, c_expected_behavior),
        COALESCE(p_actual_behavior, c_actual_behavior),
        COALESCE(p_environment, c_environment),
        c_created_by, COALESCE(p_assigned_to, c_assigned_to),
        COALESCE(p_tags, c_tags), COALESCE(p_ai_metadata, c_ai_metadata),
        COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- --- Tasks ---
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
        COALESCE(p_title, c_title), COALESCE(p_description, c_description),
        c_parent_type, c_parent_id,
        COALESCE(p_status, c_status), COALESCE(p_priority, c_priority),
        COALESCE(p_effort_estimate, c_effort_estimate),
        COALESCE(p_assigned_to, c_assigned_to),
        COALESCE(p_tags, c_tags), COALESCE(p_ai_metadata, c_ai_metadata),
        COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- --- Backlog Items ---
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
        p_id, c_item_type, c_item_id,
        COALESCE(p_rank, c_rank), COALESCE(p_sprint_label, c_sprint_label),
        COALESCE(p_notes, c_notes), COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- --- Item Document Links ---
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


-- --- Capabilities ---
CREATE OR REPLACE FUNCTION insert_capability_version(
    p_id UUID,
    p_name VARCHAR(100),
    p_description TEXT DEFAULT NULL,
    p_sdlc_phase VARCHAR(50) DEFAULT 'platform',
    p_sort_order INTEGER DEFAULT 0,
    p_status VARCHAR(20) DEFAULT 'active',
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO capabilities (
        id, name, description, sdlc_phase, sort_order, status, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_name, p_description, p_sdlc_phase, p_sort_order, p_status, p_maintained_by,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_capability_version(
    p_id UUID,
    p_name VARCHAR(100) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_sdlc_phase VARCHAR(50) DEFAULT NULL,
    p_sort_order INTEGER DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    c_name VARCHAR(100); c_description TEXT; c_sdlc_phase VARCHAR(50);
    c_sort_order INTEGER; c_status VARCHAR(20); c_maintained_by UUID;
BEGIN
    update_timestamp := p_valid_from;
    SELECT version_id INTO current_version_id
    FROM current_capabilities WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Capability not found: %', p_id;
    END IF;

    SELECT c.name, c.description, c.sdlc_phase, c.sort_order, c.status, c.maintained_by
    INTO c_name, c_description, c_sdlc_phase, c_sort_order, c_status, c_maintained_by
    FROM capabilities c WHERE c.version_id = current_version_id;

    UPDATE capabilities
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO capabilities (
        id, name, description, sdlc_phase, sort_order, status, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        COALESCE(p_name, c_name), COALESCE(p_description, c_description),
        COALESCE(p_sdlc_phase, c_sdlc_phase), COALESCE(p_sort_order, c_sort_order),
        COALESCE(p_status, c_status), COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- --- Capability Items ---
CREATE OR REPLACE FUNCTION insert_capability_item_version(
    p_id UUID,
    p_capability_id UUID,
    p_item_type VARCHAR(10),
    p_item_id UUID,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO capability_items (
        id, capability_id, item_type, item_id, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_capability_id, p_item_type, p_item_id, p_maintained_by,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION delete_capability_item(
    p_id UUID,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) RETURNS VOID AS $$
DECLARE
    current_version_id UUID;
BEGIN
    SELECT version_id INTO current_version_id
    FROM current_capability_items WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Capability item link not found: %', p_id;
    END IF;

    UPDATE capability_items
    SET valid_to = p_valid_from, transaction_to = p_valid_from
    WHERE version_id = current_version_id AND valid_to = 'infinity';
END;
$$ LANGUAGE plpgsql;


-- --- Milestones ---
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
    c_title VARCHAR(255); c_description TEXT; c_version_label VARCHAR(50);
    c_target_date DATE; c_start_date DATE; c_status VARCHAR(20);
    c_capacity_limit INTEGER; c_capacity_unit VARCHAR(20);
    c_tags JSONB; c_ai_metadata JSONB; c_maintained_by UUID; c_repository_id UUID;
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

    UPDATE milestones
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO milestones (
        id, title, description, version_label, target_date, start_date,
        status, capacity_limit, capacity_unit, tags, ai_metadata,
        maintained_by, repository_id,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        COALESCE(p_title, c_title), COALESCE(p_description, c_description),
        COALESCE(p_version_label, c_version_label),
        COALESCE(p_target_date, c_target_date), COALESCE(p_start_date, c_start_date),
        COALESCE(p_status, c_status),
        COALESCE(p_capacity_limit, c_capacity_limit), COALESCE(p_capacity_unit, c_capacity_unit),
        COALESCE(p_tags, c_tags), COALESCE(p_ai_metadata, c_ai_metadata),
        COALESCE(p_maintained_by, c_maintained_by), c_repository_id,
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- --- Products ---
CREATE OR REPLACE FUNCTION insert_product_version(
    p_id UUID,
    p_name VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT 'active',
    p_settings JSONB DEFAULT '{}'::jsonb,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO products (
        id, name, description, status, settings, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_name, p_description, p_status, p_settings, p_maintained_by,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_product_version(
    p_id UUID,
    p_name VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL,
    p_settings JSONB DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    c_name VARCHAR(255); c_description TEXT; c_status VARCHAR(20);
    c_settings JSONB; c_maintained_by UUID;
BEGIN
    update_timestamp := p_valid_from;
    SELECT version_id INTO current_version_id
    FROM current_products WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Product not found: %', p_id;
    END IF;

    SELECT pr.name, pr.description, pr.status, pr.settings, pr.maintained_by
    INTO c_name, c_description, c_status, c_settings, c_maintained_by
    FROM products pr WHERE pr.version_id = current_version_id;

    UPDATE products
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO products (
        id, name, description, status, settings, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        COALESCE(p_name, c_name), COALESCE(p_description, c_description),
        COALESCE(p_status, c_status), COALESCE(p_settings, c_settings),
        COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- --- Repositories ---
CREATE OR REPLACE FUNCTION insert_repository_version(
    p_id UUID,
    p_name VARCHAR(255),
    p_full_name VARCHAR(500) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_github_url VARCHAR(1000) DEFAULT NULL,
    p_default_branch VARCHAR(255) DEFAULT 'main',
    p_status VARCHAR(20) DEFAULT 'active',
    p_settings JSONB DEFAULT '{}'::jsonb,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO repositories (
        id, name, full_name, description, github_url, default_branch,
        status, settings, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id, p_name, p_full_name, p_description, p_github_url, p_default_branch,
        p_status, p_settings, p_maintained_by,
        p_valid_from, 'infinity', p_valid_from, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_repository_version(
    p_id UUID,
    p_name VARCHAR(255) DEFAULT NULL,
    p_full_name VARCHAR(500) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_github_url VARCHAR(1000) DEFAULT NULL,
    p_default_branch VARCHAR(255) DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT NULL,
    p_settings JSONB DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    c_name VARCHAR(255); c_full_name VARCHAR(500); c_description TEXT;
    c_github_url VARCHAR(1000); c_default_branch VARCHAR(255);
    c_status VARCHAR(20); c_settings JSONB; c_maintained_by UUID;
BEGIN
    update_timestamp := p_valid_from;
    SELECT version_id INTO current_version_id
    FROM current_repositories WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Repository not found: %', p_id;
    END IF;

    SELECT r.name, r.full_name, r.description, r.github_url, r.default_branch,
           r.status, r.settings, r.maintained_by
    INTO c_name, c_full_name, c_description, c_github_url, c_default_branch,
         c_status, c_settings, c_maintained_by
    FROM repositories r WHERE r.version_id = current_version_id;

    UPDATE repositories
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO repositories (
        id, name, full_name, description, github_url, default_branch,
        status, settings, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        COALESCE(p_name, c_name), COALESCE(p_full_name, c_full_name),
        COALESCE(p_description, c_description), COALESCE(p_github_url, c_github_url),
        COALESCE(p_default_branch, c_default_branch), COALESCE(p_status, c_status),
        COALESCE(p_settings, c_settings), COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 16. INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_features_id_valid ON features (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_features_status ON features (status) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_features_parent ON features (parent_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_features_repo ON features (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_features_product ON features (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_features_milestone ON features (milestone_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_bugs_id_valid ON bugs (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs (status) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_bugs_severity ON bugs (severity) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_bugs_repo ON bugs (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_bugs_product ON bugs (product_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_tasks_id_valid ON tasks (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks (parent_type, parent_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_tasks_repo ON tasks (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_tasks_product ON tasks (product_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_backlog_rank ON backlog_items (rank) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_backlog_item ON backlog_items (item_type, item_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_backlog_repo ON backlog_items (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_backlog_product ON backlog_items (product_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_links_item ON item_document_links (item_type, item_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_links_document ON item_document_links (document_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_links_repo ON item_document_links (repository_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_capabilities_id_valid ON capabilities (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_capabilities_phase ON capabilities (sdlc_phase) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_capabilities_product ON capabilities (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_capability_items_capability ON capability_items (capability_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_capability_items_item ON capability_items (item_type, item_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_milestones_id_valid ON milestones (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON milestones (status) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_milestones_target_date ON milestones (target_date) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_milestones_repo ON milestones (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_milestones_product ON milestones (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_milestone_items_milestone ON milestone_items (milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_items_item ON milestone_items (item_type, item_id);

CREATE INDEX IF NOT EXISTS idx_repositories_id_valid ON repositories (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_status ON repositories (status) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_repositories_product ON repositories (product_id) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_products_id_valid ON products (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status) WHERE transaction_to = 'infinity';

CREATE INDEX IF NOT EXISTS idx_documents_repo ON documents (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_documents_product ON documents (product_id) WHERE transaction_to = 'infinity';


-- =============================================================================
-- 17. SYSTEM USERS (for actor tracking)
-- =============================================================================
INSERT INTO "User" (id, email, password)
VALUES (
    '00000000-0000-0000-0000-000000000010',
    'system:chat-assistant',
    'not-a-real-password'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO "User" (id, email, password)
VALUES (
    '00000000-0000-0000-0000-000000000011',
    'system:mcp-server',
    'not-a-real-password'
) ON CONFLICT (id) DO NOTHING;


-- =============================================================================
-- DONE - All SPLM tables, views, and functions created in splm schema
-- =============================================================================
