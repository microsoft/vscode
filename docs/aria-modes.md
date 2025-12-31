# Aria Modes

## Overview

Aria modes control how the AI assistant processes requests and which tools are available. Each mode is optimized for a specific type of task, with appropriate tool access and behavioral modifications.

## Mode Summary

| Mode | Icon | Tools | Read-Only | Best For |
|------|------|-------|-----------|----------|
| **Agent** | 🤖 | All | No | Full development work |
| **Plan** | 📝 | Read-only | Yes | Task planning |
| **Debug** | 🐛 | Debug + Read | No | Debugging issues |
| **Ask** | ❓ | Read-only | Yes | Q&A, learning |
| **Research** | 🔬 | Research + Read | Yes | Deep research |
| **Code Review** | 🔍 | Review-focused | Yes | Code analysis |

## Detailed Mode Descriptions

### Agent Mode 🤖

**The default mode for full agentic execution.**

Agent mode provides unrestricted access to all Aria tools, enabling complete development workflows. Aria can read and write files, execute terminal commands, manage git operations, and perform any IDE action.

**Use Cases:**
- Implementing new features
- Fixing bugs
- Refactoring code
- Executing plans
- Running tests
- Deploying applications

**Allowed Tools:** All tools (`*`)

**Keyboard Shortcut:** `Cmd+Shift+1`

**System Behavior:**
- Takes direct action to accomplish goals
- Can create, modify, and delete files
- Can execute terminal commands
- Can make git commits and push changes

---

### Plan Mode 📝

**For thorough analysis and planning without execution.**

Plan mode restricts Aria to read-only operations, focusing on creating detailed, actionable plans. Perfect for complex tasks that benefit from planning before execution.

**Use Cases:**
- Breaking down complex features
- Architecture planning
- Creating migration strategies
- Documenting proposed changes
- Review and approval workflows

**Allowed Tools:** `read_file`, `list_dir`, `grep`, `find_files`, `get_diagnostics`

**Keyboard Shortcut:** `Cmd+Shift+2`

**System Behavior:**
- Creates structured plans with specific files and changes
- Cannot modify any files
- Plans can be saved and executed later
- Higher tier routing for thorough analysis

**Example Prompt:**
> "Plan the migration from JavaScript to TypeScript for the utils directory"

**Example Output:**
```markdown
# TypeScript Migration Plan

## Tasks
1. Create tsconfig.json with appropriate settings
2. Rename utils/*.js files to *.ts
3. Add type annotations to exported functions
4. Update import statements in dependent files
5. Configure build pipeline for TypeScript
```

---

### Debug Mode 🐛

**For debugging and problem diagnosis.**

Debug mode provides access to debugging tools and read operations, optimized for diagnosing and fixing issues. Aria can set breakpoints, inspect variables, and analyze stack traces.

**Use Cases:**
- Investigating error messages
- Analyzing stack traces
- Setting breakpoints
- Examining variable states
- Running tests to identify failures

**Allowed Tools:** Read tools + `run_terminal`, `debug_start`, `debug_stop`, `debug_set_breakpoint`, `get_breakpoints`, `debug_step`, `get_variables`, `get_call_stack`, `debug_evaluate`, `get_terminal_output`

**Keyboard Shortcut:** `Cmd+Shift+3`

**System Behavior:**
- Methodical analysis of errors
- Can run tests and debug commands
- Suggests fixes with explanations
- Can start/stop debug sessions

**Example Prompt:**
> "Debug the TypeError occurring in processData when the input array is empty"

---

### Ask Mode ❓

**For questions and learning with zero side effects.**

Ask mode is the safest mode, providing only read access for answering questions. Perfect for understanding code without any risk of changes.

**Use Cases:**
- Understanding unfamiliar code
- Learning about architecture
- Getting explanations
- Documentation lookup
- Code education

**Allowed Tools:** `read_file`, `list_dir`, `grep`, `find_files`

**Keyboard Shortcut:** `Cmd+Shift+4`

**System Behavior:**
- Answers questions thoroughly
- References code with explanations
- Provides guidance and best practices
- Cannot make any changes
- Lower tier routing for efficiency

**Example Prompt:**
> "Explain how the authentication middleware works in this codebase"

---

### Research Mode 🔬

**For deep research with Athena integration.**

Research mode connects to Athena's research capabilities, enabling deep dives into technical topics with web search and knowledge synthesis.

**Use Cases:**
- Researching technologies
- Comparing approaches
- Finding best practices
- Documentation deep dives
- State-of-the-art analysis

**Allowed Tools:** `read_file`, `grep`, `list_dir`, `find_files`, `web_search`, `athena_research`, `fetch_url`

**Keyboard Shortcut:** `Cmd+Shift+5`

**System Behavior:**
- Conducts thorough research
- Searches the web for current information
- Synthesizes multiple sources
- Provides properly cited references
- Higher tier routing for comprehensive analysis

**Example Prompt:**
> "Research the best approaches for implementing real-time collaboration in a React app"

---

### Code Review Mode 🔍

**For analyzing code quality and suggesting improvements.**

Code Review mode focuses on analysis and improvement suggestions, reviewing code for quality, security, and best practices.

**Use Cases:**
- Pre-merge code review
- Security audits
- Performance analysis
- Style and pattern review
- Best practices enforcement

**Allowed Tools:** `read_file`, `git_diff`, `git_log`, `get_diagnostics`, `grep`, `find_files`

**Keyboard Shortcut:** `Cmd+Shift+6`

**System Behavior:**
- Analyzes code thoroughly
- Identifies bugs and issues
- Checks security vulnerabilities
- Reviews adherence to best practices
- Creates improvement plans
- Cannot make direct changes

**Example Prompt:**
> "Review the changes in the last commit for security issues"

---

## Mode Switching

### Keyboard Shortcuts

| Shortcut | Mode |
|----------|------|
| `Cmd+Shift+1` | Agent |
| `Cmd+Shift+2` | Plan |
| `Cmd+Shift+3` | Debug |
| `Cmd+Shift+4` | Ask |
| `Cmd+Shift+5` | Research |
| `Cmd+Shift+6` | Code Review |
| `Cmd+Shift+M` | Mode Picker |

### Command Palette

Press `Cmd+Shift+P` and search for:
- "Logos: Switch to Agent Mode"
- "Logos: Switch to Plan Mode"
- "Logos: Switch to Debug Mode"
- "Logos: Switch to Ask Mode"
- "Logos: Switch to Research Mode"
- "Logos: Switch to Code Review Mode"
- "Logos: Select Mode..."

### UI Mode Selector

Click the mode indicator in the chat header to open the mode dropdown:

```
┌─────────────────────────────────────┐
│ 🤖 Agent                        ▼  │
├─────────────────────────────────────┤
│ 🤖 Agent                            │
│    Full agentic execution           │
│                                     │
│ 📝 Plan                             │
│    Planning without execution       │
│                                     │
│ 🐛 Debug                            │
│    Debugging assistance             │
│                                     │
│ ❓ Ask                              │
│    Q&A with no side effects         │
│                                     │
│ 🔬 Research                         │
│    Deep research via Athena         │
│                                     │
│ 🔍 Code Review                      │
│    Code analysis and suggestions    │
└─────────────────────────────────────┘
```

## Tool Permission Matrix

| Tool | Agent | Plan | Debug | Ask | Research | Code Review |
|------|-------|------|-------|-----|----------|-------------|
| `read_file` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `write_file` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `list_dir` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `grep` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `find_files` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `run_terminal` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `git_status` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `git_commit` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `git_diff` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `debug_start` | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `get_diagnostics` | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `web_search` | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |

## D3N Tier Selection by Mode

Each mode influences the D3N tier selection:

| Mode | Tier Adjustment | Reason |
|------|-----------------|--------|
| Agent | ±0 | Standard routing |
| Plan | +1 | Thorough analysis |
| Debug | ±0 | Balanced |
| Ask | -1 | Faster responses |
| Research | +1 | Deep investigation |
| Code Review | ±0 | Standard |

## Auto Mode Switching

When `logos.autoModeSwitch` is enabled, Aria can automatically switch modes based on query patterns:

| Query Pattern | Suggested Mode |
|--------------|----------------|
| "plan", "design", "architect" | Plan |
| "debug", "fix", "error", "crash" | Debug |
| "explain", "what is", "how does" | Ask |
| "research", "compare", "best practice" | Research |
| "review", "audit", "analyze" | Code Review |

## Configuration

```json
{
  "logos.defaultMode": "agent",
  "logos.autoModeSwitch": false
}
```

## Best Practices

1. **Start with Plan** for complex tasks - Review before executing
2. **Use Ask** when learning - Safe exploration with no side effects
3. **Debug mode** for errors - Specialized tools for diagnosis
4. **Research mode** for decisions - Get comprehensive analysis
5. **Code Review** before merging - Catch issues early
6. **Agent mode** for execution - Get things done

