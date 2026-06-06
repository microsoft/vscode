# RoboAgent Blueprint Part 2: System Architecture & AI Design

---

# 4. SYSTEM ARCHITECTURE

## 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     ROBOAGENT DESKTOP APP                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  Editor   │ │ AI Chat  │ │ ROS2     │ │ Simulation       │  │
│  │  (Monaco) │ │ Panel    │ │ Dashboard│ │ Panel            │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────────────┘  │
│       │             │            │             │                │
│  ┌────┴─────────────┴────────────┴─────────────┴────────────┐  │
│  │              FRONTEND ORCHESTRATION LAYER                 │  │
│  │         (IPC Bus / Event System / State Management)       │  │
│  └────┬──────────────────────────────────────────────┬──────┘  │
│       │                                              │         │
│  ┌────┴──────────────────┐  ┌────────────────────────┴──────┐  │
│  │   LOCAL ENGINE        │  │   ROS2 BRIDGE PROCESS         │  │
│  │  ┌─────────────────┐  │  │  ┌──────────────────────────┐ │  │
│  │  │ Workspace Indexer│  │  │  │ rclpy Node (introspect) │ │  │
│  │  │ Context Engine   │  │  │  │ TF Listener             │ │  │
│  │  │ Launch Parser    │  │  │  │ Topic Monitor            │ │  │
│  │  │ URDF Parser      │  │  │  │ Service Caller           │ │  │
│  │  │ Build System     │  │  │  │ Parameter Interface      │ │  │
│  │  │ Local Vector DB  │  │  │  │ Bag Reader               │ │  │
│  │  │ Knowledge Graph  │  │  │  └──────────────────────────┘ │  │
│  │  └─────────────────┘  │  └───────────────────────────────┘  │
│  └────┬──────────────────┘                                     │
└───────┼────────────────────────────────────────────────────────┘
        │ HTTPS/WSS
┌───────┴────────────────────────────────────────────────────────┐
│                    ROBOAGENT CLOUD                              │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────────┐  │
│  │ AI Gateway   │ │ Auth/Billing │ │ Telemetry/Analytics    │  │
│  │ (LLM Router) │ │ Service      │ │ Service               │  │
│  └──────┬───────┘ └──────────────┘ └────────────────────────┘  │
│         │                                                      │
│  ┌──────┴───────┐ ┌──────────────┐ ┌────────────────────────┐  │
│  │ Model Pool   │ │ Fine-tuned   │ │ Robotics Knowledge     │  │
│  │ Claude/GPT/  │ │ ROS2 Models  │ │ Base (shared patterns) │  │
│  │ Gemini/Local │ │ (7B-70B)     │ │                        │  │
│  └──────────────┘ └──────────────┘ └────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

## 4.2 Core Services Breakdown

### 4.2.1 Local Engine (Node.js + Python)

The Local Engine runs on the developer's machine and handles all latency-sensitive operations.

**Workspace Indexer**
```
Input: ROS2 workspace path
Process:
  1. Detect colcon workspace (look for src/, build/, install/, log/)
  2. Parse all package.xml files → extract dependencies, build type, maintainers
  3. Parse CMakeLists.txt / setup.py → extract targets, install rules
  4. Scan source files → identify node classes, publishers, subscribers, 
     services, actions, parameters, timers
  5. Parse launch files (Python/XML/YAML) → extract node composition,
     remappings, parameters, includes
  6. Parse URDF/Xacro → extract links, joints, sensors, plugins
  7. Parse msg/srv/action definitions → build message type registry
  8. Build dependency graph (package → package, node → topic → node)
  9. Store in local SQLite + vector embeddings

Output: Workspace Knowledge Graph (WKG)
```

**Context Engine**
```
Purpose: Build optimal context for LLM queries
Process:
  1. Receive user query + cursor position + open files
  2. Determine query intent (code generation, debugging, explanation, etc.)
  3. Retrieve relevant context from WKG:
     - Current file's package and its dependencies
     - Related nodes (by topic connections)
     - Relevant message type definitions
     - Launch file context
     - URDF context if hardware-related
  4. Retrieve similar code patterns from vector DB
  5. Include active ROS2 system state if connected
  6. Assemble context window (prioritize by relevance, fit in token budget)
  7. Send to AI Gateway

Token Budget Strategy:
  - System prompt (robotics instructions): 2K tokens
  - Workspace structure summary: 1K tokens
  - Current file + surrounding: 4K tokens
  - Related files (by graph): 8K tokens
  - Message/service definitions: 2K tokens
  - Launch file context: 2K tokens
  - Live system state: 1K tokens
  - User conversation history: 4K tokens
  - Retrieved RAG chunks: 4K tokens
  - Total: ~28K tokens (fits Claude Sonnet context)
```

### 4.2.2 ROS2 Bridge Process (Python)

Runs as a separate process with ROS2 environment sourced.

```python
# Architecture: asyncio event loop + rclpy spinning
class ROS2Bridge:
    """Bridges IDE ←→ ROS2 system via Unix domain socket IPC"""
    
    def __init__(self):
        self.node = rclpy.create_node('roboagent_bridge')
        self.ipc_server = UnixSocketServer('/tmp/roboagent.sock')
        
    # Capabilities:
    # - list_nodes() → all active nodes
    # - list_topics() → topics + types + QoS profiles
    # - list_services() → services + types
    # - get_tf_tree() → full transform tree
    # - echo_topic(topic, n=10) → sample messages
    # - get_parameters(node) → all parameters + values
    # - set_parameter(node, key, value) → modify runtime params
    # - call_service(service, request) → invoke service
    # - get_node_info(node) → publishers, subscribers, services, actions
    # - get_qos_profiles(topic) → publisher and subscriber QoS
    # - record_bag(topics, duration) → start rosbag2 recording
    # - read_bag(path) → stream bag file data
```

### 4.2.3 AI Gateway (Cloud)

```
┌─────────────────────────────────────────┐
│            AI GATEWAY                    │
│                                          │
│  Request Router                          │
│  ├── Code Generation → Claude Sonnet     │
│  ├── Quick Completion → Fine-tuned 7B    │
│  ├── Debugging → Claude Opus + tools     │
│  ├── Explanation → Claude Sonnet         │
│  ├── URDF Generation → Specialized model │
│  └── Bag Analysis → Fine-tuned 70B       │
│                                          │
│  Tool Registry                           │
│  ├── ros2_introspect (via bridge)        │
│  ├── run_command (sandboxed)             │
│  ├── read_file                           │
│  ├── search_codebase                     │
│  ├── parse_build_error                   │
│  ├── analyze_tf_tree                     │
│  ├── check_qos_compatibility             │
│  ├── query_ros2_docs                     │
│  ├── search_ros_answers                  │
│  └── run_simulation_check                │
│                                          │
│  Context Assembler                       │
│  Rate Limiter                            │
│  Usage Tracker                           │
│  Response Cache                          │
└─────────────────────────────────────────┘
```

## 4.3 Data Flow: Debugging Query

```
User: "Why is my robot spinning in circles instead of going straight?"

1. Frontend → Local Engine: query + context
2. Local Engine → Context Engine:
   a. Identify: this is a navigation/control issue
   b. Retrieve: cmd_vel publishers, base controller node, 
      motor driver node, TF tree (base_link → odom)
   c. Query ROS2 Bridge: current cmd_vel values, 
      odom readings, TF transforms
3. Context Engine → AI Gateway: assembled context + tools
4. AI Gateway → Claude Opus (with tool calling):
   a. LLM reasons: "Spinning = angular velocity without linear,
      or incorrect TF causing rotation compensation"
   b. Tool call: ros2_introspect.echo_topic("/cmd_vel", n=5)
   c. Tool call: ros2_introspect.get_tf_tree()
   d. Tool call: ros2_introspect.get_parameters("controller_server")
   e. LLM analyzes results: "TF from base_link to base_footprint 
      has a 90° yaw offset. The controller is compensating for a 
      phantom rotation."
5. AI Gateway → Local Engine → Frontend:
   Response: "The issue is in your URDF. The joint between 
   base_link and base_footprint has a rpy of [0, 0, 1.5708] 
   which introduces a 90° yaw offset. The Nav2 controller 
   sees this as a rotation error and commands angular velocity 
   to compensate. Fix: set rpy to [0, 0, 0] in line 47 of 
   robot.urdf.xacro"
   [APPLY FIX button]
```

## 4.4 Database Architecture

```
LOCAL (on developer machine):
├── SQLite: workspace_index.db
│   ├── packages (name, path, dependencies, build_type)
│   ├── nodes (name, package, source_file, node_class)
│   ├── topics (name, message_type, publishers[], subscribers[])
│   ├── services (name, service_type, servers[], clients[])
│   ├── actions (name, action_type, servers[], clients[])
│   ├── parameters (node, key, type, default_value)
│   ├── launch_files (path, nodes[], includes[], remappings[])
│   ├── urdf_elements (link|joint|sensor, name, parent, properties)
│   └── tf_frames (parent, child, static, source_node)
│
├── SQLite (FTS5): code_search.db  
│   └── Full-text search index of all source files
│
├── Qdrant (embedded): vectors.db
│   └── Code chunk embeddings for RAG retrieval
│
└── JSON: workspace_graph.json
    └── Serialized knowledge graph for fast loading

CLOUD:
├── PostgreSQL: users, billing, telemetry
├── Redis: session cache, rate limiting
└── Qdrant (cloud): shared robotics knowledge embeddings
    ├── ROS2 documentation embeddings
    ├── ROS Answers/Discourse embeddings  
    ├── Common debugging patterns
    └── Package documentation
```

---

# 5. AI SYSTEM DESIGN

## 5.1 LLM Orchestration Architecture

```
┌────────────────────────────────────────────────────┐
│                AI ORCHESTRATION LAYER               │
│                                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │           INTENT CLASSIFIER                   │  │
│  │  Input: user query + context signals          │  │
│  │  Output: intent + confidence + routing        │  │
│  │                                               │  │
│  │  Intents:                                     │  │
│  │  ├── CODE_GENERATE (new code)                 │  │
│  │  ├── CODE_EDIT (modify existing)              │  │
│  │  ├── CODE_EXPLAIN (understand code)           │  │
│  │  ├── DEBUG_SYSTEM (live ROS2 debugging)        │  │
│  │  ├── DEBUG_BUILD (compilation errors)          │  │
│  │  ├── GENERATE_LAUNCH (launch files)            │  │
│  │  ├── GENERATE_URDF (robot description)         │  │
│  │  ├── GENERATE_MSG (message definitions)        │  │
│  │  ├── ANALYZE_BAG (bag file analysis)           │  │
│  │  ├── CONFIGURE_NAV (Nav2 configuration)        │  │
│  │  ├── CONFIGURE_SLAM (SLAM setup)               │  │
│  │  ├── EXPLAIN_ARCHITECTURE (system overview)     │  │
│  │  └── DEPLOY (deployment assistance)             │  │
│  └──────────────────────────────────────────────┘  │
│                       │                            │
│  ┌──────────────────────────────────────────────┐  │
│  │           AGENT ROUTER                        │  │
│  │  Routes to specialized agents based on intent │  │
│  └──────────────────────────────────────────────┘  │
│       │         │         │         │              │
│  ┌────┴──┐ ┌────┴──┐ ┌────┴──┐ ┌────┴──┐          │
│  │ Code  │ │Debug  │ │Config │ │System │          │
│  │ Agent │ │Agent  │ │Agent  │ │Agent  │          │
│  └───────┘ └───────┘ └───────┘ └───────┘          │
└────────────────────────────────────────────────────┘
```

## 5.2 Specialized Agent Architectures

### Code Generation Agent
```
System Prompt: ROS2 coding expert with access to workspace context
Tools: read_file, search_codebase, query_ros2_docs, write_code
Context: current package, dependencies, message types, coding style

Workflow:
1. Understand what code is needed
2. Check existing patterns in workspace (consistency)
3. Retrieve relevant message/service type definitions
4. Generate code following ROS2 best practices:
   - Proper node lifecycle management
   - Correct QoS profile selection
   - Parameter declaration with descriptions
   - Proper error handling
   - Appropriate logging
5. Generate corresponding CMakeLists.txt / setup.py entries
6. Generate or update launch file entries
7. Validate: ensure all imported messages exist, 
   all parameters are declared, QoS profiles are compatible
```

### Debugging Agent (Most Critical Agent)
```
System Prompt: ROS2 systems debugger. You diagnose robotics issues 
by systematically investigating the running system.

Tools:
- ros2_list_nodes: Get active nodes
- ros2_list_topics: Get topics with types and QoS
- ros2_echo_topic: Sample messages from a topic
- ros2_get_tf_tree: Get current TF tree
- ros2_get_params: Get node parameters  
- ros2_get_node_info: Get node connections
- check_qos_compat: Check QoS compatibility between pub/sub
- read_source: Read source code of a node
- read_launch: Read launch file
- search_logs: Search node output logs
- check_timing: Measure message frequency on a topic

Reasoning Chain (ReAct pattern):
1. THINK: What could cause this symptom?
   - List top 5 hypotheses ranked by probability
2. ACT: Investigate most likely hypothesis
   - Use tools to gather evidence
3. OBSERVE: What did the evidence show?
4. THINK: Does evidence confirm or refute hypothesis?
5. Repeat until root cause identified
6. RECOMMEND: Specific fix with code changes

Example Debugging Traces:

"Robot not moving":
├── Check /cmd_vel → is anything publishing? 
│   ├── No → trace upstream: Nav2? Teleop? Joy?
│   └── Yes → check values (all zeros? valid velocities?)
│       ├── All zeros → Nav2 not producing goals
│       └── Valid → check downstream
│           ├── Check hardware interface node → is it receiving?
│           │   ├── QoS mismatch? → report
│           │   ├── Namespace mismatch? → report  
│           │   └── Receiving → check motor driver
│           │       ├── Check /joint_states → encoders working?
│           │       └── Check serial connection → hardware issue
│           └── Check TF → is odom→base_link valid?

"SLAM map is drifting":
├── Check /scan → lidar data quality
│   ├── Check frequency → is it stable?
│   ├── Check range values → are there NaN/inf?
│   └── Check TF base_link→laser → is it correct?
├── Check /odom → odometry source
│   ├── Check covariance values → are they reasonable?
│   └── Check drift over time → is odometry alone drifting?
├── Check SLAM parameters
│   ├── Resolution appropriate for environment?
│   ├── Max range matches lidar spec?
│   └── Update rate matches lidar rate?
└── Check CPU usage → is SLAM node dropping frames?
```

## 5.3 RAG Architecture

```
Document Sources:
├── Workspace source code (chunked by function/class)
├── ROS2 official documentation (all packages)
├── ROS2 API references (rclcpp, rclpy)
├── Nav2 documentation + tuning guides
├── MoveIt2 documentation
├── Gazebo documentation
├── ros2/examples repository
├── ROS Answers (filtered, quality-scored)
├── ROS Discourse (filtered)
├── Common robotics textbooks (licensed excerpts)
└── Internal debugging pattern database

Embedding Pipeline:
1. Chunk documents (512 tokens, 50 token overlap)
2. Add metadata: source, package, topic_area, difficulty
3. Embed with text-embedding-3-large (OpenAI) or 
   nomic-embed-text (self-hosted)
4. Store in Qdrant with payload metadata

Retrieval Strategy:
1. Embed user query
2. Hybrid search: vector similarity + keyword BM25
3. Re-rank with cross-encoder (ms-marco-MiniLM-L-12-v2)
4. Filter by relevance to current workspace context
5. Deduplicate and select top-8 chunks
6. Include in LLM context with source attribution
```

## 5.4 How Robotics Projects Are Indexed

### Launch File Understanding
```
Parse Tree for: bringup_launch.py

LaunchDescription
├── DeclareLaunchArgument('use_sim_time', default='false')
├── DeclareLaunchArgument('map', default='/path/to/map.yaml')
├── IncludeLaunchDescription('robot_state_publisher.launch.py')
│   └── Parameters: robot_description=xacro(robot.urdf.xacro)
├── Node('nav2_bringup', 'bringup_launch.py')
│   ├── Parameters: use_sim_time, autostart=True
│   ├── Remappings: /tf→/tf, /tf_static→/tf_static
│   └── Composed Nodes:
│       ├── controller_server (Nav2)
│       ├── planner_server (Nav2)
│       ├── behavior_server (Nav2)
│       ├── bt_navigator (Nav2)
│       ├── map_server (Nav2)
│       └── amcl (Nav2)
└── Node('rviz2', config='nav2_view.rviz')

→ Stored in Knowledge Graph with all connections resolved
```

### TF Tree Analysis
```
AI maintains a model of the expected TF tree:

map
└── odom (published by: robot_localization / amcl)
    └── base_footprint (published by: robot_state_publisher)
        └── base_link
            ├── laser_frame (static, from URDF)
            ├── camera_link (static, from URDF)
            │   ├── camera_rgb_frame
            │   ├── camera_depth_frame
            │   └── camera_rgb_optical_frame
            ├── imu_link (static, from URDF)
            └── left_wheel_link (dynamic, from joint_state_publisher)

Validation Rules:
1. map→odom must exist for navigation
2. All sensor frames must connect to base_link
3. Optical frames must follow REP-103 conventions
4. Static transforms should come from URDF, not manual publishers
5. No duplicate transform publishers for same parent→child
```

### ROS Message Modeling
```
For every message type used in the workspace:

sensor_msgs/msg/LaserScan:
  header: std_msgs/Header
    stamp: builtin_interfaces/Time
    frame_id: string → MUST match a TF frame
  angle_min: float32 → typical: -π to -π/2
  angle_max: float32 → typical: π/2 to π  
  angle_increment: float32 → derived from (max-min)/ranges.length
  time_increment: float32 → 0 for simultaneous readings
  scan_time: float32 → 1/frequency
  range_min: float32 → sensor spec minimum
  range_max: float32 → sensor spec maximum
  ranges: float32[] → NaN=no return, inf=beyond max
  intensities: float32[] → optional, sensor-dependent

AI Knowledge:
- Valid range: range_min ≤ value ≤ range_max
- NaN means no return (normal for open space)
- frame_id must be the sensor frame, NOT base_link
- Typical frequencies: 10-40 Hz for 2D lidar
- Common issues: frame_id mismatch, wrong range_max, 
  missing TF to laser frame
```

## 5.5 Multi-Agent Coordination

```
For complex queries, agents collaborate:

User: "Set up Nav2 for my robot"

Orchestrator spawns:
1. System Agent → analyzes workspace, identifies robot config
2. Config Agent → generates Nav2 params based on robot specs
3. Launch Agent → generates launch files for Nav2 bringup
4. Code Agent → generates any missing nodes (e.g., costmap filter)
5. Validation Agent → checks all configs are consistent

Coordination via shared context:
- System Agent findings feed into Config Agent
- Config Agent outputs feed into Launch Agent
- All outputs validated by Validation Agent
- Single unified response to user with all changes
```
