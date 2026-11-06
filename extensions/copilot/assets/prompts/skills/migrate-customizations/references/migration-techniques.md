# Agent Customization Migration Techniques

Use these techniques together with the source inventory and target folders supplied by VS Code. Harness-reported destinations take precedence over examples in general documentation.

## General Technique

- Back up every source before writing.
- Group approval authorizes destination writes only. Preserve each source by default; ask for explicit cleanup approval separately, after destination validation.
- Keep user and workspace scope unchanged unless the user explicitly chooses otherwise.
- Classify each inventory item once by its supplied category and scope. Do not offer a skipped item again in another group unless the user asks to reconsider it.
- In a multi-root workspace, keep each migrated customization in the corresponding workspace root.
- Verify discovery and representative behavior in the destination environment. Remote and Dev Container user folders belong to that environment.
- Migrated and original copies do not synchronize. Remove the original only after validation.
- Separate structural checks (file shape, frontmatter, or valid JSON) from runtime checks in the selected harness. A direct server-process test is useful evidence about that process, but does not prove the harness discovers or loads its configuration. If destination-harness testing is unavailable, report the limitation and keep the source unless the user explicitly chooses otherwise after being informed.

## Prompt Files to Skills

Agent Host harnesses do not load `*.prompt.md` files. Convert a prompt to `<skill-folder>/SKILL.md`.

- Preserve supported `name`, `description`, and argument guidance.
- Preserve invocation semantics. Add `disable-model-invocation: true` when needed to retain an explicit-invocation-only prompt.
- Choose a valid, unique skill folder name.
- Record unsupported prompt frontmatter rather than silently discarding it.
- Keep the prompt body focused as a reusable workflow.
- Validate the skill's frontmatter and invoke it with a representative request.
- Do not treat structural validation as proof of runtime discovery. Test the skill in the selected destination harness when possible; if testing requires a new session, defer it and keep the prompt until the user has been told runtime validation is pending.

## User Data Locations

VS Code profile user data are Local-only. Move agents, instructions, and skills to a destination reported by the selected harness.

- Preserve file type, name, and content unless a compatibility issue requires an explained change.
- Keep workspace files in their originating repository root.
- Explain that harness user folders might not participate in VS Code Settings Sync.
- Treat copying a file, deleting the source, and clearing or changing a location setting as separate decisions. Group migration approval authorizes the copy only.
- `chat.promptFilesLocations` entries are prompt-to-skill migrations, not ordinary location moves.

## MCP Servers

Migrate each MCP server independently.

- Review source and destination JSON before writing.
- Detect duplicate server names and non-equivalent destination entries.
- Explain how every source property and variable will migrate by using the table below.
- A disabled user server might become enabled at the destination; review enablement before starting a session.
- Write and statically validate the destination entry before runtime testing or considering source cleanup.
- Leave unsupported, invalid, conflicting, and unselected servers unchanged.
- Do not remove a source entry solely because an equivalent destination entry already exists. After successful validation, ask separately before removing each migrated or redundant source entry.

| Source configuration | Migration result | What to do |
|----------------------|------------------|------------|
| Standard `command`, `args`, `env`, `url`, and `headers` values | Migrate automatically and add `tools: ["*"]` | Inspect the server's tools. Replace `*` with the specific tools the agent should invoke when access to every server tool is not appropriate. |
| `${workspaceFolder}`, `${workspaceRoot}`, `${workspaceFolderBasename}`, `${workspaceRootFolderName}`, `${cwd}`, or `${pathSeparator}` | Resolve the variable and write its current value | Review the resulting value before sharing the destination file or using it on another machine. |
| `gallery`, `version`, `dev`, or `sandboxEnabled` | Migrate while removing these properties | Explain the removal and decide how to handle updates, development behavior, or sandboxing after migration. |
| `${input:...}`, `${config:...}`, `${command:...}`, or other interactive VS Code variables | Do not migrate automatically | Reconfigure the value for the destination harness. Never copy a resolved secret into the MCP file. |
| `${env:NAME}` | Do not migrate automatically | Use `$NAME`, `${NAME}`, or `${NAME:-default}`, and define the variable in the Agent Host environment. |
| `cwd` | Do not migrate automatically | Add `cwd` manually only when the server requires it, and verify the path on the Agent Host machine. |
| `envFile` | Do not migrate automatically | Export the required variables in the Agent Host environment and reference them from `env`. Never copy secret values into the MCP file. |
| SSE transport | Do not migrate automatically | Use `type: "sse"` only when the server does not support Streamable HTTP. SSE is deprecated. |
| A VS Code `oauth` object | Do not migrate automatically | Remove the nested object to use OAuth discovery, or translate supported client settings to the flat destination OAuth fields. Authenticate when prompted. |
| Environment variables with `null` values | Do not migrate automatically | Remove the entry or provide a supported value. |
| Additional VS Code-specific properties | Do not migrate automatically | Remove or replace the unsupported property before retrying. |
| A different server with the same name in the destination or another workspace root | Stop without changing the source | Rename or remove the conflicting server, and then retry. |

Input variables require manual configuration. VS Code can prompt for values such as API keys through `${input:api-key}`, but the destination MCP format does not use that input flow. Ask the user how the value should be supplied securely in the Agent Host environment.

## Custom Locations

Agents, skill, and instruction files located in custom locations defined by settings `chat.agentSkillsLocations`, `chat.instructionsFilesLocations`, and `chat.agentFilesLocations` can continue to work when the selected harness is connected to VS Code. Moving them to a harness-reported standard location may improve portability or consistency, but is not automatically required for compatibility. Explain the trade-off rather than presenting the move as mandatory.

Handle only items reported under `configuredLocations` and not already handled under another inventory category. Do not re-ask about files the user explicitly skipped. Treat copying/moving a file, deleting its old copy, and clearing or changing the location setting as separate actions requiring separate approval.

## Verification

After each migration group:

1. Confirm the item appears in the Agent Customizations editor for the selected harness.
2. Start a session with that harness and run a representative task.
3. Confirm MCP servers start and expose the expected tools.
4. Review version-control changes for workspace migrations.
5. Report structural validation separately from runtime validation. If the selected harness cannot be exercised in this session, mark runtime validation as pending and keep source files and entries.
6. Only after successful destination validation, ask for explicit approval before removing old files, MCP entries, or settings. Approval to migrate is not approval to clean up.
