# RoboAgent Requirement — ROS2 Communication Graph View

**Requirement ID:** REQ-5
**Priority: HIGH**
**Status:** Specified (implementation in progress)
**Relates to:** REQ-1 (Workspace Detection & Indexing — shipped), REQ-2 (Node Communication Graph — shipped), REQ-3 (ROS2 Toolkit)
**Blueprint alignment:** Part 1 §3.2 (Basic Visualization — *"Embedded ROS2 Graph: Interactive node/topic graph inside the IDE"*), Part 4 §9.2 (Robotics Panel — *"ROS2 Graph Tab"*), Part 5 §13.1 Month 2 (*"ROS2 graph visualization panel"*)

---

## 1. Summary

REQ-2 turned the Workspace Knowledge Graph into a communication model: every node's
publishers, subscribers, services and actions, aggregated into a topic registry. REQ-5 makes
that model **visible**: an interactive **node–topic graph** rendered inside the IDE, so an
engineer sees at a glance which nodes talk to which over what topics — the picture they today
reconstruct mentally from `rqt_graph` plus grep.

The view is a **workbench editor pane** (full editor-area canvas, like the Running Extensions
editor), opened from the command palette, the Package Explorer title bar, and the walkthrough.
It renders from the **static WKG** (source-scanned); overlaying live runtime state is a later
requirement (rclpy bridge).

---

## 2. Motivation

- The blueprint's MVP explicitly lists an embedded interactive ROS2 graph (Part 1 §3.2) and a
  dedicated ROS2 Graph tab (Part 4 §9.2). It is the first *visual* payoff of the WKG and the
  surface later requirements (debug agents, live introspection) will annotate.
- `rqt_graph` requires a running system, a sourced environment and an X session; RoboAgent can
  show the architecture **before anything runs**, straight from source.
- The Package Explorer answers "what is in this workspace"; the graph answers **"how does it
  connect"** — publishers → topics → subscribers, per package or workspace-wide.

---

## 3. Functional Requirements

| ID | Requirement |
|---|---|
| **R5.1** | A `RoboAgent: Show ROS2 Node Graph` command (palette, category RoboAgent) and a graph icon in the Package Explorer view title open the graph editor. Re-invoking reveals the existing editor (singleton input). |
| **R5.2** | The editor renders a **bipartite communication graph** from the WKG: **nodes** (executables, labeled `package/node`) and **topics** (labeled with name + message type when known), with directed edges publisher → topic and topic → subscriber. |
| **R5.3** | Layout is **deterministic layered** (left-to-right data flow): pure-publisher nodes left, topics between, downstream nodes right; computed by a testable pure function (no rendering dependencies). |
| **R5.4** | The graph is **interactive**: pan (drag background) and zoom (scroll / toolbar buttons); clicking a node or topic **highlights** it and its direct connections, dimming the rest; clicking empty space clears the highlight. |
| **R5.5** | Hovering a node or topic shows a **hover** (via the workbench hover service) with details: node → package, language, endpoint counts; topic → message type, publisher/subscriber node keys. |
| **R5.6** | Service/action links are shown as edges styled distinctly from topic edges (dashed), connecting servers and clients through the service/action name. |
| **R5.7** | The editor **updates live** when the WKG is re-indexed (`onDidChangeGraph`), preserving the current pan/zoom. |
| **R5.8** | An **empty state** (no communications indexed) explains why and offers the Index command as a link. |
| **R5.9** | The rendering is **theme-aware** (uses workbench theme colors; legible in light and dark) and localized. |

---

## 4. Design

### 4.1 Surfaces (all fork-side, `src/vs/workbench/contrib/roboagent/`)

- `browser/ros2GraphEditorInput.ts` — singleton readonly `EditorInput`
  (`roboagent.ros2GraphInput`), custom scheme resource, serializer for reopen-on-restart.
- `browser/ros2GraphEditor.ts` — `EditorPane` (`roboagent.ros2GraphEditor`): SVG rendering,
  pan/zoom, selection highlighting, hovers, `onDidChangeGraph` subscription.
- `common/ros2GraphLayout.ts` — pure layout: WKG → `{ nodes, topics, edges }` with layered
  x/y positions. **No DOM imports** ⇒ unit-testable.
- `browser/media/ros2Graph.css` — styles on workbench theme variables.
- `ros2WorkspaceActions.ts` — `ShowRos2GraphAction` (palette + Package Explorer title menu).
- `roboagent.contribution.ts` — editor pane + serializer registration.

### 4.2 Rendering & layout

Plain **SVG** built with the workbench DOM helpers — no new dependencies (Cytoscape.js is the
blueprint's suggestion for the webview-based product panel; for the fork-native MVP an SVG
renderer on the WKG (dozens of nodes) is sufficient, dependency-free and theme-native).

Layered layout: longest-path layering over the bipartite pub/sub digraph (cycles broken on
back-edges), barycenter ordering within layers to reduce crossings, fixed column/row spacing.
Nodes render as rounded rectangles (color-accented by language), topics as pill shapes,
edges as cubic curves with arrowheads; service edges dashed.

### 4.3 Data flow

`IRos2WorkspaceService.getGraph()` → `computeRos2GraphLayout(graph, filter?)` → SVG render.
On `onDidChangeGraph`: recompute + re-render, keeping the viewport transform. Package filter
(R5.10, follow-up) reserved in the layout function signature.

---

## 5. Out of Scope (explicit follow-ups)

- **Live runtime overlay** (actual publication rates, active nodes) — needs the rclpy bridge.
- **Package/subsystem filter UI** and search-in-graph (layout API accepts a filter already).
- TF-frame tree visualization (own requirement in the blueprint).
- Graph editing / drag-to-rewire (visualization only).
- Export (PNG/SVG file).

---

## 6. Acceptance Criteria

1. `RoboAgent: Show ROS2 Node Graph` from the palette and the Package Explorer title icon both
   open one graph editor tab; invoking again reveals it instead of duplicating.
2. On the fixture workspace (talker → `/chatter` → listener), the editor shows two node boxes
   and one topic pill with arrows talker→chatter→listener, labeled with `std_msgs/String`.
3. Clicking `talker` highlights talker, `/chatter` and the connecting edges; the rest dims;
   clicking the background restores.
4. Scroll-zoom and background-drag pan work; zoom controls in the editor render.
5. Re-running `RoboAgent: Index ROS2 Workspace` while the editor is open re-renders it without
   reopening; pan/zoom is preserved.
6. With an empty/non-ROS2 workspace the editor shows the localized empty state with a working
   Index link.
7. Layout unit tests pass (`ros2GraphLayout`): layering, ordering determinism, cycle safety,
   service-edge classification.
8. Type-check clean; editor renders correctly in light and dark themes.

---

*This document follows the RoboAgent blueprint requirements style. It is the authoritative spec
for REQ-5; progress is tracked in `implementation_tasks.md` and detailed in `implementation.md`.*
