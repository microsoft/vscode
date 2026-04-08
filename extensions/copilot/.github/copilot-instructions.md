# GitHub Copilot Chat Extension - Copilot Instructions

## Project Overview

This is the **GitHub Copilot Chat** extension for Visual Studio Code - a VS Code extension that provides conversational AI assistance, a coding agent with many tools, inline editing capabilities, and advanced AI-powered features for VS Code.

### Key Features
- **Chat Interface**: Conversational AI assistance with chat participants, variables, and slash commands
- **Inline Chat**: AI-powered editing directly in the editor with `Ctrl+I`
- **Agent Mode**: Multi-step autonomous coding tasks
- **Edit Mode**: Natural language to code
- **Inline Suggestions**: Next edit suggestions and inline completions
- **Language Model Integration**: Support for multiple AI models (GPT-4, Claude, Gemini, etc.)
- **Context-Aware**: Workspace understanding, semantic search, and code analysis

### Tech Stack
- **TypeScript**: Primary language (follows VS Code coding standards)
- **TSX**: Prompts are built using the @vscode/prompt-tsx library
- **Node.js**: Runtime for extension host and language server features
- **WebAssembly**: For performance-critical parsing and tokenization
- **VS Code Extension API**: Extensive use of proposed APIs for chat, language models, and editing
- **ESBuild**: Bundling and compilation
- **Vitest**: Unit testing framework
- **Python**: For notebooks integration and ML evaluation scripts

## Validating changes

You MUST check compilation output before running ANY script or declaring work complete!

1. **ALWAYS** check the `start-watch-tasks` watch task output for compilation errors
2. **NEVER** use the `compile` task as a way to check if everything is working properly
3. **FIX** all compilation errors before moving forward

### TypeScript compilation steps
- Monitor the `start-watch-tasks` task outputs for real-time compilation errors as you make changes
- This task runs `npm: watch:tsc-extension`,`npm: watch:tsc-extension-web`, `npm: watch:tsc-simulation-workbench`, and `npm: watch:esbuild` to incrementally compile the project
- Start the task if it's not already running in the background

## Project Architecture

### Top-Level Directory Structure

#### Core Source Code (`src/`)
- **`src/extension/`**: Main extension implementation, organized by feature
- **`src/platform/`**: Shared platform services and utilities
- **`src/util/`**: Common utilities, VS Code API abstractions, and service infrastructure

#### Build & Configuration
- **`.esbuild.ts`**: Build configuration for bundling extension, web worker, and simulation workbench
- **`tsconfig.json`**: TypeScript configuration extending base config with React JSX settings
- **`vite.config.ts`**: Test configuration for Vitest unit tests
- **`package.json`**: Extension manifest with VS Code contributions, dependencies, and scripts

#### Testing & Simulation
- **`test/`**: Comprehensive test suite including unit, integration, and simulation tests
- **`script/simulate.sh`**: Test runner for scenario-based testing
- **`notebooks/`**: Jupyter notebooks for performance analysis and ML experiments

#### Assets & Documentation
- **`assets/`**: Icons, fonts, and visual resources
- **`CONTRIBUTING.md`**: Architecture documentation and development guide

### Key Source Directories

#### `src/extension/` - Feature Implementation

**Core Chat & Conversation Features:**
- **`conversation/`**: Chat participants, agents, and conversation flow orchestration
- **`inlineChat/`**: Inline editing features (`Ctrl+I`) and hints system
- **`inlineEdits/`**: Advanced inline editing capabilities with streaming edits

**Context & Intelligence:**
- **`context/`**: Context resolution for code understanding and workspace analysis
- **`contextKeys/`**: VS Code context key management for UI state
- **`intents/`**: Chat participant/slash command implementations
- **`prompts/`**: Prompt engineering and template system
- **`prompt/`**: Common prompt utilities
- **`typescriptContext/`**: TypeScript-specific context and analysis

**Search & Discovery:**
- **`search/`**: General search functionality within the extension
- **`workspaceChunkSearch/`**: Chunked workspace search for large codebases
- **`workspaceSemanticSearch/`**: Semantic search across workspace content
- **`workspaceRecorder/`**: Recording and tracking workspace interactions

**Authentication & Configuration:**
- **`authentication/`**: GitHub authentication and token management
- **`configuration/`**: Settings and configuration management
- **`byok/`**: Bring Your Own Key (BYOK) functionality for custom API keys

**AI Integration & Endpoints:**
- **`endpoint/`**: AI service endpoints and model selection
- **`tools/`**: Language model tools and integrations
- **`api/`**: Core API abstractions and interfaces
- **`mcp/`**: Model Context Protocol integration

**Development & Testing:**
- **`testing/`**: Test generation and execution features
- **`test/`**: Extension-specific test utilities and helpers

**User Interface & Experience:**
- **`commands/`**: Service for working with VS Code commands
- **`codeBlocks/`**: Streaming code block processing
- **`linkify/`**: URL and reference linkification
- **`getting-started/`**: Onboarding and setup experience
- **`onboardDebug/`**: Debug onboarding flows
- **`survey/`**: User feedback and survey collection

**Specialized Features:**
- **`notebook/`**: Notebook integration and support
- **`review/`**: Code review and PR integration features
- **`renameSuggestions/`**: AI-powered rename suggestions
- **`ignore/`**: File and pattern ignore functionality
- **`xtab/`**: Cross-tab communication and state management

**Infrastructure & Utilities:**
- **`extension/`**: Core extension initialization and lifecycle
- **`log/`**: Logging infrastructure and utilities
- **`telemetry/`**: Analytics and usage tracking

**VS Code API Type Definitions:**
- Multiple `vscode.proposed.*.d.ts` files for proposed VS Code APIs including chat, language models, embeddings, and various editor integrations

#### `src/platform/` - Platform Services
- **`chat/`**: Core chat services and conversation options
- **`openai/`**: OpenAI API protocol integration and request handling
- **`embedding/`**: Vector embeddings for semantic search
- **`parser/`**: Code parsing and AST analysis
- **`search/`**: Workspace search and indexing
- **`telemetry/`**: Analytics and usage tracking
- **`workspace/`**: Workspace understanding and file management
- **`notebook/`**: Notebook integration
- **`git/`**: Git integration and repository analysis

#### `src/util/` - Infrastructure
- **`common/`**: Shared utilities, service infrastructure, and abstractions
- **`vs/`**: Utilities borrowed from the microsoft/vscode repo (readonly)

### Extension Activation Flow

1. **Base Activation** (`src/extension/extension/vscode/extension.ts`):
   - Checks VS Code version compatibility
   - Creates service instantiation infrastructure
   - Initializes contribution system

2. **Service Registration**:
   - Platform services (search, parsing, telemetry, etc.)
   - Extension-specific services (chat, authentication, etc.)
   - VS Code integrations (commands, providers, etc.)

3. **Contribution Loading**:
   - Chat participants
   - Language model providers
   - Command registrations
   - UI contributions (views, menus, etc.)

### Chat System Architecture

#### Chat Participants
- **Default Agent**: Main conversational AI assistant
- **Setup Agent**: Handles initial Copilot setup and onboarding
- **Workspace Agent**: Specialized for workspace-wide operations
- **Agent Mode**: Autonomous multi-step task execution

#### Request Processing
1. **Input Parsing**: Parse user input for participants, variables, slash commands
2. **Context Resolution**: Gather relevant code context, diagnostics, workspace info
3. **Prompt Construction**: Build prompts with context and intent detection
4. **Model Interaction**: Send requests to appropriate language models
5. **Response Processing**: Parse and interpret AI responses
6. **Action Execution**: Apply code edits, show results, handle follow-ups

#### Language Model Integration
- Support for multiple providers (OpenAI, Anthropic, etc.)
- Model selection and switching capabilities
- Quota management and fallback handling
- Custom instruction integration

### Inline Chat System
- **Hint System**: Smart detection of natural language input for inline suggestions
- **Intent Detection**: Automatic detection of user intent (explain, fix, refactor, etc.)
- **Context Collection**: Gather relevant code context around cursor/selection
- **Streaming Edits**: Real-time application of AI-suggested changes
- **Version 2**: New implementation with improved UX and hide-on-request functionality

## Coding Standards

### TypeScript/JavaScript Guidelines
- **Indentation**: Use **tabs**, not spaces
- **Naming Conventions**:
  - `PascalCase` for types and enum values
  - `camelCase` for functions, methods, properties, and local variables
  - Use descriptive, whole words in names
- **Strings**:
  - "double quotes" for user-visible strings that need localization
  - 'single quotes' for internal strings
- **Functions**: Use arrow functions `=>` over anonymous function expressions
- **Conditionals**: Always use curly braces, opening brace on same line
- **Comments**: Use JSDoc style for functions, interfaces, enums, and classes

### React/JSX Conventions
- Custom JSX factory: `vscpp` (instead of React.createElement)
- Fragment factory: `vscppf`
- Components follow VS Code theming and styling patterns

### Architecture Patterns
- **Service-oriented**: Heavy use of dependency injection via `IInstantiationService`
- **Contribution-based**: Modular system where features register themselves
- **Event-driven**: Extensive use of VS Code's event system and disposables
- **Layered**: Clear separation between platform services and extension features

### Testing Standards
- **Unit Tests**: Vitest for isolated component testing
- **Integration Tests**: VS Code extension host tests for API integration
- **Simulation Tests**: End-to-end scenario testing with `.stest.ts` files
- **Fixtures**: Comprehensive test fixtures for various scenarios

### File Organization
- **Logical Grouping**: Features grouped by functionality, not technical layer
- **Platform Separation**: Different implementations for web vs. Node.js environments
- **Test Proximity**: Tests close to implementation (`/test/` subdirectories)
- **Clear Interfaces**: Strong interface definitions for service boundaries

## Key Development Guidelines

### Arrow Functions and Parameters
- Use arrow functions `=>` over anonymous function expressions
- Only surround arrow function parameters when necessary:

```javascript
x => x + x                    // ✓ Correct
(x, y) => x + y              // ✓ Correct
<T>(x: T, y: T) => x === y   // ✓ Correct
(x) => x + x                 // ✗ Wrong
```

### Code Structure
- Always surround loop and conditional bodies with curly braces
- Open curly braces always go on the same line as whatever necessitates them
   - An open curly brace MUST be followed by a newline, with the body indented on the next line
- Parenthesized constructs should have no surrounding whitespace
- Single space follows commas, colons, and semicolons

```javascript
for (let i = 0, n = str.length; i < 10; i++) {
    if (x < 10) {
        foo();
    }
}

function f(x: number, y: string): void { }
```

### Type Management
- Do not export `types` or `functions` unless you need to share it across multiple components
- Do not introduce new `types` or `values` to the global namespace
- Use proper types. Do not use `any` unless absolutely necessary.
- Use `readonly` whenever possible.
- Avoid casts in TypeScript unless absolutely necessary. If you get type errors after your changes, look up the types of the variables involved and set up a proper system of types and interfaces instead of adding type casts.
- Do not use `any` or `unknown` as the type for variables, parameters, or return values unless absolutely necessary. If they need type annotations, they should have proper types or interfaces defined.

## Key APIs and Integrations

### VS Code Proposed APIs (Enabled)
The extension uses numerous proposed VS Code APIs for advanced functionality:
- `chatParticipantPrivate`: Private chat participant features
- `languageModelSystem`: System messages for LM API
- `chatProvider`: Custom chat provider implementation
- `mappedEditsProvider`: Advanced editing capabilities
- `inlineCompletionsAdditions`: Enhanced inline suggestions
- `aiTextSearchProvider`: AI-powered search capabilities

### External Integrations
- **GitHub**: Authentication and API access
- **Azure**: Cloud services and experimentation
- **OpenAI**: Language model API
- **Anthropic**: Claude model integration - See **[src/extension/agents/claude/AGENTS.md](../src/extension/agents/claude/AGENTS.md)** for complete Claude Agent SDK integration documentation including architecture, components, and registries
- **Telemetry**: Usage analytics and performance monitoring

## Development Workflow

### Setup and Build
- `npm install`: Install dependencies
- `npm run compile`: Development build
- `npm run watch:*`: Various watch modes for development

### Updating Dependencies

**Anthropic SDK Packages:**
When updating `@anthropic-ai/claude-agent-sdk` or `@anthropic-ai/sdk`, you **MUST** follow the upgrade guide in **[src/extension/agents/claude/AGENTS.md](../src/extension/agents/claude/AGENTS.md#upgrading-anthropic-sdk-packages)**. This includes:
1. Reviewing changelogs for breaking changes
2. Checking compilation errors in key Claude integration files
3. Running through the testing checklist for core functionality, tools, hooks, and slash commands

### Testing
- `npm run test:unit`: Unit tests
- `npm run test:extension`: VS Code integration tests
- `npm run simulate`: Scenario-based simulation tests

### Key Entry Points for Edits

**Chat & Conversation Features:**
- **Adding new chat features**: Start in `src/extension/conversation/`
- **Chat participants and agents**: Look in `src/extension/conversation/` for participant implementations
- **Conversation storage**: Modify `src/extension/conversationStore/` for persistence features
- **Inline chat improvements**: Look in `src/extension/inlineChat/` and `src/extension/inlineEdits/`

**Context & Intelligence:**
- **Context resolution changes**: Check `src/extension/context/` and `src/extension/typescriptContext/`
- **Prompt engineering**: Update `src/extension/prompts/` and `src/extension/prompt/`
- **Intent detection**: Modify `src/extension/intents/` for user intent classification

**Search & Discovery:**
- **Search functionality**: Update `src/extension/search/` for general search
- **Workspace search**: Modify `src/extension/workspaceChunkSearch/` for large codebase search
- **Semantic search**: Edit `src/extension/workspaceSemanticSearch/` for AI-powered search
- **Workspace tracking**: Update `src/extension/workspaceRecorder/` for interaction recording

**Authentication & Configuration:**
- **Authentication flows**: Modify `src/extension/authentication/` for GitHub integration
- **Settings and config**: Update `src/extension/configuration/` and `src/extension/settingsSchema/`
- **BYOK features**: Edit `src/extension/byok/` for custom API key functionality

**AI Integration:**
- **AI endpoints**: Update `src/extension/endpoint/` for model selection and routing
- **Language model tools**: Modify `src/extension/tools/` for AI tool integrations
- **API abstractions**: Edit `src/extension/api/` for core interfaces
- **MCP integration**: Update `src/extension/mcp/` for Model Context Protocol features

**User Interface:**
- **VS Code commands**: Update `src/extension/commands/` for command implementations
- **Code block rendering**: Modify `src/extension/codeBlocks/` for code display
- **Onboarding flows**: Edit `src/extension/getting-started/` and `src/extension/onboardDebug/`
- **Cross-tab features**: Update `src/extension/xtab/` for multi-tab coordination

**Testing & Development:**
- **Test generation**: Modify `src/extension/testing/` for AI-powered test creation
- **Extension tests**: Update `src/extension/test/` for extension-specific test utilities

**Platform Services:**
- **Core platform services**: Extend `src/platform/` services for cross-cutting functionality
- **VS Code integration**: Update contribution files and extension activation code
- **Configuration**: Modify `package.json` contributions for VS Code integration

This extension is a complex, multi-layered system that provides comprehensive AI assistance within VS Code. Understanding the service architecture, contribution system, and separation between platform and extension layers is crucial for making effective changes.

## Best Practices
- Use services and dependency injection over VS Code extension APIs when possible:
  - Use `IFileSystemService` instead of Node's `fs` or `vscode.workspace.fs`
  - Use `ILogService` instead of `console.log`
  - Look for existing `I*Service` interfaces before reaching for raw APIs
  - **Why**: Enables unit testing without VS Code host, supports simulation tests, provides cross-platform abstractions (Node vs web), and adds features like caching and size limits
- Always use the URI type instead of using string file paths. There are many helpers available for working with URIs.