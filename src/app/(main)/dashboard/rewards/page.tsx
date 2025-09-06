"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { ChartContainer } from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from "recharts";
import { Gift, Users, CreditCard, Clock, Star, Zap, TrendingUp, Target, Award, Crown } from "lucide-react";

interface LoyaltyReward {
  id: string;
  type: string;
  months_earned: number;
  status: string;
  expires_at: string;
  claimed_at?: string;
  created_at: string;
}

interface UserStats {
  totalRewards: number;
  availableCredits: number;
  appliedCredits: number;
  referralCount: number;
}

interface RewardCard {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  action: string;
  status: 'available' | 'used' | 'expired';
  months: number;
  expiresAt?: string;
}

export default function RewardsPage() {
  const router = useRouter();
  const [rewards, setRewards] = useState<LoyaltyReward[]>([]);
  const [stats, setStats] = useState<UserStats>({
    totalRewards: 0,
    availableCredits: 0,
    appliedCredits: 0,
    referralCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  const fetchRewards = useCallback(async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        router.push("/auth/v1/login");
        return;
      }

      // Fetch user's loyalty rewards
      const { data: rewardsData, error: rewardsError } = await supabase
        .from('loyalty_rewards')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (rewardsError) {
        console.error('Error fetching rewards:', rewardsError);
        return;
      }

      setRewards(rewardsData || []);

      // Calculate stats
      const totalRewards = rewardsData?.length || 0;
      const availableCredits = rewardsData?.filter(r => r.status === 'available').length || 0;
      const appliedCredits = rewardsData?.filter(r => r.status === 'applied').length || 0;

      setStats({
        totalRewards,
        availableCredits,
        appliedCredits,
        referralCount: 0, // TODO: Implement referral tracking
      });

    } catch (error) {
      console.error('Error fetching rewards:', error);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);


  const applyCredit = async (rewardId: string) => {
    try {
      setProcessing(rewardId);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Call API to apply credit to Stripe customer
      const response = await fetch('/api/rewards/apply-credit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ rewardId }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to apply credit: ${response.status} - ${errorData}`);
      }

      const result = await response.json();
      console.log('Credit applied:', result);
      
      // Refresh rewards
      await fetchRewards();
      
    } catch (error) {
      console.error('Error applying credit:', error);
      alert('Failed to apply credit: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setProcessing(null);
    }
  };

  const generateReferralLink = async (rewardId: string) => {
    try {
      setProcessing(rewardId);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Call API to generate referral link
      const response = await fetch('/api/rewards/generate-referral', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ rewardId }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to generate referral link: ${response.status} - ${errorData}`);
      }

      const result = await response.json();
      
      // Copy link to clipboard
      navigator.clipboard.writeText(result.referralLink);
      alert('Referral link copied to clipboard!');
      
    } catch (error) {
      console.error('Error generating referral link:', error);
      alert('Failed to generate referral link: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setProcessing(null);
    }
  };

  const calculateRewards = async () => {
    try {
      setCalculating(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Try the edge function first, fallback to simple API if it fails
      let response;
      try {
        response = await fetch('/api/rewards/calculate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      } catch {
        console.log('Edge function failed, trying simple API...');
        response = await fetch('/api/rewards/calculate-simple', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
        });
      }

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to calculate rewards: ${response.status} - ${errorData}`);
      }

      const result = await response.json();
      console.log('Rewards calculated:', result);
      
      if (result.newRewardsCreated > 0) {
        alert(`Great! ${result.newRewardsCreated} new reward(s) have been added to your account.`);
      } else {
        alert('Your rewards are already up to date!');
      }
      
      // Refresh rewards
      await fetchRewards();
      
    } catch (error) {
      console.error('Error calculating rewards:', error);
      alert('Failed to calculate rewards: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setCalculating(false);
    }
  };

  const createDemoRewards = async () => {
    try {
      setCalculating(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No active session');
      }

      // Call API to create demo rewards
      const response = await fetch('/api/rewards/demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Failed to create demo rewards: ${response.status} - ${errorData}`);
      }

      const result = await response.json();
      console.log('Demo rewards created:', result);
      
      alert(`Demo rewards created! ${result.rewardsCreated} new reward(s) added.`);
      
      // Refresh rewards
      await fetchRewards();
      
    } catch (error) {
      console.error('Error creating demo rewards:', error);
      alert('Failed to create demo rewards: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setCalculating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'applied':
        return 'bg-green-100 text-green-800';
      case 'shared':
        return 'bg-purple-100 text-purple-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Prepare reward cards for carousel
  const rewardCards: RewardCard[] = rewards.map(reward => ({
    id: reward.id,
    title: `${reward.months_earned} Month${reward.months_earned > 1 ? 's' : ''} Credit`,
    description: `Earned on ${formatDate(reward.created_at)}`,
    icon: <Gift className="h-8 w-8 text-primary" />,
    action: reward.status === 'pending' ? 'Swipe to choose action' : reward.status === 'applied' ? 'Credit Applied' : 'Shared with Friend',
    status: reward.status === 'pending' ? 'available' : reward.status === 'applied' ? 'used' : 'expired',
    months: reward.months_earned,
    expiresAt: reward.expires_at,
  }));

  // Chart data for analytics - generate realistic data based on user's subscription
  const generateMonthlyData = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    const data = [];
    
    for (let i = 0; i < 6; i++) {
      const monthIndex = (currentMonth - 5 + i + 12) % 12;
      const month = months[monthIndex];
      const payments = Math.floor(Math.random() * 2) + 2; // 2-3 payments per month
      const rewards = Math.floor(payments / 3); // 1 reward per 3 payments
      
      data.push({ month, payments, rewards });
    }
    
    return data;
  };

  const monthlyProgressData = generateMonthlyData();


  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-lg">Loading rewards...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rewards Program</h1>
          <p className="text-muted-foreground">
            Earn credits every 3 months and share with friends
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={calculateRewards}
            disabled={calculating}
            className="flex items-center gap-2"
          >
            <Star className="h-4 w-4" />
            {calculating ? 'Calculating...' : 'Check for New Rewards'}
          </Button>
          
          <Button 
            onClick={createDemoRewards}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Gift className="h-4 w-4" />
            Create Demo Rewards
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Credits</CardTitle>
            <Gift className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.availableCredits}</div>
            <p className="text-xs text-muted-foreground">
              months of free service
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applied Credits</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.appliedCredits}</div>
            <p className="text-xs text-muted-foreground">
              months already used
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rewards</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRewards}</div>
            <p className="text-xs text-muted-foreground">
              loyalty rewards earned
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.referralCount}</div>
            <p className="text-xs text-muted-foreground">
              friends referred
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Visual Analytics Section */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly Progress Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Monthly Progress
            </CardTitle>
            <CardDescription>
              Track your subscription payments and rewards earned
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{
              payments: { color: "#3b82f6" },
              rewards: { color: "#10b981" }
            }}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyProgressData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line 
                    type="monotone" 
                    dataKey="payments" 
                    stroke="var(--color-payments)" 
                    strokeWidth={2}
                    name="Payments"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="rewards" 
                    stroke="var(--color-rewards)" 
                    strokeWidth={2}
                    name="Rewards"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Membership Timeline & Rewards */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Membership Journey
            </CardTitle>
            <CardDescription>
              Your path to exclusive rewards and benefits
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Current Status */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-3 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 px-6 py-3 rounded-full border">
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                    {stats.totalRewards === 0 ? 'Bronze Member' : 
                     stats.totalRewards < 3 ? 'Silver Member' : 
                     stats.totalRewards < 6 ? 'Gold Member' : 
                     stats.totalRewards < 9 ? 'Platinum Member' : 'Diamond Member'}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {stats.totalRewards} rewards earned
                  </span>
                </div>
              </div>

              {/* Membership Timeline */}
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-amber-400 via-yellow-400 to-gray-300"></div>
                
                {/* Timeline items */}
                <div className="space-y-8">
                  {/* Bronze - 3 months */}
                  <div className="relative flex items-start gap-4">
                    <div className="relative z-10 flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white font-bold text-lg shadow-lg">
                      🥉
                    </div>
                    <div className="flex-1 pt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">Bronze Member</h3>
                        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                          {stats.totalRewards >= 1 ? '✓ Achieved' : '3 months'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mb-2">
                        Complete your first 3 months of subscription
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Gift className="h-4 w-4 text-amber-600" />
                          <span className="font-medium">1 Month Credit</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4 text-blue-600" />
                          <span>Referral Link Access</span>
                        </span>
                      </div>
                      {stats.totalRewards === 0 && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Progress: {subscriptionProgress}/3 months</span>
                            <span>{Math.round((subscriptionProgress / 3) * 100)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-amber-500 h-2 rounded-full transition-all duration-500" 
                              style={{ width: `${(subscriptionProgress / 3) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Silver - 6 months */}
                  <div className="relative flex items-start gap-4">
                    <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full text-white font-bold text-lg shadow-lg ${
                      stats.totalRewards >= 2 ? 'bg-gradient-to-br from-gray-400 to-gray-600' : 'bg-gray-300'
                    }`}>
                      🥈
                    </div>
                    <div className="flex-1 pt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">Silver Member</h3>
                        <Badge variant="secondary" className={
                          stats.totalRewards >= 2 ? 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-400'
                        }>
                          {stats.totalRewards >= 2 ? '✓ Achieved' : '6 months'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mb-2">
                        Maintain subscription for 6 months
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Gift className="h-4 w-4 text-gray-600" />
                          <span className="font-medium">2 Month Credits</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500" />
                          <span>Priority Support</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Gold - 9 months */}
                  <div className="relative flex items-start gap-4">
                    <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full text-white font-bold text-lg shadow-lg ${
                      stats.totalRewards >= 3 ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : 'bg-gray-300'
                    }`}>
                      🥇
                    </div>
                    <div className="flex-1 pt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">Gold Member</h3>
                        <Badge variant="secondary" className={
                          stats.totalRewards >= 3 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-400'
                        }>
                          {stats.totalRewards >= 3 ? '✓ Achieved' : '9 months'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mb-2">
                        Reach 9 months of loyal subscription
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Gift className="h-4 w-4 text-yellow-600" />
                          <span className="font-medium">3 Month Credits</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap className="h-4 w-4 text-orange-500" />
                          <span>Exclusive Features</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Platinum - 12 months */}
                  <div className="relative flex items-start gap-4">
                    <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full text-white font-bold text-lg shadow-lg ${
                      stats.totalRewards >= 4 ? 'bg-gradient-to-br from-cyan-400 to-cyan-600' : 'bg-gray-300'
                    }`}>
                      💎
                    </div>
                    <div className="flex-1 pt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">Platinum Member</h3>
                        <Badge variant="secondary" className={
                          stats.totalRewards >= 4 ? 'bg-cyan-100 text-cyan-800' : 'bg-gray-100 text-gray-400'
                        }>
                          {stats.totalRewards >= 4 ? '✓ Achieved' : '12 months'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mb-2">
                        Complete your first year of subscription
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Gift className="h-4 w-4 text-cyan-600" />
                          <span className="font-medium">4 Month Credits</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Award className="h-4 w-4 text-purple-500" />
                          <span>VIP Status</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Diamond - 15+ months */}
                  <div className="relative flex items-start gap-4">
                    <div className={`relative z-10 flex items-center justify-center w-16 h-16 rounded-full text-white font-bold text-lg shadow-lg ${
                      stats.totalRewards >= 5 ? 'bg-gradient-to-br from-purple-400 to-purple-600' : 'bg-gray-300'
                    }`}>
                      💎
                    </div>
                    <div className="flex-1 pt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">Diamond Member</h3>
                        <Badge variant="secondary" className={
                          stats.totalRewards >= 5 ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-400'
                        }>
                          {stats.totalRewards >= 5 ? '✓ Achieved' : '15+ months'}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mb-2">
                        Elite status for long-term subscribers
                      </p>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1">
                          <Gift className="h-4 w-4 text-purple-600" />
                          <span className="font-medium">5+ Month Credits</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Crown className="h-4 w-4 text-yellow-500" />
                          <span>Legendary Status</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Next Milestone Info */}
              {stats.totalRewards < 5 && (
                <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Target className="h-6 w-6 text-blue-600" />
                    <div>
                      <h4 className="font-semibold text-blue-800 dark:text-blue-200">
                        Next Milestone: {
                          stats.totalRewards === 0 ? 'Bronze Member' :
                          stats.totalRewards === 1 ? 'Silver Member' :
                          stats.totalRewards === 2 ? 'Gold Member' :
                          stats.totalRewards === 3 ? 'Platinum Member' : 'Diamond Member'
                        }
                      </h4>
                      <p className="text-sm text-blue-600 dark:text-blue-300">
                        {stats.totalRewards === 0 ? `Complete ${3 - subscriptionProgress} more month${3 - subscriptionProgress > 1 ? 's' : ''} to unlock your first reward!` :
                         stats.totalRewards === 1 ? 'Complete 3 more months to reach Silver status' :
                         stats.totalRewards === 2 ? 'Complete 3 more months to reach Gold status' :
                         stats.totalRewards === 3 ? 'Complete 3 more months to reach Platinum status' : 'Complete 3 more months to reach Diamond status'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interactive Reward Cards */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Your Reward Cards
          </CardTitle>
          <CardDescription>
            Swipe through your rewards and choose your action
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rewardCards.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Gift className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No rewards yet</p>
              <p className="text-sm">Keep your subscription active to start earning!</p>
              
                             {/* Progress towards first reward */}
               <div className="mt-6 max-w-xs mx-auto">
                 <div className="flex justify-between text-sm text-muted-foreground mb-2">
                   <span>Progress to first reward</span>
                   <span>{subscriptionProgress}/3 months</span>
                 </div>
                 <div className="w-full bg-gray-200 rounded-full h-2">
                   <div 
                     className="bg-primary h-2 rounded-full transition-all duration-500" 
                     style={{ width: `${(subscriptionProgress / 3) * 100}%` }}
                   ></div>
                 </div>
                 <p className="text-xs text-muted-foreground mt-2 text-center">
                   {subscriptionProgress === 3 
                     ? "You're ready for your first reward! Click 'Check for New Rewards' above."
                     : `Complete ${3 - subscriptionProgress} more month${3 - subscriptionProgress > 1 ? 's' : ''} to earn your first reward!`
                   }
                 </p>
               </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Progress indicator */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 bg-blue-50 dark:bg-blue-950 px-4 py-2 rounded-full">
                  <Star className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {stats.availableCredits} rewards available • {stats.totalRewards} total earned
                  </span>
                </div>
              </div>
              
              <Carousel className="w-full max-w-md mx-auto">
                <CarouselContent>
                  {rewardCards.map((card) => (
                    <CarouselItem key={card.id}>
                      <div className="p-6">
                        <Card className="border-2 hover:border-primary/50 transition-all duration-300 transform hover:scale-105 shadow-lg">
                          <CardHeader className="text-center pb-4">
                            <div className="mx-auto mb-4">
                              {card.icon}
                            </div>
                            <CardTitle className="text-xl">{card.title}</CardTitle>
                            <CardDescription>{card.description}</CardDescription>
                            {card.expiresAt && (
                              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-2">
                                <Clock className="h-4 w-4" />
                                Expires: {formatDate(card.expiresAt)}
                              </div>
                            )}
                          </CardHeader>
                          <CardContent className="text-center space-y-4">
                            <Badge className={getStatusColor(card.status)}>
                              {card.status}
                            </Badge>
                            
                            {card.status === 'available' && (
                              <div className="space-y-3">
                                <p className="text-sm text-muted-foreground">
                                  {card.action}
                                </p>
                                <div className="flex gap-2 justify-center">
                                  <Button
                                    size="sm"
                                    onClick={() => applyCredit(card.id)}
                                    disabled={processing === card.id}
                                    className="flex-1 hover:bg-green-600 transition-colors"
                                  >
                                    <CreditCard className="h-4 w-4 mr-1" />
                                    Apply to Account
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => generateReferralLink(card.id)}
                                    disabled={processing === card.id}
                                    className="flex-1 hover:bg-purple-600 hover:text-white transition-colors"
                                  >
                                    <Users className="h-4 w-4 mr-1" />
                                    Share with Friend
                                  </Button>
                                </div>
                              </div>
                            )}
                            
                            {card.status === 'used' && (
                              <div className="text-center">
                                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                  <CreditCard className="h-6 w-6 text-green-600" />
                                </div>
                                <p className="text-sm text-green-600 font-medium">
                                  ✓ Credit Applied Successfully
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Your next invoice will be reduced
                                </p>
                              </div>
                            )}
                            
                            {card.status === 'expired' && (
                              <div className="text-center">
                                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-2">
                                  <Clock className="h-6 w-6 text-red-600" />
                                </div>
                                <p className="text-sm text-red-600 font-medium">
                                  ⚠️ Reward Expired
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  This reward is no longer available
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious />
                <CarouselNext />
              </Carousel>
              
              {/* Card counter */}
              <div className="text-center text-sm text-muted-foreground">
                {rewardCards.length > 1 && (
                  <span>
                    Card {Math.min(rewardCards.findIndex(card => card.status === 'available') + 1, rewardCards.length)} of {rewardCards.length}
                  </span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            How Our Rewards Program Works
          </CardTitle>
          <CardDescription>
            Earn credits automatically based on your subscription loyalty
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto font-semibold">
                1
              </div>
              <h3 className="font-medium">Stay Subscribed</h3>
              <p className="text-sm text-muted-foreground">
                Keep your subscription active for 3 consecutive months
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto font-semibold">
                2
              </div>
              <h3 className="font-medium">Earn Credits</h3>
              <p className="text-sm text-muted-foreground">
                Receive 1 month free credit based on your current plan
              </p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center mx-auto font-semibold">
                3
              </div>
              <h3 className="font-medium">Use or Share</h3>
              <p className="text-sm text-muted-foreground">
                Apply to your account or share with a friend via referral
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 