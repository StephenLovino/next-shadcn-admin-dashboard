import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { supabase } from '@/lib/supabase';

export interface UserPermissions {
  role: string;
  fullName: string; // Added to fetch user's full name
  email: string; // Added to fetch user's email
  canAccessRewards: boolean;
  canAccessAcademy: boolean;
  canAccessFinance: boolean;
  canAccessBilling: boolean;
  canAccessCRM: boolean;
  canAccessAnalytics: boolean;
  canAccessSettings: boolean;
  // Add missing permissions for all tabs
  canAccessDefault: boolean;
  canAccessEcommerce: boolean;
  canAccessLogistics: boolean;
  canAccessEmail: boolean;
  canAccessChat: boolean;
  canAccessCalendar: boolean;
  canAccessKanban: boolean;
  canAccessInvoice: boolean;
  canAccessUsers: boolean;
  canAccessRoles: boolean;
  canAccessAuthentication: boolean;
  canAccessOthers: boolean;
}

export function useUserPermissions() {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setPermissions(null);
      setLoading(false);
      return;
    }

    const fetchPermissions = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log('🔍 Fetching permissions for user:', user.email);

        // Fetch user profile to get role
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, full_name, email')
          .eq('id', user.id)
          .single();

        if (profileError) {
          throw new Error(`Failed to fetch profile: ${profileError.message}`);
        }

        console.log('👤 User profile role:', profile.role);

        // Fetch dashboard access permissions for the user's role
        const { data: accessData, error: accessError } = await supabase
          .from('dashboard_access')
          .select('tab_name, can_access')
          .eq('role', profile.role);

        if (accessError) {
          throw new Error(`Failed to fetch dashboard access: ${accessError.message}`);
        }

        console.log('🔐 Dashboard access data:', accessData);

        // Convert access data to permissions object
        const accessMap = new Map(
          accessData.map(item => [item.tab_name, item.can_access])
        );

        const userPermissions: UserPermissions = {
          role: profile.role,
          fullName: profile.full_name,
          email: profile.email,
          canAccessRewards: accessMap.get('rewards') ?? false,
          canAccessAcademy: accessMap.get('academy') ?? false,
          canAccessFinance: accessMap.get('finance') ?? false,
          canAccessBilling: accessMap.get('billing') ?? false,
          canAccessCRM: accessMap.get('crm') ?? false,
          canAccessAnalytics: accessMap.get('analytics') ?? false,
          canAccessSettings: accessMap.get('settings') ?? false,
          // Add missing permissions for all tabs
          canAccessDefault: accessMap.get('default') ?? false,
          canAccessEcommerce: accessMap.get('ecommerce') ?? false,
          canAccessLogistics: accessMap.get('logistics') ?? false,
          canAccessEmail: accessMap.get('email') ?? false,
          canAccessChat: accessMap.get('chat') ?? false,
          canAccessCalendar: accessMap.get('calendar') ?? false,
          canAccessKanban: accessMap.get('kanban') ?? false,
          canAccessInvoice: accessMap.get('invoice') ?? false,
          canAccessUsers: accessMap.get('users') ?? false,
          canAccessRoles: accessMap.get('roles') ?? false,
          canAccessAuthentication: accessMap.get('authentication') ?? false,
          canAccessOthers: accessMap.get('others') ?? false,
        };

        console.log('✅ Final user permissions:', userPermissions);
        setPermissions(userPermissions);
      } catch (err) {
        console.error('❌ Error fetching user permissions:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        
        // Fallback to default user permissions if there's an error
        const fallbackPermissions = {
          role: 'user',
          fullName: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Guest User',
          email: user?.email || 'guest@example.com',
          canAccessRewards: true,
          canAccessAcademy: true,
          canAccessFinance: true,
          canAccessBilling: true,
          canAccessCRM: false,
          canAccessAnalytics: false,
          canAccessSettings: false,
          // Add missing permissions for all tabs
          canAccessDefault: true,
          canAccessEcommerce: false,
          canAccessLogistics: false,
          canAccessEmail: false,
          canAccessChat: false,
          canAccessCalendar: false,
          canAccessKanban: false,
          canAccessInvoice: false,
          canAccessUsers: false,
          canAccessRoles: false,
          canAccessAuthentication: false,
          canAccessOthers: false,
        };
        console.log('🔄 Using fallback permissions:', fallbackPermissions);
        setPermissions(fallbackPermissions);
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [user]);

  return { permissions, loading, error };
} 