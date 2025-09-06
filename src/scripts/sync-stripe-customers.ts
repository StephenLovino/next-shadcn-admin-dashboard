import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncStripeCustomers() {
  console.log('🔄 Starting Stripe customer sync...');
  
  try {
    let hasMore = true;
    let startingAfter: string | undefined;
    let totalSynced = 0;
    
    while (hasMore) {
      // Fetch customers from Stripe (100 at a time)
      const customers = await stripe.customers.list({
        limit: 100,
        starting_after: startingAfter,
      });
      
      console.log(`📥 Fetched ${customers.data.length} customers from Stripe`);
      
      // Process each customer
      for (const customer of customers.data) {
        if (!customer.email) {
          console.log(`⚠️ Skipping customer ${customer.id} - no email`);
          continue;
        }
        
        try {
          // Check if profile already exists
          const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', customer.email)
            .single();
          
          if (existingProfile) {
            // Update existing profile with stripe_customer_id
            await supabase
              .from('profiles')
              .update({ 
                stripe_customer_id: customer.id,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingProfile.id);
            
            console.log(`✅ Updated existing profile: ${customer.email}`);
          } else {
            // Create new profile
            await supabase
              .from('profiles')
              .insert({
                email: customer.email,
                full_name: customer.name || customer.email.split('@')[0],
                role: 'user', // Default role
                stripe_customer_id: customer.id,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
            
            console.log(`✅ Created new profile: ${customer.email}`);
          }
          
          totalSynced++;
          
          // Sync subscriptions for this customer
          await syncCustomerSubscriptions(customer.id, customer.email);
          
        } catch (error) {
          console.error(`❌ Error processing customer ${customer.email}:`, error);
        }
      }
      
      // Check if there are more customers
      hasMore = customers.has_more;
      if (customers.data.length > 0) {
        startingAfter = customers.data[customers.data.length - 1].id;
      }
      
      console.log(`📊 Progress: ${totalSynced} customers synced so far`);
    }
    
    console.log(`🎉 Sync complete! Total customers synced: ${totalSynced}`);
    
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

async function syncCustomerSubscriptions(customerId: string, customerEmail: string) {
  try {
    // Get all subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      limit: 100,
    });
    
    for (const subscription of subscriptions.data) {
      // Check if subscription already exists
      const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('stripe_subscription_id', subscription.id)
        .single();
      
      if (existingSub) {
        // Update existing subscription
        await supabase
          .from('subscriptions')
          .update({
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingSub.id);
      } else {
        // Get user_id for this customer
        const { data: user } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single();
        
        if (user) {
          // Create new subscription
          await supabase
            .from('subscriptions')
            .insert({
              user_id: user.id,
              stripe_customer_id: customerId,
              stripe_subscription_id: subscription.id,
              status: subscription.status,
              current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              cancel_at_period_end: subscription.cancel_at_period_end,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
        }
      }
      
      // Sync payment history for this subscription
      await syncSubscriptionPayments(subscription.id, customerId);
    }
    
  } catch (error) {
    console.error(`❌ Error syncing subscriptions for ${customerEmail}:`, error);
  }
}

async function syncSubscriptionPayments(subscriptionId: string) {
  try {
    // Get all invoices for this subscription
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 100,
    });
    
    for (const invoice of invoices.data) {
      if (invoice.payment_intent && invoice.status === 'paid') {
        // Check if payment already exists
        const { data: existingPayment } = await supabase
          .from('payment_history')
          .select('id')
          .eq('stripe_payment_intent_id', invoice.payment_intent)
          .single();
        
        if (!existingPayment) {
          // Create new payment record
          await supabase
            .from('payment_history')
            .insert({
              subscription_id: subscriptionId,
              stripe_payment_intent_id: invoice.payment_intent,
              amount: invoice.amount_paid,
              currency: invoice.currency,
              status: 'succeeded',
              payment_date: new Date(invoice.created * 1000).toISOString(),
              created_at: new Date().toISOString(),
            });
        }
      }
    }
    
  } catch (error) {
    console.error(`❌ Error syncing payments for subscription ${subscriptionId}:`, error);
  }
}

// Run the sync
if (require.main === module) {
  syncStripeCustomers();
}

export { syncStripeCustomers }; 