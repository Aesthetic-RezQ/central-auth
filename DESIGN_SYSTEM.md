# BIC Internal IT Web UI Framework

Version: 4.0.0 (Tabler.io Enterprise Theme)

Visual direction: Standardized enterprise UI language modeled directly on [Tabler.io](https://tabler.io), adapted to the BIC internal application suite. The system features a clean 240px navigation sidebar, 56px minimalist topbar, 4px-6px subtle rounded geometry, Inter typography, soft pill badges, Tabler stamp metric cards, and responsive tables without altering application workflows or backend endpoints.

This document is authoritative for all internal IT applications that use this UI framework.

## 1. Objectives

All internal applications should look and behave as if they belong to the same corporate application suite.

Priorities:

1. Consistency & Clean Modernity (Tabler.io standard)
2. High Readability & Contrast
3. Operational clarity
4. Fast development
5. Low maintenance
6. Component Reusability

## 2. Mandatory AI Coding Rules

When generating or modifying UI code:

- Reuse the existing BIC UI classes before creating new styles.
- Never create arbitrary brand colors. Use standard Tabler design tokens (`#206bc4` primary, `#f6f8fb` background, `#e6e8ea` border).
- Never hard-code spacing, border radius, shadows, or primary colors when a design token already exists.
- Never use inline styles for normal application UI.
- Never duplicate component CSS inside individual pages.
- New reusable components must be added to `bic-components.css`.
- New design constants must be added to `bic-tokens.css`.
- Page-specific CSS should be minimal and only used when the design system cannot reasonably cover the requirement.
- Existing layout patterns must be preserved unless there is a functional reason to change them.
- All pages must be usable at 1366x768 and responsive down to 768px.
- Use semantic HTML where practical.
- Maintain visible focus states for keyboard navigation (`box-shadow: 0 0 0 0.25rem rgba(32, 107, 196, 0.25)`).
- Dangerous actions must use the danger button style.
- Status indicators must use standard badge colors.

## 3. Standard Page Structure (Tabler Horizontal Navbar)

Every authenticated application page follows:

1. Top Navbar (`.bic-navbar` — 60px height, `#ffffff` surface, border `#e6e8ea`):
   - Brand (`.bic-brand` with logo + title)
   - Horizontal Navigation (`.bic-nav-horizontal` with `.bic-nav-link` items)
   - User profile dropdown (`#identity`)
2. Page header / subheader (`.bic-page-header-wrap` with kicker & `.bic-page-title`)
3. Content area (`.bic-content` — `#f6f8fb` background, max-width 1400px centered)
4. Cards / tables / forms

Recommended HTML structure:

```html
<div class="bic-app">
  <header class="bic-navbar">
    <div class="bic-navbar-container">
      <div class="bic-navbar-left">
        <button class="bic-menu-toggle" type="button" aria-label="Toggle navigation" data-bic-toggle-menu>...</button>
        <div class="bic-brand">...</div>
      </div>
      <nav class="bic-nav-horizontal">
        <button class="bic-nav-link is-active" data-section="overview">...</button>
        <button class="bic-nav-link" data-section="users">...</button>
      </nav>
      <div class="bic-navbar-right">
        <div class="bic-dropdown">...</div>
      </div>
    </div>
  </header>

  <main class="bic-main">
    <div class="bic-page-header-wrap">
      <div class="bic-page-header-container">
        <div>
          <p class="bic-kicker">CENTRAL AUTHENTICATION SERVICE</p>
          <h2 class="bic-page-title">Overview</h2>
        </div>
      </div>
    </div>

    <section class="bic-content">
      ...
    </section>
  </main>
</div>
```

## 4. Buttons (Tabler.io Style)

Primary action:

```html
<button class="bic-btn bic-btn-primary">Save changes</button>
```

Secondary / Outline:

```html
<button class="bic-btn bic-btn-secondary">Cancel</button>
```

Danger:

```html
<button class="bic-btn bic-btn-danger">Delete user</button>
```

Small size:

```html
<button class="bic-btn bic-btn-secondary bic-btn-sm">Refresh</button>
```

## 5. Forms

Use standard Tabler form classes:

- `.bic-form-group`
- `.bic-label`
- `.bic-control` (Text inputs)
- `.bic-select` (Custom styled dropdown select)
- `.bic-textarea`
- `.bic-help`

Example:

```html
<div class="bic-form-group">
  <label class="bic-label" for="email">Email address</label>
  <input class="bic-control" id="email" type="email" placeholder="user@bic.co.id" />
  <div class="bic-help">Corporate email address.</div>
</div>
```

## 6. KPI Metric Cards (Tabler Stamps)

```html
<div class="bic-card bic-stat">
  <div class="bic-stat-content">
    <span class="bic-stat-label">Total users</span>
    <strong class="bic-stat-value">128</strong>
  </div>
  <div class="bic-stat-icon-wrap bic-stat-icon-total">
    <svg ...></svg>
  </div>
</div>
```

## 7. Badges & Status Indicators

Pill badges with soft background and high contrast text:

- `.bic-badge-success` (Active / Connected)
- `.bic-badge-danger` (Disabled / Error)
- `.bic-badge-warning` (Pending / Not configured)
- `.bic-badge-info` (System / Meta)
- `.bic-badge-primary` (Roles / Applications)

```html
<span class="bic-badge bic-badge-success">Active</span>
<span class="bic-badge bic-badge-danger">Disabled</span>
```

## 8. Tables

Clean enterprise data tables with sort headers and subtle hover states:

```html
<div class="bic-card bic-panel">
  <div class="bic-table-wrap">
    <table class="bic-table bic-sortable">
      <thead>
        <tr>
          <th>User</th>
          <th>Division</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          ...
        </tr>
      </tbody>
    </table>
  </div>
</div>
```
