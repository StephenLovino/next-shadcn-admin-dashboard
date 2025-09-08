-- Create dashboard_access table for role-based permissions
CREATE TABLE IF NOT EXISTS dashboard_access (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'viewer')),
  tab_name TEXT NOT NULL,
  can_access BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(role, tab_name)
);

-- Enable RLS
ALTER TABLE dashboard_access ENABLE ROW LEVEL SECURITY;

-- Create policy for reading dashboard access
CREATE POLICY "Anyone can read dashboard access" ON dashboard_access
  FOR SELECT USING (true);

-- Insert default permissions for each role
INSERT INTO dashboard_access (role, tab_name, can_access) VALUES
-- Owner has access to everything
('owner', 'rewards', true),
('owner', 'academy', true),
('owner', 'finance', true),
('owner', 'billing', true),
('owner', 'crm', true),
('owner', 'analytics', true),
('owner', 'settings', true),
('owner', 'default', true),
('owner', 'ecommerce', true),
('owner', 'logistics', true),
('owner', 'email', true),
('owner', 'chat', true),
('owner', 'calendar', true),
('owner', 'kanban', true),
('owner', 'invoice', true),
('owner', 'users', true),
('owner', 'roles', true),
('owner', 'authentication', true),

-- Admin has most access except sensitive areas
('admin', 'rewards', true),
('admin', 'academy', true),
('admin', 'finance', true),
('admin', 'crm', true),
('admin', 'analytics', true),
('admin', 'default', true),
('admin', 'ecommerce', true),
('admin', 'logistics', true),
('admin', 'email', true),
('admin', 'chat', true),
('admin', 'calendar', true),
('admin', 'kanban', true),
('admin', 'invoice', true),
('admin', 'users', true),
('admin', 'billing', false),
('admin', 'settings', false),
('admin', 'roles', false),
('admin', 'authentication', false),

-- Manager has limited access
('manager', 'rewards', true),
('manager', 'academy', true),
('manager', 'crm', true),
('manager', 'default', true),
('manager', 'email', true),
('manager', 'chat', true),
('manager', 'calendar', true),
('manager', 'kanban', true),
('manager', 'finance', false),
('manager', 'billing', false),
('manager', 'analytics', false),
('manager', 'settings', false),
('manager', 'ecommerce', false),
('manager', 'logistics', false),
('manager', 'invoice', false),
('manager', 'users', false),
('manager', 'roles', false),
('manager', 'authentication', false),

-- Viewer has read-only access to basic features
('viewer', 'rewards', true),
('viewer', 'academy', true),
('viewer', 'crm', true),
('viewer', 'default', true),
('viewer', 'finance', false),
('viewer', 'billing', false),
('viewer', 'analytics', false),
('viewer', 'settings', false),
('viewer', 'ecommerce', false),
('viewer', 'logistics', false),
('viewer', 'email', false),
('viewer', 'chat', false),
('viewer', 'calendar', false),
('viewer', 'kanban', false),
('viewer', 'invoice', false),
('viewer', 'users', false),
('viewer', 'roles', false),
('viewer', 'authentication', false);

-- Create trigger for updated_at
CREATE TRIGGER trigger_update_dashboard_access_updated_at
  BEFORE UPDATE ON dashboard_access
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();



