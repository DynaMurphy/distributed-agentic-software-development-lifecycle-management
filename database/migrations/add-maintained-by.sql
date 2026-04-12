-- =============================================================================
-- Migration: Add maintained_by (user audit) column to all SPLM tables
-- =============================================================================
-- Adds a `maintained_by` UUID column (FK → "User".id) to every bitemporal table
-- so each version row records which user created or modified it.
-- The column is nullable to allow MCP-server and script-based changes (no user session).
-- =============================================================================

-- 1. Add column to each table
ALTER TABLE features        ADD COLUMN IF NOT EXISTS maintained_by UUID REFERENCES "User"(id);
ALTER TABLE bugs            ADD COLUMN IF NOT EXISTS maintained_by UUID REFERENCES "User"(id);
ALTER TABLE tasks           ADD COLUMN IF NOT EXISTS maintained_by UUID REFERENCES "User"(id);
ALTER TABLE backlog_items   ADD COLUMN IF NOT EXISTS maintained_by UUID REFERENCES "User"(id);
ALTER TABLE item_document_links ADD COLUMN IF NOT EXISTS maintained_by UUID REFERENCES "User"(id);
ALTER TABLE documents       ADD COLUMN IF NOT EXISTS maintained_by UUID REFERENCES "User"(id);

-- 2. Update views to include maintained_by

CREATE OR REPLACE VIEW current_features AS
SELECT id, version_id, title, description, feature_type, parent_id, status, priority,
       effort_estimate, created_by, assigned_to, tags, ai_metadata, valid_from, valid_to, maintained_by
FROM features
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_bugs AS
SELECT id, version_id, title, description, severity, status, priority,
       steps_to_reproduce, expected_behavior, actual_behavior, environment,
       created_by, assigned_to, tags, ai_metadata, valid_from, valid_to, maintained_by
FROM bugs
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_tasks AS
SELECT id, version_id, title, description, parent_type, parent_id, status, priority,
       effort_estimate, assigned_to, tags, ai_metadata, valid_from, valid_to, maintained_by
FROM tasks
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_backlog_items AS
SELECT id, version_id, item_type, item_id, rank, sprint_label, notes, valid_from, valid_to, maintained_by
FROM backlog_items
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_item_document_links AS
SELECT id, version_id, item_type, item_id, document_id, link_type, valid_from, valid_to, maintained_by
FROM item_document_links
WHERE transaction_to = 'infinity';

CREATE OR REPLACE VIEW current_documents AS
SELECT id, version_id, title, content, valid_from, valid_to, maintained_by
FROM documents
WHERE transaction_to = 'infinity';

-- =============================================================================
-- 3. Replace insert/update functions to include maintained_by parameter
-- =============================================================================

-- ---------- FEATURES ----------

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
    c_title VARCHAR(255); c_description TEXT; c_feature_type VARCHAR(20);
    c_parent_id UUID; c_status VARCHAR(30); c_priority VARCHAR(10);
    c_effort_estimate VARCHAR(50); c_created_by UUID; c_assigned_to UUID;
    c_tags JSONB; c_ai_metadata JSONB;
BEGIN
    update_timestamp := COALESCE(p_valid_from, CURRENT_TIMESTAMP);

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

    SELECT f.title, f.description, f.feature_type, f.parent_id, f.status, f.priority,
           f.effort_estimate, f.created_by, f.assigned_to, f.tags, f.ai_metadata
    INTO c_title, c_description, c_feature_type, c_parent_id, c_status, c_priority,
         c_effort_estimate, c_created_by, c_assigned_to, c_tags, c_ai_metadata
    FROM features f WHERE f.version_id = current_version_id;

    UPDATE features
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

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
        c_created_by,
        COALESCE(p_assigned_to, c_assigned_to),
        COALESCE(p_tags, c_tags),
        COALESCE(p_ai_metadata, c_ai_metadata),
        p_maintained_by,  -- Always use the new maintainer (NULL if not provided)
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- ---------- BUGS ----------

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
    c_tags JSONB; c_ai_metadata JSONB;
BEGIN
    update_timestamp := COALESCE(p_valid_from, CURRENT_TIMESTAMP);

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
           b.environment, b.created_by, b.assigned_to, b.tags, b.ai_metadata
    INTO c_title, c_description, c_severity, c_status, c_priority,
         c_steps_to_reproduce, c_expected_behavior, c_actual_behavior,
         c_environment, c_created_by, c_assigned_to, c_tags, c_ai_metadata
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
        p_maintained_by,
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- ---------- TASKS ----------

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
    c_tags JSONB; c_ai_metadata JSONB;
BEGIN
    update_timestamp := COALESCE(p_valid_from, CURRENT_TIMESTAMP);

    SELECT version_id INTO current_version_id
    From current_tasks WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Task not found: %', p_id;
    END IF;

    SELECT t.title, t.description, t.parent_type, t.parent_id, t.status, t.priority,
           t.effort_estimate, t.assigned_to, t.tags, t.ai_metadata
    INTO c_title, c_description, c_parent_type, c_parent_id, c_status, c_priority,
         c_effort_estimate, c_assigned_to, c_tags, c_ai_metadata
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
        c_parent_type,
        c_parent_id,
        COALESCE(p_status, c_status),
        COALESCE(p_priority, c_priority),
        COALESCE(p_effort_estimate, c_effort_estimate),
        COALESCE(p_assigned_to, c_assigned_to),
        COALESCE(p_tags, c_tags),
        COALESCE(p_ai_metadata, c_ai_metadata),
        p_maintained_by,
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- ---------- BACKLOG ITEMS ----------

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
    c_sprint_label VARCHAR(100); c_notes TEXT;
BEGIN
    update_timestamp := COALESCE(p_valid_from, CURRENT_TIMESTAMP);

    SELECT version_id INTO current_version_id
    FROM current_backlog_items WHERE id = p_id
    ORDER BY valid_from DESC LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Backlog item not found: %', p_id;
    END IF;

    SELECT bi.item_type, bi.item_id, bi.rank, bi.sprint_label, bi.notes
    INTO c_item_type, c_item_id, c_rank, c_sprint_label, c_notes
    FROM backlog_items bi WHERE bi.version_id = current_version_id;

    UPDATE backlog_items
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO backlog_items (
        id, item_type, item_id, rank, sprint_label, notes, maintained_by,
        valid_from, valid_to, transaction_from, transaction_to
    ) VALUES (
        p_id,
        c_item_type,
        c_item_id,
        COALESCE(p_rank, c_rank),
        COALESCE(p_sprint_label, c_sprint_label),
        COALESCE(p_notes, c_notes),
        p_maintained_by,
        update_timestamp, 'infinity', update_timestamp, 'infinity'
    )
    RETURNING version_id INTO new_version_id;
    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- ---------- ITEM-DOCUMENT LINKS ----------

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

-- delete_item_document_link does not create a new version, so no maintained_by needed
-- (it closes the validity period of the existing row)

-- ---------- DOCUMENTS ----------

CREATE OR REPLACE FUNCTION insert_document_version(
    p_id UUID,
    p_title VARCHAR(255),
    p_content TEXT,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    INSERT INTO documents (id, title, content, maintained_by, valid_from, valid_to, transaction_from, transaction_to)
    VALUES (p_id, p_title, p_content, p_maintained_by, p_valid_from, 'infinity', p_valid_from, 'infinity')
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
BEGIN
    update_timestamp := COALESCE(p_valid_from, CURRENT_TIMESTAMP);

    SELECT version_id INTO current_version_id
    FROM current_documents
    WHERE id = p_id
    ORDER BY valid_from DESC
    LIMIT 1;

    IF current_version_id IS NULL THEN
        SELECT insert_document_version(p_id, p_title, p_content, update_timestamp, p_maintained_by) INTO new_version_id;
        RETURN new_version_id;
    END IF;

    IF p_title IS NULL OR p_content IS NULL THEN
        SELECT title, content INTO p_title, p_content
        FROM documents
        WHERE version_id = current_version_id;
    END IF;

    UPDATE documents
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO documents (id, title, content, maintained_by, valid_from, valid_to, transaction_from, transaction_to)
    VALUES (p_id, p_title, p_content, p_maintained_by, update_timestamp, 'infinity', update_timestamp, 'infinity')
    RETURNING version_id INTO new_version_id;

    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 4. Add index on maintained_by for audit queries
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_features_maintained_by ON features (maintained_by) WHERE maintained_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bugs_maintained_by ON bugs (maintained_by) WHERE maintained_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_maintained_by ON tasks (maintained_by) WHERE maintained_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_backlog_maintained_by ON backlog_items (maintained_by) WHERE maintained_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_links_maintained_by ON item_document_links (maintained_by) WHERE maintained_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_maintained_by ON documents (maintained_by) WHERE maintained_by IS NOT NULL;
