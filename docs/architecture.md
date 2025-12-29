# Logos Architecture

## Overview

Logos is built as a VSCode fork with deep integration into the D3N (Dynamic Neuromorphic Neural Networks) ecosystem. This document describes the system architecture, component interactions, and design decisions.

## System Layers

### 1. Presentation Layer

The user-facing IDE built on VSCode's Electron framework:

- **Editor**: Monaco-based code editor with D3N-enhanced features
- **Chat Panel**: Multi-agent conversation interface
- **CA Sidebar**: Cognitive Architect suggestions and insights
- **Terminal**: Integrated terminal with D3N command support

### 2. Extension Layer

VSCode extensions providing D3N functionality:

| Extension | Purpose | Key Features |
|-----------|---------|--------------|
| `logos-chat` | Multi-agent chat | @-mentions, threading, branching |
| `logos-completion` | Code completion | Tiered inference, Flash Apps |
| `logos-ca` | Workspace CA | Suggestions, auto-docs |
| `logos-d3n` | Core D3N services | Client, auth, audit |

### 3. Integration Layer

Bridges between IDE and D3N infrastructure:

```typescript
// d3n_core/integration/logos/
├── ARIABridge         // Multi-agent orchestration
├── BMUIDERouter       // Tier selection
├── FlashAppExecutor   // Flash App execution
├── AuditExporter      // Audit logging
└── PersonaResolver    // Identity resolution
```

### 4. Infrastructure Layer

D3N backend services:

- **D3N Gateway**: Model inference endpoints
- **ARIA Conductor**: Agent orchestration
- **PERSONA Service**: Authentication and authorization
- **AI-Oracle**: Monitoring and observability

## Component Details

### Multi-Agent Chat System

```
┌─────────────────────────────────────────────────────────────────┐
│                        ChatPanel.tsx                            │
│  ┌───────────────┐ ┌─────────────────┐ ┌─────────────────────┐ │
│  │ ThreadSidebar │ │   MessageList   │ │    TangentTree      │ │
│  └───────────────┘ └─────────────────┘ └─────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ ContextIndicator  │  AgentSelector  │    MessageInput     │ │
│  └───────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                       React Hooks Layer                          │
│  ┌─────────────────────┐ ┌─────────────────────────────────────┐│
│  │  useThreadManager   │ │       useAgentRegistry              ││
│  └─────────────────────┘ └─────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│                    D3N Integration Layer                         │
│  ┌─────────────────────┐ ┌─────────────────────────────────────┐│
│  │     ARIABridge      │ │         BMUIDERouter                ││
│  └─────────────────────┘ └─────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### Completion Pipeline

```
Request ─→ BMU Router ─→ Tier Selection ─→ Execution ─→ Response
              │              │                │
              ▼              ▼                ▼
         Complexity    Flash App?         D3N Model
         Estimation    Cache Hit?         Inference
```

### Workspace CA Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    WorkspaceCA Controller                        │
├─────────────────────────────────────────────────────────────────┤
│  ┌───────────────┐ ┌────────────────┐ ┌──────────────────────┐ │
│  │ProjectAnalyzer│ │ConventionLearner│ │  SuggestionEngine   │ │
│  └───────────────┘ └────────────────┘ └──────────────────────┘ │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                     DocGenerator                           │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Agent Invocation

1. User sends message in ChatPanel
2. MessageInput extracts @-mentions
3. LogosRoutingPolicy determines agent(s)
4. BMUIDERouter selects tier
5. ARIABridge invokes D3N
6. Response rendered in MessageList

### Completion Request

1. Editor triggers completion
2. BMUIDERouter evaluates complexity
3. Flash App check (cache/spiking network)
4. D3N tier inference if needed
5. Completion displayed inline

### CA Suggestion

1. File save triggers analysis
2. ProjectAnalyzer updates model
3. SuggestionEngine generates suggestions
4. CASidebar displays actionable items

## Security Model

### Authentication

- PERSONA-based identity
- Session management with timeout
- Optional MFA for sensitive operations

### Authorization

| Tier | Permissions |
|------|-------------|
| system | All operations |
| subsystem | File, terminal, chat, agent |
| operator | Read/write, chat, completion |
| persona | Read, basic chat |

### Audit

All operations logged with:
- Persona ID
- Session ID
- Workspace ID
- Operation details
- Timestamp

## Performance Considerations

### Latency Targets

| Operation | Target | P99 |
|-----------|--------|-----|
| Flash App | 10ms | 25ms |
| Tier 1 completion | 100ms | 150ms |
| Tier 2 completion | 250ms | 400ms |
| Chat response | 2s | 5s |

### Caching Strategy

- LSH cache for similar queries
- Redis for session state
- Local storage for thread history

### Scaling

- Horizontal pod autoscaling
- GPU nodes for completion service
- Connection pooling for database

## Deployment Models

### Cloud (Production)

Kubernetes with Helm:
- Multi-replica services
- GPU-enabled completion pods
- Managed PostgreSQL and Redis
- Ingress with TLS

### Local (Development)

Docker Compose:
- Single-instance services
- Local PostgreSQL and Redis
- Port-forwarded access

### Hybrid

- IDE runs locally
- D3N services in cloud
- Secure tunnel for API access

