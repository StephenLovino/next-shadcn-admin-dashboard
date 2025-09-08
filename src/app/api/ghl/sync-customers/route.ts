import { NextResponse } from 'next/server';
import { ghlClient } from '@/lib/ghl-mcp';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    // Get auth header from request
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized - No auth header' }, { status: 401 });
    }

    // Verify the session using the auth header
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized - Invalid token' }, { status: 401 });
    }

    // Get Stripe customers from database
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch customers: ${error.message}`);
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No customers to sync',
        result: {
          matched: 0,
          updated: 0,
          errors: 0,
          total: 0,
          details: []
        }
      });
    }

    // Sync customers with GHL
    const syncResult = await ghlClient.syncStripeCustomersWithGHL(customers);

    return NextResponse.json({
      success: true,
      message: `Sync completed: ${syncResult.matched} matched, ${syncResult.updated} updated, ${syncResult.errors} errors`,
      result: syncResult
    });

  } catch (error) {
    console.error('GHL sync error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Sync failed' 
    }, { status: 500 });
  }
}
