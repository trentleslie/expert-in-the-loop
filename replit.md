# Expert in the Loop (EITL)

## Overview

**Expert in the Loop** (EITL) is a platform at expertintheloop.io for collecting structured human feedback on AI-generated outputs. Use it to:

- Validate LLM-suggested matches and mappings
- Review AI classifications and categorizations
- Evaluate agent-generated recommendations
- Build calibrated ground truth datasets
- Measure inter-rater reliability across expert reviewers

Designed for teams who need systematic human review to evaluate, improve, and trust their AI systems. Common use cases include: biomedical ontology mapping, legal document review, content moderation QA, and product recommendation validation.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript
- **Build Tool**: Vite with hot module replacement
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack Query for server state, React Context for auth state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Design System**: Material Design 3 inspired, optimized for data-intensive review workflows

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **API Style**: RESTful JSON API under `/api/*` prefix
- **Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple)
- **File Uploads**: Multer for CSV import handling
- **Authentication**: Passport.js with Google OAuth 2.0 strategy

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with drizzle-kit for migrations
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Key Entities**: Users, Campaigns, Pairs, Votes, AllowedDomains, ImportTemplates

### Authentication & Authorization
- **Provider**: Google OAuth 2.0 with domain restriction
- **Allowed Domains**: Configurable (default: expertintheloop.io)
- **Roles**: 
  - `reviewer`: Can review pairs, view personal stats
  - `admin`: Full access including campaign management, data export, user management
- **User Identification**: Google `sub` claim as stable unique ID

### Project Structure
```
client/           # React frontend
  src/
    components/   # UI components including shadcn/ui
    pages/        # Route pages (home, review, stats, admin/*)
    lib/          # Utilities (auth, queryClient)
    hooks/        # Custom React hooks
server/           # Express backend
  index.ts        # Server entry point
  routes.ts       # API route definitions
  auth.ts         # Passport/OAuth configuration
  storage.ts      # Database operations interface
  db.ts           # Drizzle database connection
shared/           # Shared code between client/server
  schema.ts       # Drizzle schema definitions
migrations/       # Drizzle database migrations
```

### Build & Development
- **Development**: `npm run dev` runs tsx for server with Vite middleware
- **Production Build**: Custom build script using esbuild for server, Vite for client
- **Type Checking**: TypeScript with strict mode, path aliases (@/, @shared/)

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via DATABASE_URL environment variable
- **Session Storage**: PostgreSQL-backed sessions via connect-pg-simple

### Authentication
- **Google OAuth 2.0**: Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- **Session Secret**: SESSION_SECRET environment variable for cookie signing

### Third-Party Services
- **LOINC.org**: External links to LOINC code details (no API integration, display links only)

### Key NPM Packages
- **drizzle-orm / drizzle-kit**: Database ORM and migrations
- **passport / passport-google-oauth20**: Authentication
- **csv-parse / csv-stringify**: CSV import/export for pair data
- **@tanstack/react-query**: Server state management
- **@radix-ui/***: Accessible UI primitives
- **tailwindcss**: Utility-first CSS framework

## Recent Changes (February 2026)

### Terminology & Branding
- **Voting buttons**: Changed from "Match"/"No Match" to "Confirm"/"Reject" (with "Unsure" unchanged) across review page, vote history, and results browser
- **Campaign types**: Changed from fixed enum to free-text field with autocomplete suggestions — users can define any campaign type (e.g., "contract_clause_review", "product_categorization")
- **Platform rebrand**: General-purpose AI validation platform (not biomedical-specific)

### New Features Added
- **Flexible Campaign Types**: Free-text input with combobox autocomplete showing previously-used types plus default suggestions
- **Numeric Scoring Mode**: 1-5 scale option with toggle switch, keyboard shortcuts (1-5)
- **Vote History & Editing**: View and edit past votes with full history tracking
- **Results Browser**: Admin page with filterable/paginated table of pairs, vote counts, agreement rates
- **Database Explorer**: Read-only SQL query interface with quick queries and schema browser
- **Domain Management UI**: Admin interface to manage allowed OAuth domains
- **Import Templates**: Save and reuse column mappings for CSV imports
- **Krippendorff's Alpha**: Inter-rater reliability calculation for campaigns
- **Three-Way Binary Voting**: Confirm, Reject, and Unsure options (Y/N/U keyboard shortcuts) with unsure votes excluded from consensus calculations

### Admin Pages
- `/admin/database` - SQL query explorer
- `/admin/domains` - OAuth domain management
- `/admin/campaigns/:id/results` - Campaign results browser

### API Endpoints Added
- `GET /api/campaign-types` - Distinct campaign types for autocomplete
- `GET /api/users/me/votes` - User's vote history
- `PATCH /api/pairs/:id/vote` - Edit existing vote
- `GET /api/campaigns/:id/alpha` - Krippendorff's Alpha calculation
- `GET/POST/DELETE /api/import-templates` - Import template CRUD
- `POST /api/database/query` - Execute read-only SQL queries