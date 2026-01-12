# Human Feedback Collection App for Biomedical Entity Mapping Validation

## Project Overview

Build a web application that collects human-reviewed feedback on LLM-generated entity mappings for biomedical data harmonization. The primary use cases are:

1. **Cross-Questionnaire Matching**: Validate LLM-suggested matches between questions from different survey instruments (e.g., Arivale ↔ UK Biobank questionnaires)
2. **Question-to-LOINC Mapping**: Validate LLM-suggested mappings from questionnaire items to standardized LOINC codes

The app serves as the human-in-the-loop validation component for building gold standard datasets used to train/evaluate embedding models and calibrate automated evaluation systems.

---

## Core Requirements

### Authentication & Authorization

- **Google OAuth 2.0** with domain restriction
- **Allowed domain**: `phenomehealth.org` (store in config for easy expansion to additional domains later)
- **Two roles**:
  - `reviewer`: Can review pairs, see personal stats
  - `admin`: All reviewer permissions PLUS upload datasets, manage campaigns, view full dashboard, export data
- Users can hold both roles (admins are also reviewers)
- Store user info from Google profile: unique ID (`sub`), email, display name

### Data Model

#### Users Table
```
users:
  - id: string (Google 'sub' claim - stable unique identifier)
  - email: string
  - display_name: string
  - role: enum ['reviewer', 'admin']
  - created_at: timestamp
  - last_active: timestamp
```

#### Campaigns Table
```
campaigns:
  - id: uuid
  - name: string (e.g., "Arivale↔UKBB Questionnaire Matching")
  - description: text
  - campaign_type: enum ['questionnaire_match', 'loinc_mapping', 'custom']
  - created_by: FK → users.id
  - created_at: timestamp
  - status: enum ['draft', 'active', 'completed', 'archived']
```

#### Pairs Table
```
pairs:
  - id: uuid
  - campaign_id: FK → campaigns.id
  - pair_type: enum ['questionnaire_match', 'loinc_mapping']
  
  # Source item
  - source_text: text (the question or entity text)
  - source_dataset: string (e.g., "Arivale_Questionnaire_v2")
  - source_id: string (original identifier from source system)
  - source_metadata: jsonb (flexible field for additional context)
  
  # Target item
  - target_text: text (matched question or LOINC long name)
  - target_dataset: string (e.g., "UKBB_Questionnaire" or "LOINC_2.76")
  - target_id: string (e.g., question ID or LOINC code like "44261-6")
  - target_metadata: jsonb (flexible field for additional context)
  
  # LLM matching metadata
  - llm_confidence: float (0.0-1.0, from original matching run)
  - llm_model: string (e.g., "claude-sonnet-4-20250514")
  - llm_reasoning: text (optional: LLM's explanation — stored but HIDDEN from reviewers to prevent bias)
  
  - created_at: timestamp
```

**Note on LLM metadata display**: Only `llm_confidence` is shown to reviewers during the review workflow. The `llm_model` and `llm_reasoning` fields are stored for analysis but hidden from the review interface to avoid biasing human judgment.

#### Votes Table
```
votes:
  - id: uuid
  - pair_id: FK → pairs.id
  - user_id: FK → users.id
  - score_binary: boolean (true = match, false = no match, null if numeric mode used)
  - score_numeric: integer (1-5 scale, null if binary mode used)
  - scoring_mode: enum ['binary', 'numeric']
  - created_at: timestamp
  - updated_at: timestamp (for tracking edits)
  
  UNIQUE constraint on (pair_id, user_id) — one vote per user per pair
```

#### Skips Table
```
skips:
  - id: uuid
  - pair_id: FK → pairs.id
  - user_id: FK → users.id
  - created_at: timestamp
  
  UNIQUE constraint on (pair_id, user_id) — one skip per user per pair
```

Skips are recorded to:
- Identify pairs that may be confusing or poorly formatted
- Exclude skipped pairs from a user's queue
- Analyze which pairs have high skip rates (may need review/removal)

#### Domain Allowlist Table
```
allowed_domains:
  - domain: string (e.g., "phenomehealth.org")
  - added_at: timestamp
  - added_by: FK → users.id
```

#### Import Mapping Templates Table
```
import_templates:
  - id: uuid
  - name: string (e.g., "Arivale↔UKBB Standard Format")
  - description: text
  - mapping_config: jsonb (stores column mappings, see Data Import section)
  - created_by: FK → users.id
  - created_at: timestamp
  - last_used_at: timestamp
```

---

## Scoring System

### Binary Mode (Default)
- **👍 Match**: The pair represents equivalent or appropriately matched concepts
- **👎 No Match**: The pair should not be considered a valid mapping

### Numeric Mode (Optional Toggle)
5-point scale with these anchors:
1. **Completely unrelated** — No meaningful connection
2. **Tangentially related** — Some topical overlap but measuring different constructs
3. **Similar but not equivalent** — Related concepts but not interchangeable
4. **Strongly related** — Acceptable mapping for most harmonization purposes
5. **Exact/perfect match** — Semantically equivalent, ideal mapping

Users can toggle between modes in their session. The mode used is recorded with each vote.

---

## Queue Priority Algorithm

Pairs are served to reviewers using this priority order:

```
Priority 1 (Highest): Pairs with 0 evaluations
Priority 2: Pairs with low LLM confidence (< 0.7) AND fewer than 3 evaluations
Priority 3: Pairs with high disagreement (40-60% positive rate) 
Priority 4: Pairs with fewer total votes (weighted random selection)
Priority 5 (Lowest): Random from remaining pairs
```

Within each priority tier, apply weighted random selection favoring pairs with fewer votes.

**Exclusion**: Never show a user a pair they've already voted on.

---

## User Interface

### Pages

#### 1. Login Page
- Google Sign-In button
- Brief description of the app's purpose
- Display error if user's domain is not in allowlist

#### 2. Home / Campaign Selection
- List of active campaigns the user can participate in
- Show progress bar for each campaign (X of Y pairs reviewed)
- Personal stats summary: total contributions, agreement rate with consensus

#### 3. Review Interface (Main Workflow)
**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  Campaign: Arivale↔UKBB Questionnaire Matching                  │
│  Progress: 127/500 pairs reviewed (25.4%)          [Settings ⚙]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────┐   ┌─────────────────────────────┐ │
│  │ SOURCE                  │   │ TARGET                      │ │
│  │ Dataset: Arivale v2     │   │ Dataset: UK Biobank         │ │
│  ├─────────────────────────┤   ├─────────────────────────────┤ │
│  │                         │   │                             │ │
│  │ "In the past 2 weeks,   │   │ "How often have you felt    │ │
│  │ how often have you      │   │ anxious or worried in the   │ │
│  │ felt nervous or         │   │ last two weeks?"            │ │
│  │ anxious?"               │   │                             │ │
│  │                         │   │ ID: UKB-20506               │ │
│  │ ID: ARV-MH-042          │   │                             │ │
│  └─────────────────────────┘   └─────────────────────────────┘ │
│                                                                 │
│            LLM Confidence: 0.89                                 │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Binary Mode [✓]     Numeric Mode [ ]                          │
│                                                                 │
│         ┌─────────┐              ┌─────────┐                   │
│         │  👎 No  │              │  👍 Yes │                   │
│         │  Match  │              │  Match  │                   │
│         └─────────┘              └─────────┘                   │
│                                                                 │
│  [Skip] — removes from your queue without voting (recorded)     │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Keyboard shortcuts: ← No Match | → Yes Match | ↓ Skip         │
└─────────────────────────────────────────────────────────────────┘
```

**For LOINC mapping pairs, the TARGET panel shows:**
- LOINC code
- Long common name
- Component, Property, Timing, System, Scale, Method (LOINC axes)

**Numeric mode replaces the binary buttons with:**
```
    1          2          3          4          5
   [ ]        [ ]        [ ]        [ ]        [ ]
 Unrelated  Tangential  Similar   Strong    Exact
                                  Match     Match
```

#### 4. Dashboard (Admin + Personal Stats)

**Personal Stats (All Users):**
- Total votes cast
- Votes per campaign
- Agreement rate with consensus (rolling)
- **Review history**: View and edit past votes (to correct accidental clicks)
  - Shows list of user's votes with ability to change score
  - Edit updates `updated_at` timestamp for audit trail

**Admin Dashboard (Admin Only):**
- Campaign overview: progress, inter-rater reliability (Krippendorff's alpha)
- Per-pair breakdown: vote distribution, flagged disagreements, skip rates
- Per-reviewer stats: contribution volume, agreement rates
- High-skip pairs: Identify pairs frequently skipped (may indicate confusing matches)
- Export buttons (CSV, JSON)

#### 5. Campaign Management (Admin Only)
- Create new campaign
- Upload pairs via CSV/JSON
- Edit campaign metadata
- Archive/activate campaigns
- View/download results

#### 6. Settings (Admin Only)
- Manage allowed domains
- Promote users to admin role
- View audit log

---

## API Endpoints

### Authentication
```
GET  /auth/google          — Initiate Google OAuth flow
GET  /auth/google/callback — Handle OAuth callback
POST /auth/logout          — Clear session
GET  /auth/me              — Get current user info + role
```

### Campaigns
```
GET    /api/campaigns                — List campaigns (filter by status)
POST   /api/campaigns                — Create campaign (admin)
GET    /api/campaigns/:id            — Get campaign details
PATCH  /api/campaigns/:id            — Update campaign (admin)
DELETE /api/campaigns/:id            — Archive campaign (admin)
POST   /api/campaigns/:id/pairs      — Bulk upload pairs (admin)
GET    /api/campaigns/:id/stats      — Get campaign statistics
GET    /api/campaigns/:id/export     — Export results CSV/JSON (admin)
```

### Review Workflow
```
GET   /api/campaigns/:id/next-pair   — Get next pair for review (uses priority queue)
POST  /api/pairs/:id/vote            — Submit vote for a pair
PATCH /api/pairs/:id/vote            — Update existing vote (for corrections)
POST  /api/pairs/:id/skip            — Record skip for a pair
GET   /api/pairs/:id                 — Get pair details + vote summary (admin)
GET   /api/users/me/votes            — Get user's vote history (for editing)
```

### User Management
```
GET   /api/users                     — List users (admin)
PATCH /api/users/:id/role            — Update user role (admin)
GET   /api/users/me/stats            — Get personal statistics
```

### Admin
```
GET  /api/admin/domains              — List allowed domains
POST /api/admin/domains              — Add domain (admin)
DELETE /api/admin/domains/:domain    — Remove domain (admin)
```

### Import Templates
```
GET    /api/import-templates         — List saved mapping templates
POST   /api/import-templates         — Save new template
GET    /api/import-templates/:id     — Get template details
DELETE /api/import-templates/:id     — Delete template
```

### Results Browser & Database Explorer
```
GET  /api/campaigns/:id/results      — Paginated results with filters
GET  /api/pairs/:id/details          — Full pair detail with all votes
POST /api/pairs/:id/flag             — Flag pair for expert review
POST /api/database/query             — Execute read-only SQL query (admin)
GET  /api/database/schema            — Get database schema info (admin)
GET  /api/database/quick-queries     — List saved quick queries
POST /api/database/quick-queries     — Save new quick query
```

---

## Data Import

### Flexible Column Mapping Upload

The admin upload interface supports CSV and TSV files with a column mapping wizard:

**Step 1: Upload File**
- Accepts `.csv` and `.tsv` files
- Auto-detects delimiter (comma, tab, or specify manually)
- Preview first 5 rows to verify parsing

**Step 2: Column Mapping Interface**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Upload Pairs — Column Mapping                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  File: arivale_ukbb_matches.csv (1,247 rows detected)                      │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ REQUIRED MAPPINGS                                                    │   │
│  ├──────────────────────┬──────────────────────────────────────────────┤   │
│  │ Source Text          │ [▼ arivale_question_text    ]                │   │
│  │ Source ID            │ [▼ arivale_id               ]                │   │
│  │ Source Dataset       │ [▼ — Manual entry —         ] [Arivale_v2 ]  │   │
│  │ Target Text          │ [▼ ukbb_question_text       ]                │   │
│  │ Target ID            │ [▼ ukbb_field_id            ]                │   │
│  │ Target Dataset       │ [▼ — Manual entry —         ] [UK_Biobank ]  │   │
│  │ Pair Type            │ [▼ — Manual entry —         ] [questionnaire_match ▼] │
│  └──────────────────────┴──────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ OPTIONAL MAPPINGS                                                    │   │
│  ├──────────────────────┬──────────────────────────────────────────────┤   │
│  │ LLM Confidence       │ [▼ match_confidence         ]                │   │
│  │ LLM Model            │ [▼ — Manual entry —         ] [claude-sonnet-4-20250514] │
│  │ LLM Reasoning        │ [▼ — None —                 ]                │   │
│  └──────────────────────┴──────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ADDITIONAL METADATA (stored in source_metadata / target_metadata)   │   │
│  │                                                                      │   │
│  │ Source Metadata Columns:        Target Metadata Columns:            │   │
│  │ [✓] arivale_category            [✓] ukbb_category                   │   │
│  │ [✓] arivale_response_type       [✓] ukbb_field_type                 │   │
│  │ [ ] internal_notes              [ ] internal_notes                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ IGNORED COLUMNS (not imported)                                       │   │
│  │                                                                      │   │
│  │ [✓] row_number                                                       │   │
│  │ [✓] internal_notes                                                   │   │
│  │ [✓] processing_timestamp                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Preview (first 3 rows with mapping applied):                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Source: "How often do you feel anxious?" (ARV-MH-042)               │   │
│  │ Target: "Frequency of anxiety in past 2 weeks" (20506)              │   │
│  │ Confidence: 0.89 | Metadata: {category: "mental_health", ...}       │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │ Source: "Current smoking status" (ARV-SM-001)                       │   │
│  │ Target: "Do you smoke tobacco now?" (20116)                         │   │
│  │ Confidence: 0.94 | Metadata: {category: "lifestyle", ...}           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                              [Cancel]  [Import 1,247 Pairs]                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Column Mapping Options:**
- **Dropdown selection**: Map to any column from the uploaded file
- **Manual entry**: Type a fixed value to apply to all rows (useful for dataset names)
- **None**: Leave field empty/null

**Validation:**
- Required fields must be mapped before import
- Preview shows parsed data before committing
- Duplicate pair detection (same source_id + target_id combination)
- Row-level error reporting for malformed data

### Saved Mapping Templates

Admins can save column mapping configurations as templates for repeated imports:

```
templates:
  - id: uuid
  - name: string (e.g., "Arivale↔UKBB Standard Format")
  - mapping_config: jsonb (stores all column mappings)
  - created_by: FK → users.id
  - created_at: timestamp
```

When uploading, admins can select a saved template to pre-populate mappings, then adjust as needed.

### Direct JSON Upload (Alternative)

For programmatic uploads or pre-formatted data, JSON upload is still supported:
```json
{
  "pairs": [
    {
      "source_text": "How often do you feel anxious?",
      "source_dataset": "Arivale_v2",
      "source_id": "ARV-MH-042",
      "source_metadata": {"category": "mental_health", "response_type": "likert_5"},
      "target_text": "Frequency of anxiety symptoms",
      "target_dataset": "UKBB",
      "target_id": "UKB-20506",
      "target_metadata": {"field_id": 20506},
      "llm_confidence": 0.89,
      "llm_model": "claude-sonnet-4-20250514",
      "llm_reasoning": "Both questions assess frequency of anxiety symptoms over a recent time period.",
      "pair_type": "questionnaire_match"
    }
  ]
}
```

---

## Export Format

### Results Export (CSV)
```csv
pair_id,campaign_id,source_text,source_dataset,source_id,target_text,target_dataset,target_id,llm_confidence,total_votes,positive_votes,negative_votes,skip_count,consensus_binary,mean_numeric_score,agreement_rate,vote_details
uuid-123,campaign-456,"How often...","Arivale_v2","ARV-MH-042","Frequency...","UKBB","UKB-20506",0.89,5,4,1,0,true,4.2,0.80,"[{user_hash: 'a1b2', score_binary: true, score_numeric: 5, updated_at: '...'}, ...]"
```

### Results Export (JSON)
```json
{
  "campaign": {
    "id": "uuid",
    "name": "Arivale↔UKBB Questionnaire Matching",
    "exported_at": "2025-01-08T12:00:00Z"
  },
  "summary": {
    "total_pairs": 500,
    "pairs_with_votes": 450,
    "total_votes": 1200,
    "krippendorff_alpha": 0.78
  },
  "pairs": [
    {
      "pair_id": "uuid-123",
      "source": {...},
      "target": {...},
      "llm_confidence": 0.89,
      "votes": {
        "total": 5,
        "binary": {"positive": 4, "negative": 1},
        "numeric": {"mean": 4.2, "std": 0.84, "distribution": [0, 0, 1, 2, 2]},
        "skips": 0
      },
      "consensus": {
        "binary": true,
        "confidence": 0.80
      }
    }
  ]
}
```

---

---

## Results Browser & Data Exploration

### Results Browser Interface (Admin)

A dedicated interface for exploring and analyzing collected feedback:

**Main Results Table View**
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Results Browser — Campaign: Arivale↔UKBB Questionnaire Matching                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Filters:                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ Consensus: [All ▼]  Votes: [Any ▼]  Agreement: [Any ▼]  LLM Conf: [Any ▼]  │   │
│  │                                                                              │   │
│  │ [✓] Show disagreements only (40-60% split)                                  │   │
│  │ [✓] Show high-skip pairs (>2 skips)                                         │   │
│  │ [ ] Show unreviewed only                                                     │   │
│  │                                                                              │   │
│  │ Search: [________________________] (searches source/target text)             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌───────────────────────────────────────────────────────────────────────────────┐ │
│  │ Source Text         │ Target Text         │ Votes │ +   │ -   │ Skips │ Agree │ │
│  ├─────────────────────┼─────────────────────┼───────┼─────┼─────┼───────┼───────┤ │
│  │ How often do you... │ Frequency of anx... │   5   │  4  │  1  │   0   │ 80%   │ │
│  │ Current smoking...  │ Do you smoke...     │   4   │  4  │  0  │   0   │ 100%  │ │
│  │ Hours of sleep...   │ Sleep duration...   │   3   │  1  │  2  │   2   │ 33%  ⚠│ │
│  │ Alcohol consump...  │ Weekly alcohol...   │   0   │  -  │  -  │   0   │  —    │ │
│  └─────────────────────┴─────────────────────┴───────┴─────┴─────┴───────┴───────┘ │
│                                                                                     │
│  Showing 1-50 of 1,247 pairs                    [◀ Prev] [Page 1 of 25] [Next ▶]  │
│                                                                                     │
│  [Export Filtered Results ▼]  [Bulk Actions ▼]                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Pair Detail View (click to expand)**
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Pair Detail: ARV-MH-042 ↔ UKB-20506                                               │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  SOURCE                              │  TARGET                                     │
│  ─────────────────────────────────── │  ──────────────────────────────────────── │
│  Dataset: Arivale_v2                 │  Dataset: UK_Biobank                       │
│  ID: ARV-MH-042                      │  ID: 20506                                  │
│                                      │                                             │
│  "In the past 2 weeks, how often     │  "How often have you felt anxious or       │
│  have you felt nervous or anxious?"  │  worried in the last two weeks?"           │
│                                      │                                             │
│  Metadata:                           │  Metadata:                                  │
│  • category: mental_health           │  • category: mental_health                 │
│  • response_type: likert_5           │  • field_type: categorical                 │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  LLM MATCHING INFO                                                                 │
│  ─────────────────                                                                 │
│  Confidence: 0.89                                                                  │
│  Model: claude-sonnet-4-20250514                                                           │
│  Reasoning: "Both questions assess frequency of anxiety symptoms over a two-week  │
│  recall period using similar phrasing and intent."                                 │
│                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  VOTE BREAKDOWN                                                                    │
│  ──────────────                                                                    │
│  Total: 5 votes | 0 skips                                                          │
│  Binary: 👍 4 (80%) | 👎 1 (20%)                                                   │
│  Numeric: Mean 4.2 | Std 0.84 | Distribution: ▁▁▂▄▄                               │
│                                                                                     │
│  Individual Votes:                                                                 │
│  ┌────────────────┬──────────┬─────────┬─────────────────────┐                    │
│  │ Reviewer       │ Binary   │ Numeric │ Timestamp           │                    │
│  ├────────────────┼──────────┼─────────┼─────────────────────┤                    │
│  │ alice@phen...  │ 👍       │ 5       │ 2025-01-08 10:23    │                    │
│  │ bob@phenom...  │ 👍       │ 4       │ 2025-01-08 11:45    │                    │
│  │ carol@phen...  │ 👎       │ 3       │ 2025-01-08 14:02    │                    │
│  │ david@phen...  │ 👍       │ 4       │ 2025-01-09 09:15    │                    │
│  │ emma@pheno...  │ 👍       │ 5       │ 2025-01-09 16:30    │                    │
│  └────────────────┴──────────┴─────────┴─────────────────────┘                    │
│                                                                                     │
│  [Close]  [Flag for Expert Review]  [Remove from Campaign]                         │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Database Explorer (Admin)

Direct database access for advanced queries and debugging:

**SQL Query Interface**
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Database Explorer                                                    [Read-Only]  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Quick Queries:                                                                     │
│  [Campaign Summary] [Vote Distribution] [Reviewer Stats] [High Disagreement]       │
│  [Unreviewed Pairs] [Skip Analysis] [Inter-rater Reliability]                      │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ SELECT                                                                       │   │
│  │   p.source_text,                                                            │   │
│  │   p.target_text,                                                            │   │
│  │   COUNT(v.id) as vote_count,                                                │   │
│  │   AVG(CASE WHEN v.score_binary THEN 1 ELSE 0 END) as positive_rate         │   │
│  │ FROM pairs p                                                                 │   │
│  │ LEFT JOIN votes v ON p.id = v.pair_id                                       │   │
│  │ WHERE p.campaign_id = 'uuid-here'                                           │   │
│  │ GROUP BY p.id                                                                │   │
│  │ HAVING COUNT(v.id) >= 3                                                      │   │
│  │   AND AVG(CASE WHEN v.score_binary THEN 1 ELSE 0 END) BETWEEN 0.4 AND 0.6  │   │
│  │ ORDER BY vote_count DESC;                                                    │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  [Run Query]  [Save as Quick Query]  [Export Results]                              │
│                                                                                     │
│  Results (23 rows, 0.045s):                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ source_text              │ target_text              │ vote_count │ pos_rate │   │
│  ├──────────────────────────┼──────────────────────────┼────────────┼──────────┤   │
│  │ Hours of sleep per ni... │ Sleep duration on a t... │     5      │   0.40   │   │
│  │ Frequency of vigorous... │ Days per week of mode... │     4      │   0.50   │   │
│  │ ...                      │ ...                      │    ...     │   ...    │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**Pre-built Quick Queries:**

1. **Campaign Summary**
```sql
SELECT 
  c.name,
  COUNT(DISTINCT p.id) as total_pairs,
  COUNT(DISTINCT v.id) as total_votes,
  COUNT(DISTINCT v.user_id) as unique_reviewers,
  COUNT(DISTINCT CASE WHEN v.id IS NOT NULL THEN p.id END) as pairs_with_votes
FROM campaigns c
LEFT JOIN pairs p ON c.id = p.campaign_id
LEFT JOIN votes v ON p.id = v.pair_id
WHERE c.id = :campaign_id
GROUP BY c.id;
```

2. **Inter-rater Reliability Data** (export for Krippendorff's alpha calculation)
```sql
SELECT 
  v.pair_id,
  v.user_id,
  v.score_binary,
  v.score_numeric
FROM votes v
JOIN pairs p ON v.pair_id = p.id
WHERE p.campaign_id = :campaign_id
ORDER BY v.pair_id, v.user_id;
```

3. **Reviewer Performance**
```sql
SELECT 
  u.email,
  COUNT(v.id) as total_votes,
  AVG(CASE WHEN v.score_binary = consensus.binary_consensus THEN 1 ELSE 0 END) as agreement_rate
FROM users u
JOIN votes v ON u.id = v.user_id
JOIN pairs p ON v.pair_id = p.id
JOIN (
  SELECT pair_id, (AVG(CASE WHEN score_binary THEN 1 ELSE 0 END) >= 0.5) as binary_consensus
  FROM votes GROUP BY pair_id
) consensus ON v.pair_id = consensus.pair_id
WHERE p.campaign_id = :campaign_id
GROUP BY u.id
ORDER BY total_votes DESC;
```

4. **Skip Analysis**
```sql
SELECT 
  p.source_text,
  p.target_text,
  p.llm_confidence,
  COUNT(s.id) as skip_count,
  COUNT(v.id) as vote_count
FROM pairs p
LEFT JOIN skips s ON p.id = s.pair_id
LEFT JOIN votes v ON p.id = v.pair_id
WHERE p.campaign_id = :campaign_id
GROUP BY p.id
HAVING COUNT(s.id) > 0
ORDER BY skip_count DESC;
```

**Schema Browser:**
- Expandable tree view of all tables
- Column names, types, and constraints
- Foreign key relationships visualized
- Row counts per table

**Safety Features:**
- Read-only mode by default (no INSERT/UPDATE/DELETE)
- Query timeout (30 seconds max)
- Result set limit (10,000 rows max)
- Audit log of all queries run

---

## Tech Stack Recommendations

### Frontend
- **React** with TypeScript
- **Tailwind CSS** for styling
- **React Query** for data fetching/caching
- Keyboard shortcut support for rapid review workflow

### Backend
- **Node.js** with Express or Hono
- **PostgreSQL** database (Replit has native Postgres support)
- **Passport.js** or similar for Google OAuth

### Deployment
- Replit's built-in hosting
- Environment variables for:
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `SESSION_SECRET`
  - `DATABASE_URL`
  - `ALLOWED_DOMAINS` (comma-separated, default: "phenomehealth.org")

---

## Key Features Summary

1. **Google OAuth** with domain restriction to `phenomehealth.org`
2. **Two scoring modes**: Binary (default) and 5-point numeric scale
3. **Smart queue priority**: Unreviewed → Low LLM confidence → High disagreement → Fewer votes → Random
4. **Campaign system**: Organize pairs into separate review projects for different entity types
5. **Role-based access**: Reviewers can review; Admins can also upload, manage, and export
6. **Full vote tracking**: Every vote recorded with user, timestamp, and edit history
7. **Vote editing**: Reviewers can view and correct their past votes
8. **Skip tracking**: Record and analyze skipped pairs to identify confusing matches
9. **Bias prevention**: LLM reasoning hidden from reviewers during review workflow
10. **Inter-rater reliability metrics**: Krippendorff's alpha computed per campaign
11. **Bulk import/export**: CSV and JSON support for pairs and results
12. **Keyboard shortcuts**: Speed up review workflow (←/→ for binary, 1-5 for numeric, ↓ skip)

---

## Future Extensibility

This architecture supports future expansion to:
- **Metabolite ↔ HMDB mapping** validation
- **Protein ↔ UniProt mapping** validation  
- **Disease ↔ MONDO/ICD mapping** validation
- **Cross-cohort variable harmonization** (UK Biobank ↔ Israeli10K ↔ INTERVAL)
- **Active learning integration**: Feed consensus labels back to improve LLM matching models
