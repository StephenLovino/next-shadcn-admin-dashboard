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
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    // Check if user is authenticated and is owner
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Verify the user is an owner
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response('Invalid token', { status: 401 })
    }

    // Check if user is owner
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'owner') {
      return new Response('Access denied. Only owners can sync customers.', { status: 403 })
    }

    // Parse optional body params
    let body: any = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }

    const mode = (body?.mode as string) || 'profilesOnly' // profilesOnly | full | listCustomers | getOwnerCache | cacheAllForOwner
    const limit = Number(body?.limit ?? 5)
    const cursor = body?.cursor as (string | undefined)
    const light = Boolean(body?.light ?? true)

    console.log('Starting Stripe data sync for owner:', user.email, { mode, limit })

    // Handle read-only listing quickly (no timeout race needed)
    if (mode === 'getOwnerCache') {
      const { data: owner } = await supabase
        .from('profiles')
        .select('stripe_customers_cache, stripe_cache_updated_at')
        .eq('id', user.id)
        .single()
      return new Response(
        JSON.stringify({
          cache: owner?.stripe_customers_cache ?? { customers: [] },
          updated_at: owner?.stripe_cache_updated_at ?? null,
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (mode === 'cacheAllForOwner') {
      const page = await listStripeCustomers({ limit: Math.min(100, Math.max(1, limit)), cursor, light: false })
      // Merge into owner's cache
      const { data: owner } = await supabase
        .from('profiles')
        .select('stripe_customers_cache')
        .eq('id', user.id)
        .single()
      const current = (owner?.stripe_customers_cache as any) ?? { customers: [] }
      const byId = new Map<string, any>()
      for (const c of (current.customers ?? [])) byId.set(c.id, c)
      for (const c of page.customers) byId.set(c.id, { ...(byId.get(c.id) || {}), ...c })
      const merged = { customers: Array.from(byId.values()) }
      await supabase
        .from('profiles')
        .update({
          stripe_customers_cache: merged,
          stripe_cache_updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
      return new Response(
        JSON.stringify({ message: 'Cached page', next_cursor: page.next_cursor, added: page.customers.length }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (mode === 'syncToDatabase') {
      const result = await syncCustomersToDatabase()
      return new Response(
        JSON.stringify({ 
          message: 'Customers synced to database', 
          synced: result.synced,
          status: 'success'
        }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (mode === 'listCustomers') {
      const list = await listStripeCustomers({ limit, cursor, light })
      return new Response(
        JSON.stringify({ message: 'Stripe customers listed', ...list }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Start the sync process with timeout handling for write modes
    const syncPromise = mode === 'profilesOnly'
      ? syncFromExistingProfiles({ limit })
      : syncAllStripeData()
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Sync timeout - processing too many customers')), 15000)
    )

    const result = await Promise.race([syncPromise, timeoutPromise]) as any

    return new Response(
      JSON.stringify({ 
        message: 'Stripe data sync completed successfully',
        status: 'success',
        result,
        progress: `${result.customersSynced} customers synced (batch of ${limit})`
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Sync function error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Sync function failed', 
        details: error.message,
        status: 'timeout' 
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

async function syncAllStripeData() {
  const result = {
    customersSynced: 0,
    subscriptionsSynced: 0,
    paymentsSynced: 0,
    errors: []
  }

  try {
    console.log('🔄 Starting comprehensive Stripe data sync...')
    
    // Step 1: Sync all customers
    await syncAllCustomers(result)
    
    // Step 2: Sync all subscriptions
    await syncAllSubscriptions(result)
    
    // Step 3: Sync all payment history
    await syncAllPayments(result)
    
    console.log('✅ Sync completed successfully:', result)
    return result
    
  } catch (error) {
    console.error('❌ Sync failed:', error)
    result.errors.push(error.message)
    return result
  }
}

async function syncAllCustomers(result: any) {
  console.log('📥 Syncing customers (full backfill)...')
  
  let hasMore = true
  let startingAfter: string | undefined
  let customerCount = 0
      const MAX_CUSTOMERS = 5 // Reduced to prevent timeouts
  
  while (hasMore && customerCount < MAX_CUSTOMERS) {
    try {
      // Fetch customers from Stripe (100 at a time)
      const customers = await stripe.customers.list({
        limit: 100,
        starting_after: startingAfter,
      })
      
      console.log(`📥 Fetched ${customers.data.length} customers from Stripe`)
      
      // Process each customer
      for (const customer of customers.data) {
        if (customerCount >= MAX_CUSTOMERS) break; // Stop if we hit the limit
        
        if (!customer.email) {
          console.log(`⚠️ Skipping customer ${customer.id} - no email`)
          continue
        }
        
        try {
          // Check if profile already exists
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
            
            console.log(`✅ Updated existing profile: ${customer.email}`)
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
              })
            
            console.log(`✅ Created new profile: ${customer.email}`)
          }
          
          customerCount++
          result.customersSynced++
          
        } catch (error) {
          console.error(`❌ Error processing customer ${customer.email}:`, error)
          result.errors.push(`Customer ${customer.email}: ${error.message}`)
        }
      }
      
      // Check if there are more customers
      hasMore = customers.has_more
      if (customers.data.length > 0) {
        startingAfter = customers.data[customers.data.length - 1].id
      }
      
      console.log(`📊 Customer progress: ${customerCount} processed so far (max: ${MAX_CUSTOMERS})`)
      
    } catch (error) {
      console.error('❌ Error fetching customers:', error)
      result.errors.push(`Customer fetch error: ${error.message}`)
      break
    }
  }
  
  console.log(`✅ Customer sync complete: ${customerCount} customers processed (limited to ${MAX_CUSTOMERS})`)
}

// Profiles-only sync: only process customers that already exist in profiles
async function syncFromExistingProfiles(params: { limit: number }) {
  const result = {
    customersSynced: 0,
    subscriptionsSynced: 0,
    paymentsSynced: 0,
    errors: [] as string[],
  }

  try {
    console.log('📥 Profiles-only sync start...', params)

    // 1) Read a small batch of profiles that have stripe_customer_id
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, email, stripe_customer_id')
      .not('stripe_customer_id', 'is', null)
      .order('updated_at', { ascending: true })
      .limit(params.limit)

    if (error) throw error

    for (const profile of profiles ?? []) {
      const customerId = profile.stripe_customer_id as string
      try {
        // Pull subscription(s) for this customer
        const subs = await stripe.subscriptions.list({ customer: customerId, limit: 5 })
        for (const sub of subs.data) {
          const subscriptionData = {
            user_id: profile.id,
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            created_at: new Date(sub.created * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          }

          const { data: existingSub } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('stripe_subscription_id', sub.id)
            .maybeSingle()

          if (existingSub) {
            await supabase.from('subscriptions').update(subscriptionData).eq('id', existingSub.id)
          } else {
            await supabase.from('subscriptions').insert(subscriptionData)
          }

          result.subscriptionsSynced++
        }

        // Pull paid invoices for this customer and upsert payments
        const invoices = await stripe.invoices.list({ customer: customerId, limit: 50 })
        for (const inv of invoices.data) {
          if (!inv.subscription || !inv.payment_intent || inv.status !== 'paid') continue

          const { data: existingPayment } = await supabase
            .from('payment_history')
            .select('id')
            .eq('stripe_payment_intent_id', inv.payment_intent)
            .maybeSingle()

          if (!existingPayment) {
            await supabase.from('payment_history').insert({
              subscription_id: inv.subscription as string,
              stripe_payment_intent_id: inv.payment_intent,
              amount: inv.amount_paid,
              currency: inv.currency,
              status: 'succeeded',
              payment_date: new Date(inv.created * 1000).toISOString(),
              created_at: new Date().toISOString(),
            })
            result.paymentsSynced++
          }
        }

        result.customersSynced++

      } catch (err: any) {
        console.error('Profiles-only sync error for', customerId, err)
        result.errors.push(err.message)
      }
    }

    console.log('✅ Profiles-only sync complete', result)
    return result

  } catch (err: any) {
    console.error('Profiles-only sync fatal error', err)
    result.errors.push(err.message)
    return result
  }
}

async function syncAllSubscriptions(result: any) {
  console.log('📥 Syncing subscriptions...')
  
  let hasMore = true
  let startingAfter: string | undefined
  let subscriptionCount = 0
  
  while (hasMore) {
    try {
      // Fetch subscriptions from Stripe (100 at a time)
      const subscriptions = await stripe.subscriptions.list({
        limit: 100,
        starting_after: startingAfter,
      })
      
      console.log(`📥 Fetched ${subscriptions.data.length} subscriptions from Stripe`)
      
      // Process each subscription
      for (const subscription of subscriptions.data) {
        try {
          // Get customer email to find the user
          const customer = await stripe.customers.retrieve(subscription.customer as string)
          if (!customer.email) {
            console.log(`⚠️ Skipping subscription ${subscription.id} - no customer email`)
            continue
          }
          
          // Find user by email
          const { data: user } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', customer.email)
            .single()
          
          if (!user) {
            console.log(`⚠️ No user found for customer email: ${customer.email}`)
            continue
          }
          
          const subscriptionData = {
            user_id: user.id,
            stripe_customer_id: subscription.customer as string,
            stripe_subscription_id: subscription.id,
            status: subscription.status,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancel_at_period_end: subscription.cancel_at_period_end,
            created_at: new Date(subscription.created * 1000).toISOString(),
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
            
            console.log(`✅ Updated subscription: ${subscription.id}`)
          } else {
            // Create new subscription
            await supabase
              .from('subscriptions')
              .insert(subscriptionData)
            
            console.log(`✅ Created subscription: ${subscription.id}`)
          }
          
          subscriptionCount++
          result.subscriptionsSynced++
          
        } catch (error) {
          console.error(`❌ Error processing subscription ${subscription.id}:`, error)
          result.errors.push(`Subscription ${subscription.id}: ${error.message}`)
        }
      }
      
      // Check if there are more subscriptions
      hasMore = subscriptions.has_more
      if (subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id
      }
      
      console.log(`📊 Subscription progress: ${subscriptionCount} processed so far`)
      
    } catch (error) {
      console.error('❌ Error fetching subscriptions:', error)
      result.errors.push(`Subscription fetch error: ${error.message}`)
      break
    }
  }
  
  console.log(`✅ Subscription sync complete: ${subscriptionCount} subscriptions processed`)
}

async function syncAllPayments(result: any) {
  console.log('📥 Syncing payment history...')
  
  let hasMore = true
  let startingAfter: string | undefined
  let paymentCount = 0
  
  while (hasMore) {
    try {
      // Fetch invoices from Stripe (100 at a time)
      const invoices = await stripe.invoices.list({
        limit: 100,
        starting_after: startingAfter,
      })
      
      console.log(`📥 Fetched ${invoices.data.length} invoices from Stripe`)
      
      // Process each invoice
      for (const invoice of invoices.data) {
        if (!invoice.subscription || !invoice.payment_intent || invoice.status !== 'paid') {
          continue
        }
        
        try {
          // Check if payment already exists
          const { data: existingPayment } = await supabase
            .from('payment_history')
            .select('id')
            .eq('stripe_payment_intent_id', invoice.payment_intent)
            .single()
          
          if (!existingPayment) {
            // Create new payment record
            await supabase
              .from('payment_history')
              .insert({
                subscription_id: invoice.subscription as string,
                stripe_payment_intent_id: invoice.payment_intent,
                amount: invoice.amount_paid,
                currency: invoice.currency,
                status: 'succeeded',
                payment_date: new Date(invoice.created * 1000).toISOString(),
                created_at: new Date().toISOString(),
              })
            
            console.log(`✅ Created payment record: ${invoice.payment_intent}`)
            paymentCount++
            result.paymentsSynced++
          }
          
        } catch (error) {
          console.error(`❌ Error processing payment ${invoice.payment_intent}:`, error)
          result.errors.push(`Payment ${invoice.payment_intent}: ${error.message}`)
        }
      }
      
      // Check if there are more invoices
      hasMore = invoices.has_more
      if (invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id
      }
      
      console.log(`📊 Payment progress: ${paymentCount} processed so far`)
      
    } catch (error) {
      console.error('❌ Error fetching invoices:', error)
      result.errors.push(`Invoice fetch error: ${error.message}`)
      break
    }
  }
  
  console.log(`✅ Payment sync complete: ${paymentCount} payments processed`)
}

// Read-only: list Stripe customers for the owner view without writing to DB
async function listStripeCustomers(params: { limit: number, cursor?: string, light: boolean }) {
  const out: { customers: Array<{ id: string, email: string | null, name: string | null, subscription_status?: string }>, next_cursor?: string } = {
    customers: []
  }

  const customers = await stripe.customers.list({ limit: params.limit, starting_after: params.cursor })
  for (const c of customers.data) {
    let subscriptionStatus = 'unknown'
    if (!params.light) {
      try {
        const subs = await stripe.subscriptions.list({ customer: c.id, limit: 1 })
        subscriptionStatus = subs.data[0]?.status ?? 'no subscription'
      } catch {
        subscriptionStatus = 'unknown'
      }
      out.customers.push({ id: c.id, email: c.email ?? null, name: c.name ?? null, subscription_status: subscriptionStatus })
    } else {
      out.customers.push({ id: c.id, email: c.email ?? null, name: c.name ?? null })
    }
  }
  if (customers.has_more && customers.data.length) {
    out.next_cursor = customers.data[customers.data.length - 1].id
  }
  return out
}

// Sync customers to the customers table
async function syncCustomersToDatabase() {
  let totalSynced = 0
  let hasMore = true
  let startingAfter: string | undefined

  while (hasMore) {
    try {
      const customers = await stripe.customers.list({
        limit: 100,
        starting_after: startingAfter,
      })

      for (const customer of customers.data) {
        try {
          // Get ALL subscriptions for this customer (not just one)
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: 'all',
            limit: 100,
          })

          // Determine primary subscription status
          let subscriptionStatus = 'No Subscription'
          let subscriptionId = null
          let currentPeriodEnd = null
          let hasActiveSubscription = false
          let hasCanceledSubscription = false
          let hasTrialingSubscription = false

          if (subscriptions.data.length > 0) {
            // Find the most recent active subscription, or latest if none active
            const activeSub = subscriptions.data.find(sub => sub.status === 'active')
            const latestSub = subscriptions.data[0] // Stripe returns most recent first
            
            const primarySub = activeSub || latestSub
            subscriptionStatus = primarySub.status
            subscriptionId = primarySub.id
            currentPeriodEnd = new Date((primarySub as any).current_period_end * 1000).toISOString()

            // Check for various subscription states
            hasActiveSubscription = subscriptions.data.some(sub => sub.status === 'active')
            hasCanceledSubscription = subscriptions.data.some(sub => sub.status === 'canceled')
            hasTrialingSubscription = subscriptions.data.some(sub => sub.status === 'trialing')
          }

          // Get payment methods to check card status
          const paymentMethods = await stripe.paymentMethods.list({
            customer: customer.id,
            type: 'card',
          })

          const hasCard = paymentMethods.data.length > 0
          const cardStatus = hasCard ? 'Active' : 'No Card'

          // Get payment history
          const charges = await stripe.charges.list({
            customer: customer.id,
            limit: 100,
          })

          const successfulCharges = charges.data.filter(charge => charge.status === 'succeeded')
          const failedCharges = charges.data.filter(charge => charge.status === 'failed')
          const paymentCount = successfulCharges.length
          const totalPaid = successfulCharges.reduce((sum, charge) => sum + (charge.amount || 0), 0)
          const lastPaymentDate = successfulCharges.length > 0 
            ? new Date(successfulCharges[0].created * 1000).toISOString() 
            : null

          const loyaltyProgress = Math.min(paymentCount, 12)

          // Create comprehensive status
          let comprehensiveStatus = subscriptionStatus
          if (hasCard && subscriptionStatus === 'No Subscription') {
            comprehensiveStatus = 'Has Card - No Subscription'
          } else if (!hasCard && subscriptionStatus !== 'No Subscription') {
            comprehensiveStatus = `${subscriptionStatus} - No Card`
          }

          // Upsert customer data with comprehensive information
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
              current_period_end: currentPeriodEnd,
              payment_count: paymentCount,
              total_paid: totalPaid,
              last_payment_date: lastPaymentDate,
              loyalty_progress: loyaltyProgress,
              // Additional status fields
              has_active_subscription: hasActiveSubscription,
              has_canceled_subscription: hasCanceledSubscription,
              has_trialing_subscription: hasTrialingSubscription,
              has_card: hasCard,
              card_status: cardStatus,
              failed_payment_count: failedCharges.length,
            }, {
              onConflict: 'stripe_customer_id'
            })

          if (error) {
            console.error('Error upserting customer:', error)
          } else {
            totalSynced++
          }
        } catch (customerError) {
          console.error('Error processing customer:', customer.id, customerError)
        }
      }

      hasMore = customers.has_more
      startingAfter = customers.data[customers.data.length - 1]?.id
    } catch (error) {
      console.error('Database sync error:', error)
      break
    }
  }

  return { synced: totalSynced }
}