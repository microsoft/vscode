# Welcome Experience

> First-run walkthrough and getting-started flow.

## Desired Outcome
A developer opening mia-vscode for the first time is greeted with a walkthrough that introduces three-universe intelligence, connects them to their mia-code-server instance, and lets them choose their preferred universe focus — resulting in a personalized, ready-to-use narrative IDE.

## Current Reality
VS Code shows its standard "Get Started" walkthrough tab with generic feature introductions.

## Structural Tension
First impressions shape how developers relate to the narrative tools. A purposeful welcome experience transforms curiosity into engaged creative practice.

---

## Components

### MiaWalkthrough
VS Code walkthrough contribution for first-run experience.
- **Behavior:** Registered as a walkthrough via the `walkthroughs` contribution point in the built-in `mia.three-universe` extension. Appears on first launch. Steps:
  1. **Welcome to Mia Code** — Brief philosophy introduction (Engineer precision, Ceremony accountability, Story coherence). Visual: three-universe color circles.
  2. **Connect to Server** — Input mia-code-server URL and authenticate. Validates connection, shows server status. Skippable for standalone use.
  3. **Choose Your Focus** — Select primary universe affinity (influences default sidebar view, theme accent, and suggestion weighting). All universes remain accessible.
  4. **Meet Your Panels** — Interactive tour of activity bar icons: Three-Universe, STC Charts, Story Monitor. Each click highlights the panel.
  5. **Create Your First Chart** — Guided creation of a Structural Tension Chart with desired outcome and current reality. Demonstrates the STC workflow.
  6. **Ready to Create** — Summary of keyboard shortcuts, links to documentation, option to open sample narrative project.

### ServerConnectionWidget
Server connection UI within the walkthrough.
- **Behavior:** Text input for server URL (default: `http://localhost:8080`). "Connect" button tests the `/api/health` endpoint. Success shows server version and available universes. Failure shows friendly error with troubleshooting link. Connection saved to `mia.serverUrl` setting.

### UniverseAffinitySelector
Universe preference selector.
- **Behavior:** Three clickable cards:
  - 🔧 **Engineer** (Blue) — "Precision-first. Technical clarity."
  - 🌿 **Ceremony** — (Green) — "Relational accountability. Process integrity."
  - 📖 **Story** (Purple) — "Narrative coherence. Meaning-making."
  
  Selection sets `mia.primaryUniverse` setting. Default: balanced (no primary). Each card animates on hover with its accent color.

---

## Creative Advancement Scenario: First Launch

**Desired Outcome**: Developer is oriented and engaged with narrative tools
**Current Reality**: Developer has just installed mia-vscode, unfamiliar with three-universe approach
**Natural Progression**:
  1. Welcome step introduces the philosophy without jargon
  2. Server connection establishes the platform relationship
  3. Universe selector personalizes the experience
  4. Panel tour builds spatial familiarity
  5. First chart creation generates immediate value
**Resolution**: Developer has a configured, personalized narrative IDE with their first STC chart

---

## Supporting Structures
- VS Code `walkthroughs` contribution point in extension `package.json`
- Walkthrough images/media in extension `media/` directory
- Settings stored via VS Code configuration API
- Fulfills: `mia-code-server/rispecs/mia-vscode/02-welcome-experience.spec.md`
