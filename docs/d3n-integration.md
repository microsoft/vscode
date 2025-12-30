# D3N Integration Guide

## Overview

Logos is a D3N-native IDE, meaning it uses D3N infrastructure for all AI features. This guide covers how to configure, use, and extend D3N integration.

## Architecture

```
Logos IDE
    │
    ├── logos-d3n extension
    │       │
    │       ├── D3NClient (TypeScript)
    │       │       │
    │       │       └── HTTP/gRPC to D3N Gateway
    │       │
    │       ├── ARIABridge
    │       │       │
    │       │       └── Agent orchestration
    │       │
    │       └── BMUIDERouter
    │               │
    │               └── Tier selection
    │
d3n-core (Python)
    │
    ├── agents/logos/
    │       │
    │       ├── ConductorBinding
    │       ├── SWEBinding
    │       ├── WorkspaceCABinding
    │       ├── DataAnalystBinding
    │       └── ResearcherBinding
    │
    ├── flash_apps/ide/
    │       │
    │       ├── IntentApp
    │       ├── CodeActionRouter
    │       └── SymbolExtractor
    │
    └── integration/logos/
            │
            ├── ARIABridge
            ├── BMUIDERouter
            ├── FlashAppExecutor
            └── AuditExporter
```

## Configuration

### Environment Variables

```bash
# D3N Gateway
D3N_ENDPOINT=https://d3n.deepcreative.io
D3N_API_KEY=your-api-key

# ARIA Conductor
ARIA_CONDUCTOR_ENDPOINT=https://aria.deepcreative.io
ARIA_APIF_ENABLED=true

# PERSONA
PERSONA_ENDPOINT=https://persona.deepcreative.io
PERSONA_PQC_ENABLED=true
```

### VS Code Settings

```json
{
  "logos.d3n.endpoint": "https://d3n.deepcreative.io",
  "logos.d3n.defaultTier": 2,
  "logos.d3n.maxTier": 3,
  "logos.d3n.flashAppsEnabled": true,
  "logos.d3n.usfTarget": 0.85
}
```

## D3N Client

### TypeScript API

```typescript
import { D3NClient } from '@logos/d3n';

// Initialize client
const client = new D3NClient({
  endpoint: process.env.D3N_ENDPOINT,
  apiKey: process.env.D3N_API_KEY,
});

// Invoke agent
const result = await client.invoke({
  agentId: 'logos.swe',
  query: 'Refactor this function',
  context: {
    file: editor.document.uri.fsPath,
    selection: editor.document.getText(editor.selection),
  },
  tier: 2, // Optional, auto-selected if omitted
});

console.log(result.content);
console.log(`Tier used: ${result.tierUsed}`);
console.log(`Latency: ${result.latencyMs}ms`);
```

### Streaming Responses

```typescript
const stream = client.stream({
  agentId: 'logos.swe',
  query: 'Write a complex function',
  context: {},
});

for await (const chunk of stream) {
  process.stdout.write(chunk.token);
}
```

## Tier Selection

### BMU Router

The BMU (Bellman Memory Unit) selects optimal tier:

```typescript
import { BMUIDERouter, IDEOperation } from '@logos/d3n';

const router = new BMUIDERouter({
  targetUSF: 0.85,
  latencyBudgetMs: 500,
});

const decision = router.route(
  IDEOperation.COMPLETION,
  'def process_data(',
  { file: 'main.py' }
);

console.log(`Tier: ${decision.tier}`);
console.log(`Flash App: ${decision.flashAppId}`);
console.log(`Estimated latency: ${decision.estimatedLatencyMs}ms`);
```

### Tier Characteristics

| Tier | Latency | Quality | Cost | Use Case |
|------|---------|---------|------|----------|
| 1 | 50ms | 70% | $0.0001/1K | Variable names, simple |
| 2 | 200ms | 85% | $0.001/1K | Functions, types |
| 3 | 800ms | 95% | $0.01/1K | Complex logic |

### USF Optimization

The Universal System Function (USF) balances quality, latency, and cost:

```
USF = Quality × (1 - LatencyPenalty) / (Cost + 1)
```

## Flash Apps

### Available Flash Apps

| App | Latency | Purpose |
|-----|---------|---------|
| `completion.intent` | 5ms | Classify completion type |
| `completion.extraction` | 8ms | Extract parameters |
| `code.action_router` | 3ms | Route code actions |
| `code.symbol_extractor` | 2ms | Extract symbols |

### Using Flash Apps

```typescript
import { FlashAppExecutor } from '@logos/d3n';

const executor = new FlashAppExecutor();

// Execute Flash App
const result = await executor.execute('completion.intent', {
  prefix: 'def hello(',
  context: 'Python function definition',
});

console.log(`Intent: ${result.output.intent}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Cache hit: ${result.cacheHit}`);
```

## Agent Bindings

### Creating Custom Agent

```python
# In d3n_core/agents/logos/my_agent_binding.py

from dataclasses import dataclass
from typing import Dict, Optional, Any

@dataclass
class MyAgentConfig:
    persona_id: str = "logos.my_agent"
    name: str = "My Agent"
    default_tier: int = 2

class MyAgentBinding:
    def __init__(self, config: Optional[MyAgentConfig] = None):
        self.config = config or MyAgentConfig()

    def get_system_prompt(self) -> str:
        return """You are a specialized agent..."""

    def get_moe_weights(self) -> Dict[str, float]:
        return {"coding": 0.5, "reasoning": 0.5}

    def prepare_request(
        self,
        query: str,
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return {
            "persona_id": self.config.persona_id,
            "system_prompt": self.get_system_prompt(),
            "query": query,
            "context": context or {},
            "tier": self.config.default_tier,
            "moe_weights": self.get_moe_weights(),
        }
```

### Registering Agent

```python
from d3n_core.integration.logos import ARIABridge
from .my_agent_binding import MyAgentBinding

bridge = ARIABridge(workspace_id="ws-123", session_id="sess-456")
bridge.register_custom_agent("logos.my_agent", MyAgentBinding())
```

## Audit Integration

### Recording Events

```typescript
import { AuditLogger } from '@logos/d3n';

// Automatically logs all D3N operations
// Can also log custom events:
AuditLogger.record({
  eventType: 'custom.operation',
  data: { action: 'my_action' },
});
```

### Querying Audit Logs

```sql
SELECT event_type, timestamp, data
FROM audit_events
WHERE workspace_id = 'ws-123'
AND timestamp > NOW() - INTERVAL '7 days'
ORDER BY timestamp DESC;
```

## Troubleshooting

### Connection Issues

```bash
# Test D3N connectivity
curl -H "Authorization: Bearer $D3N_API_KEY" \
  $D3N_ENDPOINT/health
```

### Slow Responses

1. Check tier being used (logs show tier)
2. Verify Flash App cache hits
3. Monitor D3N Gateway latency

### Auth Failures

1. Verify API key is valid
2. Check PERSONA session expiry
3. Ensure MFA completed if required


