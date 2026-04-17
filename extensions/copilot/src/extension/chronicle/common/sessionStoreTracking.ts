/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Helpers for extracting file paths and refs from tool calls.
 */

/** Tools whose arguments contain a file path being modified. */
const FILE_TRACKING_TOOLS = new Set(['apply_patch', 'str_replace_editor', 'create_file', 'create']);

/** GitHub MCP server tool prefix. */
const GH_MCP_PREFIX = 'github-mcp-server-';

/**
 * Extract absolute file path from tool arguments if available.
 * Handles both CLI-style (edit/create with `path`) and VS Code-style
 * (apply_patch with `patch`, str_replace_editor with `filePath`, create_file with `filePath`).
 * @internal Exported for testing.
 */
export function extractFilePath(toolName: string, toolArgs: unknown): string | undefined {
	if (!FILE_TRACKING_TOOLS.has(toolName)) { return undefined; }
	if (typeof toolArgs !== 'object' || toolArgs === null) { return undefined; }
	const args = toolArgs as Record<string, unknown>;
	// VS Code tools use 'filePath', CLI tools use 'path'
	const filePath = args.filePath ?? args.path;
	return typeof filePath === 'string' ? filePath : undefined;
}

/**
 * Safely extract a string field from an unknown object.
 */
function getStringField(obj: unknown, field: string): string | undefined {
	if (typeof obj !== 'object' || obj === null) { return undefined; }
	const val = (obj as Record<string, unknown>)[field];
	return typeof val === 'string' ? val : undefined;
}

/**
 * Safely extract a number field from an unknown object.
 */
function getNumberField(obj: unknown, field: string): number | undefined {
	if (typeof obj !== 'object' || obj === null) { return undefined; }
	const val = (obj as Record<string, unknown>)[field];
	return typeof val === 'number' ? val : undefined;
}

/**
 * Extract refs from GitHub MCP server tool calls.
 * These tools use structured args with owner/repo/pullNumber/issue_number/sha etc.
 * @internal Exported for testing.
 */
export function extractRefsFromMcpTool(
	toolName: string,
	toolArgs: unknown,
): Array<{ ref_type: 'pr' | 'issue' | 'commit'; ref_value: string }> {
	const refs: Array<{ ref_type: 'pr' | 'issue' | 'commit'; ref_value: string }> = [];

	// PR tools: pull_request_read, list_pull_requests, search_pull_requests
	if (toolName.includes('pull_request')) {
		const pullNumber = getNumberField(toolArgs, 'pullNumber');
		if (pullNumber) {
			refs.push({ ref_type: 'pr', ref_value: String(pullNumber) });
		}
	}

	// Issue tools: issue_read, list_issues, search_issues
	if (toolName.includes('issue')) {
		const issueNumber = getNumberField(toolArgs, 'issue_number');
		if (issueNumber) {
			refs.push({ ref_type: 'issue', ref_value: String(issueNumber) });
		}
	}

	// Commit tools: get_commit, list_commits
	if (toolName.includes('commit')) {
		const sha = getStringField(toolArgs, 'sha');
		if (sha) {
			refs.push({ ref_type: 'commit', ref_value: sha });
		}
	}

	return refs;
}

/**
 * Detect git/gh commands in terminal tool arguments and extract refs from the result.
 * @internal Exported for testing.
 */
export function extractRefsFromTerminal(
	toolArgs: unknown,
	resultText: string | undefined,
): Array<{ ref_type: 'pr' | 'issue' | 'commit'; ref_value: string }> {
	const command = getStringField(toolArgs, 'command');
	if (!command) { return []; }

	const refs: Array<{ ref_type: 'pr' | 'issue' | 'commit'; ref_value: string }> = [];

	// Detect PR creation/checkout/view/merge — look for PR URL in result
	if (/\bgh\s+pr\s+(create|checkout|view|merge)\b/.test(command) && resultText) {
		const prMatch = resultText.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
		if (prMatch?.[1]) {
			refs.push({ ref_type: 'pr', ref_value: prMatch[1] });
		}
	}

	// Detect issue creation — look for issue URL in result
	if (command.includes('gh issue create') && resultText) {
		const issueMatch = resultText.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/);
		if (issueMatch?.[1]) {
			refs.push({ ref_type: 'issue', ref_value: issueMatch[1] });
		}
	}

	// Detect git commit — extract SHA from "[branch sha]" pattern in output
	if (/\bgit\s+commit\b/.test(command) && resultText) {
		const commitMatch = resultText.match(/\[[\w/.-]+\s+([0-9a-f]{7,40})\]/);
		if (commitMatch?.[1]) {
			refs.push({ ref_type: 'commit', ref_value: commitMatch[1] });
		}
	}

	return refs;
}

/**
 * Extract repository info from GitHub MCP tool args (most tools have owner + repo).
 * @internal Exported for testing.
 */
export function extractRepoFromMcpTool(toolArgs: unknown): string | undefined {
	const owner = getStringField(toolArgs, 'owner');
	const repo = getStringField(toolArgs, 'repo');
	if (owner && repo) { return `${owner}/${repo}`; }
	return undefined;
}

/**
 * Check whether a tool name is a GitHub MCP server tool.
 */
export function isGitHubMcpTool(toolName: string): boolean {
	return toolName.startsWith(GH_MCP_PREFIX);
}
