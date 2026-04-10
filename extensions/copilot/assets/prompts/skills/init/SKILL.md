---
name: init
description: Generate or update chat customization files for AI coding agents
argument-hint: Optionally specify a focus area or pattern to document for agents
disable-model-invocation: true
---

The purpose of this command is to create or update chat customization files
- the agent instructions file (`.github/copilot-instructions.md` or `AGENTS.md`) to help AI coding agents understand the codebase and be immediately productive
- skills and custom agents to automate common tasks or enforce conventions in the codebase

The user can optionally call this command with an argument. The argument can be a specific request for a customization file, or, for new projects, the description of the project. When called with an argument, focus on customizations related to that argument. Only create or modify chat customization files. Never start working on a task in the argument.

When the command is invoked, immediately tell the user that you are now exploring the codebase and work on creating and improving the chat customization files. If the user provided an argument, also mention that you are focusing on that area or pattern. Keep the output brief, and ask for feedback or additional input if needed.

Use the related skill `agent-customization` for detailed information about the different types of customization files.
Explore the codebase to get a good understanding of the project and its conventions, and then create or update the relevant chat customization files to help AI coding agents be productive in this codebase.

When complete, print a table of the added or modified chat customization files, along with a short explanation why this file is useful to the AI coding agents.

## Workflow

1. **Discover existing conventions**
   Search: `**/{.github/copilot-instructions.md,AGENT.md,AGENTS.md,CLAUDE.md,.cursorrules,.windsurfrules,.clinerules,.cursor/rules/**,.windsurf/rules/**,.clinerules/**,README.md}`

2. **Explore the codebase** via subagent, 1-3 in parallel if needed
   Find essential knowledge that helps an AI agent be immediately productive:
   - Build/test commands (agents run these automatically)
   - Architecture decisions and component boundaries
   - Project-specific conventions that differ from common practices
   - Potential pitfalls or common development environment issues
   - Key files/directories that exemplify patterns

   Also inventory existing documentation (`docs/**/*.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, etc.) to identify topics that should be linked, not duplicated.

3. **Generate or merge**
   - New file: Prefer AGENTS.md over `.github/copilot-instructions.md`. If the user already has one of these files, update it instead of creating a new one.
   - Existing file: Preserve valuable content, update outdated sections, remove duplication
   - Follow the guidelines in the `agent-customization` skill: 
      1. **Link, don't embed** principle. Do not copy existing documentation that exists in the workspace, link to them with a Markdown link instead.
      2. **Minimal by default**: Only what's relevant and can not be easely discovered by an agent should be included. Link to other documentation for details.
      3. **Concise and actionable**: Every line should guide behavior

4. **Iterate**
   - Ask for feedback on unclear or incomplete sections
   - If the workspace is complex, suggest creating separate instructions files or skills for specific areas (e.g., frontend, backend, tests)

Once finalized, propose related agent-customizations to create next (`/create-(agent|hook|instruction|prompt|skill) …`), explaining the customization and how it would be used in practice.
