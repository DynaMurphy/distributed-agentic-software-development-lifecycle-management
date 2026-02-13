-- Enable the periods extension for bitemporal support
CREATE EXTENSION IF NOT EXISTS periods;

-- Table for storing documents with bitemporal support using periods extension
CREATE TABLE IF NOT EXISTS documents (
    id UUID NOT NULL, -- Business key, not unique by itself
    version_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Surrogate key for each version
    title VARCHAR(255) NOT NULL,
    content TEXT, -- Storing SFDT (rich text) or relevant content
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP, -- When this version became valid in the real world
    valid_to TIMESTAMP WITH TIME ZONE DEFAULT 'infinity' -- When this version ceased to be valid (infinity if current)
);

-- Add periods using the extension functions
SELECT periods.add_period('documents', 'validity', 'valid_from', 'valid_to');
SELECT periods.add_system_time_period('documents', 'transaction_from', 'transaction_to');

-- Add unique constraint to prevent overlapping valid periods for the same document
SELECT periods.add_unique_key('documents', ARRAY['id'], 'validity');

-- Create a view for current documents (latest transaction time)
CREATE OR REPLACE VIEW current_documents AS
SELECT id, title, content, valid_from, valid_to
FROM documents
WHERE transaction_to = 'infinity';

-- Function to insert a new document version
CREATE OR REPLACE FUNCTION insert_document_version(
    p_id UUID,
    p_title VARCHAR(255),
    p_content TEXT,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) RETURNS UUID AS $$
DECLARE
    new_version_id UUID;
BEGIN
    -- For new documents (no existing versions), just insert
    -- For updates, the periods extension will handle closing the previous transaction period
    INSERT INTO documents (id, title, content, valid_from, valid_to, transaction_from, transaction_to)
    VALUES (p_id, p_title, p_content, p_valid_from, 'infinity', p_valid_from, 'infinity')
    RETURNING version_id INTO new_version_id;

    RETURN new_version_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update an existing document (creates new version)
CREATE OR REPLACE FUNCTION update_document_version(
    p_id UUID,
    p_title VARCHAR(255) DEFAULT NULL,
    p_content TEXT DEFAULT NULL,
    p_valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
) RETURNS UUID AS $$
DECLARE
    current_version_id UUID;
    update_timestamp TIMESTAMP WITH TIME ZONE;
    new_version_id UUID;
BEGIN
    -- Use a consistent timestamp for this update
    update_timestamp := p_valid_from;

    -- Get current version
    SELECT version_id INTO current_version_id
    FROM current_documents
    WHERE id = p_id
    ORDER BY valid_from DESC
    LIMIT 1;

    IF current_version_id IS NULL THEN
        -- No existing document, insert new one
        SELECT insert_document_version(p_id, p_title, p_content, update_timestamp) INTO new_version_id;
        RETURN new_version_id;
    END IF;

    -- Get current values if not provided
    IF p_title IS NULL OR p_content IS NULL THEN
        SELECT title, content INTO p_title, p_content
        FROM documents
        WHERE version_id = current_version_id;
    END IF;

    -- Update the current version to end its validity period at the update time
    UPDATE documents
    SET valid_to = update_timestamp, transaction_to = update_timestamp
    WHERE version_id = current_version_id AND valid_to = 'infinity';

    -- Insert new version starting from the update time
    INSERT INTO documents (id, title, content, valid_from, valid_to, transaction_from, transaction_to)
    VALUES (p_id, p_title, p_content, update_timestamp, 'infinity', update_timestamp, 'infinity')
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
