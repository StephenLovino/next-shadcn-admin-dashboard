import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-08-27.basil',
});

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { rewardId } = await request.json();
    
    if (!rewardId) {
      return NextResponse.json({ error: 'Reward ID is required' }, { status: 400 });
    }

    // Get the reward details
    const { data: reward, error: rewardError } = await supabase
      .from('loyalty_rewards')
      .select('*')
      .eq('id', rewardId)
      .eq('user_id', user.id)
      .single();

    if (rewardError || !reward) {
      return NextResponse.json({ error: 'Reward not found' }, { status: 404 });
    }

    if (reward.status !== 'pending') {
      return NextResponse.json({ error: 'Reward already processed' }, { status: 400 });
    }

    // Get user's profile to find Stripe customer ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return NextResponse.json({ error: 'No Stripe customer found' }, { status: 404 });
    }

    // Get the user's current subscription to determine credit amount
    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (subscriptionError || !subscription) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    // Get subscription details from Stripe to determine the plan amount
    const stripeSubscription = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
    const monthlyAmount = stripeSubscription.items.data[0]?.price.unit_amount || 0;
    
    // Calculate credit amount (number of months * monthly amount)
    const creditAmount = monthlyAmount * reward.months_earned;

    // Get current customer balance and add credit
    const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
    const currentBalance = (customer as any).balance || 0;
    const newBalance = currentBalance - creditAmount; // Negative balance means credit

    // Update customer balance
    await stripe.customers.update(profile.stripe_customer_id, {
      balance: newBalance,
      metadata: {
        ...((customer as any).metadata || {}),
        loyalty_credits_applied: 'true',
        last_credit_applied: new Date().toISOString(),
      }
    });

    // Create a customer balance transaction for record keeping
    const balanceTransaction = await stripe.customers.createBalanceTransaction(profile.stripe_customer_id, {
      amount: -creditAmount, // Negative amount creates a credit
      currency: stripeSubscription.items.data[0]?.price.currency || 'usd',
      description: `Loyalty reward: ${reward.months_earned} month(s) free service`,
      metadata: {
        reward_id: rewardId,
        user_id: user.id,
        months_earned: reward.months_earned.toString(),
      }
    });

    // Update the reward status
    await supabase
      .from('loyalty_rewards')
      .update({
        status: 'applied',
        claimed_at: new Date().toISOString(),
      })
      .eq('id', rewardId);

    return NextResponse.json({
      success: true,
      creditAmount,
      balanceTransaction: balanceTransaction.id,
      newBalance,
      message: `Successfully applied ${reward.months_earned} month(s) credit to your account`,
    });

  } catch (error) {
    console.error('Apply credit error:', error);
    return NextResponse.json(
      { error: 'Failed to apply credit', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 