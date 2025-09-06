-- Add additional status fields to customers table
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS has_active_subscription BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_canceled_subscription BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_trialing_subscription BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_card BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS card_status TEXT DEFAULT 'No Card',
ADD COLUMN IF NOT EXISTS failed_payment_count INTEGER DEFAULT 0;
