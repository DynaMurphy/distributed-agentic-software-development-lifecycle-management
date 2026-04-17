-- =============================================================================
-- Migration Fix: Recreate views with product_id
-- Must DROP first because CREATE OR REPLACE can't add/reorder columns
-- =============================================================================

-- Drop all dependent views first
DROP VIEW IF EXISTS current_features CASCADE;
DROP VIEW IF EXISTS current_bugs CASCADE;
DROP VIEW IF EXISTS current_tasks CASCADE;
DROP VIEW IF EXISTS current_backlog_items CASCADE;
DROP VIEW IF EXISTS current_documents CASCADE;
DROP VIEW IF EXISTS current_milestones CASCADE;
DROP VIEW IF EXISTS current_capabilities CASCADE;
DROP VIEW IF EXISTS current_repositories CASCADE;
DROP VIEW IF EXISTS current_products CASCADE;

-- Recreate current_products
CREATE VIEW current_products AS
SELECT id, version_id, name, description, status, settings, maintained_by, valid_from, valid_to
FROM products
WHERE transaction_to = 'infinity';

-- Recreate current_repositories (with product_id)
CREATE VIEW current_repositories AS
SELECT id, version_id, name, full_name, description, github_url, default_branch,
       status, settings, maintained_by, product_id, valid_from, valid_to
FROM repositories
WHERE transaction_to = 'infinity';

-- Recreate current_features (with product_id + roadmap fields)
CREATE VIEW current_features AS
SELECT id, version_id, title, description, feature_type, parent_id, status, priority,
       effort_estimate, created_by, assigned_to, tags, ai_metadata,
       maintained_by, repository_id, product_id,
       planned_start, planned_end, roadmap_horizon, milestone_id, primary_capability_id,
       valid_from, valid_to
FROM features
WHERE transaction_to = 'infinity';

-- Recreate current_bugs (with product_id)
CREATE VIEW current_bugs AS
SELECT id, version_id, title, description, severity, status, priority,
       steps_to_reproduce, expected_behavior, actual_behavior, environment,
       created_by, assigned_to, tags, ai_metadata,
       maintained_by, repository_id, product_id,
       valid_from, valid_to
FROM bugs
WHERE transaction_to = 'infinity';

-- Recreate current_tasks (with product_id)
CREATE VIEW current_tasks AS
SELECT id, version_id, title, description, parent_type, parent_id, status, priority,
       effort_estimate, assigned_to, tags, ai_metadata,
       maintained_by, repository_id, product_id,
       valid_from, valid_to
FROM tasks
WHERE transaction_to = 'infinity';

-- Recreate current_backlog_items (with product_id)
CREATE VIEW current_backlog_items AS
SELECT id, version_id, item_type, item_id, rank, sprint_label, notes,
       maintained_by, repository_id, product_id,
       valid_from, valid_to
FROM backlog_items
WHERE transaction_to = 'infinity';

-- Recreate current_documents (with product_id)
CREATE VIEW current_documents AS
SELECT id, version_id, title, content, maintained_by, valid_from, valid_to,
       parent_id, sort_order, repository_id, product_id
FROM documents
WHERE transaction_to = 'infinity';

-- Recreate current_milestones (with product_id + release fields)
CREATE VIEW current_milestones AS
SELECT id, version_id, title, description, version_label, target_date, start_date,
       status, capacity_limit, capacity_unit, tags, ai_metadata,
       maintained_by, repository_id, product_id,
       release_type, release_sequence,
       valid_from, valid_to
FROM milestones
WHERE transaction_to = 'infinity';

-- Recreate current_capabilities (with product_id + roadmap fields)
CREATE VIEW current_capabilities AS
SELECT id, version_id, name, description, sdlc_phase, sort_order, status,
       planned_start, planned_end, roadmap_horizon, priority,
       maintained_by, product_id,
       valid_from, valid_to
FROM capabilities
WHERE transaction_to = 'infinity';
