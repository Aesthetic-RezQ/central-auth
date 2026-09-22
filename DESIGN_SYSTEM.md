# BIC Internal IT Web UI Framework

Version: 3.0.0 (Tailwind-Admin Theme)

Visual direction: Tailwind-Admin dashboard UI language ([Tailwind-Admin/free-tailwind-admin-dashboard-template](https://github.com/Tailwind-Admin/free-tailwind-admin-dashboard-template.git)), adapted to the BIC internal framework. The system features a clean light navigation rail, modern pastel stat cards, 12px rounded geometry, soft pill badges, responsive layouts, and glowing primary focus states without altering application workflows or backend endpoints.

This document is authoritative for all internal IT applications that use this UI framework.

## 1. Objectives

All internal applications should look and behave as if they belong to the same corporate application suite.

Priorities:

1. Consistency
2. Readability
3. Operational clarity
4. Fast development
5. Low maintenance
6. Reusability

## 2. Mandatory AI Coding Rules

When generating or modifying UI code:

- Reuse the existing BIC UI classes before creating new styles.
- Never create arbitrary brand colors.
- Never hard-code spacing, border radius, shadows, or primary colors when a design token already exists.
- Never use inline styles for normal application UI.
- Never duplicate component CSS inside individual pages.
- New reusable components must be added to `bic-components.css`.
- New design constants must be added to `bic-tokens.css`.
- Page-specific CSS should be minimal and only used when the design system cannot reasonably cover the requirement.
- Existing layout patterns must be preserved unless there is a functional reason to change them.
- All pages must be usable at 1366x768 and responsive down to 768px.
- Use semantic HTML where practical.
- Maintain visible focus states for keyboard navigation.
- Dangerous actions must use the danger button style.
- Status indicators must use standard badge colors.

## 3. Standard Page Structure

Every authenticated application page should follow:

1. Sidebar
2. Topbar
3. Page header
4. Content area
5. Cards / tables / forms

Recommended HTML structure:

```html
<div class="bic-app">
  <aside class="bic-sidebar">...</aside>

  <main class="bic-main">
    <header class="bic-topbar">...</header>

    <section class="bic-content">
      <div class="bic-page-header">...</div>
      ...
    </section>
  </main>
</div>
```

## 4. Buttons

Primary action:

```html
<button class="bic-btn bic-btn-primary">Save</button>
```

Secondary:

```html
<button class="bic-btn bic-btn-secondary">Cancel</button>
```

Danger:

```html
<button class="bic-btn bic-btn-danger">Delete</button>
```

Do not create custom button colors unless a new global component state is approved.

## 5. Forms

Use:

- `.bic-form-group`
- `.bic-label`
- `.bic-control`
- `.bic-select`
- `.bic-textarea`
- `.bic-help`

Do not style individual `<input>` elements directly in page templates.

## 6. Tables

Use `.bic-table-wrap` and `.bic-table`.

Tables should:

- Keep header labels concise.
- Put actions in the rightmost column.
- Use badges for status.
- Avoid excessive grid lines.
- Use horizontal scrolling on smaller screens.

## 7. Status Colors

Use status colors only for operational meaning:

- Green = healthy / success / active
- Amber = warning / attention
- Red = failed / critical / destructive
- Blue = information / neutral operational state

Do not use status colors decoratively.

## 8. Cards

Use `.bic-card`.

Cards should group logically related information. Avoid nesting cards unless necessary.

For dashboards, KPI cards should use `.bic-stat`.

## 9. Navigation

Sidebar items use `.bic-nav-link`.

The current page must include `.is-active`.

Group navigation with `.bic-nav-section` when the application has many modules.

## 10. Spacing

Spacing follows the global 4px scale from `bic-tokens.css`.

Preferred values:

- 8px for tight UI spacing
- 12px for compact grouping
- 16px for standard spacing
- 24px for section spacing
- 32px+ for major separation

Do not introduce arbitrary values such as 17px, 23px, or 37px unless technically required.

## 11. Typography

Default:

- Font: Inter / Segoe UI fallback
- Body: 14px
- Small: 13px
- Labels/meta: 12px
- Section titles: 18–24px
- Page titles: 30px

Avoid oversized marketing-style typography in internal operational systems.

## 12. New Component Policy

Before creating a new component:

1. Check if an existing BIC component can be reused.
2. If not, create a generic reusable component.
3. Add its CSS to `bic-components.css`.
4. Document its usage here if it becomes a common component.
5. Do not create one-off styling in individual pages unless unavoidable.

## 13. AI Prompt Template

Use this at the beginning of future vibe-coding tasks:

> This application uses the BIC Internal IT Web UI Framework.
> Read and follow `DESIGN_SYSTEM.md`.
> Reuse existing BIC classes from `/css`.
> Do not invent a new design language.
> Do not use inline CSS.
> Do not hard-code colors, spacing, radius, or shadows when tokens exist.
> If a reusable component is missing, add it to `bic-components.css`.
> Preserve the standard sidebar, topbar, page header, card, table, form, badge, alert, and modal patterns.
> The result must visually match the existing internal IT application suite.

## 14. Versioning

Applications should record the UI framework version in their README or application documentation.

Example:

`BIC Internal IT Web UI Framework: v1.0.0`

Breaking visual changes should increment the major version.
