-- Enable the periods extension for bitemporal support
CREATE EXTENSION IF NOT EXISTS periods;

-- Table for storing documents with bitemporal support using periods extension
CREATE TABLE IF NOT EXISTS documents (
    id UUID NOT NULL, -- Business key, not unique by itself
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Surrogate key for each version
    title VARCHAR(255) NOT NULL,
    content TEXT, -- Storing SFDT (rich text) or relevant content
    maintained_by UUID REFERENCES "User"(id),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- When this version became valid in the real world
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity', -- When this version ceased to be valid (infinity if current)
    parent_id UUID NULL, -- Business-key ref to parent document (1-level hierarchy)
    sort_order INTEGER NOT NULL DEFAULT 0 -- Ordering within parent (0-based)
);

-- Add periods using the extension functions
SELECT periods.add_period('documents', 'validity', 'valid_from', 'valid_to');
SELECT periods.add_system_time_period('documents', 'transaction_from', 'transaction_to');

-- Add unique constraint to prevent overlapping valid periods for the same document
SELECT periods.add_unique_key('documents', ARRAY['id'], 'validity');

-- Create a view for current documents (latest transaction time)
CREATE OR REPLACE VIEW current_documents AS
SELECT id, version_id, title, content, maintained_by, valid_from, valid_to, parent_id, sort_order
FROM documents
WHERE transaction_to = 'infinity';

-- Function to insert a new document version
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

-- Function to update an existing document (creates new version)
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
    FROM current_documents
    WHERE id = p_id
    ORDER BY valid_from DESC
    LIMIT 1;

    IF current_version_id IS NULL THEN
        SELECT insert_document_version(p_id, p_title, p_content, update_timestamp, p_maintained_by, NULL, 0) INTO new_version_id;
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

-- Function to update document metadata (parent_id, sort_order, title) without changing content
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

-- Optional: Insert a sample document if table is empty
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM current_documents) THEN
        PERFORM insert_document_version(
            gen_random_uuid(),
            'Sample Specification',
            '{"sections": [{"sectionFormat": {"pageWidth": 612, "pageHeight": 792, "leftMargin": 72, "rightMargin": 72, "topMargin": 72, "bottomMargin": 72, "differentFirstPage": false, "differentOddAndEvenPages": false, "headerDistance": 36, "footerDistance": 36, "bidi": false}, "blocks": [{"paragraphFormat": {"leftIndent": 0, "rightIndent": 0, "firstLineIndent": 0, "beforeSpacing": 0, "afterSpacing": 8, "lineSpacing": 1.0791666507720947, "lineSpacingType": "Multiple", "textAlignment": "Left", "bidi": false, "styleName": "Normal"}, "characterFormat": {"bold": false, "italic": false, "fontSize": 11, "fontFamily": "Calibri", "underline": "None", "strikethrough": "None", "baselineAlignment": "Normal", "highlightColor": "NoColor", "fontColor": "#000000", "bidi": false, "styleName": "Default Paragraph Font"}, "inlines": []}], "headersFooters": {}}], "characterFormat": {"bold": false, "italic": false, "fontSize": 11, "fontFamily": "Calibri", "underline": "None", "strikethrough": "None", "baselineAlignment": "Normal", "highlightColor": "NoColor", "fontColor": "#000000", "bidi": false}, "paragraphFormat": {"leftIndent": 0, "rightIndent": 0, "firstLineIndent": 0, "beforeSpacing": 0, "afterSpacing": 8, "lineSpacing": 1.0791666507720947, "lineSpacingType": "Multiple", "textAlignment": "Left", "bidi": false}, "styles": [{"name": "Normal", "type": "Paragraph", "paragraphFormat": {"leftIndent": 0, "rightIndent": 0, "firstLineIndent": 0, "beforeSpacing": 0, "afterSpacing": 8, "lineSpacing": 1.0791666507720947, "lineSpacingType": "Multiple", "textAlignment": "Left", "bidi": false, "styleName": "Normal"}, "characterFormat": {"bold": false, "italic": false, "fontSize": 11, "fontFamily": "Calibri", "underline": "None", "strikethrough": "None", "baselineAlignment": "Normal", "highlightColor": "NoColor", "fontColor": "#000000", "bidi": false, "styleName": "Default Paragraph Font"}, "next": "Normal"}, {"name": "Default Paragraph Font", "type": "Character", "characterFormat": {"bold": false, "italic": false, "fontSize": 11, "fontFamily": "Calibri", "underline": "None", "strikethrough": "None", "baselineAlignment": "Normal", "highlightColor": "NoColor", "fontColor": "#000000", "bidi": false}}], "lists": [], "abstractLists": [], "comments": [], "revisions": [], "customXml": []}'::text
        );
    END IF;
END $$;
