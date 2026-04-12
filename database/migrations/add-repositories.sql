-- =============================================================================
-- Migration: Multi-Repository Registry & Data Namespacing
-- Phase 1 of Distributed Multi-Repository SPLM
-- =============================================================================
-- Adds a repositories table, and a repository_id column to all SPLM tables
-- so that features, bugs, tasks, backlog items, documents, and links
-- can be scoped to a specific GitHub repository.
-- =============================================================================

-- Default repository UUID (used for backfill and as column default)
-- This represents the "local / unassigned" repository for existing data.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'repository_status') THEN
    CREATE TYPE repository_status AS ENUM ('active', 'archived');
  END IF;
END $$;

-- =============================================================================
-- 1. REPOSITORIES TABLE (bitemporal)
-- =============================================================================
CREATE TABLE IF NOT EXISTS repositories (
    id UUID NOT NULL,
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,                              -- e.g. "owner/repo"
    full_name VARCHAR(500),                                  -- GitHub full name
    description TEXT,
    github_url VARCHAR(1000),                                -- https://github.com/owner/repo
    default_branch VARCHAR(255) DEFAULT 'main',
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'archived')),
    settings JSONB DEFAULT '{}'::jsonb,                      -- Per-repo SPLM settings
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity'
);

SELECT periods.add_period('repositories', 'validity', 'valid_from', 'valid_to');
SELECT periods.add_system_time_period('repositories', 'transaction_from', 'transaction_to');
SELECT periods.add_unique_key('repositories', ARRAY['id'], 'validity');

CREATE OR REPLACE VIEW current_repositories AS
SELECT id, version_id, name, full_name, description, github_url, default_branch,
       status, settings, maintained_by, valid_from, valid_to
FROM repositories
WHERE transaction_to = 'infinity';

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
        COALESCE(p_name, c_name),
        COALESCE(p_full_name, c_full_name),
        COALESCE(p_description, c_description),
        COALESCE(p_github_url, c_github_url),
        COALESCE(p_default_branch, c_default_branch),
        COALESCE(p_status, c_status),
        COALESCE(p_settings, c_settings),
        COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. INSERT DEFAULT REPOSITORY
-- =============================================================================
-- Use a well-known UUID so code can reference it as the default.
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
-- 3. ADD repository_id COLUMN TO ALL SPLM TABLES
-- =============================================================================
-- Use the default repository UUID as default so existing rows get backfilled
-- and new rows without explicit repository_id are assigned to default.

ALTER TABLE features            ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE bugs                ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE tasks               ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE backlog_items       ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE documents           ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE item_document_links ADD COLUMN IF NOT EXISTS repository_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';

-- =============================================================================
-- 4. UPDATE VIEWS TO INCLUDE repository_id
-- =============================================================================

CREATE OR REPLACE VIEW current_repositories AS
SELECT id, version_id, name, full_name, description, github_url, default_branch,
       status, settings, maintained_by, valid_from, valid_to
FROM repositories
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_features AS
SELECT id, version_id, title, description, feature_type, parent_id, status, priority,
       effort_estimate, created_by, assigned_to, tags, ai_metadata, valid_from, valid_to,
       maintained_by, repository_id
FROM features
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_bugs AS
SELECT id, version_id, title, description, severity, status, priority,
       steps_to_reproduce, expected_behavior, actual_behavior, environment,
       created_by, assigned_to, tags, ai_metadata, valid_from, valid_to,
       maintained_by, repository_id
FROM bugs
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_tasks AS
SELECT id, version_id, title, description, parent_type, parent_id, status, priority,
       effort_estimate, assigned_to, tags, ai_metadata, valid_from, valid_to,
       maintained_by, repository_id
FROM tasks
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_backlog_items AS
SELECT id, version_id, item_type, item_id, rank, sprint_label, notes, valid_from, valid_to,
       maintained_by, repository_id
FROM backlog_items
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_item_document_links AS
SELECT id, version_id, item_type, item_id, document_id, link_type, valid_from, valid_to,
       maintained_by, repository_id
FROM item_document_links
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_documents AS
SELECT id, version_id, title, content, valid_from, valid_to,
       maintained_by, repository_id
FROM documents
WHERE transaction_to = 'infinity';

-- =============================================================================
-- 5. ADD INDEXES for repository_id filtering
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_features_repo ON features (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_bugs_repo ON bugs (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_tasks_repo ON tasks (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_backlog_repo ON backlog_items (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_documents_repo ON documents (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_links_repo ON item_document_links (repository_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_repositories_id_valid ON repositories (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_repositories_status ON repositories (status) WHERE transaction_to = 'infinity';
