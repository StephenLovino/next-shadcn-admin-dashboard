import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { customerIds, tags, action = 'add' } = body;

    if (!customerIds || !Array.isArray(customerIds) || customerIds.length === 0) {
      return NextResponse.json({ 
        error: 'Customer IDs are required' 
      }, { status: 400 });
    }

    if (!tags || !Array.isArray(tags) || tags.length === 0) {
      return NextResponse.json({ 
        error: 'Tags are required' 
      }, { status: 400 });
    }

    // Get customer emails from database
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, email')
      .in('id', customerIds);

    if (error) {
      throw new Error(`Failed to fetch customers: ${error.message}`);
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
    }

    for (const customer of customers) {
      try {
        // Find GHL contact by email using Edge Function
        const contactResponse = await fetch(`${supabaseUrl}/functions/v1/ghl-contacts?action=get-contact-by-email&email=${encodeURIComponent(customer.email)}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!contactResponse.ok) {
          throw new Error(`Failed to fetch contact: ${contactResponse.status}`)
        }

        const contactData = await contactResponse.json();
        const ghlContact = contactData.contact;
        
        if (ghlContact) {
          // Add or remove tags using Edge Function
          const tagAction = action === 'add' ? 'add-tags' : 'remove-tags';
          const tagResponse = await fetch(`${supabaseUrl}/functions/v1/ghl-contacts?action=${tagAction}&contactId=${ghlContact.id}&tags=${tags.join(',')}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${supabaseServiceKey}`,
              'Content-Type': 'application/json'
            }
          });

          if (!tagResponse.ok) {
            throw new Error(`Failed to ${action} tags: ${tagResponse.status}`)
          }

          const tagData = await tagResponse.json();
          
          if (tagData.success) {
            successCount++;
            results.push({
              customerId: customer.id,
              email: customer.email,
              ghlContactId: ghlContact.id,
              status: 'success',
              message: `Tags ${action}ed successfully`
            });
          } else {
            errorCount++;
            results.push({
              customerId: customer.id,
              email: customer.email,
              ghlContactId: ghlContact.id,
              status: 'error',
              message: `Failed to ${action} tags`
            });
          }
        } else {
          errorCount++;
          results.push({
            customerId: customer.id,
            email: customer.email,
            ghlContactId: null,
            status: 'error',
            message: 'Contact not found in GHL'
          });
        }
      } catch (error) {
        errorCount++;
        results.push({
          customerId: customer.id,
          email: customer.email,
          ghlContactId: null,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Bulk tag ${action} completed: ${successCount} successful, ${errorCount} errors`,
      result: {
        total: customers.length,
        successful: successCount,
        errors: errorCount,
        details: results
      }
    });

  } catch (error) {
    console.error('Bulk tag error:', error);
    return NextResponse.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Bulk tag operation failed' 
    }, { status: 500 });
  }
}
