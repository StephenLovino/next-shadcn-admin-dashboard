import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GHLContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  tags: string[];
}

class GHLClient {
  private config: {
    apiUrl: string;
    headers: {
      Authorization: string;
      locationId: string;
      Version: string;
    };
  };

  constructor() {
    this.config = {
      apiUrl: 'https://services.leadconnectorhq.com/',
      headers: {
        Authorization: `Bearer ${Deno.env.get('GHL_PRIVATE_INTEGRATION_TOKEN') || ''}`,
        locationId: Deno.env.get('GHL_LOCATION_ID') || 'LL7TmGrkL72EOf8O0FKA',
        Version: '2021-07-28'
      }
    };
  }

  private async makeRequest(endpoint: string, method: string = 'GET', body?: any) {
    try {
      console.log(`GHL API Request: ${method} ${endpoint}`);
      
      const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.config.headers.Authorization,
          'Version': this.config.headers.Version
        },
        body: body ? JSON.stringify(body) : undefined
      });

      console.log(`GHL API Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('GHL API Error Response:', errorText);
        throw new Error(`GHL API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`GHL API Result:`, result);
      return result;
    } catch (error) {
      console.error('GHL API Request failed:', error);
      throw error;
    }
  }

  async getContacts(limit: number = 100, offset: number = 0): Promise<GHLContact[]> {
    try {
      console.log(`Fetching GHL contacts: limit=${limit}, offset=${offset}`);
      const result = await this.makeRequest(`contacts?limit=${limit}&offset=${offset}`);
      
      const contacts = result.contacts || [];
      console.log(`Fetched ${contacts.length} contacts from GHL`);
      return contacts;
    } catch (error) {
      console.error('Failed to fetch GHL contacts:', error);
      return [];
    }
  }

  async getContactByEmail(email: string): Promise<GHLContact | null> {
    try {
      console.log(`Searching for contact with email: ${email}`);
      
      const contacts = await this.getContacts(1000, 0);
      const foundContact = contacts.find(contact => 
        contact.email?.toLowerCase() === email.toLowerCase()
      );
      
      if (foundContact) {
        console.log(`Found contact via search: ${foundContact.email} (ID: ${foundContact.id})`);
        return foundContact;
      }

      console.log(`Contact not found in GHL: ${email}`);
      return null;
    } catch (error) {
      console.error('Failed to fetch GHL contact by email:', error);
      return null;
    }
  }

  async addTagsToContact(contactId: string, tags: string[]): Promise<boolean> {
    try {
      console.log(`Adding tags to contact ${contactId}:`, tags);
      await this.makeRequest(`contacts/${contactId}/tags`, 'POST', { tags });
      console.log(`Successfully added tags to contact ${contactId}`);
      return true;
    } catch (error) {
      console.error('Failed to add tags to contact:', error);
      return false;
    }
  }

  async removeTagsFromContact(contactId: string, tags: string[]): Promise<boolean> {
    try {
      console.log(`Removing tags from contact ${contactId}:`, tags);
      await this.makeRequest(`contacts/${contactId}/tags`, 'DELETE', { tags });
      console.log(`Successfully removed tags from contact ${contactId}`);
      return true;
    } catch (error) {
      console.error('Failed to remove tags from contact:', error);
      return false;
    }
  }

  async getTags(): Promise<string[]> {
    try {
      const contacts = await this.getContacts(1000, 0);
      const allTags = new Set<string>();
      
      contacts.forEach(contact => {
        if (contact.tags && Array.isArray(contact.tags)) {
          contact.tags.forEach(tag => allTags.add(tag));
        }
      });

      const tags = Array.from(allTags);
      console.log(`Found ${tags.length} unique tags in GHL`);
      return tags;
    } catch (error) {
      console.error('Failed to fetch GHL tags:', error);
      return [];
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const email = url.searchParams.get('email')
    const contactId = url.searchParams.get('contactId')
    const tags = url.searchParams.get('tags')?.split(',').filter(Boolean) || []

    const ghlClient = new GHLClient()

    switch (action) {
      case 'get-contacts':
        const contacts = await ghlClient.getContacts(1000, 0)
        return new Response(JSON.stringify({ contacts }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

      case 'get-contact-by-email':
        console.log('get-contact-by-email action called with email:', email)
        if (!email || email.trim() === '' || email === ':1') {
          console.error('Invalid email parameter:', email)
          return new Response(JSON.stringify({ error: 'Valid email parameter required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const contact = await ghlClient.getContactByEmail(email)
        return new Response(JSON.stringify({ contact }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

      case 'add-tags':
        if (!contactId || tags.length === 0) {
          return new Response(JSON.stringify({ error: 'ContactId and tags required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const addResult = await ghlClient.addTagsToContact(contactId, tags)
        return new Response(JSON.stringify({ success: addResult }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

      case 'remove-tags':
        if (!contactId || tags.length === 0) {
          return new Response(JSON.stringify({ error: 'ContactId and tags required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        const removeResult = await ghlClient.removeTagsFromContact(contactId, tags)
        return new Response(JSON.stringify({ success: removeResult }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

      case 'get-tags':
        const allTags = await ghlClient.getTags()
        return new Response(JSON.stringify({ tags: allTags }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
