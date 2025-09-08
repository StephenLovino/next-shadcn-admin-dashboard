-- Add subscription plan field to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS subscription_plan TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS subscription_plan_id TEXT;

-- Create index for faster plan lookups
CREATE INDEX IF NOT EXISTS idx_customers_subscription_plan ON customers(subscription_plan);
