# Story Monitor

> Live narrative event dashboard webview.

## Desired Outcome
Developers observe their coding session as a live narrative — events flowing through the three universes, beats forming a timeline, significance gauges showing what matters — transforming passive coding into an observed creative practice.

## Current Reality
No real-time narrative observation exists in the IDE. Server-side narrative events have no visual surface.

## Structural Tension
The narrative system generates rich events but they are invisible to the developer. Surfacing them creates awareness that transforms how developers relate to their work.

---

## Components

### StoryMonitorWebview
Main dashboard webview panel.
- **Behavior:** Opens in the Story Monitor activity bar container or as a split editor tab. Dark-themed with three-universe color coding. Sections:
  - **Event Feed** — Real-time stream of narrative events, newest at top. Each event shows: timestamp, universe icon, significance indicator (1-5 dots), description. High-significance events highlighted with glow effect.
  - **Universe Gauges** — Three circular gauges showing real-time coherence scores for Engineer, Ceremony, Story. Gauges pulse on updates.
  - **Session Arc** — Horizontal timeline showing the current session's narrative structure: phases (germination, assimilation, completion), key beats, tension peaks.
  - **Beat Detail** — Click any event to see three-universe analysis detail in a side panel.

### SessionExplorer
Tree view for session navigation.
- **Behavior:** Tree structure in Story Monitor sidebar:
  - Active session at top with: start time, current phase, beat count
  - Recent sessions below (last 10)
  - Each session expandable to show beats
  - Right-click: Resume session, Export as narrative document, Archive
  - Session intent shown as subtitle (editable inline)

### AmbientMode
Subtle ambient indicators.
- **Behavior:** When enabled (`mia.storyMonitor.ambient`), provides minimal ambient feedback without requiring the full dashboard:
  - Status bar item: current session phase + elapsed time
  - Editor background: very subtle color tint based on active universe
  - Notification: popup on high-significance beats (significance ≥ 4)
  - Can be toggled independently of the full dashboard

### EventSubscription
WebSocket event consumer.
- **Behavior:** Subscribes to the narrative WebSocket channel via `integration/02-websocket-narrative-client`. Handles event types:
  - `beat.created` — new story beat
  - `analysis.complete` — three-universe analysis result
  - `session.phase` — session phase transition
  - `coherence.update` — universe coherence score change
  - `chart.progress` — STC chart progress update
  
  Events buffered during disconnection, replayed on reconnect (last 100 events).

---

## Supporting Structures
- Extension directory: `extensions/mia-story-monitor/`
- Activation: `onView:sessionExplorer` or `onCommand:mia.showDashboard`
- Depends on: `mia.three-universe` (shared API, WebSocket, activity bar container)
- Webview built with vanilla HTML/CSS/JS (no framework) for fast loading
- Fulfills: `mia-code-server/rispecs/narrative-intelligence/05-live-story-monitor` (IDE surface)
