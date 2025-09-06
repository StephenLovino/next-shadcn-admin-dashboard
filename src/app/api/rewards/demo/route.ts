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

    // Create demo rewards for testing
    const demoRewards = [
      {
        user_id: user.id,
        type: 'quarterly_reward',
        months_earned: 1,
        status: 'pending',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year from now
      },
      {
        user_id: user.id,
        type: 'quarterly_reward',
        months_earned: 1,
        status: 'applied',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        claimed_at: new Date().toISOString(),
      },
      {
        user_id: user.id,
        type: 'quarterly_reward',
        months_earned: 1,
        status: 'shared',
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        claimed_at: new Date().toISOString(),
      }
    ];

    const createdRewards = [];
    
    for (const reward of demoRewards) {
      const { data: newReward, error: rewardError } = await supabase
        .from('loyalty_rewards')
        .insert(reward)
        .select()
        .single();

      if (!rewardError && newReward) {
        createdRewards.push(newReward);
      }
    }

    return NextResponse.json({
      message: 'Demo rewards created successfully',
      rewardsCreated: createdRewards.length,
      rewards: createdRewards
    });

  } catch (error) {
    console.error('Create demo rewards error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create demo rewards', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
} 