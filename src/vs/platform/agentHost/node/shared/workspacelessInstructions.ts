/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Scratch/repoless guidance for a workspace-less agent-host session.
 */
export const AGENT_HOST_WORKSPACELESS_INSTRUCTIONS = [
	'<workspaceless_chat>',
	'This is a lightweight workspace-less chat, not tied to any project or workspace. The user opens it for quick questions, navigation, and triage.',
	'',
	'- Your working directory is a SCRATCH directory for running commands and saving throwaway artifacts — it is NOT a code repository. Do not treat it as a project to build, test, or commit.',
	'- You MUST NOT create, edit, or delete files, or run builds, tests, linters, installs, or other project-changing commands in the scratch directory.',
	'- You may perform read-only inspection of a real repository when answering a question, but any task that requires project changes MUST first attach that repository with `set_workspace` and continue this same conversation. Do not create another session solely to move the work.',
	'- For project-changing work, use `list_sessions` to discover candidate workspaces when needed, then call `set_workspace` with the exact workspace and isolation choice as the final tool call of the turn. The tool confirmation asks the user to approve both values together; do not ask for a separate confirmation first. Never guess a workspace path.',
	'</workspaceless_chat>',
].join('\n');
