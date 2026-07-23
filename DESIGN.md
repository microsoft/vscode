---
product: Repoctx IDE
register: product
creative_north_star: The Evidence Workbench
version: 0.1.0
---

# Overview

Repoctx IDE should feel like an evidence workbench built into a familiar code editor. The visual system is restrained and structural: repository relationships, ownership, risk, validation, and review state are connected through clear hierarchy rather than decorative chrome.

The creative signature is the connected repository map. Small nodes and deliberate connector lines may show how files, routes, tests, owners, and checks relate. Use this metaphor only when it explains a real relationship.

Product-owned surfaces use one primary accent at a time and inherit the active Code OSS theme wherever possible. Avoid gradients, glass effects, decorative cards, and excessive status color.

# Colors

- `evidence-amber` `#C8792A`: primary Repoctx accent for focus, selected trust actions, and creator-brand moments. Keep below 10 percent of a view.
- `trust-teal` `#2F7D72`: positive evidence and verified relationships. Always pair with an icon or label.
- `risk-rust` `#B5473C`: blocking risk and failed validation. Reserve for states that require attention.
- `workbench-ink` `#1F2328`: light-theme foreground reference.
- `workbench-paper` `#F7F5F2`: light-theme product surface reference.
- `workbench-slate` `#171B20`: dark-theme product surface reference.

Use VS Code semantic theme variables as the implementation source of truth, including `--vscode-foreground`, `--vscode-editor-background`, `--vscode-focusBorder`, and button, badge, list, and status variables. Never override a user's entire theme to enforce Repoctx brand colors.

# Typography

Use the host workbench UI font for navigation, labels, and explanatory copy. Use the configured editor monospace font for file paths, symbols, commands, receipts, hashes, and evidence values.

- Page titles: 24 to 28px, semibold, compact line height
- Section titles: 13 to 16px, semibold
- Body and controls: inherit workbench sizing, normally 12 to 14px
- Metadata and creator credit: 11 to 12px with restrained contrast

Prefer short, factual sentences. Use sentence case. Avoid marketing superlatives, vague AI language, and unexplained acronyms.

# Elevation

Create hierarchy with tonal surface differences, borders, spacing, and placement. Do not make every section a floating card. Shadows are reserved for transient overlays such as menus, dialogs, and drag previews where the host workbench already uses them.

Connected evidence may use one-pixel lines or subtle tonal bands. Focus and selection must remain visible in high-contrast themes.

# Components

- Trust summary: a compact repository-level view showing context freshness, changed-file risk, validation, ownership, and review readiness.
- Evidence row: label, state icon, short reason, and one clear next action. It expands to reveal sources and timestamps.
- Repository map: connected nodes for real files, routes, tests, owners, and dependencies. It supports keyboard navigation and a readable list alternative.
- Readiness pill: a concise state such as `Needs evidence`, `Review ready`, or `Blocked`. Never show a score without its meaning.
- Trust rail: a narrow, persistent route to Context, Impact, Review, and Audit. It should not compete with Explorer or Source Control.
- Action button: one primary action per region. Secondary actions use native button and link treatments.
- Creator credit: `Created by Oluwasegun Olumbe` appears quietly in Welcome and About, below the product promise or product name.

# Do's and Don'ts

## Do

- Keep the editor, terminal, Git, shortcuts, and accessibility behavior familiar.
- Show the source, time, and reason behind trust states.
- Pair status colors with text and icons.
- Put the next useful action near the evidence that requires it.
- Respect reduced motion and keep state transitions between 150 and 250ms.
- Preserve Microsoft and third-party license notices in the fork.

## Don't

- Do not turn the workbench into a generic analytics dashboard.
- Do not use gradients, glassmorphism, neon glows, or decorative network noise.
- Do not hide important risk behind hover-only interactions.
- Do not present AI output as verified evidence without checks.
- Do not use color as the only signal.
- Do not make the creator credit larger than the product purpose.
