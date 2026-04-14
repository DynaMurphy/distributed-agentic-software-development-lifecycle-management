-- Migration: Add document hierarchy (parent_id + sort_order)
-- Date: 2026-04-13

-- 1. Add columns to documents table
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_id UUID NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- 2. Update the current_documents view to include new columns
DROP VIEW IF EXISTS current_documents CASCADE;
CREATE VIEW current_documents AS
SELECT id, version_id, title, content, maintained_by, valid_from, valid_to, parent_id, sort_order
FROM documents
WHERE transaction_to = 'infinity';

-- 3. Replace insert_document_version to accept parent_id and sort_order
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

-- 4. Replace update_document_version to preserve hierarchy fields
-- parent_id and sort_order are always carried forward from the current version.
-- To change them, use the new update_document_metadata function or pass them via app layer.
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

    -- Get current version with hierarchy fields
    SELECT version_id, parent_id, sort_order
    INTO current_version_id, cur_parent_id, cur_sort_order
    FROM current_documents
    WHERE id = p_id
    ORDER BY valid_from DESC
    LIMIT 1;

    IF current_version_id IS NULL THEN
        SELECT insert_document_version(p_id, p_title, p_content, update_timestamp, p_maintained_by, NULL, 0)
        INTO new_version_id;
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

    INSERT INTO documents (id, title, content, maintained_by, valid_from, valid_to, transaction_from, transaction_to, parent_id, sort_order)
    VALUES (p_id, p_title, p_content, p_maintained_by, update_timestamp, 'infinity', update_timestamp, 'infinity', cur_parent_id, cur_sort_order)
    RETURNING version_id INTO new_version_id;

    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- 4b. New function to update document metadata (parent_id, sort_order, title) without changing content
CREATE OR REPLACE FUNCTION update_document_metadata(
    p_id UUID,
    p_title VARCHAR(255) DEFAULT NULL,
    p_parent_id UUID DEFAULT NULL,
    p_sort_order INTEGER DEFAULT NULL,
    p_maintained_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
    cur_title VARCHAR(255);
    cur_content TEXT;
    cur_parent_id UUID;
    cur_sort_order INTEGER;
BEGIN
    update_timestamp := CURRENT_TIMESTAMP;

    SELECT version_id, title, content, parent_id, sort_order
    INTO current_version_id, cur_title, cur_content, cur_parent_id, cur_sort_order
    FROM current_documents
    WHERE id = p_id
    ORDER BY valid_from DESC
    LIMIT 1;

    IF current_version_id IS NULL THEN
        RAISE EXCEPTION 'Document % not found', p_id;
    END IF;

    UPDATE documents
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    INSERT INTO documents (id, title, content, maintained_by, valid_from, valid_to, transaction_from, transaction_to, parent_id, sort_order)
    VALUES (
        p_id,
        COALESCE(p_title, cur_title),
        cur_content,
        p_maintained_by,
        update_timestamp, 'infinity', update_timestamp, 'infinity',
        COALESCE(p_parent_id, cur_parent_id),
        COALESCE(p_sort_order, cur_sort_order)
    )
    RETURNING version_id INTO new_version_id;

    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Backfill: Set parent_id and sort_order for existing vision sub-documents
UPDATE documents SET parent_id = '905bd31a-0cd3-4c80-a400-914b31d5cf5c', sort_order = 1 WHERE id = '10000001-0000-4000-8000-000000000001';
UPDATE documents SET parent_id = '905bd31a-0cd3-4c80-a400-914b31d5cf5c', sort_order = 2 WHERE id = '10000002-0000-4000-8000-000000000002';
UPDATE documents SET parent_id = '905bd31a-0cd3-4c80-a400-914b31d5cf5c', sort_order = 3 WHERE id = '10000003-0000-4000-8000-000000000003';
UPDATE documents SET parent_id = '905bd31a-0cd3-4c80-a400-914b31d5cf5c', sort_order = 4 WHERE id = '10000004-0000-4000-8000-000000000004';
UPDATE documents SET parent_id = '905bd31a-0cd3-4c80-a400-914b31d5cf5c', sort_order = 5 WHERE id = '10000005-0000-4000-8000-000000000005';
UPDATE documents SET parent_id = '905bd31a-0cd3-4c80-a400-914b31d5cf5c', sort_order = 6 WHERE id = '10000006-0000-4000-8000-000000000006';
