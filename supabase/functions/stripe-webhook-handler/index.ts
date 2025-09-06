import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@12.0.0'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response('Missing stripe signature', { status: 400 })
    }

    const body = await req.text()
    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || ''
    
    let event: Stripe.Event
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return new Response('Invalid signature', { status: 400 })
    }

    console.log('Processing webhook event:', event.type)

    switch (event.type) {
      case 'customer.created':
      case 'customer.updated':
        await handleCustomerChange(event.data.object as Stripe.Customer)
        break
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object as Stripe.Subscription)
        break
      
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice)
        break
      
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice)
        break
      
      default:
        console.log('Unhandled event type:', event.type)
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: 'Webhook handler failed' }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

async function handleCustomerChange(customer: Stripe.Customer) {
  if (!customer.email) return

  console.log('Processing customer change for:', customer.email)

  // Update or create profile with stripe_customer_id
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', customer.email)
    .single()

  if (existingProfile) {
    // Update existing profile with stripe_customer_id
    await supabase
      .from('profiles')
      .update({ 
        stripe_customer_id: customer.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingProfile.id)
    
    console.log('Updated profile with stripe_customer_id:', customer.id)
  } else {
    // Create new profile if doesn't exist
    await supabase
      .from('profiles')
      .insert({
        email: customer.email,
        full_name: customer.name || customer.email.split('@')[0],
        role: 'user', // Default role
        stripe_customer_id: customer.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    
    console.log('Created new profile for customer:', customer.id)
  }

  // Also sync to customers table for admin management
  await syncCustomerToDatabase(customer)
}

async function syncCustomerToDatabase(customer: Stripe.Customer) {
  try {
    // Get subscription data for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      limit: 1,
      status: 'all',
    })

    let subscriptionStatus = 'No Subscription'
    let subscriptionId = null
    let currentPeriodEnd = null

    if (subscriptions.data.length > 0) {
      const subscription = subscriptions.data[0]
      subscriptionStatus = subscription.status
      subscriptionId = subscription.id
      currentPeriodEnd = new Date((subscription as any).current_period_end * 1000).toISOString()
    }

    // Get payment history
    const charges = await stripe.charges.list({
      customer: customer.id,
      limit: 100,
    })

    const successfulCharges = charges.data.filter(charge => charge.status === 'succeeded')
    const paymentCount = successfulCharges.length
    const totalPaid = successfulCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0)
    const lastPaymentDate = successfulCharges.length > 0 
      ? new Date(successfulCharges[0].created * 1000).toISOString() 
      : null

    const loyaltyProgress = Math.min(paymentCount, 12)

    // Upsert customer data to customers table
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
        subscription_status: subscriptionStatus,
        subscription_id: subscriptionId,
        current_period_end: currentPeriodEnd,
        payment_count: paymentCount,
        total_paid: totalPaid,
        last_payment_date: lastPaymentDate,
        loyalty_progress: loyaltyProgress,
      }, {
        onConflict: 'stripe_customer_id'
      })

    if (error) {
      console.error('Error syncing customer to database:', error)
    } else {
      console.log('Synced customer to database:', customer.id)
    }
  } catch (error) {
    console.error('Error in syncCustomerToDatabase:', error)
  }
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  console.log('Processing subscription change for:', subscription.id)

  // Get customer details to find the user
  const customer = await stripe.customers.retrieve(subscription.customer as string)
  if (!customer.email) return

  // Find user by email
  const { data: user } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', customer.email)
    .single()

  if (!user) {
    console.log('No user found for customer email:', customer.email)
    return
  }

  const subscriptionData = {
    user_id: user.id,
    stripe_customer_id: subscription.customer as string,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }

  // Check if subscription already exists
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('stripe_subscription_id', subscription.id)
    .single()

  if (existingSub) {
    // Update existing subscription
    await supabase
      .from('subscriptions')
      .update(subscriptionData)
      .eq('id', existingSub.id)
    
    console.log('Updated subscription:', subscription.id)
  } else {
    // Create new subscription
    await supabase
      .from('subscriptions')
      .insert(subscriptionData)
    
    console.log('Created new subscription:', subscription.id)
  }

  // Also update customers table
  await updateCustomerSubscription(subscription)
}

async function updateCustomerSubscription(subscription: Stripe.Subscription) {
  try {
    const { error } = await supabase
      .from('customers')
      .update({
        subscription_status: subscription.status,
        subscription_id: subscription.id,
        current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
      })
      .eq('stripe_customer_id', subscription.customer as string)

    if (error) {
      console.error('Error updating customer subscription:', error)
    } else {
      console.log('Updated customer subscription in database:', subscription.id)
    }
  } catch (error) {
    console.error('Error in updateCustomerSubscription:', error)
  }
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  if (!invoice.subscription || !invoice.payment_intent) return

  console.log('Processing successful payment for subscription:', invoice.subscription)

  // Record payment
  await supabase
    .from('payment_history')
    .insert({
      subscription_id: invoice.subscription as string,
      stripe_payment_intent_id: invoice.payment_intent as string,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
    })

  // Update customer payment data
  await updateCustomerPaymentData(invoice)

  // Check loyalty rewards eligibility
  await checkLoyaltyRewards(invoice.subscription as string)
}

async function updateCustomerPaymentData(invoice: Stripe.Invoice) {
  try {
    // Get customer ID from subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('stripe_subscription_id', invoice.subscription as string)
      .single()

    if (!subscription) return

    // Get current customer data
    const { data: customer } = await supabase
      .from('customers')
      .select('payment_count, total_paid, last_payment_date')
      .eq('stripe_customer_id', subscription.stripe_customer_id)
      .single()

    if (customer) {
      const newPaymentCount = (customer.payment_count || 0) + 1
      const newTotalPaid = (customer.total_paid || 0) + (invoice.amount_paid || 0)
      const newLoyaltyProgress = Math.min(newPaymentCount, 12)

      const { error } = await supabase
        .from('customers')
        .update({
          payment_count: newPaymentCount,
          total_paid: newTotalPaid,
          last_payment_date: new Date().toISOString(),
          loyalty_progress: newLoyaltyProgress,
        })
        .eq('stripe_customer_id', subscription.stripe_customer_id)

      if (error) {
        console.error('Error updating customer payment data:', error)
      } else {
        console.log('Updated customer payment data:', subscription.stripe_customer_id)
      }
    }
  } catch (error) {
    console.error('Error in updateCustomerPaymentData:', error)
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription || !invoice.payment_intent) return

  console.log('Processing failed payment for subscription:', invoice.subscription)

  await supabase
    .from('payment_history')
    .insert({
      subscription_id: invoice.subscription as string,
      stripe_payment_intent_id: invoice.payment_intent as string,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
    })
}

async function checkLoyaltyRewards(subscriptionId: string) {
  // Get subscription and count successful payments
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('user_id, status')
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (!subscription) return

  // Only check for active subscriptions
  if (subscription.status !== 'active') return

  const { count } = await supabase
    .from('payment_history')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_id', subscriptionId)
    .eq('status', 'succeeded')

  if (count === null) return

  console.log('Payment count for subscription:', count)

  // Award rewards every 3 months
  if (count > 0 && count % 3 === 0) {
    // Check if we already created a reward for this milestone
    const { data: existingReward } = await supabase
      .from('loyalty_rewards')
      .select('id')
      .eq('user_id', subscription.user_id)
      .eq('type', 'quarterly_reward')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Created within last 7 days
      .single()

    if (!existingReward) {
      await createLoyaltyReward(subscription.user_id, 'quarterly_reward', 1)
      console.log(`Created quarterly loyalty reward for user: ${subscription.user_id} (${count} payments)`)
    }
  }
}

async function createLoyaltyReward(userId: string, type: string, months: number) {
  const expiresAt = new Date()
  expiresAt.setMonth(expiresAt.getMonth() + 12) // Expires in 1 year

  await supabase
    .from('loyalty_rewards')
    .insert({
      user_id: userId,
      type,
      months_earned: months,
      status: 'pending',
      expires_at: expiresAt.toISOString(),
    })
} 