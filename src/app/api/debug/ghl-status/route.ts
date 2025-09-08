import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    // Check current GHL sync status in database
    const { data: customers, error } = await supabase
      .from('customers')
      .select('email, ghl_contact_id, ghl_sync_status, ghl_last_synced_at, ghl_tags')
      .limit(10);

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Get counts by sync status
    const { data: statusCounts, error: countError } = await supabase
      .from('customers')
      .select('ghl_sync_status')
      .not('ghl_sync_status', 'is', null);

    if (countError) {
      console.error('Count error:', countError);
    }

    const syncStatusSummary = statusCounts?.reduce((acc: Record<string, number>, customer) => {
      const status = customer.ghl_sync_status || 'null';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {}) || {};

    // Check environment variables
    const envCheck = {
      GHL_PRIVATE_INTEGRATION_TOKEN: !!process.env.GHL_PRIVATE_INTEGRATION_TOKEN,
      GHL_LOCATION_ID: !!process.env.GHL_LOCATION_ID,
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL
    };

    return NextResponse.json({
      success: true,
      data: {
        sampleCustomers: customers,
        syncStatusSummary,
        totalCustomers: customers?.length || 0,
        environmentVariables: envCheck,
        recommendations: [
          !envCheck.GHL_PRIVATE_INTEGRATION_TOKEN && "Missing GHL_PRIVATE_INTEGRATION_TOKEN",
          !envCheck.GHL_LOCATION_ID && "Missing GHL_LOCATION_ID",
          Object.values(syncStatusSummary).every(count => count === 0) && "No customers have been synced with GHL yet"
        ].filter(Boolean)
      }
    });

  } catch (error) {
    console.error('Debug GHL status error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
