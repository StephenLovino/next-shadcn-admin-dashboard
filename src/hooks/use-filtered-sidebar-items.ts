import { useMemo } from 'react';
import { sidebarItems } from '@/navigation/sidebar/sidebar-items';
import { useUserPermissions } from './use-user-permissions';

export function useFilteredSidebarItems() {
  const { permissions, loading } = useUserPermissions();

  const filteredItems = useMemo(() => {
    console.log('🔄 Filtering sidebar items...');
    console.log('📊 Current permissions:', permissions);
    console.log('⏳ Loading state:', loading);
    
    if (loading || !permissions) {
      console.log('⏳ Still loading or no permissions, showing all items');
      return sidebarItems; // Show all items while loading
    }

    const filtered = sidebarItems.map(group => ({
      ...group,
      items: group.items.filter(item => {
        // Check permissions first, regardless of comingSoon status
        let hasPermission = false;
        switch (item.title.toLowerCase()) {
          case 'default':
            hasPermission = permissions.canAccessDefault;
            break;
          case 'rewards':
            hasPermission = permissions.canAccessRewards;
            break;
          case 'academy':
            hasPermission = permissions.canAccessAcademy;
            break;
          case 'finance':
            hasPermission = permissions.canAccessFinance;
            break;
          case 'billing':
            hasPermission = permissions.canAccessBilling;
            break;
          case 'crm':
            hasPermission = permissions.canAccessCRM;
            break;
          case 'analytics':
            hasPermission = permissions.canAccessAnalytics;
            break;
          case 'e-commerce':
            hasPermission = permissions.canAccessEcommerce;
            break;
          case 'logistics':
            hasPermission = permissions.canAccessLogistics;
            break;
          case 'email':
            hasPermission = permissions.canAccessEmail;
            break;
          case 'chat':
            hasPermission = permissions.canAccessChat;
            break;
          case 'calendar':
            hasPermission = permissions.canAccessCalendar;
            break;
          case 'kanban':
            hasPermission = permissions.canAccessKanban;
            break;
          case 'invoice':
            hasPermission = permissions.canAccessInvoice;
            break;
          case 'users':
            hasPermission = permissions.canAccessUsers;
            break;
          case 'roles':
            hasPermission = permissions.canAccessRoles;
            break;
          case 'authentication':
            hasPermission = permissions.canAccessAuthentication;
            break;
          case 'others':
            hasPermission = permissions.canAccessOthers;
            break;
          case 'settings':
            hasPermission = permissions.canAccessSettings;
            break;
          default:
            // For any other items not explicitly defined, deny access
            hasPermission = false;
            break;
        }

        // Only show items that user has permission for
        if (!hasPermission) {
          console.log(`❌ Hiding ${item.title} (no permission)`);
          return false;
        }

        // If user has permission, show the item (even if comingSoon)
        if (item.comingSoon) {
          console.log(`✅ Showing ${item.title} (comingSoon + has permission)`);
        } else {
          console.log(`✅ Showing ${item.title} (has permission)`);
        }
        
        return true;
      })
    })).filter(group => group.items.length > 0); // Remove empty groups

    console.log('🎯 Final filtered items:', filtered);
    return filtered;
  }, [permissions, loading]);

  return {
    filteredItems,
    loading,
    userRole: permissions?.role || 'unknown'
  };
} 