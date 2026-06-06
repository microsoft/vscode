# RoboAgent Blueprint Part 4: IDE/UX, Tech Stack, Security

---

# 9. IDE / UX DESIGN

## 9.1 Layout Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  [≡] RoboAgent   │  robot_bringup ▸ launch ▸ bringup.launch.py    │
│  File Edit View   │  ○ Connected to ROS2 (Humble) │ 12 nodes active│
├──────┬────────────┴───────────────────────┬─────────────────────────┤
│      │                                     │                         │
│  E   │     EDITOR AREA                     │   ROBOTICS PANEL       │
│  X   │                                     │                         │
│  P   │  ┌─────────────────────────────┐   │   [Tabs: Graph│TF│     │
│  L   │  │  bringup.launch.py          │   │    Topics│Params│Sim]  │
│  O   │  │                             │   │                         │
│  R   │  │  def generate_launch():     │   │   ┌─────────────────┐  │
│  E   │  │    return LaunchDescription([│   │   │  ROS2 GRAPH     │  │
│  R   │  │      Node(                  │   │   │  (Interactive)   │  │
│      │  │        package='nav2...',   │   │   │                  │  │
│  ──  │  │        executable='...',    │   │   │  [node]──topic──→│  │
│      │  │        parameters=[{...}],  │   │   │  [node]──srv──→  │  │
│  📦  │  │      ),                     │   │   │  [node]──tf──→   │  │
│  Pkgs│  │    ])                       │   │   │                  │  │
│      │  │                             │   │   └─────────────────┘  │
│  📡  │  └─────────────────────────────┘   │                         │
│  ROS │                                     │   ┌─────────────────┐  │
│      │                                     │   │  TF TREE         │  │
│  🔧  │                                     │   │  map             │  │
│  Dbg │                                     │   │  └─odom          │  │
│      │                                     │   │    └─base_link   │  │
│  🤖  │                                     │   │      ├─laser     │  │
│  Sim │                                     │   │      └─camera    │  │
│      │                                     │   └─────────────────┘  │
├──────┴─────────────────────────────────────┴─────────────────────────┤
│  BOTTOM PANEL  [Terminal│AI Chat│Diagnostics│Topics│Build│Bag]       │
│                                                                       │
│  🤖 AI: Your TF tree looks good. Nav2 requires map→odom→base_link   │
│     chain which is present. However, I notice your laser_frame is    │
│     rotated 180° from the standard orientation. This will cause      │
│     the costmap to mirror obstacles. Fix the rpy in your URDF.       │
│     [Show URDF] [Apply Fix] [Explain More]                           │
│                                                                       │
│  You: Why is the robot oscillating near the goal?                    │
│  █                                                                    │
└───────────────────────────────────────────────────────────────────────┘
```

## 9.2 Panel Descriptions

### Explorer Sidebar (Left)
```
Package Explorer:
├── my_robot_bringup/
│   ├── launch/ (3 files)
│   ├── config/ (2 files)
│   ├── urdf/ (1 file)
│   └── package.xml
├── my_robot_navigation/
│   ├── config/nav2_params.yaml
│   └── src/waypoint_follower.py
└── my_robot_perception/
    └── src/obstacle_detector.cpp

ROS2 Explorer:
├── Active Nodes (12)
│   ├── /controller_server [nav2] ●
│   ├── /planner_server [nav2] ●
│   ├── /map_server [nav2] ●
│   ├── /amcl [nav2] ●
│   ├── /robot_state_publisher ●
│   └── /my_obstacle_detector ⚠ (high CPU)
├── Active Topics (34)
│   ├── /cmd_vel [geometry_msgs/Twist] 20Hz
│   ├── /scan [sensor_msgs/LaserScan] 10Hz
│   ├── /odom [nav_msgs/Odometry] 50Hz
│   └── ▸ Show all...
└── Active Services (8)
    ├── /compute_path [nav2_msgs/ComputePath]
    └── ▸ Show all...

Debugging Quick Actions:
├── [▶ Echo Topic] - select and view live data
├── [📊 Plot Topic] - real-time graph
├── [🔍 Inspect Node] - show node details
├── [⚡ Check QoS] - run QoS compatibility check
└── [🩺 Health Check] - full system diagnostic
```

### Robotics Panel (Right)

**ROS2 Graph Tab**: Interactive node-topic graph using Cytoscape.js
- Nodes as circles, topics as diamonds
- Color-coded by package
- Click node → show publishers, subscribers, parameters
- Click topic → show message type, QoS, live data preview
- Filter by package or subsystem
- Highlight data flow paths

**TF Tree Tab**: Transform tree visualization
- Tree view with expand/collapse
- Show transform values on hover
- Highlight stale transforms in red
- Show publishing rate for dynamic TFs
- One-click: "Why is this transform missing?"

**Topics Tab**: Live topic monitoring
- Table: topic name, type, frequency, publishers, subscribers
- Click to echo (replaces `ros2 topic echo`)
- Mini-chart for numeric fields
- QoS status indicator (✓ compatible, ⚠ mismatch)

**Parameters Tab**: Runtime parameter browser
- Tree organized by node
- Edit parameters live (calls set_parameter service)
- Show declared type, range, description
- Diff against launch file defaults

**Simulation Tab**: When simulation is running
- Embedded 3D viewport (GzWeb or custom WebGL)
- Play/pause/step controls
- Spawn/remove objects
- Set robot pose
- View collision indicators

### Bottom Panel

**AI Chat**: Context-aware robotics assistant
- Maintains conversation with full workspace context
- Quick actions: [Debug This], [Generate Node], [Fix Error]
- Shows tool calls in collapsible sections
- Code blocks with [Apply] buttons

**Diagnostics**: Automated system health
- Continuously running checks (TF, QoS, timing, connectivity)
- Sorted by severity: CRITICAL → ERROR → WARNING → INFO
- Each diagnostic links to relevant code/config
- [Auto-Fix] buttons for known solutions

**Build Output**: Enhanced `colcon build` output
- Color-coded errors and warnings
- AI-annotated: explains cryptic CMake/compiler errors
- [Fix This Error] button on each error

**Bag Player**: When a bag file is opened
- Timeline scrubber
- Topic selector
- Synchronized playback
- AI analysis overlay

## 9.3 User Workflows

### Workflow 1: New ROS2 Project
```
1. User: "Create a new ROS2 package for a differential drive robot"
2. AI generates package structure:
   - robot_description/ (URDF, meshes)
   - robot_bringup/ (launch files, configs)
   - robot_navigation/ (Nav2 config)
   - robot_msgs/ (custom messages if needed)
3. AI generates URDF based on user's robot specs
4. AI generates launch files (sim + real)
5. AI generates Nav2 config tuned for diff-drive
6. One-click: build + launch simulation
7. Robot appears in simulation, ready to navigate
```

### Workflow 2: Debug a Running Robot
```
1. User connects IDE to running ROS2 system
2. ROS2 Explorer populates with active nodes/topics
3. User notices robot not reaching goals
4. User: "Why is my robot failing to reach navigation goals?"
5. AI runs systematic diagnosis:
   a. Checks Nav2 node status → all active
   b. Checks /plan topic → paths being generated
   c. Checks /cmd_vel → velocities being sent
   d. Checks /odom → odometry looks normal
   e. Checks controller_server logs → "path blocked"
   f. Checks local costmap → inflation radius too large
6. AI: "Your inflation radius (0.55m) is larger than the corridor 
   width minus robot radius. The local costmap inflates obstacles 
   until no path exists. Reduce inflation_radius to 0.25m."
7. User clicks [Apply Fix] → parameter updated live
8. Robot resumes navigation successfully
```

## 9.4 Onboarding Flow
```
First Launch:
1. Detect installed ROS2 distro (Humble/Jazzy/Rolling)
2. Scan for existing workspaces
3. Offer to index workspace (show progress)
4. Quick tutorial: "Here's your robot architecture" 
   (show auto-generated graph)
5. Offer first task: "Let's debug your robot" or 
   "Let's create a new project"
```

---

# 10. TECHNOLOGY STACK

## 10.1 Recommended Stack (Opinionated)

| Layer | Technology | Rationale |
|---|---|---|
| **Desktop Shell** | VSCode fork (Electron) | Mature editor, extensions ecosystem, familiar UX. We fork (not extend) for full panel control. |
| **Editor Core** | Monaco Editor | Part of VSCode. Best code editor in class. |
| **Frontend Framework** | React 18 + TypeScript | VSCode webviews use this. Large talent pool. |
| **Graph Visualization** | Cytoscape.js | Purpose-built for graph visualization. Performant with 100+ nodes. Better than D3 for graphs. |
| **3D Visualization** | Three.js + URDF-loader | WebGL-based URDF rendering. Lightweight. |
| **State Management** | Zustand | Lightweight, works well with React. Avoids Redux boilerplate. |
| **IPC (IDE ↔ Local Engine)** | Unix Domain Sockets + MessagePack | Low latency, no network overhead, compact binary format. |
| **Local Engine** | Node.js 20 (TypeScript) | Same runtime as VSCode. Access to native modules. |
| **ROS2 Bridge** | Python 3.10+ (rclpy) | Official ROS2 Python client. Runs as subprocess. |
| **IPC (Engine ↔ Bridge)** | Unix Domain Sockets + JSON | Bridge is Python, JSON is simplest interop. |
| **Local Database** | SQLite + sqlite-vec | Embedded, zero-config. sqlite-vec for vector search. |
| **Local Vector Search** | sqlite-vec or Qdrant (embedded) | sqlite-vec for MVP simplicity; Qdrant for production quality. |
| **Workspace Parsing** | Tree-sitter (C++/Python grammars) | Fast, incremental parsing. Used by many editors. |
| **Launch File Parsing** | Python AST module + custom visitor | Launch files are Python; AST parsing is the right approach. |
| **URDF Parsing** | urdf_parser_py (Python) | Official ROS URDF parser. Well-tested. |
| **Build Integration** | Subprocess (colcon, cmake, platformio) | Shell out to native build tools. Don't reinvent. |

### Cloud Stack

| Layer | Technology | Rationale |
|---|---|---|
| **API Gateway** | FastAPI (Python) | Async, fast, great for AI workloads. Type-safe. |
| **Auth** | Supabase Auth or Clerk | Don't build auth. Use a service. |
| **Database** | PostgreSQL 16 (Supabase) | Reliable, scalable, great tooling. |
| **Cache** | Redis | Session cache, rate limiting, pub/sub for real-time. |
| **Vector DB (Cloud)** | Qdrant Cloud | Best performance/cost for vector search. Better than Pinecone for self-hosted fallback. |
| **LLM Provider** | Anthropic (Claude) primary, OpenAI fallback | Claude has best code understanding. Multi-provider for resilience. |
| **Fine-tuned Models** | Llama 3 70B on vLLM (self-hosted) | For specialized robotics tasks. Reduce API costs for common queries. |
| **Embedding Model** | text-embedding-3-large (OpenAI) or nomic-embed-text | OpenAI for quality; nomic for self-hosted cost savings. |
| **Hosting** | Hetzner (GPU) + Cloudflare (CDN/edge) | Hetzner for cost-effective GPU inference. Cloudflare for edge. |
| **Monitoring** | Grafana + Prometheus | Industry standard. Self-hosted to control costs. |
| **CI/CD** | GitHub Actions | Standard. No need to be exotic. |
| **Container** | Docker + Docker Compose | Packaging for cloud services. |

### Tradeoffs Discussion

**Why fork VSCode instead of building from scratch?**
- Pro: 10+ years of editor maturity, extension ecosystem, familiar UX
- Pro: Monaco editor is the best code editor available
- Pro: Massive community, documentation, extensions
- Con: Electron is heavy (~200MB RAM baseline)
- Con: Tied to Microsoft's architecture decisions
- Con: Forking creates maintenance burden for upstream changes
- Verdict: **Fork.** The alternative (building from scratch with Tauri/GTK) would take 2+ years just to reach VSCode baseline quality.

**Why not Tauri?**
- Pro: Much lighter than Electron (~10MB vs ~200MB)
- Pro: Native performance, smaller bundle
- Con: Immature ecosystem compared to Electron
- Con: Would require rewriting all VSCode functionality
- Con: Web-based panels still need a browser engine (WebKitGTK)
- Verdict: **Maybe in v2** once the product is proven.

**Why SQLite for local instead of PostgreSQL?**
- Pro: Zero configuration, embedded, fast for single-user
- Pro: sqlite-vec extension adds vector search
- Con: No concurrent access (not needed for single-user IDE)
- Verdict: **SQLite for local, PostgreSQL for cloud only.**

**Why Claude over GPT-4?**
- Claude: Better code understanding, 200K context, better instruction following
- GPT-4: Larger ecosystem, function calling is more mature
- Verdict: **Claude primary, GPT-4 fallback.** Abstract the LLM interface.

---

# 11. SECURITY & SAFETY

## 11.1 Threat Model

```
┌─────────────────────────────────────────────┐
│              THREAT MODEL                    │
│                                              │
│  1. AI generates dangerous robot commands    │
│     Risk: Physical damage, injury            │
│     Severity: CRITICAL                       │
│                                              │
│  2. AI generates incorrect control code      │
│     Risk: Robot behaves unpredictably        │
│     Severity: HIGH                           │
│                                              │
│  3. AI halluccinates ROS2 APIs              │
│     Risk: Runtime crashes, silent failures   │
│     Severity: MEDIUM                         │
│                                              │
│  4. Malicious code in AI suggestions         │
│     Risk: System compromise                  │
│     Severity: HIGH                           │
│                                              │
│  5. Sensitive code sent to cloud LLM         │
│     Risk: IP leakage                         │
│     Severity: HIGH (enterprise)              │
│                                              │
│  6. Deployment without validation             │
│     Risk: Untested code on real hardware     │
│     Severity: CRITICAL                       │
│                                              │
│  7. Command injection via AI tools           │
│     Risk: Arbitrary command execution        │
│     Severity: HIGH                           │
└─────────────────────────────────────────────┘
```

## 11.2 Safety Architecture

### Layer 1: Code Generation Safety
```
Pre-Generation Rules:
├── Never generate code that directly writes to hardware 
│   without user confirmation
├── Flag velocity commands above robot-specific limits
├── Flag any use of sudo, system(), or shell commands
├── Validate all generated ROS2 code against API specs
└── Check generated parameters against declared ranges

Post-Generation Validation:
├── Static analysis (clang-tidy for C++, pylint for Python)
├── ROS2 API validation (do these functions/messages exist?)
├── Parameter range checking (is this velocity physically safe?)
├── Dependency verification (are all imports available?)
└── Build verification (does it compile?)
```

### Layer 2: Deployment Safety
```
Deployment Pipeline:
1. Code change committed
2. Automated build (colcon build)
3. Unit tests (colcon test)
4. Simulation test suite runs
5. AI reviews simulation results
6. Safety checklist:
   ├── [ ] All tests pass
   ├── [ ] No new warnings
   ├── [ ] Velocity limits configured
   ├── [ ] Emergency stop tested
   ├── [ ] TF tree validated
   ├── [ ] QoS profiles verified
   └── [ ] Sensor data validated
7. User manually approves deployment
8. Deploy to hardware with rollback capability
9. Monitor first 60 seconds for anomalies
```

### Layer 3: Runtime Safety
```
Runtime Monitor (runs on robot):
├── Watchdog: kill cmd_vel if no heartbeat from controller
├── Velocity limiter: hardware-enforced max velocities
├── Geofencing: stop if robot exceeds defined boundary
├── Collision proximity: emergency stop if too close
└── Telemetry: stream health metrics back to IDE
```

### Layer 4: Data Privacy
```
Privacy Controls:
├── Local-first: all code stays on machine by default
├── Code snippets sent to LLM are:
│   ├── Stripped of comments containing "confidential"/"secret"
│   ├── Anonymized (company names, internal URLs removed)
│   └── Not stored by LLM provider (use API, not training data)
├── Enterprise mode: self-hosted LLM option (Llama 3 70B)
├── Telemetry: opt-in only, anonymized usage metrics
└── Bag files: never uploaded; analyzed locally
```

### Layer 5: Sandboxing
```
AI Tool Execution Sandbox:
├── Commands run in restricted shell (rbash)
├── No network access from sandbox
├── No write access outside workspace
├── Resource limits (CPU, memory, time)
├── All commands logged and auditable
└── User approval required for:
    ├── Any sudo command
    ├── Any network request
    ├── Any file deletion
    ├── Any hardware access
    └── Any deployment action
```
