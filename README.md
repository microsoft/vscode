# Logos: D3N-Native Cognitive Development Environment

<p align="center">
  <img src="resources/logos-banner.svg" alt="Logos IDE" width="600">
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#installation">Installation</a> •
  <a href="#development">Development</a> •
  <a href="#documentation">Documentation</a>
</p>

---

**Logos** is a VSCode-fork IDE deeply integrated with the D3N (Dynamic Neuromorphic Neural Networks) infrastructure, ARIA orchestration layer, and PERSONA identity framework. It serves as the primary development interface for the Bravo Zero platform.

Logos embodies **"eating our own dogfood"** — it is both a tool for building D3N-powered applications AND a D3N-powered application itself.

## Vision

Every IDE feature leverages the D3N fabric for maximum thermodynamic efficiency:

- 🤖 **Multi-agent conversations** via ARIA with @-mention routing
- ⚡ **Code completions** with Flash App acceleration (sub-10ms)
- 🧠 **Per-workspace Cognitive Architect** for proactive assistance
- 🔐 **PERSONA-integrated auth** with quantum-secure options
- 📊 **Full auditability** for compliance and security

## Features

### Multi-Agent Chat

Interact with specialized AI agents using familiar @-mention syntax:

```
@swe refactor this function to use async/await

@researcher what are the best practices for rate limiting?

@ca document this module's architecture
```

**Available Agents:**
| Agent | Command | Specialty |
|-------|---------|-----------|
| Conductor | `@conductor` | Multi-step coordination, orchestration |
| Software Engineer | `@swe` | Code generation, debugging, refactoring |
| Data Analyst | `@da` | Data analysis, visualization |
| Researcher | `@researcher` | Deep research via Athena integration |
| Workspace CA | `@ca` | Documentation, architecture assistance |

### Thread Branching

Explore alternative solutions without losing context:

- Branch from any message to try different approaches
- Visualize conversation tree in TangentTree panel
- Merge insights back to main thread

### D3N-Powered Completions

Three-tier execution for optimal speed/quality tradeoff:

| Tier | Latency | Use Case |
|------|---------|----------|
| Rung 1: Flash Apps | < 10ms | Simple completions, variable names |
| Rung 2: Fast Tier | 50-200ms | Function calls, type annotations |
| Rung 3: Full Reasoning | 500ms+ | Complex logic, algorithms |

The **BMU (Bellman Memory Unit)** automatically selects the optimal tier based on:
- Query complexity
- Context size
- Target USF (Universal System Function)

### Workspace Cognitive Architect

Per-project AI assistant that learns your codebase:

- **Proactive suggestions**: Refactoring opportunities, documentation gaps
- **Convention learning**: Adapts to your coding patterns
- **Auto-documentation**: README, CHANGELOG, API docs
- **Architecture diagrams**: Mermaid generation

### Full Auditability

Comprehensive logging for compliance:

- Session tracking
- Agent invocations with full request/response
- Tier usage for cost allocation
- File operations

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        Logos IDE Frontend                          │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │  Chat Panel  │ │  Code Editor │ │  CA Sidebar  │ │  Terminal  │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
├────────────────────────────────────────────────────────────────────┤
│                     Extension Layer (VSCode)                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │  logos-chat  │ │ logos-compl. │ │   logos-ca   │ │ logos-d3n  │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
├────────────────────────────────────────────────────────────────────┤
│                        D3N Integration Layer                        │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │ ARIA Bridge│ │BMU Router  │ │Flash Apps  │ │  Audit Exporter  │ │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘ │
├────────────────────────────────────────────────────────────────────┤
│                      D3N Infrastructure                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │  D3N Core  │ │   ARIA     │ │  PERSONA   │ │   AI-Oracle      │ │
│  └────────────┘ └────────────┘ └────────────┘ └──────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Node.js 20+
- Python 3.11+ (for d3n-core)
- Docker & Docker Compose (for local development)
- Kubernetes (for production)

### Quick Start

```bash
# Clone repository
git clone git@github.com:DeepCreative/Logos.git
cd Logos

# Install dependencies
npm install

# Start local services
cd infrastructure/docker
docker-compose up -d

# Build and run
npm run watch
npm run start-extension
```

### Production Deployment

```bash
# Deploy to Kubernetes with Helm
helm install logos ./infrastructure/helm/logos \
  --namespace logos \
  --set d3n.apiEndpoint=https://d3n.deepcreative.io \
  --set aria.conductorEndpoint=https://aria.deepcreative.io
```

See [Deployment Guide](docs/deployment.md) for detailed instructions.

## Development

### Project Structure

```
Logos/
├── src/
│   ├── chat/           # Multi-agent chat components
│   ├── workspace-ca/   # Cognitive Architect modules
│   ├── agents/         # Agent registry and hooks
│   ├── threading/      # Thread management
│   ├── context/        # Editor context providers
│   ├── governance/     # PERSONA auth, audit
│   ├── d3n/            # D3N integration
│   └── ui/             # Shared UI components
├── extensions/
│   ├── logos-chat/     # Chat VSCode extension
│   ├── logos-completion/  # Completion extension
│   ├── logos-ca/       # CA extension
│   └── logos-d3n/      # Core D3N extension
├── infrastructure/
│   ├── k8s/            # Kubernetes manifests
│   ├── helm/           # Helm charts
│   └── docker/         # Docker configs
└── tests/              # Test suites
```

### Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

### Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/my-feature`
3. Make changes with tests
4. Run linting: `npm run lint`
5. Submit PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines.

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/architecture.md) | System design and components |
| [Multi-Agent Chat](docs/multi-agent-chat.md) | Chat system details |
| [Workspace CA](docs/workspace-ca.md) | Cognitive Architect guide |
| [D3N Integration](docs/d3n-integration.md) | D3N bindings and usage |
| [Deployment](docs/deployment.md) | Production deployment guide |
| [API Reference](docs/api-reference.md) | Extension APIs |

## D3N Integration

Logos integrates deeply with D3N infrastructure:

### Agent Bindings

Located in `d3n-core` repository:
```
d3n_core/agents/logos/
├── conductor_binding.py
├── swe_binding.py
├── workspace_ca_binding.py
├── data_analyst_binding.py
├── researcher_binding.py
└── routing_policies.py
```

### Flash Apps

Spiking neural networks for sub-10ms operations:
```
d3n_core/flash_apps/ide/
├── intent_app.py          # Intent classification
├── code_action_router.py  # Action routing
├── symbol_extractor.py    # Symbol extraction
└── test_generator.py      # Test generation
```

### Usage Example

```typescript
import { D3NClient } from '@deepcreative/d3n-client';

const client = new D3NClient({
  endpoint: process.env.D3N_ENDPOINT,
});

// Invoke agent with automatic routing
const result = await client.invoke({
  query: 'Refactor this function',
  context: { file: 'main.ts', selection: code },
});
```

## Related Projects

| Project | Description |
|---------|-------------|
| [d3n-core](https://github.com/DeepCreative/d3n-core) | D3N infrastructure |
| [ARIA](https://github.com/DeepCreative/ARIA) | Multi-agent orchestration |
| [PERSONA](https://github.com/DeepCreative/PERSONA) | Identity and policy framework |
| [Athena](https://github.com/DeepCreative/Athena) | Research and knowledge system |
| [CognitiveArchitecture](https://github.com/DeepCreative/CognitiveArchitecture) | Architecture documentation |

## License

Copyright (c) DeepCreative. All rights reserved.

Licensed under the [MIT](LICENSE.txt) license.

---

<p align="center">
  <sub>Built with ❤️ by DeepCreative • Part of the Bravo Zero Platform</sub>
</p>
