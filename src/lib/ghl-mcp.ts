/**
 * GoHighLevel MCP Client
 * Handles communication with GHL MCP server for contact management and tagging
 */

import { supabase } from './supabase';

interface GHLConfig {
  mcpUrl: string;
  apiUrl: string;
  headers: {
    Authorization: string;
    locationId: string;
    Version: string;
  };
}

interface GHLContact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  tags: string[];
  customFields: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface GHLTag {
  id: string;
  name: string;
  color: string;
}

interface GHLSyncResult {
  matched: number;
  updated: number;
  errors: number;
  total: number;
  details: {
    contactId: string;
    email: string;
    status: 'matched' | 'updated' | 'error' | 'not_found';
    message?: string;
  }[];
}

class GHLMCPClient {
  private config: GHLConfig;
  private connectionFailed: boolean = false;
  private supabaseClient = supabase;

  constructor() {
    this.config = {
      mcpUrl: 'https://services.leadconnectorhq.com/mcp/',
      apiUrl: 'https://services.leadconnectorhq.com/',
      headers: {
        Authorization: `Bearer ${process.env.GHL_PRIVATE_INTEGRATION_TOKEN || ''}`,
        locationId: process.env.GHL_LOCATION_ID || 'LL7TmGrkL72EOf8O0FKA',
        Version: '2021-07-28'
      }
    };
  }

  /**
   * Make HTTP request to GHL MCP server
   */
  private async makeRequest(toolName: string, params: any = {}) {
    try {
      console.log(`GHL MCP Request: ${toolName}`, params);
      
      const response = await fetch(`${this.config.mcpUrl}${toolName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(params)
      });

      console.log(`GHL MCP Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('GHL API Error Response:', errorText);
        throw new Error(`GHL API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`GHL MCP Result:`, result);
      return result;
    } catch (error) {
      console.error('GHL MCP Request failed:', error);
      throw error;
    }
  }

  /**
   * Make direct HTTP request to GHL API
   */
  private async makeDirectRequest(endpoint: string, method: string = 'GET', body?: any) {
    try {
      console.log(`GHL Direct API Request: ${method} ${endpoint}`, body);
      
      const response = await fetch(`${this.config.apiUrl}${endpoint}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.config.headers.Authorization,
          'Version': this.config.headers.Version
        },
        body: body ? JSON.stringify(body) : undefined
      });

      console.log(`GHL Direct API Response: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('GHL Direct API Error Response:', errorText);
        throw new Error(`GHL Direct API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`GHL Direct API Result:`, result);
      return result;
    } catch (error) {
      console.error('GHL Direct API Request failed:', error);
      throw error;
    }
  }

  /**
   * Get all contacts from GHL using direct API
   */
  async getContacts(limit: number = 100, offset: number = 0): Promise<GHLContact[]> {
    // If connection previously failed, don't retry
    if (this.connectionFailed) {
      console.log('GHL connection previously failed, skipping request');
      return [];
    }

    try {
      console.log(`Fetching GHL contacts: limit=${limit}, offset=${offset}`);
      const result = await this.makeDirectRequest(`contacts?limit=${limit}&offset=${offset}`);
      
      const contacts = result.contacts || [];
      console.log(`Fetched ${contacts.length} contacts from GHL`);
      return contacts;
    } catch (error) {
      console.error('Failed to fetch GHL contacts:', error);
      this.connectionFailed = true; // Mark connection as failed
      return [];
    }
  }

  /**
   * Get all available tags from GHL
   */
  async getTags(): Promise<GHLTag[]> {
    try {
      // Note: GHL MCP doesn't have a direct get-tags endpoint
      // We'll need to fetch contacts and extract unique tags
      const contacts = await this.getContacts(1000, 0);
      const tagMap = new Map<string, GHLTag>();
      
      contacts.forEach(contact => {
        contact.tags?.forEach(tag => {
          if (!tagMap.has(tag)) {
            tagMap.set(tag, {
              id: tag.toLowerCase().replace(/\s+/g, '-'),
              name: tag,
              color: '#3B82F6' // Default blue color
            });
          }
        });
      });

      return Array.from(tagMap.values());
    } catch (error) {
      console.error('Failed to fetch GHL tags:', error);
      return [];
    }
  }

  /**
   * Get tags for a specific contact by email
   */
  async getContactTags(email: string): Promise<string[]> {
    try {
      const contact = await this.getContactByEmail(email);
      return contact?.tags || [];
    } catch (error) {
      console.error('Failed to fetch contact tags:', error);
      return [];
    }
  }

  /**
   * Get detailed contact information including tags
   */
  async getContactDetails(email: string): Promise<GHLContact | null> {
    try {
      const contact = await this.getContactByEmail(email);
      return contact;
    } catch (error) {
      console.error('Failed to fetch contact details:', error);
      return null;
    }
  }

  /**
   * Search for a specific contact by email using direct API
   */
  async getContactByEmail(email: string): Promise<GHLContact | null> {
    try {
      console.log(`Searching for contact with email: ${email}`);
      
      // First try to get all contacts and search by email
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

  /**
   * Get contact by ID using direct API
   */
  async getContactById(contactId: string): Promise<GHLContact | null> {
    try {
      console.log(`Getting contact by ID: ${contactId}`);
      const result = await this.makeDirectRequest(`contacts/${contactId}`);
      return result.contact || null;
    } catch (error) {
      console.error('Failed to fetch GHL contact by ID:', error);
      return null;
    }
  }

  /**
   * Add tags to a contact using direct API
   */
  async addTagsToContact(contactId: string, tags: string[]): Promise<boolean> {
    try {
      console.log(`Adding tags to contact ${contactId}:`, tags);
      await this.makeDirectRequest(`contacts/${contactId}/tags`, 'POST', { tags });
      console.log(`Successfully added tags to contact ${contactId}`);
      return true;
    } catch (error) {
      console.error('Failed to add tags to contact:', error);
      return false;
    }
  }

  /**
   * Remove tags from a contact using direct API
   */
  async removeTagsFromContact(contactId: string, tags: string[]): Promise<boolean> {
    try {
      console.log(`Removing tags from contact ${contactId}:`, tags);
      await this.makeDirectRequest(`contacts/${contactId}/tags`, 'DELETE', { tags });
      console.log(`Successfully removed tags from contact ${contactId}`);
      return true;
    } catch (error) {
      console.error('Failed to remove tags from contact:', error);
      return false;
    }
  }

  /**
   * Update contact information
   */
  async updateContact(contactId: string, updates: Partial<GHLContact>): Promise<boolean> {
    try {
      await this.makeRequest('contacts_update-contact', {
        contactId,
        ...updates
      });
      
      return true;
    } catch (error) {
      console.error('Failed to update contact:', error);
      return false;
    }
  }

  /**
   * Bulk sync Stripe customers with GHL contacts
   */
  async syncStripeCustomersWithGHL(stripeCustomers: any[]): Promise<GHLSyncResult> {
    const result: GHLSyncResult = {
      matched: 0,
      updated: 0,
      errors: 0,
      total: stripeCustomers.length,
      details: []
    };

    for (const customer of stripeCustomers) {
      try {
        // Find matching GHL contact by email
        const ghlContact = await this.getContactByEmail(customer.email);
        
        if (ghlContact) {
          result.matched++;

          // Get current tags from GHL contact
          const currentTags = ghlContact.tags || [];

          // Determine tags based on Stripe data
          const newTags = this.generateTagsFromStripeData(customer);

          // Update database with GHL contact info and current tags
          try {
            const { error: updateError } = await this.supabaseClient
              .from('customers')
              .update({
                ghl_contact_id: ghlContact.id,
                ghl_sync_status: 'synced',
                ghl_last_synced_at: new Date().toISOString(),
                ghl_tags: currentTags
              })
              .eq('email', customer.email);

            if (updateError) {
              console.error('Failed to update customer in database:', updateError);
            }
          } catch (dbError) {
            console.error('Database update error:', dbError);
          }

          if (newTags.length > 0) {
            const success = await this.addTagsToContact(ghlContact.id, newTags);
            if (success) {
              result.updated++;

              // Update database with new tags after adding them
              try {
                const updatedTags = [...new Set([...currentTags, ...newTags])];
                await this.supabaseClient
                  .from('customers')
                  .update({ ghl_tags: updatedTags })
                  .eq('email', customer.email);
              } catch (dbError) {
                console.error('Failed to update tags in database:', dbError);
              }

              result.details.push({
                contactId: ghlContact.id,
                email: customer.email,
                status: 'updated',
                message: `Added tags: ${newTags.join(', ')}`
              });
            } else {
              result.errors++;
              result.details.push({
                contactId: ghlContact.id,
                email: customer.email,
                status: 'error',
                message: 'Failed to add tags'
              });
            }
          } else {
            result.details.push({
              contactId: ghlContact.id,
              email: customer.email,
              status: 'matched',
              message: 'Contact synced, no new tags to add'
            });
          }
        } else {
          // Update database to mark as not found
          try {
            await this.supabaseClient
              .from('customers')
              .update({
                ghl_contact_id: null,
                ghl_sync_status: 'not_found',
                ghl_last_synced_at: new Date().toISOString(),
                ghl_tags: []
              })
              .eq('email', customer.email);
          } catch (dbError) {
            console.error('Failed to update not found customer in database:', dbError);
          }

          result.details.push({
            contactId: '',
            email: customer.email,
            status: 'not_found',
            message: 'Contact not found in GHL'
          });
        }
      } catch (error) {
        result.errors++;
        result.details.push({
          contactId: '',
          email: customer.email,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return result;
  }

  /**
   * Generate tags based on Stripe customer data
   */
  private generateTagsFromStripeData(customer: any): string[] {
    const tags: string[] = [];

    // Subscription status tags
    if (customer.subscription_status === 'active') {
      tags.push('Stripe-Active');
    } else if (customer.subscription_status === 'canceled') {
      tags.push('Stripe-Canceled');
    } else if (customer.subscription_status === 'past_due') {
      tags.push('Stripe-PastDue');
    } else {
      tags.push('Stripe-NoSubscription');
    }

    // Loyalty level tags
    if (customer.loyalty_progress >= 6) {
      tags.push('Stripe-Loyal-6+');
    } else if (customer.loyalty_progress >= 3) {
      tags.push('Stripe-Loyal-3+');
    } else if (customer.loyalty_progress >= 1) {
      tags.push('Stripe-Loyal-1+');
    } else {
      tags.push('Stripe-New');
    }

    // Payment behavior tags
    if (customer.total_paid > 10000) { // $100+ in cents
      tags.push('Stripe-HighValue');
    } else if (customer.payment_count > 5) {
      tags.push('Stripe-Frequent');
    }

    return tags;
  }

  /**
   * Test connection to GHL API
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log('Testing GHL API connection...');
      console.log('Using Location ID:', this.config.headers.locationId);
      console.log('Using Token:', this.config.headers.Authorization.substring(0, 20) + '...');
      
      this.connectionFailed = false; // Reset connection status
      await this.getContacts(1, 0);
      console.log('GHL API connection test successful');
      return true;
    } catch (error) {
      console.error('GHL connection test failed:', error);
      return false;
    }
  }

  /**
   * Reset connection status (useful for retrying after fixing credentials)
   */
  resetConnection(): void {
    this.connectionFailed = false;
    console.log('GHL connection status reset');
  }
}

export const ghlClient = new GHLMCPClient();
export type { GHLContact, GHLTag, GHLSyncResult };
