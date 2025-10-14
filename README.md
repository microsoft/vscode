# Specter IDE

<p align="center">
  <img src="resources/specter-logo.png" alt="Specter Logo" width="200"/>
</p>

<h3 align="center">AI-Powered Offensive Security Testing Platform</h3>

<p align="center">
  <a href="https://github.com/BugB-Tech/bsurf_b2c"><img src="https://img.shields.io/github/stars/BugB-Tech/bsurf_b2c?style=social" alt="GitHub Stars"></a>
  <a href="https://github.com/BugB-Tech/bsurf_b2c/blob/bugb/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://discord.gg/specter"><img src="https://img.shields.io/discord/xxxxxx?color=7289da&label=Discord&logo=discord&logoColor=white" alt="Discord"></a>
</p>

---

## Overview

**Specter** is an AI-powered IDE built for offensive security testing. It enables security engineers to create, execute, and share automated security testing workflows through natural language prompts and visual workflow builders.

Built on top of VS Code, Specter integrates with **certxgen** (our automation framework with 100+ exploit templates) and provides an intelligent agent that generates executable Python notebooks with visual workflow graphs.

### Key Features

- 🤖 **AI-Powered Workflow Generation** - Describe security tests in natural language
- 📊 **Visual Workflow Builder** - See your testing workflow as an interactive graph
- 🔧 **100+ Pre-built Templates** - certxgen exploit templates ready to use
- 🛠️ **Tool Integration** - nmap, pyats, Pacu, Atomic Red Team, and more
- 📓 **Jupyter Notebooks** - Editable, executable testing workflows
- 🌐 **Marketplace** - Share and discover security workflows
- 🔒 **Local Execution** - All tests run on your machine
- 🎯 **Target Validation** - Built-in safety and compliance checks

---

## Quick Start

### Prerequisites

- **Node.js** v22.15.1 or later
- **Python** 3.x (for notebook execution)
- **certxgen** CLI (install from [certxgen repo](https://github.com/bugb/certxgen))

### Installation

```bash
# Clone the repository
git clone https://github.com/BugB-Tech/bsurf_b2c.git
cd bsurf_b2c

# Install dependencies
npm install

# Build and run
npm run watch &
./scripts/code.sh
```

For detailed setup instructions, see [SETUP.md](documents/03-SETUP.md)

---

## Usage Example

### Generate a Security Workflow

1. **Open Specter IDE**
2. **Open Security Chat** (Cmd+Shift+P → "Specter: Open Security Chat")
3. **Enter your prompt:**
   ```
   Check if Redis is vulnerable on 192.168.1.100
   ```
4. **Review the generated workflow:**
   - Python notebook with step-by-step testing code
   - Visual graph showing the testing flow
5. **Execute the workflow** and see real-time progress

### Example Workflow

**Prompt:** "Test mobile app on Genymotion for common vulnerabilities"

**Generated Workflow:**
```python
# Cell 1: Connect to Genymotion
import subprocess
result = subprocess.run(['adb', 'devices'])

# Cell 2: Install and configure testing tools
subprocess.run(['pip', 'install', 'frida-tools'])

# Cell 3: Run certxgen mobile test suite
subprocess.run([
    'certxgen', 'run',
    'mobile-vuln-scan.yaml',
    '--target', 'emulator-5554'
])
```

---

## Architecture

```
User Prompt
  ↓
AI Agent (Claude/GPT-4)
  ↓
Workflow Plan
  ↓
Python Notebook + certxgen YAMLs
  ↓
Visual Graph (Reactflow)
  ↓
Jupyter Execution
  ↓
Real-time Results
```

See [Architecture Documentation](documents/02-DEVELOPMENT.md#architecture-overview) for details.

---

## Project Structure

```
bsurf_b2c/
├── src/vs/workbench/
│   ├── contrib/specter/        # Specter UI components
│   └── services/specter/       # Specter backend services
├── extensions/                  # Built-in extensions
├── documents/                   # Project documentation
│   ├── 01-IDEATION.md
│   ├── 02-DEVELOPMENT.md
│   ├── 03-SETUP.md
│   └── 04-ROADMAP.md
├── product.json                 # Product configuration
└── package.json                 # Dependencies
```

---

## Development

### Setup Development Environment

```bash
# Install Node.js 22+
nvm install 22
nvm use 22

# Clone and install
git clone https://github.com/BugB-Tech/bsurf_b2c.git
cd bsurf_b2c
npm install

# Start development
npm run watch           # Terminal 1 (keep running)
./scripts/code.sh       # Terminal 2
```

### Making Changes

1. Create feature branch: `git checkout -b bugb/feature/your-feature`
2. Make changes in `src/vs/workbench/contrib/specter/`
3. Test: Reload window (Cmd+R in development IDE)
4. Commit: `git commit -m "feat: add your feature"`
5. Push: `git push origin bugb/feature/your-feature`
6. Create Pull Request

See [Contributing Guide](documents/05-CONTRIBUTING.md) for details.

---

## Documentation

- 📖 [Ideation Document](documents/01-IDEATION.md) - Product vision, features, strategy
- 🔧 [Development Guide](documents/02-DEVELOPMENT.md) - Codebase structure, architecture
- 🚀 [Setup Guide](documents/03-SETUP.md) - Installation and configuration
- 🗺️ [Roadmap](documents/04-ROADMAP.md) - Timeline and milestones
- 🤝 [Contributing](documents/05-CONTRIBUTING.md) - How to contribute

---

## Roadmap

### Phase 1: Foundation (Weeks 1-8)
- ✅ Fork VS Code
- ✅ Rebrand to Specter
- 🔄 AI workflow generator
- 🔄 Visual graph builder
- 🔄 Tool integrations (nmap, pyats, certxgen)

### Phase 2: Platform (Weeks 9-14)
- ⏳ Marketplace MVP
- ⏳ bswarm integration
- ⏳ Safety & compliance layer
- ⏳ Beta launch

### Phase 3: Growth (Weeks 15-20)
- ⏳ Enterprise features
- ⏳ Product suite integration (ASM, CNAPP)
- ⏳ Public launch

See detailed [Roadmap](documents/04-ROADMAP.md)

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| **IDE Base** | VS Code (Electron, TypeScript) |
| **AI/LLM** | Claude API, OpenAI API, Ollama |
| **Notebooks** | Jupyter, Python |
| **Visualization** | Reactflow |
| **Automation** | certxgen (Rust CLI) |
| **Threat Intel** | bswarm MCP Server |

---

## Marketplace

Specter includes a built-in marketplace for sharing security workflows:

- **Browse** - Discover workflows created by the community
- **Install** - One-click installation of workflows
- **Publish** - Share your workflows with others
- **Categories** - Web App Testing, Network Scanning, Cloud Security, Mobile Testing, API Security

**Featured Workflows:**
- 🐞 Log4Shell Scanner
- 🔓 Redis Unauthorized Access Checker
- ☁️ AWS Misconfiguration Detector
- 📱 Mobile App Security Suite

---

## Contributing

We welcome contributions! Here's how you can help:

- 🐛 **Report Bugs** - Open an issue on GitHub
- 💡 **Suggest Features** - Share your ideas in Discussions
- 📝 **Improve Docs** - Help us improve documentation
- 🔧 **Submit PRs** - Contribute code (see [Contributing Guide](documents/05-CONTRIBUTING.md))
- 🎨 **Create Workflows** - Build and share security workflows

### Contributors

<a href="https://github.com/BugB-Tech/bsurf_b2c/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=BugB-Tech/bsurf_b2c" />
</a>

---

## License

Specter is licensed under the [MIT License](LICENSE).

Built on top of [VS Code](https://github.com/microsoft/vscode) (MIT License).

---

## Support

- 📧 **Email:** support@bugb.com
- 💬 **Discord:** [Join our community](https://discord.gg/specter)
- 🐦 **Twitter:** [@BugBSecurity](https://twitter.com/bugbsecurity)
- 📚 **Docs:** [docs.bugb.com/specter](https://docs.bugb.com/specter)
- 🎥 **YouTube:** [Specter Tutorials](https://youtube.com/bugbsecurity)

---

## Security

Security researchers: please report vulnerabilities to security@bugb.com

See our [Security Policy](SECURITY.md) for details.

---

## Acknowledgments

- Built on [VS Code](https://github.com/microsoft/vscode) by Microsoft
- AI powered by [Anthropic Claude](https://www.anthropic.com/)
- Inspired by the security community

---

<p align="center">
  Made with ❤️ by <a href="https://bugb.com">BugB-Tech</a>
</p>

<p align="center">
  <a href="https://github.com/BugB-Tech/bsurf_b2c">GitHub</a> •
  <a href="https://docs.bugb.com/specter">Documentation</a> •
  <a href="https://discord.gg/specter">Discord</a> •
  <a href="https://twitter.com/bugbsecurity">Twitter</a>
</p>
