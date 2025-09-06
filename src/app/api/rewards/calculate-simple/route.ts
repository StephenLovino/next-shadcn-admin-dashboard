import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration is missing');
  }
  
  return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const supabase = getSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    console.log('Calculating loyalty rewards for user:', user.email);

    // Get user's subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('id, stripe_subscription_id, status, current_period_start')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (subError || !subscription) {
      return NextResponse.json(
        JSON.stringify({ message: 'No active subscription found' }), 
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Count successful payments for this subscription
    const { count: paymentCount } = await supabase
      .from('payment_history')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_id', subscription.stripe_subscription_id)
      .eq('status', 'succeeded');

    if (paymentCount === null || paymentCount === 0) {
      return NextResponse.json(
        JSON.stringify({ message: 'No payments found' }), 
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log('Payment count:', paymentCount);

    // Calculate how many rewards the user should have
    const expectedRewards = Math.floor(paymentCount / 3);
    
    // Count existing rewards
    const { count: existingRewards } = await supabase
      .from('loyalty_rewards')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('type', 'quarterly_reward');

    const rewardsToCreate = expectedRewards - (existingRewards || 0);

    console.log(`Expected rewards: ${expectedRewards}, Existing rewards: ${existingRewards}, To create: ${rewardsToCreate}`);

    // Create missing rewards
    const newRewards = [];
    for (let i = 0; i < rewardsToCreate; i++) {
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1); // Expires in 1 year

      const { data: newReward, error: rewardError } = await supabase
        .from('loyalty_rewards')
        .insert({
          user_id: user.id,
          type: 'quarterly_reward',
          months_earned: 1,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (!rewardError && newReward) {
        newRewards.push(newReward);
        console.log('Created loyalty reward:', newReward.id);
      }
    }

    return NextResponse.json({
      message: 'Loyalty rewards calculated successfully',
      paymentCount,
      expectedRewards,
      existingRewards: existingRewards || 0,
      newRewardsCreated: newRewards.length,
      newRewards
    });

  } catch (error) {
    console.error('Calculate loyalty rewards error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to calculate loyalty rewards', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
} 