#!/bin/bash
# Seed Supabase local (splm schema) from local PostgreSQL (public schema)
# Source: postgresql://Murphy:@localhost:5432/spec_docs (public)
# Target: postgresql://postgres:postgres@127.0.0.1:54322/postgres (splm)

set -euo pipefail

SOURCE="postgresql://Murphy:@localhost:5432/spec_docs"
TARGET="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

# Tables in dependency order (User first, then tables without FK deps, then dependents)
TABLES=(
  "repositories"
  "products"
  "documents"
  "features"
  "bugs"
  "tasks"
  "backlog_items"
  "item_document_links"
  "capabilities"
  "capability_items"
  "milestones"
  "milestone_items"
)

echo "=== Seeding Supabase splm schema from local PostgreSQL ==="

# Clear existing data in reverse dependency order
echo "Clearing existing data in splm schema..."
psql "$TARGET" -c "
  SET search_path TO splm;
  TRUNCATE milestone_items CASCADE;
  TRUNCATE milestones CASCADE;
  TRUNCATE capability_items CASCADE;
  TRUNCATE capabilities CASCADE;
  TRUNCATE item_document_links CASCADE;
  TRUNCATE backlog_items CASCADE;
  TRUNCATE tasks CASCADE;
  TRUNCATE bugs CASCADE;
  TRUNCATE features CASCADE;
  TRUNCATE documents CASCADE;
  TRUNCATE products CASCADE;
  TRUNCATE repositories CASCADE;
  TRUNCATE \"User\" CASCADE;
"

# Step 1: Drop all FK constraints (Supabase won't let us disable system triggers)
echo ""
echo "--- Dropping FK constraints for bulk load ---"
FK_DROP_SQL=$(psql "$TARGET" -t -A -c "
  SELECT 'ALTER TABLE splm.' || quote_ident(tc.table_name) || ' DROP CONSTRAINT ' || quote_ident(tc.constraint_name) || ';'
  FROM information_schema.table_constraints tc
  WHERE tc.table_schema = 'splm' AND tc.constraint_type = 'FOREIGN KEY';
")
if [ -n "$FK_DROP_SQL" ]; then
  echo "$FK_DROP_SQL"
  psql "$TARGET" -c "$FK_DROP_SQL"
fi

# Step 2: Seed User table first (all other tables reference it via maintained_by)
echo ""
echo "--- Seeding splm.User ---"
TMPFILE="/tmp/splm_seed_User.csv"

# Get common columns between source and target User tables
SOURCE_USER_COLS=$(psql "$SOURCE" -t -A -c "
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'User';
")
TARGET_USER_COLS=$(psql "$TARGET" -t -A -c "
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  FROM information_schema.columns
  WHERE table_schema = 'splm' AND table_name = 'User';
")
USER_COMMON_COLS=$(comm -12 \
  <(echo "$SOURCE_USER_COLS" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort) \
  <(echo "$TARGET_USER_COLS" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort) \
  | paste -sd ',' -)

echo "  Columns: $USER_COMMON_COLS"
psql "$SOURCE" -c "\COPY (SELECT $USER_COMMON_COLS FROM public.\"User\") TO '$TMPFILE' WITH (FORMAT csv, HEADER true, NULL '')"
USER_COUNT=$(( $(wc -l < "$TMPFILE" | tr -d ' ') - 1 ))
echo "  Exported $USER_COUNT users"
psql "$TARGET" -c "\COPY splm.\"User\"($USER_COMMON_COLS) FROM '$TMPFILE' WITH (FORMAT csv, HEADER true, NULL '')"
echo "  Imported $USER_COUNT users into splm.User"
rm -f "$TMPFILE"

# Step 3: Seed all SPLM tables (with exclusion constraints temporarily dropped)
for TABLE in "${TABLES[@]}"; do
  echo ""
  echo "--- Seeding splm.$TABLE ---"
  
  # Get column list from source (public schema)
  COLS=$(psql "$SOURCE" -t -A -c "
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = '$TABLE';
  ")
  
  # Get column list from target (splm schema) 
  TARGET_COLS=$(psql "$TARGET" -t -A -c "
    SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'splm' AND table_name = '$TABLE';
  ")
  
  # Find common columns (intersection)
  COMMON_COLS=$(comm -12 \
    <(echo "$COLS" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort) \
    <(echo "$TARGET_COLS" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort) \
    | paste -sd ',' -)
  
  if [ -z "$COMMON_COLS" ]; then
    echo "  WARNING: No common columns found, skipping $TABLE"
    continue
  fi
  
  echo "  Columns: $COMMON_COLS"
  
  TMPFILE="/tmp/splm_seed_${TABLE}.csv"
  
  psql "$SOURCE" -c "\COPY (SELECT $COMMON_COLS FROM public.\"$TABLE\") TO '$TMPFILE' WITH (FORMAT csv, HEADER true, NULL '')"
  
  ROW_COUNT=$(( $(wc -l < "$TMPFILE" | tr -d ' ') - 1 ))
  echo "  Exported $ROW_COUNT rows"
  
  if [ "$ROW_COUNT" -gt 0 ]; then
    # Drop exclusion constraint for bulk load
    CONSTRAINT_NAME="${TABLE}_no_overlap"
    psql "$TARGET" -c "ALTER TABLE splm.\"$TABLE\" DROP CONSTRAINT IF EXISTS \"$CONSTRAINT_NAME\";" 2>/dev/null || true
    
    psql "$TARGET" -c "\COPY splm.\"$TABLE\"($COMMON_COLS) FROM '$TMPFILE' WITH (FORMAT csv, HEADER true, NULL '')"
    
    # Re-add exclusion constraint (skip for milestone_items — non-bitemporal)
    if [ "$TABLE" != "milestone_items" ]; then
      psql "$TARGET" -c "ALTER TABLE splm.\"$TABLE\" ADD CONSTRAINT \"$CONSTRAINT_NAME\" EXCLUDE USING gist (id WITH =, tstzrange(valid_from, valid_to) WITH &&);" 2>/dev/null || true
    fi
    echo "  Imported $ROW_COUNT rows into splm.$TABLE"
  else
    echo "  No data to import"
  fi
  
  rm -f "$TMPFILE"
done

# Step 4: Re-add FK constraints
echo ""
echo "--- Re-adding FK constraints ---"
psql "$TARGET" -c "
  SET search_path TO splm;
  ALTER TABLE documents ADD CONSTRAINT documents_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE features ADD CONSTRAINT features_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE bugs ADD CONSTRAINT bugs_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE tasks ADD CONSTRAINT tasks_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE backlog_items ADD CONSTRAINT backlog_items_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE item_document_links ADD CONSTRAINT item_document_links_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE capabilities ADD CONSTRAINT capabilities_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE capability_items ADD CONSTRAINT capability_items_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE repositories ADD CONSTRAINT repositories_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE milestones ADD CONSTRAINT milestones_maintained_by_fkey FOREIGN KEY (maintained_by) REFERENCES splm.\"User\"(id);
  ALTER TABLE milestone_items ADD CONSTRAINT milestone_items_added_by_fkey FOREIGN KEY (added_by) REFERENCES splm.\"User\"(id);
"

echo ""
echo "=== Verifying row counts ==="
psql "$TARGET" -c "
  SET search_path TO splm;
  SELECT 'User' as tbl, count(*) FROM \"User\"
  UNION ALL SELECT 'repositories', count(*) FROM repositories
  UNION ALL SELECT 'products', count(*) FROM products
  UNION ALL SELECT 'documents', count(*) FROM documents
  UNION ALL SELECT 'features', count(*) FROM features
  UNION ALL SELECT 'bugs', count(*) FROM bugs
  UNION ALL SELECT 'tasks', count(*) FROM tasks
  UNION ALL SELECT 'backlog_items', count(*) FROM backlog_items
  UNION ALL SELECT 'item_document_links', count(*) FROM item_document_links
  UNION ALL SELECT 'capabilities', count(*) FROM capabilities
  UNION ALL SELECT 'capability_items', count(*) FROM capability_items
  UNION ALL SELECT 'milestones', count(*) FROM milestones
  UNION ALL SELECT 'milestone_items', count(*) FROM milestone_items
  ORDER BY tbl;
"

echo ""
echo "=== Seed complete ==="
