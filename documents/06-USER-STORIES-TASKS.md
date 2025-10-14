# Specter Agent System - User Stories & Detailed Tasks

**Project:** Specter IDE - Agentic AI System  
**Version:** 1.0  
**Created:** October 14, 2025  
**Status:** Planning Phase

---

## Table of Contents

1. [User Personas](#user-personas)
2. [User Stories](#user-stories)
3. [Technical Tasks](#technical-tasks)
4. [Task Dependencies](#task-dependencies)
5. [Testing Checklist](#testing-checklist)
6. [Progress Tracking](#progress-tracking)

---

## User Personas

### Persona 1: Alex - Security Researcher
- **Background:** 5 years experience in penetration testing
- **Goals:** Quickly prototype security testing workflows
- **Pain Points:** Writing custom scripts for each engagement
- **Technical Level:** High
- **Primary Use Case:** Complex multi-step attack chains

### Persona 2: Sam - Junior Security Engineer
- **Background:** 1 year in security, learning offensive testing
- **Goals:** Learn security testing with AI guidance
- **Pain Points:** Steep learning curve, unfamiliar with tools
- **Technical Level:** Medium
- **Primary Use Case:** Guided vulnerability scanning

### Persona 3: Jordan - DevSecOps Engineer
- **Background:** Developer transitioning to security
- **Goals:** Automate security checks in CI/CD
- **Pain Points:** Don't know which tools to use for what
- **Technical Level:** High (development), Medium (security)
- **Primary Use Case:** Automated security workflows

---

## User Stories

### Epic 1: Agent Configuration & Setup

#### US-1.1: Configure LLM API Key
**As a** security professional  
**I want to** configure my DeepSeek API key in Specter  
**So that** I can use the AI agent to generate security workflows

**Acceptance Criteria:**
- [ ] User can open configuration panel from settings
- [ ] User can enter and save DeepSeek API key
- [ ] API key is stored securely in database
- [ ] System validates API key on save
- [ ] User receives feedback if key is invalid
- [ ] Encrypted storage of API key

**Priority:** P0 (Critical)  
**Effort:** 2 hours  
**Dependencies:** Database setup

---

#### US-1.2: View Available Tools
**As a** security professional  
**I want to** see which security tools are available in Specter  
**So that** I know what capabilities the agent can use

**Acceptance Criteria:**
- [ ] User can view list of all tools in tool selector panel
- [ ] Each tool shows: name, description, installed status
- [ ] Tools marked as "installed" are highlighted
- [ ] User can see tool capabilities and usage examples
- [ ] Filter tools by category (recon, exploit, etc.)

**Priority:** P1 (High)  
**Effort:** 2 hours  
**Dependencies:** Tool Registry

---

### Epic 2: Workflow Generation

#### US-2.1: Generate Workflow from Natural Language
**As a** security researcher (Alex)  
**I want to** describe my testing scenario in plain English  
**So that** the agent creates an executable workflow for me

**Acceptance Criteria:**
- [ ] User can type natural language request in chat panel
- [ ] Agent analyzes request and identifies required tools
- [ ] Agent generates structured workflow plan
- [ ] Workflow plan shows: steps, tools, parameters
- [ ] User can review plan before execution
- [ ] System shows estimated execution time

**Example Input:**
```
"Check if Redis is vulnerable on 192.168.1.100"
```

**Expected Output:**
```json
{
  "workflow": {
    "name": "Redis Vulnerability Check",
    "steps": [
      {"tool": "nmap", "action": "scan_port_6379"},
      {"tool": "certxgen", "action": "redis_vuln_test"}
    ]
  }
}
```

**Priority:** P0 (Critical)  
**Effort:** 4 hours  
**Dependencies:** LLM Service, Tool Registry, Prompt Engineering

---

#### US-2.2: Generate Python Notebook
**As a** security professional  
**I want to** receive a Python notebook from the agent  
**So that** I can review and execute the workflow step-by-step

**Acceptance Criteria:**
- [ ] Agent converts workflow plan to .ipynb format
- [ ] Each step becomes a notebook cell
- [ ] Code is syntactically correct Python
- [ ] Includes import statements
- [ ] Includes error handling (try/except)
- [ ] Includes progress indicators (print statements)
- [ ] certxgen YAML configs are generated inline
- [ ] Notebook is editable by user

**Priority:** P0 (Critical)  
**Effort:** 3 hours  
**Dependencies:** Workflow generation

---

#### US-2.3: Generate Visual Workflow Graph
**As a** security professional  
**I want to** see a visual representation of my workflow  
**So that** I can understand the execution flow at a glance

**Acceptance Criteria:**
- [ ] Agent generates Reactflow-compatible graph
- [ ] Each workflow step is a node
- [ ] Nodes are connected with arrows showing dependencies
- [ ] Nodes show: step name, tool, status
- [ ] Graph is auto-layout (no manual positioning needed)
- [ ] Conditional steps shown with decision nodes

**Priority:** P1 (High)  
**Effort:** 3 hours  
**Dependencies:** Workflow generation

---

### Epic 3: Workflow Execution

#### US-3.1: Execute Workflow with Progress Tracking
**As a** security researcher  
**I want to** execute my workflow and see real-time progress  
**So that** I know what's happening during execution

**Acceptance Criteria:**
- [ ] User can click "Execute" button
- [ ] Pre-execution safety warnings displayed
- [ ] User must acknowledge warnings
- [ ] Jupyter kernel executes notebook cells
- [ ] Graph nodes update in real-time:
  - ⏸ Pending (gray)
  - ⏳ Running (blue)
  - ✅ Success (green)
  - ❌ Failed (red)
- [ ] User can view cell output in real-time
- [ ] Execution can be cancelled mid-workflow

**Priority:** P0 (Critical)  
**Effort:** 4 hours  
**Dependencies:** Notebook generation, Graph generation

---

#### US-3.2: View Execution Results
**As a** security professional  
**I want to** see aggregated results after execution  
**So that** I can quickly understand findings

**Acceptance Criteria:**
- [ ] Results displayed in structured format
- [ ] Summary shows: total steps, successes, failures
- [ ] Each step shows output and any errors
- [ ] Failed steps highlight error messages
- [ ] Results are saved to database
- [ ] User can export results (JSON, PDF)

**Priority:** P1 (High)  
**Effort:** 2 hours  
**Dependencies:** Execution service

---

### Epic 4: Conversation & Refinement

#### US-4.1: Maintain Conversation Context
**As a** security researcher  
**I want** my conversation with the agent to remember previous messages  
**So that** I can refine workflows iteratively

**Acceptance Criteria:**
- [ ] Each conversation has unique ID
- [ ] Messages stored in database
- [ ] Agent can reference previous messages
- [ ] User can start new conversation (clears context)
- [ ] Conversation list shows recent chats

**Example Interaction:**
```
User: "Scan 192.168.1.100 for Redis"
Agent: [Generates workflow]

User: "Also check for MongoDB"
Agent: [Updates workflow with MongoDB checks]

User: "Use port 27018 for MongoDB"  
Agent: [Refines workflow with custom port]
```

**Priority:** P1 (High)  
**Effort:** 2 hours  
**Dependencies:** Database, Agent service

---

#### US-4.2: Refine Workflow Based on Feedback
**As a** junior security engineer (Sam)  
**I want to** ask the agent to modify the workflow  
**So that** I can customize it without writing code

**Acceptance Criteria:**
- [ ] User can provide feedback like "add step X" or "change port to Y"
- [ ] Agent understands modification intent
- [ ] Agent generates updated workflow
- [ ] User can compare old vs new workflow
- [ ] Changes are highlighted
- [ ] User can accept or reject changes

**Priority:** P1 (High)  
**Effort:** 3 hours  
**Dependencies:** LLM service, Workflow service

---

### Epic 5: Safety & Error Handling

#### US-5.1: Pre-Execution Safety Review
**As a** responsible security professional  
**I want to** see safety warnings before execution  
**So that** I ensure I have proper authorization

**Acceptance Criteria:**
- [ ] System analyzes workflow for risks
- [ ] Displays warnings:
  - Target systems that will be scanned
  - Potentially destructive operations
  - Required authorizations
  - Legal compliance notes
- [ ] User must check "I have authorization" box
- [ ] Dry-run mode available (shows what would execute)
- [ ] Audit log created for all executions

**Priority:** P0 (Critical)  
**Effort:** 2 hours  
**Dependencies:** Workflow validation

---

#### US-5.2: Handle Tool Failures Gracefully
**As a** security professional  
**I want** the system to handle tool failures gracefully  
**So that** one failure doesn't break the entire workflow

**Acceptance Criteria:**
- [ ] If a step fails, workflow can continue (if not dependent)
- [ ] Failed steps marked with ❌ in graph
- [ ] Error messages are clear and actionable
- [ ] Suggestions for fixing errors
- [ ] Option to retry failed step
- [ ] Option to skip failed step

**Priority:** P1 (High)  
**Effort:** 2 hours  
**Dependencies:** Execution service

---

#### US-5.3: Validate Generated Code
**As a** security professional  
**I want** the generated notebook to be syntactically valid  
**So that** I don't waste time fixing code errors

**Acceptance Criteria:**
- [ ] Agent validates Python syntax before presenting
- [ ] Checks for required imports
- [ ] Verifies tool commands are correct
- [ ] Validates parameters match tool requirements
- [ ] Warns if required credentials missing
- [ ] Suggests fixes if validation fails

**Priority:** P1 (High)  
**Effort:** 2 hours  
**Dependencies:** Workflow validator

---

### Epic 6: Tool Integration

#### US-6.1: Use certxgen Templates
**As a** security researcher  
**I want** the agent to use certxgen's 100+ exploit templates  
**So that** I can leverage pre-built security tests

**Acceptance Criteria:**
- [ ] Agent knows about certxgen templates
- [ ] Agent suggests appropriate templates based on intent
- [ ] Agent generates certxgen YAML configs
- [ ] YAML configs are syntactically correct
- [ ] Templates are matched to target systems
- [ ] User can see template description before use

**Example:**
```
User: "Test Log4Shell on myapp.com"
Agent: Uses certxgen template "log4j_rce"
```

**Priority:** P0 (Critical)  
**Effort:** 2 hours  
**Dependencies:** Tool registry, certxgen metadata

---

#### US-6.2: Combine Multiple Tools
**As a** security researcher (Alex)  
**I want** workflows that chain multiple tools together  
**So that** I can perform complex attack simulations

**Acceptance Criteria:**
- [ ] Agent can plan multi-tool workflows
- [ ] Dependencies between steps are correct
- [ ] Data flows from one tool to another
- [ ] Example: nmap → certxgen → custom script
- [ ] Conditional steps (e.g., "if port open, then exploit")

**Priority:** P1 (High)  
**Effort:** 3 hours  
**Dependencies:** Workflow planner

---

## Technical Tasks

### Category A: Database & Storage

#### TASK-A1: Create Database Schema
**Description:** Design and implement SQLite schema for Specter

**Subtasks:**
- [ ] A1.1: Design table structure (config, conversations, messages, workflows, executions)
- [ ] A1.2: Define relationships and foreign keys
- [ ] A1.3: Create indexes for performance
- [ ] A1.4: Write schema.sql file
- [ ] A1.5: Add migration system for schema updates

**Files:**
- `src/vs/workbench/services/specter/common/database/schema.sql`
- `src/vs/workbench/services/specter/common/database/migrations.ts`

**Acceptance Criteria:**
- [ ] Schema creates all required tables
- [ ] Foreign key constraints work
- [ ] Indexes improve query performance
- [ ] Default config values are inserted

**Effort:** 1 hour  
**Priority:** P0

---

#### TASK-A2: Implement Database Service
**Description:** Create SQLite wrapper service

**Subtasks:**
- [ ] A2.1: Initialize SQLite connection
- [ ] A2.2: Implement execute() for writes
- [ ] A2.3: Implement query() for reads
- [ ] A2.4: Implement get() for single row
- [ ] A2.5: Add connection pooling
- [ ] A2.6: Add error handling and logging
- [ ] A2.7: Test CRUD operations manually

**Files:**
- `src/vs/workbench/services/specter/common/database/databaseService.ts`

**Acceptance Criteria:**
- [ ] Can read/write to database
- [ ] Handles errors gracefully
- [ ] Logs operations for debugging
- [ ] Database file created in correct location

**Effort:** 1 hour  
**Priority:** P0  
**Depends On:** TASK-A1

---

#### TASK-A3: Implement Configuration Service
**Description:** Service for reading/writing config values

**Subtasks:**
- [ ] A3.1: Implement get(key) method
- [ ] A3.2: Implement set(key, value) method
- [ ] A3.3: Implement getAll() method
- [ ] A3.4: Add caching for frequently accessed config
- [ ] A3.5: Encrypt sensitive values (API keys)
- [ ] A3.6: Test config operations

**Files:**
- `src/vs/workbench/services/specter/common/config/configService.ts`

**Acceptance Criteria:**
- [ ] Can store and retrieve config
- [ ] API keys are encrypted
- [ ] Cache improves performance
- [ ] Thread-safe operations

**Effort:** 1 hour  
**Priority:** P0  
**Depends On:** TASK-A2

---

### Category B: Tool Registry

#### TASK-B1: Create Tool Metadata Files
**Description:** Write JSON files for each security tool

**Subtasks:**
- [ ] B1.1: Create certxgen.json (with 10 sample templates)
- [ ] B1.2: Create nmap.json
- [ ] B1.3: Create pyats.json
- [ ] B1.4: Create pacu.json
- [ ] B1.5: Create atomic-red-team.json
- [ ] B1.6: Create bswarm.json
- [ ] B1.7: Validate all JSON files
- [ ] B1.8: Set all tools to "installed": true

**Files:**
- `src/vs/workbench/services/specter/common/tools/metadata/*.json`

**Acceptance Criteria:**
- [ ] Each file has complete metadata
- [ ] Includes capabilities, usage patterns, examples
- [ ] agentContext helps LLM understand when to use
- [ ] All JSON is valid
- [ ] certxgen includes at least 10 templates

**Effort:** 3 hours  
**Priority:** P0

---

#### TASK-B2: Implement Tool Loader
**Description:** Load tool metadata from JSON files

**Subtasks:**
- [ ] B2.1: Read all JSON files from metadata directory
- [ ] B2.2: Parse JSON into ToolMetadata objects
- [ ] B2.3: Handle parsing errors gracefully
- [ ] B2.4: Cache loaded tools in memory
- [ ] B2.5: Reload on file changes (optional)
- [ ] B2.6: Test loading all tools

**Files:**
- `src/vs/workbench/services/specter/common/tools/toolLoader.ts`

**Acceptance Criteria:**
- [ ] Successfully loads all tool metadata
- [ ] Handles malformed JSON gracefully
- [ ] Fast loading (< 100ms)
- [ ] Logs loaded tools

**Effort:** 1 hour  
**Priority:** P0  
**Depends On:** TASK-B1

---

#### TASK-B3: Implement Tool Registry Service
**Description:** Main service for querying tool information

**Subtasks:**
- [ ] B3.1: Initialize with ToolLoader
- [ ] B3.2: Implement getAllTools()
- [ ] B3.3: Implement getInstalledTools()
- [ ] B3.4: Implement getTool(id)
- [ ] B3.5: Implement findToolsByCapability()
- [ ] B3.6: Implement isToolInstalled()
- [ ] B3.7: Add filtering by category
- [ ] B3.8: Test all methods

**Files:**
- `src/vs/workbench/services/specter/common/tools/toolRegistry.ts`

**Acceptance Criteria:**
- [ ] Can query tools by various criteria
- [ ] Fast lookups (use Map/index)
- [ ] Returns only installed tools when requested
- [ ] Handles missing tools gracefully

**Effort:** 1 hour  
**Priority:** P0  
**Depends On:** TASK-B2

---

### Category C: LLM Integration

#### TASK-C1: Implement DeepSeek Provider
**Description:** API client for DeepSeek

**Subtasks:**
- [ ] C1.1: Set up axios HTTP client
- [ ] C1.2: Implement complete() method
- [ ] C1.3: Handle API authentication
- [ ] C1.4: Parse API responses
- [ ] C1.5: Handle errors (401, 429, timeout)
- [ ] C1.6: Add retry logic with exponential backoff
- [ ] C1.7: Log API calls and responses
- [ ] C1.8: Test with real API key

**Files:**
- `src/vs/workbench/services/specter/common/llm/providers/deepseekProvider.ts`

**Acceptance Criteria:**
- [ ] Successfully calls DeepSeek API
- [ ] Handles all error cases
- [ ] Retries on transient failures
- [ ] User-friendly error messages
- [ ] Respects rate limits

**Effort:** 2 hours  
**Priority:** P0  
**Depends On:** TASK-A3 (for API key)

---

#### TASK-C2: Create Prompt Templates
**Description:** Build prompts for LLM

**Subtasks:**
- [ ] C2.1: Write system prompt with tool descriptions
- [ ] C2.2: Write workflow generation prompt
- [ ] C2.3: Write refinement prompt
- [ ] C2.4: Add examples in prompts (few-shot learning)
- [ ] C2.5: Format tool metadata for LLM context
- [ ] C2.6: Test prompts manually with DeepSeek
- [ ] C2.7: Iterate on prompt quality

**Files:**
- `src/vs/workbench/services/specter/common/llm/prompts/systemPrompt.ts`
- `src/vs/workbench/services/specter/common/llm/prompts/workflowPrompt.ts`
- `src/vs/workbench/services/specter/common/llm/prompts/refinementPrompt.ts`

**Acceptance Criteria:**
- [ ] LLM generates valid JSON
- [ ] Workflows make logical sense
- [ ] Uses appropriate tools
- [ ] Follows safety guidelines
- [ ] Response format is consistent

**Effort:** 2 hours  
**Priority:** P0  
**Depends On:** TASK-B3

---

#### TASK-C3: Implement LLM Service
**Description:** Abstraction layer over LLM providers

**Subtasks:**
- [ ] C3.1: Implement ILLMService interface
- [ ] C3.2: Register DeepSeek provider
- [ ] C3.3: Implement generateWorkflowPlan()
- [ ] C3.4: Implement refineWorkflowPlan()
- [ ] C3.5: Parse JSON responses
- [ ] C3.6: Validate response structure
- [ ] C3.7: Handle malformed responses
- [ ] C3.8: Test with various prompts

**Files:**
- `src/vs/workbench/services/specter/common/llm/llmService.ts`

**Acceptance Criteria:**
- [ ] Successfully generates workflow plans
- [ ] Validates LLM responses
- [ ] Handles errors gracefully
- [ ] Logs interactions for debugging

**Effort:** 2 hours  
**Priority:** P0  
**Depends On:** TASK-C1, TASK-C2

---

### Category D: Workflow Management

#### TASK-D1: Implement Workflow Planner
**Description:** Validates and optimizes workflow plans

**Subtasks:**
- [ ] D1.1: Validate workflow structure
- [ ] D1.2: Check tool availability
- [ ] D1.3: Verify parameter types
- [ ] D1.4: Validate step dependencies
- [ ] D1.5: Detect circular dependencies
- [ ] D1.6: Check for required credentials
- [ ] D1.7: Estimate execution time
- [ ] D1.8: Test validation logic

**Files:**
- `src/vs/workbench/services/specter/common/workflow/validator.ts`
- `src/vs/workbench/services/specter/common/workflow/planner.ts`

**Acceptance Criteria:**
- [ ] Catches invalid workflows
- [ ] Provides clear error messages
- [ ] Suggests fixes for common issues
- [ ] Optimizes step ordering

**Effort:** 2 hours  
**Priority:** P0  
**Depends On:** TASK-B3

---

#### TASK-D2: Implement Notebook Generator
**Description:** Convert workflow plan to Jupyter notebook

**Subtasks:**
- [ ] D2.1: Create notebook structure (.ipynb format)
- [ ] D2.2: Generate Python code for each step
- [ ] D2.3: Add import statements
- [ ] D2.4: Add error handling (try/except)
- [ ] D2.5: Add progress indicators (print statements)
- [ ] D2.6: Generate certxgen YAML configs
- [ ] D2.7: Add markdown cells for documentation
- [ ] D2.8: Validate Python syntax
- [ ] D2.9: Test notebook generation

**Files:**
- `src/vs/workbench/services/specter/common/workflow/notebookGenerator.ts`

**Acceptance Criteria:**
- [ ] Generates valid .ipynb files
- [ ] Python code is syntactically correct
- [ ] Includes all necessary imports
- [ ] Error handling present
- [ ] certxgen YAMLs are valid

**Effort:** 3 hours  
**Priority:** P0  
**Depends On:** TASK-D1

---

#### TASK-D3: Implement Graph Generator
**Description:** Convert workflow plan to Reactflow graph

**Subtasks:**
- [ ] D3.1: Create graph structure (nodes, edges)
- [ ] D3.2: Map workflow steps to nodes
- [ ] D3.3: Create edges for dependencies
- [ ] D3.4: Auto-layout nodes (hierarchical layout)
- [ ] D3.5: Add node metadata (tool, status)
- [ ] D3.6: Handle conditional branches
- [ ] D3.7: Test graph generation

**Files:**
- `src/vs/workbench/services/specter/common/workflow/graphGenerator.ts`

**Acceptance Criteria:**
- [ ] Generates valid Reactflow data
- [ ] Nodes positioned logically
- [ ] Dependencies shown correctly
- [ ] Graph is readable

**Effort:** 2 hours  
**Priority:** P1  
**Depends On:** TASK-D1

---

#### TASK-D4: Implement Workflow Service
**Description:** Main orchestrator for workflows

**Subtasks:**
- [ ] D4.1: Combine planner, generator, validator
- [ ] D4.2: Implement createWorkflow()
- [ ] D4.3: Implement saveWorkflow() to database
- [ ] D4.4: Implement loadWorkflow() from database
- [ ] D4.5: Implement listWorkflows()
- [ ] D4.6: Test end-to-end workflow creation

**Files:**
- `src/vs/workbench/services/specter/common/workflow/workflowService.ts`

**Acceptance Criteria:**
- [ ] Can create complete workflows
- [ ] Workflows saved to database
- [ ] Can retrieve workflows
- [ ] All validations pass

**Effort:** 2 hours  
**Priority:** P0  
**Depends On:** TASK-D1, TASK-D2, TASK-D3

---

### Category E: Agent Orchestration

#### TASK-E1: Implement Main Agent Service
**Description:** Main entry point for agent operations

**Subtasks:**
- [ ] E1.1: Implement ISpecterAgentService interface
- [ ] E1.2: Inject all dependencies (LLM, Workflow, Tools)
- [ ] E1.3: Implement generateWorkflow()
- [ ] E1.4: Implement refineWorkflow()
- [ ] E1.5: Implement getAvailableTools()
- [ ] E1.6: Add comprehensive error handling
- [ ] E1.7: Add logging for debugging
- [ ] E1.8: Test complete flow

**Files:**
- `src/vs/workbench/services/specter/common/specterAgent.ts`

**Acceptance Criteria:**
- [ ] Coordinates all services correctly
- [ ] Returns complete AgentResponse
- [ ] Handles all error cases
- [ ] Logs operations

**Effort:** 2 hours  
**Priority:** P0  
**Depends On:** TASK-C3, TASK-D4, TASK-B3

---

#### TASK-E2: Implement Conversation Management
**Description:** Store and retrieve conversation history

**Subtasks:**
- [ ] E2.1: Create conversation in database
- [ ] E2.2: Store messages
- [ ] E2.3: Retrieve conversation history
- [ ] E2.4: Load conversation context
- [ ] E2.5: Link workflows to conversations
- [ ] E2.6: Test conversation flow

**Files:**
- `src/vs/workbench/services/specter/common/conversation/conversationService.ts`

**Acceptance Criteria:**
- [ ] Conversations stored in DB
- [ ] Can retrieve message history
- [ ] Context passed to LLM
- [ ] Workflows linked to conversations

**Effort:** 2 hours  
**Priority:** P1  
**Depends On:** TASK-A2

---

### Category F: User Interface

#### TASK-F1: Create Configuration Panel UI
**Description:** UI for setting API key and preferences

**Subtasks:**
- [ ] F1.1: Create settings panel component
- [ ] F1.2: Add API key input field (password type)
- [ ] F1.3: Add model selection dropdown
- [ ] F1.4: Add temperature slider
- [ ] F1.5: Add save button
- [ ] F1.6: Show validation feedback
- [ ] F1.7: Test API key validation

**Files:**
- `src/vs/workbench/contrib/specter/browser/views/configPanel.ts`

**Acceptance Criteria:**
- [ ] User can enter API key
- [ ] Key is validated on save
- [ ] Settings persisted to database
- [ ] User feedback on save

**Effort:** 2 hours  
**Priority:** P0  
**Depends On:** TASK-A3, TASK-C1

---

#### TASK-F2: Create Chat Panel UI
**Description:** Chat interface for interacting with agent

**Subtasks:**
- [ ] F2.1: Create chat panel webview
- [ ] F2.2: Add message input field
- [ ] F2.3: Display message history
- [ ] F2.4: Show agent responses
- [ ] F2.5: Add "Generate Workflow" button
- [ ] F2.6: Show loading indicator during generation
- [ ] F2.7: Display errors
- [ ] F2.8: Test chat interactions

**Files:**
- `src/vs/workbench/contrib/specter/browser/views/chatPanel.ts`

**Acceptance Criteria:**
- [ ] User can send messages
- [ ] Messages stored in DB
- [ ] Agent responses displayed
- [ ] Loading states shown
- [ ] Errors displayed clearly

**Effort:** 3 hours  
**Priority:** P0  
**Depends On:** TASK-E1, TASK-E2

---

#### TASK-F3: Display Generated Workflow
**Description:** Show workflow plan to user for review

**Subtasks:**
- [ ] F3.1: Display workflow name and description
- [ ] F3.2: Show step list with details
- [ ] F3.3: Highlight required tools
- [ ] F3.4: Show safety warnings
- [ ] F3.5: Add "Execute" button
- [ ] F3.6: Add "Refine" button
- [ ] F3.7: Test workflow display

**Files:**
- `src/vs/workbench/contrib/specter/browser/views/workflowPanel.ts`

**Acceptance Criteria:**
- [ ] Workflow rendered clearly
- [ ] All details visible
- [ ] Action buttons work
- [ ] Safety warnings prominent

**Effort:** 2 hours  
**Priority:** P0  
**Depends On:** TASK-E1

---

#### TASK-F4: Display Workflow Graph
**Description:** Visual representation of workflow

**Subtasks:**
- [ ] F4.1: Integrate Reactflow library
- [ ] F4.2: Render graph from workflow data
- [ ] F4.3: Style nodes by status
- [ ] F4.4: Add node click handler (show details)
- [ ] F4.5: Update nodes during execution
- [ ] F4.6: Test graph rendering

**Files:**
- `src/vs/workbench/contrib/specter/browser/views/graphPanel.ts`

**Acceptance Criteria:**
- [ ] Graph renders correctly
- [ ] Nodes styled by status
- [ ] Interactive (clickable)
- [ ] Updates in real-time

**Effort:** 3 hours  
**Priority:** P1  
**Depends On:** TASK-D3

---

### Category G: Execution (Future Phase)

#### TASK-G1: Implement Jupyter Kernel Integration
**Description:** Execute notebooks via Jupyter

**Subtasks:**
- [ ] G1.1: Install Jupyter dependencies
- [ ] G1.2: Start Jupyter kernel
- [ ] G1.3: Execute notebook cells
- [ ] G1.4: Capture cell outputs
- [ ] G1.5: Handle execution errors
- [ ] G1.6: Stop kernel on completion

**Effort:** 4 hours  
**Priority:** P1 (Future)  
**Status:** Deferred

---

#### TASK-G2: Implement Progress Tracking
**Description:** Track execution progress in database

**Subtasks:**
- [ ] G2.1: Create execution record
- [ ] G2.2: Update step status
- [ ] G2.3: Store outputs
- [ ] G2.4: Store errors
- [ ] G2.5: Calculate progress percentage

**Effort:** 2 hours  
**Priority:** P1 (Future)  
**Status:** Deferred

---

## Task Dependencies

```
A1 (Schema) 
  → A2 (Database Service)
      → A3 (Config Service)
          → C1 (DeepSeek)
              → C3 (LLM Service)
                  → E1 (Agent)

B1 (Tool Metadata)
  → B2 (Tool Loader)
      → B3 (Tool Registry)
          → C2 (Prompts)
              → C3 (LLM Service)

C3 (LLM) + B3 (Tools)
  → D1 (Planner)
      → D2 (Notebook Gen)
      → D3 (Graph Gen)
          → D4 (Workflow Service)
              → E1 (Agent)

E1 (Agent)
  → F2 (Chat UI)
  → F3 (Workflow Display)
  → F4 (Graph Display)

A3 (Config)
  → F1 (Config UI)
```

---

## Testing Checklist

### Manual Test Cases

#### TC-1: Configuration
- [ ] Open config panel
- [ ] Enter invalid API key
- [ ] Verify error message
- [ ] Enter valid API key
- [ ] Verify success message
- [ ] Restart IDE
- [ ] Verify API key persisted

#### TC-2: Tool Registry
- [ ] View tool list
- [ ] Verify all 6 tools present
- [ ] Check installed status shows true
- [ ] Filter by category
- [ ] View tool details

#### TC-3: Simple Workflow Generation
**Input:** "Scan 192.168.1.1 for open ports"
- [ ] Enter prompt in chat
- [ ] Verify LLM call made
- [ ] Verify workflow returned
- [ ] Check workflow uses nmap
- [ ] Verify notebook generated
- [ ] Check Python syntax
- [ ] Verify graph generated
- [ ] Check graph has nodes

#### TC-4: certxgen Integration
**Input:** "Check if Redis is vulnerable on 192.168.1.100"
- [ ] Verify workflow uses nmap + certxgen
- [ ] Check certxgen YAML generated
- [ ] Verify YAML syntax valid
- [ ] Check appropriate template used

#### TC-5: Multi-Step Workflow
**Input:** "Scan target, if Redis found, test vulnerabilities"
- [ ] Verify multiple steps
- [ ] Check dependencies correct
- [ ] Verify conditional logic
- [ ] Check graph shows branches

#### TC-6: Conversation Context
- [ ] Send first message
- [ ] Send refinement: "also check MongoDB"
- [ ] Verify agent updates workflow
- [ ] Check previous context remembered
- [ ] Start new conversation
- [ ] Verify context cleared

#### TC-7: Error Handling
- [ ] Remove API key
- [ ] Try to generate workflow
- [ ] Verify error message
- [ ] Request unknown tool
- [ ] Verify error message
- [ ] Enter malformed prompt
- [ ] Verify graceful handling

#### TC-8: Workflow Refinement
- [ ] Generate initial workflow
- [ ] Request change: "change port to 8080"
- [ ] Verify workflow updated
- [ ] Check change highlighted
- [ ] Accept changes
- [ ] Verify saved to database

---

## Progress Tracking

### Phase 1: Foundation (Week 1)
- [x] Schema design
- [ ] Database service (A1, A2, A3)
- [ ] Config UI (F1)
- **Target:** Database operational, API key configurable

### Phase 2: Tool Registry (Week 1-2)
- [ ] Tool metadata files (B1)
- [ ] Tool loader (B2)
- [ ] Tool registry (B3)
- **Target:** All tools loaded and queryable

### Phase 3: LLM Integration (Week 2)
- [ ] DeepSeek provider (C1)
- [ ] Prompt templates (C2)
- [ ] LLM service (C3)
- **Target:** Can call DeepSeek API

### Phase 4: Workflow Generation (Week 2-3)
- [ ] Workflow planner (D1)
- [ ] Notebook generator (D2)
- [ ] Graph generator (D3)
- [ ] Workflow service (D4)
- **Target:** Generate notebooks and graphs

### Phase 5: Agent Orchestration (Week 3)
- [ ] Main agent service (E1)
- [ ] Conversation management (E2)
- **Target:** End-to-end workflow generation

### Phase 6: User Interface (Week 3-4)
- [ ] Chat panel (F2)
- [ ] Workflow display (F3)
- [ ] Graph display (F4)
- **Target:** Complete user experience

### Phase 7: Testing & Polish (Week 4)
- [ ] Manual testing all scenarios
- [ ] Bug fixes
- [ ] Error message improvements
- [ ] Performance optimization
- **Target:** Production-ready

---

## Notes

### Definition of Done
A task is complete when:
- [ ] Code written and compiles
- [ ] Manual test case passes
- [ ] Error handling in place
- [ ] Logging added
- [ ] Documented (inline comments)
- [ ] Reviewed by team

### Priorities
- **P0:** Must have for MVP
- **P1:** Should have for MVP
- **P2:** Nice to have
- **P3:** Future enhancement

---

*Document Version: 1.0*  
*Last Updated: October 14, 2025*  
*Next Review: After Phase 1 completion*
