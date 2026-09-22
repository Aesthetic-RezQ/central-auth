# BIC Internal IT Web UI Framework

A reusable front-end UI starter kit for internal IT applications.

Suitable for:

- PHP / XAMPP
- Laravel
- Plain HTML
- Flask / Django templates
- Node / Express templates
- Internal dashboards
- NMS
- Helpdesk
- Asset Management
- Server Audit
- Project & Budget Tracker
- Internal administration portals

## Quick Start

Include the styles in this order:

```html
<link rel="stylesheet" href="/css/bic-tokens.css">
<link rel="stylesheet" href="/css/bic-base.css">
<link rel="stylesheet" href="/css/bic-layout.css">
<link rel="stylesheet" href="/css/bic-components.css">
<link rel="stylesheet" href="/css/bic-utilities.css">
```

Then include:

```html
<script src="/js/bic-ui.js"></script>
```

## Files

- `bic-tokens.css` — colors, spacing, sizing, typography, layout constants
- `bic-base.css` — reset and global HTML styling
- `bic-layout.css` — sidebar, topbar, content and grids
- `bic-components.css` — buttons, cards, tables, forms, badges, alerts, modal
- `bic-utilities.css` — small utility classes
- `bic-ui.js` — sidebar and modal behavior
- `DESIGN_SYSTEM.md` — rules for developers and AI coding assistants
- `examples/dashboard.html` — complete reference page

## Recommended Workflow

Keep this framework in its own source-control repository.

For each application:

1. Reference or copy a specific released version.
2. Record the framework version in the app README.
3. Do not modify the framework CSS inside the app.
4. Submit improvements back to the master UI framework.
5. Upgrade apps intentionally between versions.

## Version

1.0.0
