-- =============================================================================
-- Migration: Product as Top-Level Entity
-- Product → Repository (many repos per product)
-- All work items scoped to product_id
-- =============================================================================

-- =============================================================================
-- 1. PRODUCTS TABLE (bitemporal)
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

SELECT periods.add_period('products', 'validity', 'valid_from', 'valid_to');
SELECT periods.add_system_time_period('products', 'transaction_from', 'transaction_to');
SELECT periods.add_unique_key('products', ARRAY['id'], 'validity');

CREATE OR REPLACE VIEW current_products AS
SELECT id, version_id, name, description, status, settings, maintained_by, valid_from, valid_to
FROM products
WHERE transaction_to = 'infinity';

-- Insert function
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

-- Update function
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
        COALESCE(p_name, c_name),
        COALESCE(p_description, c_description),
        COALESCE(p_status, c_status),
        COALESCE(p_settings, c_settings),
        COALESCE(p_maintained_by, c_maintained_by),
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_id_valid ON products (id, valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_products_status ON products (status) WHERE transaction_to = 'infinity';

-- =============================================================================
-- 2. MIGRATE DATA: Create products from existing repositories (same UUIDs)
-- =============================================================================
INSERT INTO products (id, name, description, status, settings, maintained_by,
                      valid_from, valid_to, transaction_from, transaction_to)
SELECT id, name, COALESCE(description, ''), status,
       COALESCE(settings, '{}'::jsonb), maintained_by,
       valid_from, valid_to, transaction_from, transaction_to
FROM repositories
WHERE transaction_to = 'infinity'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. ADD product_id TO REPOSITORIES (repos become children of products)
-- =============================================================================
ALTER TABLE repositories ADD COLUMN IF NOT EXISTS product_id UUID;

-- Backfill: each repo's product_id = its own id (since repos were products)
UPDATE repositories SET product_id = id WHERE product_id IS NULL;

-- =============================================================================
-- 4. ADD product_id TO ALL WORK ITEM TABLES
-- =============================================================================
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

-- =============================================================================
-- 5. BACKFILL product_id FROM repository_id
-- =============================================================================
-- For tables that have repository_id, copy to product_id
UPDATE features            SET product_id = repository_id WHERE product_id IS NULL AND repository_id IS NOT NULL;
UPDATE bugs                SET product_id = repository_id WHERE product_id IS NULL AND repository_id IS NOT NULL;
UPDATE tasks               SET product_id = repository_id WHERE product_id IS NULL AND repository_id IS NOT NULL;
UPDATE backlog_items       SET product_id = repository_id WHERE product_id IS NULL AND repository_id IS NOT NULL;
UPDATE documents           SET product_id = repository_id WHERE product_id IS NULL AND repository_id IS NOT NULL;
UPDATE item_document_links SET product_id = repository_id WHERE product_id IS NULL AND repository_id IS NOT NULL;
UPDATE milestones          SET product_id = repository_id WHERE product_id IS NULL AND repository_id IS NOT NULL;
UPDATE milestone_items     SET product_id = repository_id WHERE product_id IS NULL AND repository_id IS NOT NULL;

-- For capabilities/capability_items that don't have repository_id,
-- default to the local product
UPDATE capabilities     SET product_id = '00000000-0000-0000-0000-000000000001' WHERE product_id IS NULL;
UPDATE capability_items SET product_id = '00000000-0000-0000-0000-000000000001' WHERE product_id IS NULL;

-- Milestones that had NULL repository_id also default to local product
UPDATE milestones SET product_id = '00000000-0000-0000-0000-000000000001' WHERE product_id IS NULL;

-- =============================================================================
-- 6. ADD INDEXES FOR product_id
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_features_product ON features (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_bugs_product ON bugs (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_tasks_product ON tasks (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_backlog_product ON backlog_items (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_documents_product ON documents (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_milestones_product ON milestones (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_capabilities_product ON capabilities (product_id) WHERE transaction_to = 'infinity';
CREATE INDEX IF NOT EXISTS idx_repositories_product ON repositories (product_id) WHERE transaction_to = 'infinity';

-- =============================================================================
-- 7. UPDATE VIEWS TO INCLUDE product_id
-- =============================================================================

CREATE OR REPLACE VIEW current_repositories AS
SELECT id, version_id, name, full_name, description, github_url, default_branch,
       status, settings, maintained_by, product_id, valid_from, valid_to
FROM repositories
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_features AS
SELECT id, version_id, title, description, feature_type, parent_id, status, priority,
       effort_estimate, created_by, assigned_to, tags, ai_metadata, valid_from, valid_to,
       maintained_by, repository_id, product_id
FROM features
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_bugs AS
SELECT id, version_id, title, description, severity, status, priority,
       steps_to_reproduce, expected_behavior, actual_behavior, environment,
       created_by, assigned_to, tags, ai_metadata, valid_from, valid_to,
       maintained_by, repository_id, product_id
FROM bugs
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_tasks AS
SELECT id, version_id, title, description, parent_type, parent_id, status, priority,
       effort_estimate, assigned_to, tags, ai_metadata, valid_from, valid_to,
       maintained_by, repository_id, product_id
FROM tasks
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_backlog_items AS
SELECT id, version_id, item_type, item_id, rank, sprint_label, notes, valid_from, valid_to,
       maintained_by, repository_id, product_id
FROM backlog_items
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_documents AS
SELECT id, version_id, title, content, maintained_by, valid_from, valid_to, parent_id, sort_order,
       repository_id, product_id
FROM documents
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_milestones AS
SELECT id, version_id, title, description, version_label, target_date, start_date,
       status, capacity_limit, capacity_unit, tags, ai_metadata,
       maintained_by, repository_id, product_id, valid_from, valid_to
FROM milestones
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_capabilities AS
SELECT id, version_id, name, description, sdlc_phase, sort_order, status,
       maintained_by, product_id, valid_from, valid_to
FROM capabilities
WHERE transaction_to = 'infinity';

-- Also update current_milestones to include additional fields from enhance-milestones migration
-- (release_type, release_cadence, parent_milestone_id) if they exist
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'milestones' AND column_name = 'release_type') THEN
        CREATE OR REPLACE VIEW current_milestones AS
        SELECT id, version_id, title, description, version_label, target_date, start_date,
               status, capacity_limit, capacity_unit, tags, ai_metadata,
               maintained_by, repository_id, product_id,
               release_type, release_cadence, parent_milestone_id,
               valid_from, valid_to
        FROM milestones
        WHERE transaction_to = 'infinity';
    END IF;
END $$;

-- Also update current_capabilities to include roadmap fields if they exist
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'capabilities' AND column_name = 'planned_start') THEN
        CREATE OR REPLACE VIEW current_capabilities AS
        SELECT id, version_id, name, description, sdlc_phase, sort_order, status,
               maintained_by, product_id,
               planned_start, planned_end, roadmap_horizon,
               valid_from, valid_to
        FROM capabilities
        WHERE transaction_to = 'infinity';
    END IF;
END $$;

-- Also update current_features to include roadmap/milestone fields if they exist
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'features' AND column_name = 'planned_start') THEN
        CREATE OR REPLACE VIEW current_features AS
        SELECT id, version_id, title, description, feature_type, parent_id, status, priority,
               effort_estimate, created_by, assigned_to, tags, ai_metadata, valid_from, valid_to,
               maintained_by, repository_id, product_id,
               planned_start, planned_end, roadmap_horizon, milestone_id, primary_capability_id
        FROM features
        WHERE transaction_to = 'infinity';
    END IF;
END $$;
