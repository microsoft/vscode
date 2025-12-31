# SWE Agent Extension for Logos IDE

The SWE Agent extension provides intelligent code assistance powered by D3N's 15 specialized software engineering models.

## Features

### Code Generation
Generate code from natural language descriptions using Codex-01.

### Bug Fixing
Automatically detect and fix bugs with Debug-01.

### Code Review
Get instant code reviews with Review-01.

### Test Generation
Generate comprehensive tests with Test-01.

### SQL Generation
Convert natural language to SQL with SQL-01.

### And More...
- Shell commands (Shell-01)
- Git operations (Git-01)
- Infrastructure as Code (Infra-01)
- API design (API-01)
- Documentation (Docs-01)
- Mobile development (Mobile-01)
- Structured output (JSON-01)
- Agentic workflows (Agent-01)
- Diagram generation (Diagram-01)
- UI components (UI-01)

## Installation

1. Open Logos IDE
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "SWE Agent"
4. Click Install

## Configuration

Set your API key in settings:

```json
{
  "sweAgent.apiKey": "your-api-key",
  "sweAgent.endpoint": "https://swe.d3n.ai"
}
```

## Usage

### Quick Actions

- `Ctrl+Shift+G`: Generate code
- `Ctrl+Shift+D`: Debug selection
- `Ctrl+Shift+R`: Review selection
- `Ctrl+Shift+T`: Generate tests

### Chat Interface

Open the SWE Agent chat panel from the sidebar to interact with the models conversationally.

### Context Menu

Right-click on selected code to access:
- Generate Code
- Fix Bug
- Review Code
- Generate Tests
- Generate Documentation

## Commands

| Command | Description |
|---------|-------------|
| `sweAgent.generate` | Generate code |
| `sweAgent.debug` | Fix bugs |
| `sweAgent.review` | Review code |
| `sweAgent.test` | Generate tests |
| `sweAgent.sql` | Generate SQL |
| `sweAgent.shell` | Generate shell command |
| `sweAgent.diagram` | Generate diagram |
| `sweAgent.selectModel` | Select specific model |

## Views

### Chat View
Interactive chat interface for conversational coding assistance.

### History View
Browse and revisit previous SWE operations.

### Models View
View available models and their status.

## Requirements

- Logos IDE 1.0.0 or higher
- SWE Agent API key

## Known Issues

See [GitHub Issues](https://github.com/d3n-ai/logos-swe-agent/issues)

## Release Notes

### 1.0.0 (2024-12-30)

- Initial release
- 15 specialized models
- Chat interface
- History tracking
- Model selection

## Contributing

See [CONTRIBUTING.md](./docs/CONTRIBUTING.md)

## License

MIT



