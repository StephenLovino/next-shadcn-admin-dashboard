-- Create customers table to store Stripe customer data
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_customer_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  address JSONB,
  metadata JSONB,
  subscription_status TEXT,
  subscription_id TEXT,
  current_period_end TIMESTAMP WITH TIME ZONE,
  payment_count INTEGER DEFAULT 0,
  total_paid BIGINT DEFAULT 0,
  last_payment_date TIMESTAMP WITH TIME ZONE,
  loyalty_progress INTEGER DEFAULT 0,
  has_active_subscription BOOLEAN DEFAULT FALSE,
  has_canceled_subscription BOOLEAN DEFAULT FALSE,
  has_trialing_subscription BOOLEAN DEFAULT FALSE,
  has_card BOOLEAN DEFAULT FALSE,
  card_status TEXT DEFAULT 'No Card',
  failed_payment_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_customers_stripe_id ON customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_subscription_status ON customers(subscription_status);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_update_customers_updated_at') THEN
    CREATE TRIGGER trigger_update_customers_updated_at
      BEFORE UPDATE ON customers
      FOR EACH ROW
      EXECUTE FUNCTION update_customers_updated_at();
  END IF;
END $$;
