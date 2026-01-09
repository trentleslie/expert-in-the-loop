# Design Guidelines: Biomedical Entity Mapping Validation App

## Design Approach
**System-Based Approach: Material Design 3**

Rationale: This is a utility-focused, data-intensive enterprise application requiring clear information hierarchy, efficient workflows, and professional trustworthiness. Material Design 3 provides the structured component system ideal for complex forms, data tables, and dashboard interfaces common in scientific tools.

## Core Design Principles

**1. Clarity Over Aesthetics**
- Information legibility is paramount
- Minimize visual noise to reduce cognitive load during rapid review sessions
- Use whitespace strategically to separate distinct data elements

**2. Workflow Efficiency**
- Design for keyboard-first interaction patterns
- Clear visual feedback for all interactive states
- Immediate response confirmation (votes, skips, navigation)

**3. Professional Medical Context**
- Clean, trustworthy visual language appropriate for biomedical research
- Avoid playful or consumer-oriented design patterns
- Maintain scientific credibility through restrained visual design

## Typography System

**Font Families:**
- Primary: Inter (clean, highly legible for data display)
- Monospace: JetBrains Mono (for IDs, codes, technical identifiers)

**Hierarchy:**
- Page Titles: 2xl, semibold
- Section Headers: xl, semibold  
- Card Titles: lg, medium
- Body Text: base, regular
- Metadata/Labels: sm, medium
- Technical IDs: sm, mono, medium
- Helper Text: xs, regular

## Layout System

**Spacing Primitives:**
Use Tailwind units: **2, 4, 6, 8, 12, 16** for consistent rhythm
- Micro spacing (within components): 2, 4
- Component padding: 6, 8
- Section spacing: 12, 16
- Page margins: 16

**Container Widths:**
- Review interface: max-w-6xl (requires side-by-side comparison space)
- Dashboard/tables: max-w-7xl
- Forms/settings: max-w-4xl
- Text content: max-w-prose

## Component Library

### Navigation
- **Top Navigation Bar**: Fixed header with app logo, campaign name, user avatar dropdown
- **Sidebar (Admin)**: Collapsible navigation for dashboard, campaigns, users, settings
- **Breadcrumbs**: Show navigation path in admin sections

### Review Interface (Core Workflow)
- **Split-Panel Layout**: Two equal-width cards (source/target) displayed side-by-side with clear visual separation
- **Entity Cards**: Elevated cards with subtle border, internal padding (p-6), rounded corners (rounded-lg)
  - Dataset label: Small badge/chip at top
  - Entity text: Large, prominent (text-lg)
  - ID/metadata: Muted text (text-sm) at bottom
- **LLM Confidence Indicator**: Horizontal progress bar or pill badge showing confidence score
- **Action Buttons**: Large, touch-friendly (h-12), full-width on mobile, side-by-side on desktop
  - Primary action (Match): Filled button
  - Secondary action (No Match): Outlined button
  - Tertiary action (Skip): Text button
- **Progress Indicator**: Linear progress bar at top showing campaign completion percentage
- **Session Stats**: Compact metrics display (reviews completed, current streak) in subtle card

### Data Display
- **Tables**: Striped rows, hover states, sortable headers, sticky header on scroll
- **Statistics Cards**: Grid layout (grid-cols-1 md:grid-cols-3), elevated cards with icon, number (large), and label
- **Vote Distribution**: Simple horizontal stacked bar charts or donut charts
- **Timeline**: Vertical timeline with icons for activity history

### Forms
- **Input Fields**: Material-style outlined inputs with floating labels
- **File Upload**: Drag-and-drop zone with clear file format instructions
- **Radio/Checkbox Groups**: Clear spacing between options (gap-3)
- **Form Actions**: Right-aligned button group (Cancel + Primary action)

### Dashboard Elements
- **Campaign Cards**: Elevated cards in grid layout showing title, description, progress bar, quick stats
- **Filter Bar**: Horizontal row of filter chips/dropdowns
- **Export Buttons**: Outlined buttons with download icon

## Visual Treatment

**Elevation Strategy:**
- Level 0: Page background
- Level 1: Primary content cards (review panels, data tables)
- Level 2: Modals, dropdowns, tooltips
- Use subtle shadows consistent with Material Design elevation system

**Borders & Dividers:**
- Card borders: 1px subtle border or rely on shadow only
- Section dividers: 1px horizontal rule with ample margin (my-8)
- Input borders: 1px medium-weight, 2px on focus

**Iconography:**
- Use **Material Icons** via CDN for consistency with design system
- Icon sizes: 16px (inline), 20px (buttons), 24px (headers)
- Always pair with text labels except for universally understood actions

## Interaction Patterns

**Keyboard Navigation:**
- Display keyboard shortcuts prominently (e.g., "← No Match | → Yes Match | ↓ Skip")
- Visual indicator when shortcuts are active
- Focus states clearly visible with 2px outline

**Loading States:**
- Skeleton screens for data-heavy views (tables, dashboards)
- Linear progress indicator at page top for async operations
- Button loading states with spinner replacing icon

**Success/Error Feedback:**
- Toast notifications (top-right) for vote confirmations, upload results
- Inline validation messages below form fields
- Success: green accent, Error: red accent, Info: blue accent

## Responsive Behavior

**Breakpoints:**
- Mobile (< 768px): Stack review panels vertically, full-width buttons, simplified navigation
- Tablet (768px - 1024px): Maintain side-by-side review layout if content fits comfortably
- Desktop (> 1024px): Full layout with sidebar navigation (admin), optimal use of horizontal space

**Mobile Optimizations:**
- Review interface priority: Maximize entity text visibility
- Collapsible metadata sections to reduce scroll
- Sticky action buttons at bottom for easy thumb access
- Hamburger menu for navigation

## Accessibility Requirements
- WCAG 2.1 AA compliance throughout
- All interactive elements keyboard accessible with visible focus states
- Semantic HTML structure (proper heading hierarchy)
- ARIA labels for icon-only buttons
- Form labels always present (not placeholder-only)
- Sufficient contrast ratios for all text (minimum 4.5:1)

## Animation Guidelines
**Use sparingly** - only where they enhance usability:
- Page transitions: Simple fade (200ms)
- Vote submission: Brief scale animation on button press (100ms)
- Skeleton loading: Gentle shimmer effect
- Avoid: Elaborate scroll animations, parallax effects, decorative motion

## Images
**No hero images or decorative imagery** - this is a specialized workflow tool, not a marketing site. Focus all visual attention on the data being reviewed and the interface for providing feedback.