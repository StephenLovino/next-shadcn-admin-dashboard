# AHA Rewards - Next.js Admin Dashboard

A comprehensive admin dashboard built with Next.js 15, Supabase, Stripe integration, and GoHighLevel (GHL) automation for managing customers, team members, and business operations.

## 🚀 Features

### 📊 Dashboard Management
- **Multi-Dashboard Support**: Default, CRM, and Rewards dashboards
- **Role-Based Access Control**: Owner, Admin, Manager, and Viewer roles
- **Responsive Sidebar Navigation**: Collapsible sidebar with theme switching
- **Real-time Data Sync**: Live updates from integrated services

### 👥 User Management
- **Team Management**: Internal user role assignment and management
- **Customer Management**: Comprehensive Stripe customer data with 1000+ customers
- **Advanced Filtering**: Filter by subscription status, loyalty status, card status, and plan type
- **Export Functionality**: CSV export for customer data
- **Pagination**: Configurable page sizes (50, 100, 500, All)

### 💳 Stripe Integration
- **Customer Sync**: Automatic synchronization of Stripe customers to database
- **Subscription Management**: Track active, canceled, and pending subscriptions
- **Payment History**: Complete payment tracking and revenue analytics
- **Plan Details**: Real-time subscription plan information (Basic, Pro, Agency, Enterprise)
- **Card Status Tracking**: Monitor active cards and payment methods

### 🎯 Loyalty & Rewards System
- **Points-Based Rewards**: 1 month credit for every 3 months of subscription
- **Referral System**: Generate and share referral links for rewards
- **Credit Application**: Apply loyalty credits to Stripe customer balances
- **Visual Analytics**: Interactive charts showing monthly progress and reward status
- **Reward Cards**: Swipeable reward cards with self-application or sharing options

### 🔗 GoHighLevel (GHL) Integration
- **Contact Synchronization**: Sync Stripe customers with GHL contacts
- **Bulk Tag Management**: Add/remove tags for multiple contacts simultaneously
- **Tag Display**: Show GHL tags directly in customer profiles
- **Automated Workflows**: Tag customers based on subscription status and card activity
- **API Integration**: Direct GHL API integration with secure token management

### 🎨 UI/UX Features
- **Modern Design**: Built with shadcn/ui components and Tailwind CSS
- **Dark/Light Theme**: Theme switching with multiple presets
- **Responsive Layout**: Mobile-first design with adaptive sidebar
- **Interactive Tables**: Sortable columns, filtering, and pagination
- **Loading States**: Progress indicators and ETA calculations for sync operations

## 🛠️ Tech Stack

### Frontend
- **Next.js 15**: App Router with Server Components
- **React 18**: Hooks, Context, and modern patterns
- **TypeScript**: Full type safety
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: Component library
- **Lucide React**: Icon system

### Backend & Database
- **Supabase**: PostgreSQL database with real-time subscriptions
- **Row Level Security (RLS)**: Secure data access
- **Edge Functions**: Serverless functions for API integrations
- **Database Migrations**: Version-controlled schema changes

### Integrations
- **Stripe API**: Payment processing and customer management
- **GoHighLevel API**: CRM and marketing automation
- **Webhooks**: Real-time data synchronization

### Development Tools
- **ESLint**: Code linting and formatting
- **Husky**: Git hooks for code quality
- **Vercel**: Deployment and hosting

## 📁 Project Structure

```
src/
├── app/                          # Next.js App Router
│   ├── (main)/                   # Main application routes
│   │   ├── dashboard/            # Dashboard pages
│   │   │   ├── users/           # User management
│   │   │   ├── crm/             # CRM dashboard
│   │   │   ├── rewards/         # Rewards system
│   │   │   └── finance/         # Financial overview
│   │   └── auth/                # Authentication pages
│   └── api/                     # API routes
│       ├── admin/               # Admin operations
│       ├── ghl/                 # GoHighLevel integration
│       ├── rewards/             # Rewards system
│       └── sync-*/              # Data synchronization
├── components/                   # Reusable components
│   ├── ui/                      # shadcn/ui components
│   ├── auth/                    # Authentication components
│   └── data-table/              # Table components
├── lib/                         # Utility libraries
├── hooks/                       # Custom React hooks
├── contexts/                    # React contexts
├── stores/                      # State management
└── types/                       # TypeScript definitions

supabase/
├── functions/                   # Edge Functions
│   ├── sync-stripe-data/        # Stripe synchronization
│   ├── ghl-contacts/            # GHL integration
│   └── stripe-webhook-handler/  # Webhook processing
└── migrations/                  # Database migrations
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Supabase account
- Stripe account
- GoHighLevel account (optional)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/StephenLovino/next-shadcn-admin-dashboard.git
   cd next-shadcn-admin-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env.local
   ```
   
   Configure the following environment variables:
   ```env
   # Supabase
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   
   # Stripe
   STRIPE_SECRET_KEY=your_stripe_secret_key
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
   
   # GoHighLevel (optional)
   GHL_PRIVATE_INTEGRATION_TOKEN=your_ghl_token
   GHL_LOCATION_ID=your_ghl_location_id
   ```

4. **Database Setup**
   ```bash
   # Link to your Supabase project
   npx supabase link --project-ref your_project_ref
   
   # Apply migrations
   npx supabase db push
   
   # Deploy Edge Functions
   npx supabase functions deploy
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

6. **Access the Application**
   Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔧 Configuration

### Supabase Setup
1. Create a new Supabase project
2. Run the provided migrations to set up tables:
   - `customers` - Stripe customer data
   - `profiles` - User profiles and roles
   - `dashboard_access` - Role-based permissions
3. Configure RLS policies for security
4. Set up Edge Functions for API integrations

### Stripe Integration
1. Create a Stripe account and get API keys
2. Set up webhooks pointing to your Supabase Edge Function
3. Configure products and pricing plans
4. Test customer synchronization

### GoHighLevel Integration
1. Create a GHL account and subaccount
2. Generate a Private Integration Token (PIT)
3. Configure location ID and permissions
4. Test contact synchronization

## 📊 Database Schema

### Customers Table
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT,
  subscription_plan TEXT,
  subscription_plan_id TEXT,
  payment_count INTEGER DEFAULT 0,
  total_paid DECIMAL DEFAULT 0,
  last_payment_date TIMESTAMP,
  card_status TEXT,
  ghl_contact_id TEXT,
  ghl_sync_status TEXT DEFAULT 'not_synced',
  ghl_last_synced_at TIMESTAMP,
  ghl_tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Profiles Table
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  full_name TEXT,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 🔐 Security Features

- **Row Level Security (RLS)**: Database-level access control
- **Role-Based Permissions**: Granular access control for different user types
- **API Route Protection**: Secure API endpoints with authentication
- **Environment Variables**: Sensitive data stored securely
- **CORS Configuration**: Proper cross-origin resource sharing setup

## 🚀 Deployment

### Vercel Deployment
1. Connect your GitHub repository to Vercel
2. Configure environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

### Supabase Deployment
1. Deploy Edge Functions:
   ```bash
   npx supabase functions deploy
   ```
2. Set up secrets:
   ```bash
   npx supabase secrets set STRIPE_SECRET_KEY=your_key
   npx supabase secrets set GHL_PRIVATE_INTEGRATION_TOKEN=your_token
   ```

## 📈 Performance Features

- **Server-Side Rendering**: Fast initial page loads
- **Client-Side Hydration**: Smooth user interactions
- **Database Indexing**: Optimized queries for large datasets
- **Pagination**: Efficient data loading for 1000+ customers
- **Caching**: Strategic caching for improved performance

## 🔄 Data Synchronization

### Stripe Sync
- **Automatic**: Webhook-based real-time updates
- **Manual**: On-demand synchronization with progress tracking
- **Batch Processing**: Efficient handling of large customer datasets
- **Error Handling**: Robust error recovery and retry logic

### GHL Sync
- **Contact Matching**: Email-based contact identification
- **Tag Management**: Automated tagging based on customer status
- **Bulk Operations**: Efficient batch processing
- **Status Tracking**: Real-time sync status monitoring

## 🎯 Business Logic

### Loyalty System
- **Credit Calculation**: 1 month credit per 3 months of subscription
- **Referral Rewards**: Shareable referral links
- **Credit Application**: Direct application to Stripe customer balance
- **Progress Tracking**: Visual progress indicators

### Customer Management
- **Status Tracking**: Active, canceled, pending subscriptions
- **Payment History**: Complete transaction records
- **Plan Management**: Real-time subscription plan details
- **Card Monitoring**: Payment method status tracking

## 🛠️ Development

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # Run TypeScript checks
```

### Code Quality
- **ESLint**: Code linting and formatting
- **TypeScript**: Type safety and IntelliSense
- **Husky**: Pre-commit hooks
- **Prettier**: Code formatting

## 📝 API Documentation

### Key Endpoints
- `GET /api/admin/update-profile` - Update user profiles
- `POST /api/sync-customers` - Sync Stripe customers
- `GET /api/ghl/contacts` - Fetch GHL contacts
- `POST /api/ghl/bulk-tag` - Bulk tag operations
- `POST /api/rewards/apply-credit` - Apply loyalty credits

### Edge Functions
- `sync-stripe-data` - Comprehensive Stripe synchronization
- `ghl-contacts` - GoHighLevel API integration
- `stripe-webhook-handler` - Webhook processing

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the documentation
- Review the code comments for implementation details

## 🔮 Roadmap

- [ ] Advanced analytics dashboard
- [ ] Email marketing integration
- [ ] Automated reporting
- [ ] Mobile app
- [ ] Advanced user permissions
- [ ] Multi-tenant support
- [ ] API rate limiting
- [ ] Advanced caching strategies

---

**Built with ❤️ using Next.js, Supabase, and modern web technologies.**