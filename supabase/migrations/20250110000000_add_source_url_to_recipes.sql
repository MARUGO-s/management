-- Add source_url column to recipes table
ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Add comment to the column
COMMENT ON COLUMN recipes.source_url IS 'URL取り込み時の参考URL';

-- Create index for better performance when filtering by source_url
CREATE INDEX IF NOT EXISTS idx_recipes_source_url ON recipes(source_url) WHERE source_url IS NOT NULL;
