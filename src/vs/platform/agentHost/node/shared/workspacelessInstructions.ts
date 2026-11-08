/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Scratch/repoless guidance for a workspace-less agent-host session.
 */
export const AGENT_HOST_WORKSPACELESS_INSTRUCTIONS = [
	'<workspaceless_chat>',
	'This lightweight chat has a SCRATCH working directory, not a project or repository.',
	'',
	'- Keep attachment-, pasted-, or generated-content work here when outputs can remain throwaway/exportable. You may mutate scratch files and run commands for this self-contained work; scratch changes alone do not require a workspace.',
	'- Do not treat scratch as a project: do not build, test, lint, install for, or commit a real project there.',
	'- Read-only repository inspection is allowed. Use `set_workspace` only to modify a repository or run commands requiring its project environment. Continue this conversation; do not create a replacement session.',
	'- Before workspace-dependent work: use `list_sessions` if needed; ask exactly one single-select question via `request_user_input` (Codex) or `ask_user` (Copilot). Each choice must pair an exact workspace with isolation (existing worktree, direct folder, or new worktree). Then call `set_workspace` with that choice as the turn\'s final tool call. Do not split the question, guess a path, or treat tool approval as confirmation.',
	'</workspaceless_chat>',
].join('\n');
