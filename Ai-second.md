# Blueprint: The "Omega" AI-First IDE (VS Code Fork)

### Phase 1: The Foundation (The Fork)
* **Base Selection:** Start with **Void** (github.com/voideditor/void) or **PearAI**. These are "un-Microsofted" forks of VS Code that already have the AI side-panel infrastructure built.
* **Custom Workbench:** Modify `src/vs/workbench` to prioritize a "Permanent Agent Panel" instead of just a sidebar. This panel will house your LangGraph visualizer and LangSmith-style traces.

### Phase 2: The "Brain" (Python-Node Middleware)
* **Persistent Agent Server:** Build a FastAPI background process that the IDE launches on startup.
* **Language Bridge:** Use `JSON-RPC` or WebSockets to communicate between VS Code (TypeScript) and your Agents (Python).
* **Agent Registry:** Implement a `.agents/` config directory in the workspace where custom LangGraph agents can be "hot-reloaded" into the IDE.

### Phase 3: The "Local LangSmith" (Observability)
* **Trace Interceptor:** Create a custom `BaseCallbackHandler` in Python. Every LLM call from any agent (`hermes`, `open-swe`, etc.) must emit an event.
* **UI Visualization:** Build a VS Code `Webview` that renders these events as a timeline. 
* **Deep Linking:** Clicking a trace in the UI should open the exact line of code in the editor that triggered the agent call.

### Phase 4: The Terminal-First Interface (Claude Code Style)
* **Rich Terminal:** Extend the `Integrated Terminal` to support "Interception." When a user types a command like `/fix`, the terminal should bypass the shell and trigger your `open-swe` orchestrator.
* **Human-in-the-Loop:** Implement "Approval Cards" inside the terminal window. Before an agent executes `rm -rf` or a major `git push`, the terminal renders a UI button: [Approve] | [Reject].

### Phase 5: The Database & Endpoint Middleware
* **Unified Data Provider:** Build a "Data Explorer" sidebar.
* **Drivers:** Integrate `psycopg2` (Postgres), `neo4j` (Graph), and `qdrant-client` (Vector) into your Python middleware.
* **Natural Language Querying:** Allow the user to highlight a DB table and ask "What does this schema represent?" using the IDE's local agent context.

### Phase 6: Skill Extraction & Verification (The Mixed Repos)
* **Hermes Logic:** Integrate a "Post-Mortem" loop. After every successful task, the IDE asks the agent: "What did we learn?" and saves the logic to a `.skills/` directory for future tasks.
* **Open-SWE Verification:** Use a headless Docker container or Modal.com integration within the IDE to run `pytest` on every agent-generated fix before showing it to the user.
* **Endpoint Testing:** Create a "Playground" tab where you can call your own external agent endpoints, track the latency, and verify the JSON output against your IDE's internal state.

---

### Immediate Next Steps:
1. **Fork the Repo:** Clone `voideditor/void`.
2. **Setup Middleware:** Create a `python/` directory in the root and build a basic FastAPI server that can talk to LangGraph.
3. **Register Commands:** Add your first custom VS Code command that sends the current file context to your Python server.
