# Reference Repos Analysis

## 1. 9Router — AI Code Tool Router

**Purpose**: Local proxy server routing requests across 40+ AI providers and 100+ models. Solves quota waste across multiple subscriptions.

**Architecture**: `CLI Tool → 9Router (localhost:20128) → Multiple AI Providers`

**Key Patterns**:
- **Three-Tier Fallback**: Subscription → Cheap → Free. Auto-cascades on quota exhaustion/errors
- **Format Translation Engine**: Converts between OpenAI ↔ Claude ↔ Gemini message protocols, preserves tool calls, streaming, structured outputs
- **Multi-Account Round-Robin**: Multiple accounts per provider with priority routing
- **OAuth + API Key Auth**: Supports both authentication methods
- **Real-time Token Tracking**: Per-provider consumption with auto-reset countdown (5hr rolling, daily, weekly)
- **Model Syntax**: `provider/model` identifier (e.g., `if/kimi-k2-thinking`)
- **Deployment**: npm package, Docker, Cloudflare Workers

**Applicable Patterns for VS Code**:
- Tiered provider fallback strategy
- Format translation between provider APIs
- Multi-account rotation with quota tracking
- Provider/model identifier syntax
- Usage analytics with cost estimation

## 2. Cockpit Tools — Universal AI IDE Account Manager

**Purpose**: Desktop app (Tauri + Vue.js) for centralized management of 12 AI IDE platform accounts.

**Key Patterns**:
- **Multi-Account Switching**: One-click switch without manual login/logout
- **Batch Import**: OAuth, token/JSON, plugin sync, local import
- **Quota Monitoring**: Real-time tracking across all platforms with configurable refresh (2-10min)
- **Wake-up Tasks**: Trigger quota reset cycles
- **Dashboard**: Unified view showing remaining quotas, reset timing, quick-action buttons
- **Multi-Instance**: Simultaneous operation with independent user directories and isolated parameters
- **Local-First**: All data stored locally, no cloud dependency
- **WebSocket Service**: localhost:19528 for plugin integration

**Applicable Patterns for VS Code**:
- Unified provider dashboard with quota visualization
- Multi-account management with tagging/filtering
- Configurable auto-refresh for quota monitoring
- Platform-specific quota display formats
- Local-first data storage pattern

## Key Takeaways for Implementation

1. **Provider rotation**: Adopt 9Router's tiered fallback — primary accounts first, auto-cascade on quota depletion
2. **Account management**: Follow Cockpit's multi-account pattern with batch operations and tagging
3. **Quota tracking**: Combine 9Router's real-time token tracking with Cockpit's dashboard visualization
4. **Format translation**: Build adapter layer per provider API format (OpenAI, Anthropic, Gemini protocols)
5. **Model-provider mapping**: Use explicit `provider/model` syntax with compatibility validation
6. **Dashboard**: Unified view with per-provider quota bars, reset timers, and cost estimation
7. **Authentication**: Support both API keys and OAuth tokens with auto-refresh
