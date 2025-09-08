-- Add GHL integration tracking fields to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS ghl_contact_id VARCHAR,
ADD COLUMN IF NOT EXISTS ghl_sync_status VARCHAR DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS ghl_last_synced_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS ghl_tags TEXT[] DEFAULT '{}';

-- Create index for GHL contact ID lookups
CREATE INDEX IF NOT EXISTS idx_customers_ghl_contact_id ON customers(ghl_contact_id);

-- Create index for GHL sync status
CREATE INDEX IF NOT EXISTS idx_customers_ghl_sync_status ON customers(ghl_sync_status);

-- Add comment to explain the sync status values
COMMENT ON COLUMN customers.ghl_sync_status IS 'Status of GHL sync: pending, synced, error, not_found';
COMMENT ON COLUMN customers.ghl_tags IS 'Array of tags applied to the contact in GHL';
COMMENT ON COLUMN customers.ghl_contact_id IS 'GHL contact ID for this customer';
COMMENT ON COLUMN customers.ghl_last_synced_at IS 'Last time this customer was synced with GHL';
