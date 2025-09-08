"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUserPermissions } from "@/hooks/use-user-permissions";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { addUser, deleteUser, InternalUser } from "@/data/users";
import { Plus, Edit, Trash2, UserCheck, UserX, Clock, Users, UserPlus, RefreshCw, Pause, Play, CheckCircle, AlertCircle, Search, Filter, Download, X, ArrowUpDown, ArrowUp, ArrowDown, ExternalLink, Tag, Zap } from "lucide-react";

interface CustomerData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  stripe_customer_id: string | null;
  subscription_status: string | null;
  subscription_plan: string | null;
  subscription_plan_id: string | null;
  payment_count: number;
  loyalty_progress: number;
  last_payment_date: string | null;
  total_paid: number;
  created_at: string;
  updated_at: string;
  card_status?: string;
  ghl_contact_id?: string | null;
  ghl_sync_status?: string;
  ghl_last_synced_at?: string | null;
  ghl_tags?: string[];
}

interface GHLTag {
  id: string;
  name: string;
  color: string;
}

interface GHLSyncResult {
  matched: number;
  updated: number;
  errors: number;
  total: number;
  details: {
    contactId: string;
    email: string;
    status: 'matched' | 'updated' | 'error';
    message?: string;
  }[];
}

export default function UsersPage() {
  const { permissions } = useUserPermissions();
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<CustomerData[]>([]);
  const [teamMembers, setTeamMembers] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerGhlData, setCustomerGhlData] = useState<Record<string, { tags: string[], contactId: string | null }>>({});
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [subscriptionFilter, setSubscriptionFilter] = useState('all');
  const [loyaltyFilter, setLoyaltyFilter] = useState('all');
  const [cardStatusFilter, setCardStatusFilter] = useState('all');
  const [planFilter, setPlanFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCustomerCount, setTotalCustomerCount] = useState(0);
  
  // Active tab state with localStorage persistence
  const [activeTab, setActiveTab] = useState(() => {
    // Get the saved tab from localStorage, default to 'team' if not found
    if (typeof window !== 'undefined') {
      return localStorage.getItem('users-page-active-tab') || 'team';
    }
    return 'team';
  });
  
  // Sorting states
  const [sortField, setSortField] = useState<keyof CustomerData | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  
  // GHL integration states
  const [ghlConnected, setGhlConnected] = useState(false);
  const [ghlTags, setGhlTags] = useState<GHLTag[]>([]);
  const [ghlSyncing, setGhlSyncing] = useState(false);
  const [ghlSyncResult, setGhlSyncResult] = useState<GHLSyncResult | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [showGhlPanel, setShowGhlPanel] = useState(false);
  
  // Customer detail states
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerData | null>(null);
  const [customerGhlTags, setCustomerGhlTags] = useState<string[]>([]);
  const [loadingGhlTags, setLoadingGhlTags] = useState(false);
  const [showCustomerDetails, setShowCustomerDetails] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState({
    current: 0,
    total: 0,
    status: '',
    isPaused: false
  });
  const [syncStartTime, setSyncStartTime] = useState<Date | null>(null);
  const [syncNotification, setSyncNotification] = useState<{
    show: boolean;
    type: 'success' | 'error' | 'info';
    message: string;
  }>({
    show: false,
    type: 'info',
    message: ''
  });
  
  // Team management states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<InternalUser | null>(null);
  const [newUser, setNewUser] = useState({
    name: "",
    username: "",
    email: "",
    role: "viewer" as InternalUser['role'],
    department: "",
    permissions: [] as string[],
    notes: ""
  });

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Starting customer fetch at:', new Date().toISOString());
      
      // First get the total count
      const { count, error: countError } = await supabase
        .from('customers')
        .select('*', { count: 'exact', head: true });

      if (countError) {
        console.error('Error getting customer count:', countError);
      } else {
        console.log('📊 Total customers in database:', count);
        setTotalCustomerCount(count || 0);
      }
      
      // Fetch customers from database (synced from Stripe) - fetch all rows using pagination
      let allCustomers: any[] = [];
      let from = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data: batch, error: batchError } = await supabase
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);
          
        if (batchError) {
          console.error('Error fetching customers batch:', batchError);
          break;
        }
        
        if (!batch || batch.length === 0) {
          break;
        }
        
        allCustomers = [...allCustomers, ...batch];
        console.log(`📊 Fetched batch ${Math.floor(from/batchSize) + 1}: ${batch.length} customers (total: ${allCustomers.length})`);
        from += batchSize;
        
        // If we got less than batchSize, we've reached the end
        if (batch.length < batchSize) {
          break;
        }
      }
      
      const customers = allCustomers;

      if (!customers || customers.length === 0) {
        console.error('No customers fetched, trying fallback');
        // Fallback to profiles if customers table doesn't exist yet
        await fetchCustomersFromProfiles();
        return;
      }

      console.log('📊 Final total customers fetched:', customers?.length);
      console.log('📊 Setting customers state with:', customers?.length, 'customers');
      setCustomers(customers || []);
      setFilteredCustomers(customers || []);
      console.log('📊 Customers state set, filteredCustomers will be:', customers?.length);
    } catch (error) {
      console.error('Error fetching customers:', error);
      await fetchCustomersFromProfiles();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (permissions?.role === 'owner' || permissions?.role === 'admin') {
      fetchCustomers();
      fetchTeamMembers();
      checkGhlConnection();
      fetchGhlTags();
    }
  }, [permissions, fetchCustomers]);

  // GHL data fetching is now manual only - no automatic fetching

  const fetchTeamMembers = async () => {
    try {
      // Fetch all profiles (Supabase users) for team management
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching team members:', error);
        return;
      }

      console.log('📊 Fetched profiles from database:', profiles);

      // Convert profiles to InternalUser format
      const teamMembersData: InternalUser[] = profiles.map((profile) => ({
        id: profile.id,
        name: profile.full_name || profile.email || 'Unknown',
        username: profile.email.split('@')[0],
        email: profile.email,
        role: profile.role as InternalUser['role'],
        status: 'active' as InternalUser['status'],
        department: 'General',
        permissions: profile.role === 'owner' ? ['all'] : ['view'],
        lastLogin: new Date().toISOString(),
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        notes: ''
      }));

      console.log('👥 Team members data:', teamMembersData);
      setTeamMembers(teamMembersData);
    } catch (error) {
      console.error('Error fetching team members:', error);
    }
  };


  const fetchCustomersFromProfiles = async () => {
    try {
      // Fallback: fetch from profiles table
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          role,
          stripe_customer_id,
          created_at
        `)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const customersWithData = await Promise.all(
        profiles.map(async (profile) => {
          let subscriptionStatus = 'No Subscription';
          let paymentCount = 0;
          let lastPaymentDate = null;
          let totalPaid = 0;

          if (profile.stripe_customer_id) {
            const { data: subscriptions } = await supabase
              .from('subscriptions')
              .select('id, status, current_period_end')
              .eq('stripe_customer_id', profile.stripe_customer_id)
              .maybeSingle();

            if (subscriptions) {
              subscriptionStatus = subscriptions.status;
              
              const { data: payments, count } = await supabase
                .from('payment_history')
                .select('amount, payment_date')
                .eq('subscription_id', subscriptions.id)
                .eq('status', 'succeeded');

              if (payments) {
                paymentCount = count || 0;
                totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
                if (payments.length > 0) {
                  lastPaymentDate = payments[0].payment_date;
                }
              }
            }
          }

          const loyaltyProgress = Math.min(paymentCount, 12);

          return {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name || 'Unknown',
            role: profile.role,
            stripe_customer_id: profile.stripe_customer_id,
            subscription_status: subscriptionStatus,
            subscription_plan: null,
            subscription_plan_id: null,
            payment_count: paymentCount,
            loyalty_progress: loyaltyProgress,
            last_payment_date: lastPaymentDate,
            total_paid: totalPaid,
            created_at: profile.created_at,
            updated_at: profile.created_at,
            card_status: paymentCount > 0 ? 'Active Card' : 'No Card',
            ghl_contact_id: null,
            ghl_sync_status: 'not_synced',
            ghl_last_synced_at: null,
            ghl_tags: []
          };
        })
      );

      setCustomers(customersWithData);
      setFilteredCustomers(customersWithData);
    } catch (error) {
      console.error('Error fetching from profiles:', error);
    }
  };

  const syncFromStripe = async () => {
    try {
      setSyncing(true);
      setSyncStartTime(new Date());
      setSyncProgress({
        current: 0,
        total: 0,
        status: 'Starting Stripe sync...',
        isPaused: false
      });
      
      console.log('🔄 Starting Stripe sync...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No active session');
      }
      
      // Use API route for manual sync
      const response = await fetch('/api/sync-customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Sync failed: ${response.status} - ${errorData}`);
      }

      const data = await response.json();

      setLastSyncedAt(new Date().toISOString());
      setSyncProgress({
        current: data?.synced || 0,
        total: data?.synced || 0,
        status: 'Sync complete!',
        isPaused: false
      });
      
      // Show success notification
      setSyncNotification({
        show: true,
        type: 'success',
        message: `Successfully synced ${data?.synced || 0} customers!`
      });
      
      // Refresh customers after sync
      await fetchCustomers();
      
      // Clear progress and notification after 5 seconds
      setTimeout(() => {
        setSyncProgress({
          current: 0,
          total: 0,
          status: '',
          isPaused: false
        });
        setSyncNotification({
          show: false,
          type: 'info',
          message: ''
        });
      }, 5000);
      
    } catch (error) {
      console.error('❌ Sync error:', error);
      setSyncProgress({
        current: 0,
        total: 0,
        status: 'Sync failed',
        isPaused: false
      });
      
      // Show error notification
      setSyncNotification({
        show: true,
        type: 'error',
        message: `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      
      // Clear notification after 5 seconds
      setTimeout(() => {
        setSyncNotification({
          show: false,
          type: 'info',
          message: ''
        });
      }, 5000);
    } finally {
      setSyncing(false);
    }
  };

  const pauseSync = () => {
    setSyncProgress(prev => ({ ...prev, isPaused: true }));
  };

  const resumeSync = () => {
    setSyncProgress(prev => ({ ...prev, isPaused: false }));
  };

  // Filter, search, and sort logic
  useEffect(() => {
    let filtered = customers;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(customer => 
        customer.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Subscription filter
    if (subscriptionFilter !== 'all') {
      filtered = filtered.filter(customer => 
        customer.subscription_status === subscriptionFilter
      );
    }

    // Loyalty filter
    if (loyaltyFilter !== 'all') {
      filtered = filtered.filter(customer => {
        const months = customer.loyalty_progress;
        switch (loyaltyFilter) {
          case 'new': return months === 0;
          case '1+': return months >= 1 && months < 3;
          case '3+': return months >= 3 && months < 6;
          case '6+': return months >= 6;
          default: return true;
        }
      });
    }

    // Card status filter
    if (cardStatusFilter !== 'all') {
      filtered = filtered.filter(customer => {
        // Check if customer has a card based on payment count and subscription status
        const hasCard = customer.payment_count > 0 || customer.subscription_status === 'active';
        switch (cardStatusFilter) {
          case 'has_card': return hasCard;
          case 'no_card': return !hasCard;
          default: return true;
        }
      });
    }

    // Plan filter
    if (planFilter !== 'all') {
      filtered = filtered.filter(customer => {
        if (planFilter === 'no_plan') {
          return !customer.subscription_plan;
        } else {
          return customer.subscription_plan === planFilter;
        }
      });
    }

    // Sorting
    if (sortField) {
      filtered.sort((a, b) => {
        let aValue = a[sortField];
        let bValue = b[sortField];

        // Handle null/undefined values
        if (aValue === null || aValue === undefined) aValue = '';
        if (bValue === null || bValue === undefined) bValue = '';

        // Convert to strings for comparison if needed
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredCustomers(filtered);
  }, [customers, searchTerm, subscriptionFilter, loyaltyFilter, cardStatusFilter, planFilter, sortField, sortDirection]);

  // Pagination logic
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = itemsPerPage === -1 ? filteredCustomers.length : startIndex + itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);
  
  // Debug pagination
  console.log('🔍 PAGINATION DEBUG:', {
    customersLength: customers.length,
    filteredCustomersLength: filteredCustomers.length,
    itemsPerPage,
    totalPages,
    currentPage,
    startIndex,
    endIndex,
    paginatedLength: paginatedCustomers.length,
    shouldShowPagination: totalPages > 1
  });


  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, subscriptionFilter, loyaltyFilter, cardStatusFilter, planFilter]);

  // CSV Export function
  const exportToCSV = () => {
    const headers = [
      'Name',
      'Email', 
      'Role',
      'Subscription Status',
      'Payment Count',
      'Loyalty Progress',
      'Total Paid',
      'Last Payment Date',
      'Created At'
    ];

    const csvData = filteredCustomers.map(customer => [
      customer.full_name,
      customer.email,
      customer.role,
      customer.subscription_status || 'No Subscription',
      customer.payment_count,
      customer.loyalty_progress,
      (customer.total_paid / 100).toFixed(2),
      customer.last_payment_date ? new Date(customer.last_payment_date).toLocaleDateString() : 'Never',
      new Date(customer.created_at).toLocaleDateString()
    ]);

    const csvContent = [headers, ...csvData]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `customers_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Get unique plans for filter dropdown
  const getUniquePlans = (): string[] => {
    const plans = customers
      .map(customer => customer.subscription_plan)
      .filter((plan): plan is string => plan !== null && plan !== undefined && plan.trim() !== '')
      .filter((plan, index, self) => self.indexOf(plan) === index)
      .sort();
    return plans;
  };

  // Calculate ETA for sync progress
  const calculateETA = (current: number, total: number, startTime: Date | null) => {
    if (!startTime || current === 0) return null;
    
    const elapsed = Date.now() - startTime.getTime();
    const rate = current / elapsed; // customers per millisecond
    const remaining = total - current;
    const etaMs = remaining / rate;
    
    if (etaMs < 60000) {
      return `${Math.round(etaMs / 1000)}s remaining`;
    } else if (etaMs < 3600000) {
      return `${Math.round(etaMs / 60000)}m remaining`;
    } else {
      return `${Math.round(etaMs / 3600000)}h remaining`;
    }
  };

  // Handle tab change and save to localStorage
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('users-page-active-tab', value);
    }
  };

  // Clear all filters
  const clearFilters = () => {
    setSearchTerm('');
    setSubscriptionFilter('all');
    setLoyaltyFilter('all');
    setCardStatusFilter('all');
    setPlanFilter('all');
    setSortField(null);
    setSortDirection('asc');
    setCurrentPage(1);
  };

  // GHL Integration Functions
  const checkGhlConnection = async () => {
    try {
      const response = await fetch('/api/ghl/test-connection');
      const data = await response.json();
      setGhlConnected(data.success);
    } catch (error) {
      console.error('GHL connection check failed:', error);
      setGhlConnected(false);
    }
  };

  const fetchGhlTags = async () => {
    try {
      const response = await fetch('/api/ghl/tags');
      const data = await response.json();
      if (data.success) {
        setGhlTags(data.tags);
      }
    } catch (error) {
      console.error('Failed to fetch GHL tags:', error);
    }
  };

  const fetchAllCustomerGhlData = async () => {
    if (!ghlConnected) {
      console.log('GHL not connected, please connect first');
      return;
    }

    // Prevent automatic fetching during sync
    if (syncing) {
      console.log('Stripe sync in progress, skipping GHL fetch');
      return;
    }

    try {
      console.log('Fetching GHL data for all customers...');
      setGhlSyncing(true);
      const ghlData: Record<string, { tags: string[], contactId: string | null }> = {};
      
      // Process customers in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (customer) => {
          try {
            // Skip if customer email is invalid
            if (!customer.email || customer.email.trim() === '') {
              console.warn(`Skipping customer with invalid email:`, customer);
              return;
            }
            
            const response = await fetch(`/api/ghl/contact-tags?email=${encodeURIComponent(customer.email)}`);
            
            if (!response.ok) {
              console.error(`Failed to fetch GHL data for ${customer.email}: ${response.status} ${response.statusText}`);
              ghlData[customer.email] = {
                tags: [],
                contactId: null
              };
              return;
            }
            
            const data = await response.json();
            
            if (data.success && data.contact) {
              ghlData[customer.email] = {
                tags: data.tags || [],
                contactId: data.contact.id
              };
            } else {
              ghlData[customer.email] = {
                tags: [],
                contactId: null
              };
            }
          } catch (error) {
            console.error(`Failed to fetch GHL data for ${customer.email}:`, error);
            ghlData[customer.email] = {
              tags: [],
              contactId: null
            };
          }
        }));
        
        // Small delay between batches
        if (i + batchSize < customers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      setCustomerGhlData(ghlData);
      console.log('GHL data fetched for all customers:', ghlData);
    } catch (error) {
      console.error('Failed to fetch GHL data for customers:', error);
    } finally {
      setGhlSyncing(false);
    }
  };

  const syncWithGhl = async () => {
    try {
      setGhlSyncing(true);
      setGhlSyncResult(null);
      
      const response = await fetch('/api/ghl/sync-customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.success) {
        setGhlSyncResult(data.result);
        // Refresh customers to show updated sync status
        await fetchCustomers();
      } else {
        console.error('GHL sync failed:', data.message);
      }
    } catch (error) {
      console.error('GHL sync error:', error);
    } finally {
      setGhlSyncing(false);
    }
  };

  const handleBulkTag = async (tags: string[], action: 'add' | 'remove' = 'add') => {
    if (selectedCustomers.length === 0) {
      alert('Please select customers to tag');
      return;
    }

    try {
      const response = await fetch('/api/ghl/bulk-tag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerIds: selectedCustomers,
          tags,
          action
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Successfully ${action}ed tags to ${data.result.successful} customers`);
        setSelectedCustomers([]);
        // Refresh customers to show updated tags
        await fetchCustomers();
      } else {
        alert(`Failed to ${action} tags: ${data.message}`);
      }
    } catch (error) {
      console.error('Bulk tag error:', error);
      alert('Failed to apply tags');
    }
  };

  const toggleCustomerSelection = (customerId: string) => {
    setSelectedCustomers(prev => 
      prev.includes(customerId) 
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const selectAllCustomers = () => {
    setSelectedCustomers(filteredCustomers.map(c => c.id));
  };

  const clearSelection = () => {
    setSelectedCustomers([]);
  };

  // Customer detail functions
  const fetchCustomerGhlTags = async (customer: CustomerData) => {
    try {
      setLoadingGhlTags(true);
      const response = await fetch(`/api/ghl/contact-tags?email=${encodeURIComponent(customer.email)}`);
      const data = await response.json();
      
      if (data.success) {
        setCustomerGhlTags(data.tags || []);
        setSelectedCustomer(customer);
        setShowCustomerDetails(true);
      } else {
        console.error('Failed to fetch GHL tags:', data.message);
        setCustomerGhlTags([]);
      }
    } catch (error) {
      console.error('Error fetching customer GHL tags:', error);
      setCustomerGhlTags([]);
    } finally {
      setLoadingGhlTags(false);
    }
  };

  const handleAddTagToCustomer = async (customer: CustomerData, tag: string) => {
    try {
      const response = await fetch('/api/ghl/bulk-tag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerIds: [customer.id],
          tags: [tag],
          action: 'add'
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Refresh customer tags
        await fetchCustomerGhlTags(customer);
        // Refresh customers list
        await fetchCustomers();
      } else {
        alert(`Failed to add tag: ${data.message}`);
      }
    } catch (error) {
      console.error('Error adding tag:', error);
      alert('Failed to add tag');
    }
  };

  const handleRemoveTagFromCustomer = async (customer: CustomerData, tag: string) => {
    try {
      const response = await fetch('/api/ghl/bulk-tag', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerIds: [customer.id],
          tags: [tag],
          action: 'remove'
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        // Refresh customer tags
        await fetchCustomerGhlTags(customer);
        // Refresh customers list
        await fetchCustomers();
      } else {
        alert(`Failed to remove tag: ${data.message}`);
      }
    } catch (error) {
      console.error('Error removing tag:', error);
      alert('Failed to remove tag');
    }
  };

  // Handle column sorting
  const handleSort = (field: keyof CustomerData) => {
    if (sortField === field) {
      // If clicking the same field, toggle direction
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // If clicking a new field, set it and default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get sort icon for column headers
  const getSortIcon = (field: keyof CustomerData) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-4 w-4 text-muted-foreground" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-4 w-4 text-foreground" />
      : <ArrowDown className="h-4 w-4 text-foreground" />;
  };

  // Team management functions
  const handleAddUser = async () => {
    try {
      // First, create the user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: newUser.email,
        password: 'tempPassword123!', // Temporary password - user should change on first login
        email_confirm: true
      });

      if (authError) {
        console.error('Error creating auth user:', authError);
        return;
      }

      // Then create the profile
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: authData.user.id,
          full_name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (profileError) {
        console.error('Error creating profile:', profileError);
        return;
      }

      // Add to local state
      const user = addUser({
        ...newUser,
        status: 'pending',
        permissions: newUser.permissions.length > 0 ? newUser.permissions : ['view']
      });
      setTeamMembers([...teamMembers, user]);
      setNewUser({
        name: "",
        username: "",
        email: "",
        role: "viewer",
        department: "",
        permissions: [],
        notes: ""
      });
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error('Error adding user:', error);
    }
  };

  const handleEditUser = (user: InternalUser) => {
    setEditingUser(user);
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = async () => {
    if (!editingUser) return;
    
    try {
      console.log('🔄 Updating user:', editingUser);
      
      // Update user via secure API (uses service role)
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        alert('No active session');
        return;
      }

      const resp = await fetch('/api/admin/update-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: editingUser.id,
          full_name: editingUser.name,
          email: editingUser.email,
          role: editingUser.role,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('❌ Error updating via API:', errText);
        alert(`Failed to update user: ${resp.status} ${errText}`);
        return;
      }

      const { data } = await resp.json();
      console.log('✅ User updated in database via API:', data);

      // Refetch team members to ensure UI reflects DB
      await fetchTeamMembers();
      setIsEditDialogOpen(false);
      setEditingUser(null);
    } catch (e) {
      console.error('❌ Error updating user:', e);
      alert(`Failed to update user: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        // Delete from database
        const { error } = await supabase
          .from('profiles')
          .delete()
          .eq('id', userId);

        if (error) {
          console.error('Error deleting user:', error);
          return;
        }

        // Update local state
        deleteUser(userId);
        setTeamMembers(teamMembers.filter(u => u.id !== userId));
      } catch (error) {
        console.error('Error deleting user:', error);
      }
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'canceled':
        return 'bg-red-100 text-red-800';
      case 'past_due':
        return 'bg-yellow-100 text-yellow-800';
      case 'no subscription':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const getLoyaltyBadge = (months: number) => {
    if (months >= 6) return { text: '6+ Months', color: 'bg-purple-100 text-purple-800' };
    if (months >= 3) return { text: '3+ Months', color: 'bg-blue-100 text-blue-800' };
    if (months >= 1) return { text: '1+ Month', color: 'bg-green-100 text-green-800' };
    return { text: 'New', color: 'bg-gray-100 text-gray-800' };
  };

  const getRoleColor = (role: InternalUser['role']) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800';
      case 'admin': return 'bg-blue-100 text-blue-800';
      case 'manager': return 'bg-green-100 text-green-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColorTeam = (status: InternalUser['status']) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: InternalUser['status']) => {
    switch (status) {
      case 'active': return <UserCheck className="h-4 w-4" />;
      case 'inactive': return <UserX className="h-4 w-4" />;
      case 'pending': return <Clock className="h-4 w-4" />;
      default: return null;
    }
  };

  if (permissions?.role !== 'owner' && permissions?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Access denied. Only owners and admins can view this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalCustomers = totalCustomerCount || customers.length;
  const activeSubscriptions = customers.filter(c => c.subscription_status === 'active').length;
  const totalRevenue = customers.reduce((sum, c) => sum + c.total_paid, 0);

  const activeTeamMembers = teamMembers.filter(u => u.status === 'active').length;
  const pendingTeamMembers = teamMembers.filter(u => u.status === 'pending').length;
  const totalTeamMembers = teamMembers.length;

  return (
    <div className="space-y-6 w-full min-w-0 max-w-none">
      {/* Sync Notification */}
      {syncNotification.show && (
        <div className={`p-4 rounded-lg border ${
          syncNotification.type === 'success' 
            ? 'bg-green-50 border-green-200 text-green-800' 
            : syncNotification.type === 'error'
            ? 'bg-red-50 border-red-200 text-red-800'
            : 'bg-blue-50 border-blue-200 text-blue-800'
        }`}>
          <div className="flex items-center gap-2">
            {syncNotification.type === 'success' && <CheckCircle className="h-5 w-5" />}
            {syncNotification.type === 'error' && <AlertCircle className="h-5 w-5" />}
            <span className="font-medium">{syncNotification.message}</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Manage internal team members and Stripe customers
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="team" className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Team Management
          </TabsTrigger>
          <TabsTrigger value="customers" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Customer Management
          </TabsTrigger>
        </TabsList>

        {/* Team Management Tab */}
        <TabsContent value="team" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Team Management</h2>
              <p className="text-muted-foreground">
                Manage your internal team members and their access permissions
              </p>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Team Member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Team Member</DialogTitle>
                  <DialogDescription>
                    Add a new team member to your internal admin system.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        value={newUser.name}
                        onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                        placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <Label htmlFor="username">Username</Label>
                      <Input
                        id="username"
                        value={newUser.username}
                        onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                        placeholder="johndoe"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                      placeholder="john@company.com"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="role">Role</Label>
                      <Select value={newUser.role} onValueChange={(value: InternalUser['role']) => setNewUser({...newUser, role: value})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="department">Department</Label>
                      <Input
                        id="department"
                        value={newUser.department}
                        onChange={(e) => setNewUser({...newUser, department: e.target.value})}
                        placeholder="Engineering"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={newUser.notes}
                      onChange={(e) => setNewUser({...newUser, notes: e.target.value})}
                      placeholder="Additional notes about this team member..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddUser}>
                    Add Team Member
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Team Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Team Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalTeamMembers}</div>
                <p className="text-xs text-muted-foreground">
                  All team members
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{activeTeamMembers}</div>
                <p className="text-xs text-muted-foreground">
                  Currently active
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingTeamMembers}</div>
                <p className="text-xs text-muted-foreground">
                  Awaiting access
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Team Members Table */}
          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                Manage your internal team members and their permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamMembers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getRoleColor(user.role)}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(user.status)}
                          <Badge className={getStatusColorTeam(user.status)}>
                            {user.status}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {user.department || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {user.lastLogin 
                          ? new Date(user.lastLogin).toLocaleDateString()
                          : 'Never'
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          {user.role !== 'owner' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteUser(user.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customer Management Tab */}
        <TabsContent value="customers" className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Customer Management</h2>
              <p className="text-muted-foreground">
                Manage Stripe customers synced to your database. Data updates automatically via webhooks.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {lastSyncedAt && !syncing && (
                <p className="text-sm text-muted-foreground">
                  Last synced: {new Date(lastSyncedAt).toLocaleString()}
                </p>
              )}
              
              {/* Progress Indicator */}
              {syncing && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ 
                          width: syncProgress.total > 0 
                            ? `${(syncProgress.current / syncProgress.total) * 100}%` 
                            : '0%' 
                        }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {syncProgress.current}/{syncProgress.total}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {syncProgress.status === 'Sync complete!' && <CheckCircle className="h-4 w-4 text-green-600" />}
                    {syncProgress.status === 'Sync failed' && <AlertCircle className="h-4 w-4 text-red-600" />}
                    <span className="text-sm font-medium">
                      {syncProgress.status}
                    </span>
                    {syncProgress.current > 0 && syncProgress.total > 0 && syncProgress.status !== 'Sync complete!' && syncProgress.status !== 'Sync failed' && (
                      <span className="text-xs text-muted-foreground">
                        ({calculateETA(syncProgress.current, syncProgress.total, syncStartTime)})
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={exportToCSV}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowGhlPanel(!showGhlPanel)}
                  className={ghlConnected ? "border-green-500 text-green-700" : "border-red-500 text-red-700"}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  GHL Integration
                </Button>
                {syncing && (
                  <>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={syncProgress.isPaused ? resumeSync : pauseSync}
                    >
                      {syncProgress.isPaused ? (
                        <>
                          <Play className="h-4 w-4 mr-1" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="h-4 w-4 mr-1" />
                          Pause
                        </>
                      )}
                    </Button>
                  </>
                )}
        <Button onClick={syncFromStripe} disabled={syncing}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing Stripe...' : 'Sync Stripe'}
        </Button>
        <Button 
          onClick={() => {
            setLoading(true);
            fetchCustomers();
          }}
          disabled={loading}
          variant="outline"
          className="ml-2"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
                {syncing && (
                  <Button 
                    variant="destructive" 
                    onClick={() => {
                      setSyncing(false);
                      setSyncProgress({ current: 0, total: 0, status: 'Sync stopped', isPaused: false });
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Stop Sync
                  </Button>
                )}
              </div>
            </div>
      </div>

          {/* Filter Controls */}
          {showFilters && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg">Filter Customers</CardTitle>
                <CardDescription>
                  Filter customers by subscription status, loyalty level, or search by name/email
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <Label htmlFor="search">Search</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="search"
                        placeholder="Search by name or email..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="subscription-filter">Subscription Status</Label>
                    <Select value={subscriptionFilter} onValueChange={setSubscriptionFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Subscriptions</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="canceled">Canceled</SelectItem>
                        <SelectItem value="past_due">Past Due</SelectItem>
                        <SelectItem value="No Subscription">No Subscription</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="loyalty-filter">Loyalty Level</Label>
                    <Select value={loyaltyFilter} onValueChange={setLoyaltyFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Levels</SelectItem>
                        <SelectItem value="new">New (0 months)</SelectItem>
                        <SelectItem value="1+">1+ Months</SelectItem>
                        <SelectItem value="3+">3+ Months</SelectItem>
                        <SelectItem value="6+">6+ Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="card-status-filter">Card Status</Label>
                    <Select value={cardStatusFilter} onValueChange={setCardStatusFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Card Status</SelectItem>
                        <SelectItem value="has_card">Has Active Card</SelectItem>
                        <SelectItem value="no_card">No Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="plan-filter">Subscription Plan</Label>
                    <Select value={planFilter} onValueChange={setPlanFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Plans</SelectItem>
                        <SelectItem value="no_plan">No Plan</SelectItem>
                        {getUniquePlans().map((plan) => (
                          <SelectItem key={plan} value={plan}>
                            {plan}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button 
                      variant="outline" 
                      onClick={clearFilters}
                      className="flex-1"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear Filters
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {sortField && (
                      <span>
                        Sorted by {sortField.replace('_', ' ')} ({sortDirection})
                      </span>
                    )}
                  </div>
                  
                  {/* Items per page selector */}
                  <div className="flex items-center gap-2">
                    <Label htmlFor="items-per-page" className="text-sm">Show:</Label>
                    <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                      setItemsPerPage(value === 'all' ? -1 : parseInt(value));
                      setCurrentPage(1);
                    }}>
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="500">500</SelectItem>
                        <SelectItem value="all">All</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    {customers.length === 0 ? (
                      <span className="text-red-600 font-semibold">
                        ⚠️ NO CUSTOMERS LOADED! Check console for debug info.
                      </span>
                    ) : (
                      <>
                        Showing {startIndex + 1}-{Math.min(endIndex, filteredCustomers.length)} of {filteredCustomers.length} customers
                        {totalCustomerCount > 0 && totalCustomerCount !== filteredCustomers.length && (
                          <span className="ml-2 text-blue-600">
                            (Total in database: {totalCustomerCount})
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  
                  {/* Always show pagination controls for debugging */}
                  {(totalPages > 1 || customers.length === 0) && (
                    <div className="flex items-center space-x-2">
                      {customers.length === 0 && (
                        <div className="text-red-600 text-sm font-semibold mr-4">
                          DEBUG: customers.length = 0, totalPages = {totalPages}
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      
                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          const pageNum = currentPage <= 3 
                            ? i + 1 
                            : currentPage >= totalPages - 2 
                              ? totalPages - 4 + i 
                              : currentPage - 2 + i;
                          
                          if (pageNum < 1 || pageNum > totalPages) return null;
                          
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              onClick={() => setCurrentPage(pageNum)}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* GHL Integration Panel */}
          {showGhlPanel && (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <ExternalLink className="h-5 w-5" />
                  GoHighLevel Integration
                  <div className={`ml-auto px-2 py-1 rounded-full text-xs ${
                    ghlConnected 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {ghlConnected ? 'Connected' : 'Disconnected'}
                  </div>
                </CardTitle>
                <CardDescription>
                  Sync Stripe customers with GHL contacts and manage bulk tagging
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Connection Status */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-2">
                    {ghlConnected ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">
                      {ghlConnected ? 'Connected to GHL' : 'Not connected to GHL'}
                    </span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={checkGhlConnection}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Test Connection
                  </Button>
                </div>

                {/* Sync Controls */}
                {ghlConnected && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Button 
                        onClick={syncWithGhl} 
                        disabled={ghlSyncing}
                        className="flex-1"
                      >
                        <Zap className="h-4 w-4 mr-2" />
                        {ghlSyncing ? 'Syncing...' : 'Sync with GHL'}
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={fetchGhlTags}
                      >
                        <Tag className="h-4 w-4 mr-2" />
                        Refresh Tags
                      </Button>
                      <Button 
                        variant="outline" 
                        onClick={fetchAllCustomerGhlData}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Load GHL Data
                      </Button>
                    </div>

                    {/* Sync Results */}
                    {ghlSyncResult && (
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <h4 className="font-medium text-blue-900 mb-2">Sync Results</h4>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-blue-700">Matched:</span>
                            <span className="ml-1 font-medium">{ghlSyncResult.matched}</span>
                          </div>
                          <div>
                            <span className="text-blue-700">Updated:</span>
                            <span className="ml-1 font-medium">{ghlSyncResult.updated}</span>
                          </div>
                          <div>
                            <span className="text-blue-700">Errors:</span>
                            <span className="ml-1 font-medium">{ghlSyncResult.errors}</span>
                          </div>
                          <div>
                            <span className="text-blue-700">Total:</span>
                            <span className="ml-1 font-medium">{ghlSyncResult.total}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Available Tags */}
                    {ghlTags.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Available GHL Tags ({ghlTags.length})</h4>
                        <div className="flex flex-wrap gap-2">
                          {ghlTags.slice(0, 10).map((tag) => (
                            <Badge key={tag.id} variant="secondary" className="text-xs">
                              {tag.name}
                            </Badge>
                          ))}
                          {ghlTags.length > 10 && (
                            <Badge variant="outline" className="text-xs">
                              +{ghlTags.length - 10} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Bulk Actions */}
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-3">Bulk Actions</h4>
                      <div className="flex items-center gap-2 mb-3">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={selectAllCustomers}
                        >
                          Select All ({filteredCustomers.length})
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={clearSelection}
                        >
                          Clear Selection
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          {selectedCustomers.length} selected
                        </span>
                      </div>
                      
                      {selectedCustomers.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleBulkTag(['Stripe-Active'], 'add')}
                          >
                            <Tag className="h-4 w-4 mr-1" />
                            Tag as Active
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleBulkTag(['Stripe-Canceled'], 'add')}
                          >
                            <Tag className="h-4 w-4 mr-1" />
                            Tag as Canceled
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleBulkTag(['Stripe-HighValue'], 'add')}
                          >
                            <Tag className="h-4 w-4 mr-1" />
                            Tag as High Value
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Customer Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCustomers}</div>
            <p className="text-xs text-muted-foreground">
                  All Stripe customers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeSubscriptions}</div>
            <p className="text-xs text-muted-foreground">
              Currently paying customers
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(totalRevenue / 100).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              All time payments
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Customers Table */}
      <Card>
        <CardHeader>
              <CardTitle>Stripe Customers</CardTitle>
          <CardDescription>
                Complete list of Stripe customers with subscription and loyalty data
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">Loading customers...</p>
                </div>
              ) : (
          <Table className="min-w-[1200px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <input
                    type="checkbox"
                    checked={selectedCustomers.length === filteredCustomers.length && filteredCustomers.length > 0}
                    onChange={selectedCustomers.length === filteredCustomers.length ? clearSelection : selectAllCustomers}
                    className="rounded"
                  />
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('full_name')}
                >
                  <div className="flex items-center gap-2">
                    Customer
                    {getSortIcon('full_name')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('role')}
                >
                  <div className="flex items-center gap-2">
                    Role
                    {getSortIcon('role')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('subscription_status')}
                >
                  <div className="flex items-center gap-2">
                    Subscription
                    {getSortIcon('subscription_status')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('payment_count')}
                >
                  <div className="flex items-center gap-2">
                    Payments
                    {getSortIcon('payment_count')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('loyalty_progress')}
                >
                  <div className="flex items-center gap-2">
                    Loyalty
                    {getSortIcon('loyalty_progress')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('total_paid')}
                >
                  <div className="flex items-center gap-2">
                    Total Paid
                    {getSortIcon('total_paid')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50 select-none"
                  onClick={() => handleSort('last_payment_date')}
                >
                  <div className="flex items-center gap-2">
                    Last Payment
                    {getSortIcon('last_payment_date')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('subscription_plan')}
                >
                  <div className="flex items-center gap-2">
                    Plan
                    {getSortIcon('subscription_plan')}
                  </div>
                </TableHead>
                <TableHead 
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('card_status')}
                >
                  <div className="flex items-center gap-2">
                    Card Status
                    {getSortIcon('card_status')}
                  </div>
                </TableHead>
                <TableHead>GHL Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCustomers.map((customer) => {
                const loyaltyBadge = getLoyaltyBadge(customer.loyalty_progress);
                return (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selectedCustomers.includes(customer.id)}
                        onChange={() => toggleCustomerSelection(customer.id)}
                        className="rounded"
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{customer.full_name}</div>
                        <div className="text-sm text-muted-foreground">{customer.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {customer.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(customer.subscription_status || '')}>
                        {customer.subscription_status || 'No Subscription'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-center">
                        <div className="font-medium">{customer.payment_count}</div>
                        <div className="text-xs text-muted-foreground">payments</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={loyaltyBadge.color}>
                        {loyaltyBadge.text}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      ${(customer.total_paid / 100).toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {customer.last_payment_date 
                        ? new Date(customer.last_payment_date).toLocaleDateString()
                        : 'Never'
                      }
                    </TableCell>
                    <TableCell>
                      {customer.subscription_plan ? (
                        <Badge variant="outline" className="font-medium">
                          {customer.subscription_plan}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">No Plan</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        // Use card_status from database if available, otherwise calculate it
                        const cardStatus = customer.card_status || 
                          (customer.payment_count > 0 || customer.subscription_status === 'active' ? 'Active Card' : 'No Card');
                        return (
                          <Badge variant={cardStatus === 'Active Card' ? "default" : "secondary"}>
                            {cardStatus}
                          </Badge>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        {/* Status and Contact Info */}
                        <div className="flex items-center gap-2">
                          {(() => {
                            const ghlData = customerGhlData[customer.email];
                            if (ghlData?.contactId) {
                              return (
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                  <span className="text-xs text-green-700">Synced</span>
                                </div>
                              );
                            } else {
                              return (
                                <div className="flex items-center gap-1">
                                  <AlertCircle className="h-4 w-4 text-gray-400" />
                                  <span className="text-xs text-gray-500">Not Found</span>
                                </div>
                              );
                            }
                          })()}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => fetchCustomerGhlTags(customer)}
                            disabled={loadingGhlTags}
                            className="h-6 px-2 text-xs"
                          >
                            <RefreshCw className={`h-3 w-3 mr-1 ${loadingGhlTags ? 'animate-spin' : ''}`} />
                            {loadingGhlTags ? 'Loading...' : 'Refresh'}
                          </Button>
                        </div>
                        
                        {/* GHL Tags Display */}
                        {(() => {
                          const ghlData = customerGhlData[customer.email];
                          const tags = ghlData?.tags || [];
                          
                          if (tags.length > 0) {
                            return (
                              <div className="flex flex-wrap gap-1">
                                {tags.slice(0, 3).map((tag, index) => (
                                  <Badge key={index} variant="secondary" className="text-xs">
                                    {tag}
                                  </Badge>
                                ))}
                                {tags.length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{tags.length - 3}
                                  </Badge>
                                )}
                              </div>
                            );
                          } else {
                            return (
                              <span className="text-xs text-muted-foreground">No tags</span>
                            );
                          }
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
              )}
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
            <DialogDescription>
              Update team member information and permissions.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input
                    id="edit-name"
                    value={editingUser.name}
                    onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                  />
                </div>
                <div>
                  <Label htmlFor="edit-username">Username</Label>
                  <Input
                    id="edit-username"
                    value={editingUser.username}
                    onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="edit-role">Role</Label>
                  <Select 
                    value={editingUser.role} 
                    onValueChange={(value: InternalUser['role']) => setEditingUser({...editingUser, role: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">Viewer</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="edit-status">Status</Label>
                  <Select 
                    value={editingUser.status} 
                    onValueChange={(value: InternalUser['status']) => setEditingUser({...editingUser, status: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="edit-department">Department</Label>
                <Input
                  id="edit-department"
                  value={editingUser.department || ''}
                  onChange={(e) => setEditingUser({...editingUser, department: e.target.value})}
                />
              </div>
              <div>
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editingUser.notes || ''}
                  onChange={(e) => setEditingUser({...editingUser, notes: e.target.value})}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer GHL Tags Dialog */}
      <Dialog open={showCustomerDetails} onOpenChange={setShowCustomerDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              GHL Tags for {selectedCustomer?.full_name}
            </DialogTitle>
            <DialogDescription>
              Manage tags for {selectedCustomer?.email} in your GoHighLevel subaccount
            </DialogDescription>
          </DialogHeader>
          
          {selectedCustomer && (
            <div className="space-y-4">
              {/* Current Tags */}
              <div>
                <h4 className="font-medium mb-2">Current Tags ({customerGhlTags.length})</h4>
                {customerGhlTags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {customerGhlTags.map((tag, index) => (
                      <div key={index} className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveTagFromCustomer(selectedCustomer, tag)}
                          className="h-5 w-5 p-0 text-red-500 hover:text-red-700"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No tags applied to this contact</p>
                )}
              </div>

              {/* Available Tags to Add */}
              {ghlTags.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Available Tags ({ghlTags.length})</h4>
                  <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                    {ghlTags
                      .filter(tag => !customerGhlTags.includes(tag.name))
                      .map((tag) => (
                        <Button
                          key={tag.id}
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddTagToCustomer(selectedCustomer, tag.name)}
                          className="text-xs"
                        >
                          <Tag className="h-3 w-3 mr-1" />
                          {tag.name}
                        </Button>
                      ))}
                  </div>
                </div>
              )}

              {/* Quick Add Common Tags */}
              <div>
                <h4 className="font-medium mb-2">Quick Add Tags</h4>
                <div className="flex flex-wrap gap-2">
                  {['Stripe-Active', 'Stripe-Canceled', 'Stripe-HighValue', 'Stripe-Loyal-6+', 'VIP Customer'].map((tag) => (
                    <Button
                      key={tag}
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddTagToCustomer(selectedCustomer, tag)}
                      disabled={customerGhlTags.includes(tag)}
                      className="text-xs"
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      {tag}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Contact Info */}
              <div className="border-t pt-4">
                <h4 className="font-medium mb-2">Contact Information</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <span className="ml-2">{selectedCustomer.email}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Subscription:</span>
                    <span className="ml-2">{selectedCustomer.subscription_status || 'No Subscription'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Paid:</span>
                    <span className="ml-2">${(selectedCustomer.total_paid / 100).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Loyalty:</span>
                    <span className="ml-2">{selectedCustomer.loyalty_progress} months</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomerDetails(false)}>
              Close
            </Button>
            <Button 
              onClick={() => selectedCustomer && fetchCustomerGhlTags(selectedCustomer)}
              disabled={loadingGhlTags}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loadingGhlTags ? 'animate-spin' : ''}`} />
              Refresh Tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 