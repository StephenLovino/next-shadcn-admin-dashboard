import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    
    if (!email) {
      return NextResponse.json({ 
        error: 'Email parameter is required' 
      }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 })
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/ghl-contacts?action=get-contact-by-email&email=${encodeURIComponent(email)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Edge function error: ${response.status}`)
    }

    const data = await response.json()
    
    if (!data.contact) {
      return NextResponse.json({ 
        success: false, 
        message: 'Contact not found in GHL',
        contact: null,
        tags: []
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      contact: data.contact,
      tags: data.contact.tags || []
    });
  } catch (error) {
    console.error('Failed to fetch contact tags:', error);
    return NextResponse.json({ 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to fetch contact tags' 
    }, { status: 500 });
  }
}
