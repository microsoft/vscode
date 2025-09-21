---
mode: agent
description: 'Help author a component specification instructions file for an agent.'
tools: ['edit', 'search', 'usages', 'vscodeAPI', 'fetch', 'extensions', 'todos']
---

<overview>
Your goal is to create a component overview in markdown given the context provided by the user. The overview should include a brief description of the component, its main features, an architectural diagram and layout of important code files and their relationships. The purpose of this overview is to enable a developer to attach it to a feature request and ensure the agent has enough context to make correct code changes without breaking functionality.
</overview>

<format>
---
description: 'A short description of when to use the instructions in this file.'
---

# [Component Name] Overview

## Purpose

Brief description of what this component does and why it exists.

## Scope
- What functionality is included
- What is explicitly out of scope
- Integration points with other components

## Architecture

### High-Level Design
[Architectural diagram or description of key patterns used]

### Key Classes & Interfaces
- **[ClassName]**: Brief description of responsibility
- **[InterfaceName]**: Purpose and main methods
- **[ServiceName]**: Service responsibilities

### Key Files
List all the key files and a brief description of their purpose:
- **`src/vs/[path/to/component]/[filename.ts]`**: [Purpose and main exports]
- **`src/vs/[path/to/component]/[service.ts]`**: [Service implementation details]
- **`src/vs/[path/to/component]/[contribution.ts]`**: [Workbench contributions]

## Development Guidelines

- Reserve a section for any specific development practices or patterns relevant to this component. These will be edited by a developer or agent as needed.

## Learnings

- Reserve a section for learnings that will be added by the agent. This section should be empty initially and only updated when the agent learns something based on separate instructions.
</format>

<instructions>
- **Create** a new overview file if one is not specified: `.github/[component-name].instructions.md`
- **Fill** each section with component-specific details
- **Gather** information from the attached context and use available tools if needed to complete your understanding
- **Ask** the user for clarification if you cannot fill out a section with accurate information
- **Use complete file paths** from repository root (e.g., `src/vs/workbench/services/example/browser/exampleService.ts`)
- **Keep** descriptions concise but comprehensive
- **Use file references** instead of code snippets when making references to code as otherwise the code may become outdated
- **Reserve an empty section** for Learnings to be filled in later by the agent
</instructions>
