---
name: migrate-customizations
description: Guide a safe, reversible migration of VS Code local agent customizations to locations and formats supported by the selected Agent Host harness such as Copilot, Claude, and Codex.
argument-hint: Migration inventory and harness-reported target folders
user-invocable: true
disable-model-invocation: true
---

# Migrate Agent Customizations

Guide the user through migrating the inventory included in the invoking prompt. The source locations and valid target folders in that prompt were evaluated for the selected harness. Treat them as authoritative: do not substitute hardcoded destination paths or migrate to a folder that is not listed.

Read [migration techniques](./references/migration-techniques.md) before proposing changes.

## Safety Contract

1. Never modify a customization before creating a recovery bundle.
2. Use the recovery bundle folder supplied in the invoking prompt. VS Code created and is watching this folder; do not move it or substitute another location.
3. In the recovery bundle, create:
   - `migration-log.md`, containing the selected harness, scope, timestamps, source and destination paths, commands or tools used, validation results, and every user decision.
   - `backups/`, containing a byte-for-byte copy of every file before its first modification or deletion.
   - `restore.md`, containing exact steps for restoring the backups and reverting newly created files.
   - `migration-results.json`, containing only the privacy-safe aggregate schema described in Finish. VS Code watches this file for the final migration outcome.
4. Append to the log after every attempted operation, including failures and rollbacks.
5. Do not delete original files or clear location settings until the migrated customization has been validated and the user explicitly approves cleanup.
6. Stop on an unexpected source change, destination conflict, invalid configuration, failed backup, or failed validation. Explain the problem instead of guessing.
7. Never include customization names, paths, contents, MCP configuration, or other user data in telemetry.

## Workflow

### 1. Choose Scope

Ask whether to migrate:

- user customizations,
- workspace customizations, or
- both.

Do not act on an unselected scope.

If workspace customizations are selected, ask whether the user wants a pull request. If they do, keep workspace changes focused, include the validation evidence and migration rationale in the pull request, and do not include a recovery bundle stored outside the repository.

### 2. Review the Plan

Group the supplied inventory into this order:

1. prompt files that should become skills;
2. user-data agents and instructions;
3. MCP servers;
4. customizations at custom locations defined by settings `chat.agentSkillsLocations`, `chat.instructionsFilesLocations`, and `chat.agentFilesLocations`

Before each group:

- explain why the migration is useful;
- list the source and harness-reported destination locations;
- describe changes that cannot be preserved;
- ask for confirmation to proceed with that group.

Work one group at a time. Do not request approval for all writes at once.

### 3. Migrate Prompt Files to Skills

Explain that Agent Host harnesses do not load prompt files and that skills preserve reusable workflows across compatible agents. Convert each selected prompt into a skill directory with a `SKILL.md`, preserving supported name, description, argument guidance, and body content. Record unsupported frontmatter in the log for review.

Validate that each skill has valid frontmatter, a meaningful description, and a folder name that matches the skill name. Test representative invocation behavior before offering to remove the original prompt.

### 4. Migrate User Data

Explain that Agent Host doesn't read the VS Code profile user data folder. It only reads the  harness's user folders. Copy selected agents, instructions, and skills to a compatible listed destination without silently changing their contents.

### 5. Migrate MCP Servers

Explain that moving MCP configuration lets the selected Agent Host load the server directly. Review every server separately, including destination conflicts and properties the destination format cannot preserve. Call out that a disabled user server might become enabled after migration.

Write and validate the destination before removing the source entry. Leave unselected or unsupported servers unchanged. Test that migrated servers are discovered and can start before offering source cleanup.

### 6. Customizations at Custom Locations

Agents, skill, and instruction files located in custom locations defined by settings `chat.agentSkillsLocations`, `chat.instructionsFilesLocations`, and `chat.agentFilesLocations` still work when a harness is connected to VS Code. It is better to move these files to standard locations to ensure consistent behavior and easier management.

### 7. Finish

Before the final summary, write `migration-results.json` in the recovery bundle:

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

The total reported for each category, scope, and customization type must not exceed the inventory supplied by VS Code. The result file must never include names, paths, contents, configuration values, error messages, or other user data.

Write the validated JSON to the exact recovery bundle supplied by VS Code. Do not write a result file when no migration telemetry flow was supplied.

If the user stops the workflow, set `cancelled` to `true`, record completed work with its actual outcome, mark the remaining inventory as `skipped`, and still validate and write the result file before the final cancellation summary.

Summarize:

- migrated, skipped, and failed items;
- created, modified, deleted, and retained files;
- validation performed;
- cleanup still pending;
- recovery bundle and restoration instructions;
- pull request URL when one was requested.

Keep the recovery bundle until the user confirms the migrated customizations work.
