import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

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

    // Generate a unique referral code
    const referralCode = crypto.randomBytes(16).toString('hex');
    
    // For now, store referral info in the loyalty_rewards metadata
    // In the future, create a proper referrals table
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    // Update the reward status to 'shared'
    await supabase
      .from('loyalty_rewards')
      .update({
        status: 'shared',
        claimed_at: new Date().toISOString(),
      })
      .eq('id', rewardId);

    // Generate the referral link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const referralLink = `${baseUrl}/auth/v1/register?ref=${referralCode}`;

    return NextResponse.json({
      success: true,
      referralCode,
      referralLink,
      expiresAt,
      message: `Referral link generated! Share it with a friend to give them ${reward.months_earned} month(s) free.`,
    });

  } catch (error) {
    console.error('Generate referral error:', error);
    return NextResponse.json(
      { error: 'Failed to generate referral', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 