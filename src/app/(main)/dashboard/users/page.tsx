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
import { addUser, updateUser, deleteUser, InternalUser } from "@/data/users";
import { Plus, Edit, Trash2, UserCheck, UserX, Clock, Users, UserPlus, RefreshCw, Pause, Play, CheckCircle, AlertCircle } from "lucide-react";

interface CustomerData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  stripe_customer_id: string | null;
  subscription_status: string | null;
  payment_count: number;
  loyalty_progress: number;
  last_payment_date: string | null;
  total_paid: number;
  created_at: string;
  updated_at: string;
}

export default function UsersPage() {
  const { permissions } = useUserPermissions();
  const [customers, setCustomers] = useState<CustomerData[]>([]);
  const [teamMembers, setTeamMembers] = useState<InternalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState({
    current: 0,
    total: 0,
    status: '',
    isPaused: false
  });
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
      
      // Fetch customers from database (synced from Stripe)
      const { data: customers, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching customers:', error);
        // Fallback to profiles if customers table doesn't exist yet
        await fetchCustomersFromProfiles();
        return;
      }

      setCustomers(customers || []);
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
    }
  }, [permissions, fetchCustomers]);

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
        lastLogin: new Date().toISOString(), // You can add last_login tracking later
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        notes: ''
      }));

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
            payment_count: paymentCount,
            loyalty_progress: loyaltyProgress,
            last_payment_date: lastPaymentDate,
            total_paid: totalPaid,
            created_at: profile.created_at,
            updated_at: profile.created_at
          };
        })
      );

      setCustomers(customersWithData);
    } catch (error) {
      console.error('Error fetching from profiles:', error);
    }
  };

  const syncFromStripe = async () => {
    try {
      setSyncing(true);
      setSyncProgress({
        current: 0,
        total: 0,
        status: 'Starting sync...',
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

  // Team management functions
  const handleAddUser = () => {
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
  };

  const handleEditUser = (user: InternalUser) => {
    setEditingUser(user);
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = () => {
    if (!editingUser) return;
    
    const updatedUser = updateUser(editingUser.id, editingUser);
    if (updatedUser) {
      setTeamMembers(teamMembers.map(u => u.id === updatedUser.id ? updatedUser : u));
    }
    setIsEditDialogOpen(false);
    setEditingUser(null);
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      deleteUser(userId);
      setTeamMembers(teamMembers.filter(u => u.id !== userId));
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

  const totalCustomers = customers.length;
  const activeSubscriptions = customers.filter(c => c.subscription_status === 'active').length;
  const totalRevenue = customers.reduce((sum, c) => sum + c.total_paid, 0);

  const activeTeamMembers = teamMembers.filter(u => u.status === 'active').length;
  const pendingTeamMembers = teamMembers.filter(u => u.status === 'pending').length;
  const totalTeamMembers = teamMembers.length;

  return (
    <div className="space-y-6">
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

      <Tabs defaultValue="team" className="space-y-4">
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
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-2">
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
                  {syncing ? 'Syncing...' : 'Sync Now'}
                </Button>
              </div>
            </div>
          </div>

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
        <CardContent>
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">Loading customers...</p>
                </div>
              ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead>Payments</TableHead>
                <TableHead>Loyalty</TableHead>
                <TableHead>Total Paid</TableHead>
                <TableHead>Last Payment</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => {
                const loyaltyBadge = getLoyaltyBadge(customer.loyalty_progress);
                return (
                  <TableRow key={customer.id}>
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
    </div>
  );
} 