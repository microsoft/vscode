---
name: agent-customization
description: '**WORKFLOW SKILL** — Create, update, review, fix, or debug VS Code agent customization files (.instructions.md, .prompt.md, .agent.md, SKILL.md, copilot-instructions.md, AGENTS.md). USE FOR: saving coding preferences; troubleshooting why instructions/skills/agents are ignored or not invoked; configuring applyTo patterns; defining tool restrictions; creating custom agent modes or specialized workflows; packaging domain knowledge; fixing YAML frontmatter syntax. DO NOT USE FOR: general coding questions (use default agent); runtime debugging or error diagnosis; MCP server configuration (use MCP docs directly); VS Code extension development. INVOKES: file system tools (read/write customization files), ask-questions tool (interview user for requirements), subagents for codebase exploration. FOR SINGLE OPERATIONS: For quick YAML frontmatter fixes or creating a single file from a known pattern, edit the file directly — no skill needed.'
---

# Agent Customization

## Decision Flow

| Primitive | When to Use |
|-----------|-------------|
| Workspace Instructions | Always-on, applies everywhere in the project |
| File Instructions | Explicit via `applyTo` patterns, or on-demand via `description` |
| MCP | Integrates external systems, APIs, or data |
| Hooks | Deterministic shell commands at agent lifecycle points (block tools, auto-format, inject context) |
| Custom Agents | Subagents for context isolation, or multi-stage workflows with tool restrictions |
| Prompts | Single focused task with parameterized inputs |
| Skills | On-demand workflow with bundled assets (scripts/templates) |

## Quick Reference

Consult the reference docs for templates, domain examples, advanced frontmatter options, asset organization, anti-patterns, and creation checklists. If the references are not enough, load the official documentation links for each primitive.

| Type | File | Location | Reference |
|------|------|----------|-----------|
| Workspace Instructions | `copilot-instructions.md`, `AGENTS.md` | `.github/` or root | [Link](./references/workspace-instructions.md) |
| File Instructions | `*.instructions.md` | `.github/instructions/` | [Link](./references/instructions.md) |
| Prompts | `*.prompt.md` | `.github/prompts/` | [Link](./references/prompts.md) |
| Hooks | `*.json` | `.github/hooks/` | [Link](./references/hooks.md) |
| Custom Agents | `*.agent.md` | `.github/agents/` | [Link](./references/agents.md) |
| Skills | `SKILL.md` | `.github/skills/<name>/`, `.agents/skills/<name>/`, `.claude/skills/<name>/` | [Link](./references/skills.md) |

**User-level**: `{{VSCODE_USER_PROMPTS_FOLDER}}/` (*.prompt.md, *.instructions.md, *.agent.md; not skills)
Customizations roam with user's settings sync

## Creation Process

If you need to explore or validate patterns in the codebase, use a read-only subagent. If the ask-questions tool is available, use it to interview the user and clarify requirements.

Follow these steps when creating any customization file.

### 1. Determine Scope

Ask the user where they want the customization:
- **Workspace**: For project-specific, team-shared customizations → `.github/` folder
- **User profile**: For personal, cross-workspace customizations → `{{VSCODE_USER_PROMPTS_FOLDER}}/`

### 2. Choose the Right Primitive

Use the Decision Flow above to select the appropriate file type based on the user's need.

### 3. Create the File

Create the file directly at the appropriate path:
- Use the location tables in each reference file
- Include required frontmatter as needed
- Add the body content following the templates

### 4. Validate

After creating:
- Confirm the file is in the correct location
- Verify frontmatter syntax (YAML between `---` markers)
- Check that `description` is present and meaningful

## Edge Cases

**Instructions vs Skill?** Does this apply to *most* work, or *specific* tasks? Most → Instructions. Specific → Skill.

**Skill vs Prompt?** Both appear as slash commands in chat (type `/`). Multi-step workflow with bundled assets → Skill. Single focused task with inputs → Prompt.

**Skill vs Custom Agent?** Same capabilities for all steps → Skill. Need context isolation (subagent returns single output) or different tool restrictions per stage → Custom Agent.

**Hooks vs Instructions?** Instructions *guide* agent behavior (non-deterministic). Hooks *enforce* behavior via shell commands at lifecycle events like `PreToolUse` or `PostToolUse` — they can block operations, require approval, or run formatters deterministically. See [hooks reference](./references/hooks.md).

## Common Pitfalls

**Description is the discovery surface.** The `description` field is how the agent decides whether to load a skill, instruction, or agent. If trigger phrases aren't IN the description, the agent won't find it. Use the "Use when..." pattern with specific keywords.

**YAML frontmatter silent failures.** Unescaped colons in values, tabs instead of spaces, `name` that doesn't match folder name — all cause silent failures with no error message. Always quote descriptions that contain colons: `description: "Use when: doing X"`.

**`applyTo: "**"` burns context.** This means "always included for every file request" — it loads the instruction into the context window on every interaction, even when irrelevant. Use specific globs (`**/*.py`, `src/api/**`) unless the instruction truly applies to all files.
