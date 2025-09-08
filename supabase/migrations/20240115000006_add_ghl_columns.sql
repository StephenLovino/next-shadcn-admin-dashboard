-- Add GHL integration columns to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ghl_sync_status TEXT DEFAULT 'not_synced';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ghl_last_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS ghl_tags TEXT[] DEFAULT '{}';

-- Create indexes for GHL lookups
CREATE INDEX IF NOT EXISTS idx_customers_ghl_contact_id ON customers(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_customers_ghl_sync_status ON customers(ghl_sync_status);
