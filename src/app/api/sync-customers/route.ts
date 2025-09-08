import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

// Initialize clients inside functions to avoid build-time issues
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-08-27.basil',
  });
}

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
    // Get the authorization header
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

    // Check if user is owner or admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'owner' && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Access denied. Only owners and admins can sync customers.' }, { status: 403 });
    }

    // Sync customers to database
    const result = await syncCustomersToDatabase();

    return NextResponse.json({
      success: true,
      synced: result.synced,
      message: `Successfully synced ${result.synced} customers to database`
    });

  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

async function syncCustomersToDatabase() {
  let totalSynced = 0;
  let hasMore = true;
  let startingAfter: string | undefined;

  console.log('🔄 Starting efficient customer sync...');
  
  const stripe = getStripe();
  const supabase = getSupabase();


  while (hasMore) {
    try {
      const customers = await stripe.customers.list({
        limit: 50, // Reduced batch size
        starting_after: startingAfter,
      });

      console.log(`📥 Processing ${customers.data.length} customers... (${totalSynced} synced so far)`);

      for (const customer of customers.data) {
        try {
          // Basic customer data first
          let subscriptionStatus = 'No Subscription';
          let subscriptionId = null;
          let subscriptionPlan = null;
          let subscriptionPlanId = null;
          let currentPeriodEnd = null;
          let hasActiveSubscription = false;
          let hasCanceledSubscription = false;
          let hasTrialingSubscription = false;
          let hasCard = false;
          let cardStatus = 'No Card';
          let paymentCount = 0;
          let totalPaid = 0;
          let lastPaymentDate = null;
          let failedPaymentCount = 0;

          // Only get subscription data if customer has email (likely real customer)
          if (customer.email) {
            try {
              // Get only active subscriptions first (most important)
              const activeSubscriptions = await stripe.subscriptions.list({
                customer: customer.id,
                status: 'active',
                limit: 1,
              });

              if (activeSubscriptions.data.length > 0) {
                const sub = activeSubscriptions.data[0];
                subscriptionStatus = sub.status;
                subscriptionId = sub.id;
                hasActiveSubscription = true;
                
                // Get subscription plan details
                if (sub.items && sub.items.data && sub.items.data.length > 0) {
                  const price = sub.items.data[0].price;
                  if (price) {
                    subscriptionPlanId = price.id;
                    
                    // Try to get the product name from Stripe
                    try {
                      if (price.product) {
                        const product = await stripe.products.retrieve(price.product as string);
                        subscriptionPlan = product.name;
                      } else if (price.metadata && price.metadata.plan_name) {
                        subscriptionPlan = price.metadata.plan_name;
                      } else if (price.nickname) {
                        subscriptionPlan = price.nickname;
                      } else {
                        // Fallback to price amount and interval
                        const amount = price.unit_amount ? (price.unit_amount / 100) : 0;
                        const interval = price.recurring?.interval || 'month';
                        subscriptionPlan = `$${amount}/${interval}`;
                      }
                    } catch (productError) {
                      console.log(`Could not fetch product for price ${price.id}:`, productError);
                      // Fallback to price amount and interval
                      const amount = price.unit_amount ? (price.unit_amount / 100) : 0;
                      const interval = price.recurring?.interval || 'month';
                      subscriptionPlan = `$${amount}/${interval}`;
                    }
                  }
                }
                
                // Safely handle current_period_end
                try {
                  const subData = sub as any;
                  if (subData.current_period_end && typeof subData.current_period_end === 'number') {
                    currentPeriodEnd = new Date(subData.current_period_end * 1000).toISOString();
                  }
                } catch {
                  console.log(`Invalid current_period_end for subscription ${sub.id}`);
                }
              } else {
                // Only check other statuses if no active subscription
                const otherSubscriptions = await stripe.subscriptions.list({
                  customer: customer.id,
                  status: 'all',
                  limit: 5, // Reduced limit
                });

                if (otherSubscriptions.data.length > 0) {
                  const latestSub = otherSubscriptions.data[0];
                  subscriptionStatus = latestSub.status;
                  subscriptionId = latestSub.id;
                  
                  // Get subscription plan details for non-active subscriptions too
                  if (latestSub.items && latestSub.items.data && latestSub.items.data.length > 0) {
                    const price = latestSub.items.data[0].price;
                    if (price) {
                      subscriptionPlanId = price.id;
                      
                      // Try to get the product name from Stripe
                      try {
                        if (price.product) {
                          const product = await stripe.products.retrieve(price.product as string);
                          subscriptionPlan = product.name;
                        } else if (price.metadata && price.metadata.plan_name) {
                          subscriptionPlan = price.metadata.plan_name;
                        } else if (price.nickname) {
                          subscriptionPlan = price.nickname;
                        } else {
                          const amount = price.unit_amount ? (price.unit_amount / 100) : 0;
                          const interval = price.recurring?.interval || 'month';
                          subscriptionPlan = `$${amount}/${interval}`;
                        }
                      } catch (productError) {
                        console.log(`Could not fetch product for price ${price.id}:`, productError);
                        const amount = price.unit_amount ? (price.unit_amount / 100) : 0;
                        const interval = price.recurring?.interval || 'month';
                        subscriptionPlan = `$${amount}/${interval}`;
                      }
                    }
                  }
                  
                  hasCanceledSubscription = otherSubscriptions.data.some(sub => sub.status === 'canceled');
                  hasTrialingSubscription = otherSubscriptions.data.some(sub => sub.status === 'trialing');
                }
              }

              // Check payment methods (lightweight)
              const paymentMethods = await stripe.paymentMethods.list({
                customer: customer.id,
                type: 'card',
                limit: 1, // Only need to know if they have a card
              });

              hasCard = paymentMethods.data.length > 0;
              cardStatus = hasCard ? 'Active' : 'No Card';

              // Get recent payment history (limited)
              const charges = await stripe.charges.list({
                customer: customer.id,
                limit: 20, // Reduced from 100
              });

              const successfulCharges = charges.data.filter(charge => charge.status === 'succeeded');
              const failedCharges = charges.data.filter(charge => charge.status === 'failed');
              
              paymentCount = successfulCharges.length;
              totalPaid = successfulCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
              failedPaymentCount = failedCharges.length;
              
              lastPaymentDate = successfulCharges.length > 0 
                ? new Date(successfulCharges[0].created * 1000).toISOString() 
                : null;

            } catch (apiError) {
              console.log(`API error for customer ${customer.id}:`, apiError instanceof Error ? apiError.message : 'Unknown error');
              // Continue with basic data
            }
          }

          const loyaltyProgress = Math.min(paymentCount, 12);

          // Create comprehensive status
          let comprehensiveStatus = subscriptionStatus;
          if (hasCard && subscriptionStatus === 'No Subscription') {
            comprehensiveStatus = 'Has Card - No Subscription';
          } else if (!hasCard && subscriptionStatus !== 'No Subscription') {
            comprehensiveStatus = `${subscriptionStatus} - No Card`;
          }

          // Upsert customer data
          const { error } = await supabase
            .from('customers')
            .upsert({
              stripe_customer_id: customer.id,
              email: customer.email || '',
              full_name: customer.name || customer.email || 'Unknown',
              phone: customer.phone,
              address: customer.address ? {
                line1: customer.address.line1,
                line2: customer.address.line2,
                city: customer.address.city,
                state: customer.address.state,
                postal_code: customer.address.postal_code,
                country: customer.address.country,
              } : null,
              metadata: customer.metadata,
              subscription_status: comprehensiveStatus,
              subscription_id: subscriptionId,
              subscription_plan: subscriptionPlan,
              subscription_plan_id: subscriptionPlanId,
              current_period_end: currentPeriodEnd,
              payment_count: paymentCount,
              total_paid: totalPaid,
              last_payment_date: lastPaymentDate,
              loyalty_progress: loyaltyProgress,
              has_active_subscription: hasActiveSubscription,
              has_canceled_subscription: hasCanceledSubscription,
              has_trialing_subscription: hasTrialingSubscription,
              has_card: hasCard,
              card_status: cardStatus,
              failed_payment_count: failedPaymentCount,
              ghl_contact_id: null,
              ghl_sync_status: 'not_synced',
              ghl_last_synced_at: null,
              ghl_tags: [],
            }, {
              onConflict: 'stripe_customer_id'
            });

          if (error) {
            console.error('Error upserting customer:', error);
          } else {
            totalSynced++;
            if (totalSynced % 5 === 0) {
              console.log(`✅ Synced ${totalSynced} customers so far...`);
            }
          }
        } catch (customerError) {
          console.error('Error processing customer:', customer.id, customerError);
        }
      }

      hasMore = customers.has_more;
      startingAfter = customers.data[customers.data.length - 1]?.id;
      
      // Add delay to prevent rate limiting
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }
    } catch (error) {
      console.error('Database sync error:', error);
      break;
    }
  }

  console.log(`✅ Customer sync complete: ${totalSynced} customers synced`);
  return { synced: totalSynced };
}
