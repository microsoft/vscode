---
name: migrate-customizations
description: Guide a safe, reversible migration of VS Code agent customizations when launched from the Agent Customizations Migrations page with VS Code-generated migration context.
argument-hint: Launch from Agent Customizations > Migrations > Migrate with Agent
user-invocable: true
disable-model-invocation: true
---

# Migrate Agent Customizations

Guide the user through migrating the inventory included in the invoking prompt. The source locations and valid target folders in that prompt were evaluated for the selected harness. Treat them as authoritative: do not substitute hardcoded destination paths or migrate to a folder that is not listed.

## Required Migration Context

Before doing anything else, verify that the invoking prompt includes all of the following VS Code-generated values:

- Selected harness
- Migration telemetry flow
- Customizations that need migration
- Valid target folders reported by the selected harness

If any value is missing, do not inspect, copy, move, convert, or delete customizations. Explain that this workflow must be started from **Agent Customizations > Migrations** by selecting **Migrate with Agent**, then stop. Do not ask the user to manually reconstruct or paste the missing context.

Read [migration techniques](./references/migration-techniques.md) before proposing changes.

## Safety Contract

1. VS Code created and verified a private recovery bundle before starting this workflow. Do not search for, inspect, modify, move, or replace its manifest or backups.
2. The recovery bundle restores original sources only. It does not remove or revert destination files created or changed during migration.
3. Call `report_customization_migration` exactly once using the privacy-safe aggregate schema described in Finish. This internal tool is available only in the migration chat and does not require filesystem access.
4. Approval to migrate a group authorizes destination writes only; it does not authorize deleting source files, removing source MCP entries, or clearing location settings. Preserve sources by default. After the destination is validated, ask separately for explicit approval for each kind of cleanup. If runtime validation is not possible, explain what was and was not verified, keep the source, and ask whether to defer cleanup.
5. Stop on an unexpected source change, destination conflict, invalid configuration, or failed validation. Explain the problem instead of guessing.
6. Never include customization names, paths, contents, MCP configuration, or other user data in telemetry.
7. Classify each inventory item exactly once using its supplied category and scope. Do not offer the same item again in another group; if groups overlap, explain the overlap and use the item's inventory category to decide where it is handled.
8. When using `ask_user`, keep the question short and write it as a single sentence so it remains readable in the chat viewer.

## Workflow

### 1. Choose Scope

Ask whether to migrate:

- user customizations,
- workspace customizations, or
- both.

Do not act on an unselected scope.

If workspace customizations are selected, ask whether the user wants a pull request. If they do, keep workspace changes focused, include the validation evidence and migration rationale in the pull request, and do not include a recovery bundle stored outside the repository.

### 2. Review the Plan

Classify the supplied inventory by its reported category and scope, then handle applicable items in this order:

1. prompt files that should become skills;
2. VS Code profile user-data agents, instructions, and skills;
3. MCP servers;
4. workspace or user customizations at locations defined by settings `chat.agentSkillsLocations`, `chat.instructionsFilesLocations`, and `chat.agentFilesLocations`.

The groups are mutually exclusive for an inventory item. In particular, a file reported under `configuredLocations` belongs in group 4, not group 2, even if its type is agent, instruction, or skill. If a previously skipped item would otherwise reappear in a later group, do not ask about it again unless the user requests reconsideration.

Before each group:

- explain why the migration is useful;
- list the source and harness-reported destination locations;
- describe changes that cannot be preserved;
- state explicitly that approval covers destination writes only and that source cleanup will require a separate approval;
- ask for confirmation to proceed with that group.

Work one group at a time. Do not request approval for all writes at once.

### 3. Migrate Prompt Files to Skills

Explain the compatibility reason for converting each prompt to a skill. Convert each selected prompt into a skill directory with a `SKILL.md`, preserving supported name, description, argument guidance, invocation semantics, and body content. Add `disable-model-invocation: true` when needed to preserve an explicit-invocation-only prompt. Report unsupported frontmatter for review; do not silently drop behavior.

Validate that each skill has valid frontmatter, a meaningful description, and a folder name that matches the skill name. Distinguish structural validation from runtime validation: test discovery and representative invocation in the selected destination harness when possible. A file inspection or a test against a different harness is not proof that the destination harness loads the skill. If runtime validation requires a new session or is otherwise unavailable, say so, leave the source in place, and defer cleanup unless the user explicitly chooses otherwise after hearing the limitation.

### 4. Migrate User Data

Explain that Agent Host doesn't read the VS Code profile user data folder. It only reads the harness's user folders. Copy selected agents, instructions, and skills to a compatible listed destination without silently changing their contents.
Keep user-scope items in user scope. Explain that approval to copy does not authorize deleting the VS Code source or changing sync/location settings; ask for those separately after validation.

### 5. Migrate MCP Servers

Explain that moving MCP configuration lets the selected Agent Host load the server directly. Review every server separately, including destination conflicts and properties the destination format cannot preserve. Call out that a disabled user server might become enabled after migration.

Write and statically validate the destination before considering source cleanup. Leave unselected, unsupported, and conflicting servers unchanged. Test that migrated servers are discovered and can start in the selected destination harness; spawning a command directly can verify process behavior, but does not by itself prove that the harness discovers or loads the configuration. If destination-harness testing is unavailable, report that limitation and keep source entries.

Approval for this group authorizes destination writes only. After successful destination validation, ask separately whether to remove each migrated or already-equivalent source entry. Do not remove a source entry merely because its destination entry was written or because the user approved the group.

### 6. Customizations at Custom Locations

Files in custom locations defined by `chat.agentSkillsLocations`, `chat.instructionsFilesLocations`, and `chat.agentFilesLocations` can continue to work when the selected harness is connected to VS Code. Moving them to a harness-reported standard location may improve portability or consistency, but is not automatically required for compatibility. Explain this trade-off before asking whether to migrate.

Handle only items reported as `configuredLocations` and not already handled in another group. Do not re-offer files the user explicitly skipped. Treat moving a file, deleting its old copy, and clearing or changing the location setting as separate actions; obtain explicit approval for each cleanup action after validating the destination.

### 7. Finish

Before the final summary, call `report_customization_migration` with:

```json
{
  "version": 1,
  "migrationFlowId": "<flow from the invoking prompt>",
  "cancelled": false,
  "results": [
    {
      "category": "promptFiles",
      "scope": "workspace",
      "customizationType": "skill",
      "outcome": "migrated",
      "count": 1
    }
  ]
}
```

Aggregate results by:

- category: `promptFiles`, `userData`, `configuredLocations`, or `mcpServers`;
- scope: `user` or `workspace`;
- customization type: `agent`, `instructions`, `skill`, or `mcpServer`;
- outcome: `migrated`, `skipped`, or `failed`.

The total reported for each category, scope, and customization type must not exceed the inventory supplied by VS Code. The tool input must never include names, paths, contents, configuration values, error messages, or other user data.

Do not print this payload in the chat response and do not write it to a file. If the tool call fails, explain the failure and retry once with a corrected payload. Do not claim that VS Code recorded the outcome unless the tool succeeds. Do not call the tool when no migration telemetry flow was supplied.

If the user stops the workflow, set `cancelled` to `true`, record completed work with its actual outcome, mark the remaining inventory as `skipped`, and still call the tool before the final cancellation summary.

Summarize:

- migrated, skipped, and failed items;
- created, modified, deleted, and retained files;
- validation performed;
- cleanup still pending;
- recovery bundle, noting that VS Code can restore original sources but does not revert destination files;
- pull request URL when one was requested.

Keep the recovery bundle until the user confirms the migrated customizations work.

For a requested pull request, verify the final diff contains only approved workspace changes, exclude the recovery bundle, and include the migration rationale and actual validation performed. Do not claim runtime validation when only static checks or direct process tests were possible.
