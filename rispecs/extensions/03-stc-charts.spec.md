# STC Charts

> Structural Tension Chart management sidebar and webview.

## Desired Outcome
Developers create, view, and progress through Structural Tension Charts directly within the IDE — seeing the gap between desired outcome and current reality, tracking action steps, and watching charts resolve as work advances.

## Current Reality
STC charts exist as concepts in the Miadi platform and miaco CLI. No IDE-native chart management exists.

## Structural Tension
Structural Tension Charts are the creative process methodology. Making them visible and interactive in the IDE keeps the creative orientation present during coding.

---

## Components

### ChartExplorer
Tree view in the STC Dashboard activity bar container.
- **Behavior:** Tree structure:
  - Root: active charts (sorted by last modified)
  - Each chart shows: title, progress indicator (action steps completed / total)
  - Expand chart → nodes: Desired Outcome, Current Reality, Action Steps
  - Action steps show checkbox icon (completed/pending)
  - Context menu on chart: Review, Archive, Delete, Export
  - Context menu on action step: Complete, Edit, Reorder
  - Drag-and-drop to reorder action steps within a chart

### ChartDetailWebview
Webview panel showing full chart detail.
- **Behavior:** Opens when user clicks "Review" on a chart or runs `mia.createChart`. Displays:
  - **Desired Outcome** — editable text area with rich formatting
  - **Current Reality** — editable text area, updated as reality changes
  - **Action Steps** — ordered list with: checkbox, description, assignee, status
  - **Progress Arc** — visual indicator: arc from current reality to desired outcome, filling as steps complete
  - **Three-Universe Analysis** — if connected to server, shows Engineer/Ceremony/Story perspectives on the chart
  
  Changes saved to local workspace (`.stc/` directory) and synced to server when connected.

### ChartStatusBarItem
Status bar indicator for active chart.
- **Behavior:** Shows currently active chart name and progress in the status bar. Click opens the chart detail webview. Tooltip shows desired outcome preview. Badge color reflects progress: red (early), yellow (midway), green (near completion).

### ChartFileStorage
Local workspace storage for charts.
- **Behavior:** Charts stored as JSON files in `.stc/charts/` directory within the workspace:
  ```json
  {
    "id": "uuid",
    "title": "Chart title",
    "desiredOutcome": "What the user wants to create",
    "currentReality": "Current state description",
    "actionSteps": [
      { "id": "uuid", "description": "Step text", "completed": false, "order": 1 }
    ],
    "created": "ISO timestamp",
    "modified": "ISO timestamp"
  }
  ```
  File watcher detects external changes (e.g., from miaco CLI) and refreshes views.

---

## Creative Advancement Scenario: Chart Progression

**Desired Outcome**: Developer completes a creative process with visible progress
**Current Reality**: Developer has identified a gap between where they are and where they want to be
**Natural Progression**:
  1. Developer creates chart via `mia.createChart` — defines desired outcome and current reality
  2. Chart appears in STC Dashboard sidebar and status bar
  3. As action steps are completed (checked off), the progress arc fills
  4. Three-universe analysis provides perspective on the progression
  5. Chart resolves when all action steps complete
**Resolution**: The structural tension between desired outcome and current reality has resolved through visible, tracked creative work

---

## Supporting Structures
- Extension directory: `extensions/mia-stc-charts/`
- Activation: `onView:chartExplorer` or `onCommand:mia.createChart`
- Depends on: `mia.three-universe` (for shared API, activity bar container)
- Views contributed to the STC Dashboard `viewsContainer` registered by core extension
- Fulfills: `mia-code-server/rispecs/miaco-module/04-stc-charts` (IDE surface)
