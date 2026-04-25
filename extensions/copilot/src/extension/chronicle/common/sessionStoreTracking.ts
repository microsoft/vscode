/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Helpers for extracting file paths and refs from tool calls.
 */

/** Tools whose arguments contain a file path being modified or read. */
const FILE_TRACKING_TOOLS = new Set([
	// VS Code model-facing tool names (from ToolName enum)
	'replace_string_in_file',
	'multi_replace_string_in_file',
	'insert_edit_into_file',
	'create_file',
	'create_directory',
	'edit_notebook_file',
	'apply_patch',
	'read_file',
	'view_image',
	'list_dir',
	// CLI-agent tool names (backward compat)
	'str_replace_editor',
	'create',
]);

/** GitHub MCP server tool prefixes. */
const GH_MCP_PREFIXES = ['mcp_github_', 'github-mcp-server-'];

/**
 * Extract absolute file path from tool arguments if available.
 * Handles both CLI-style (edit/create with `path`) and VS Code-style tools
 * that use `filePath`, as well as `apply_patch` which encodes paths in the patch input.
 * @internal Exported for testing.
 */
export function extractFilePath(toolName: string, toolArgs: unknown): string | undefined {
	if (!FILE_TRACKING_TOOLS.has(toolName)) { return undefined; }
	if (typeof toolArgs !== 'object' || toolArgs === null) { return undefined; }
	const args = toolArgs as Record<string, unknown>;

	// VS Code tools use 'filePath', CLI tools use 'path', list_dir uses 'path',
	// create_directory uses 'dirPath'
	const filePath = args.filePath ?? args.path ?? args.dirPath;
	if (typeof filePath === 'string') { return filePath; }

	// multi_replace_string_in_file stores filePath in each replacement item
	if (toolName === 'multi_replace_string_in_file' && Array.isArray(args.replacements)) {
		const first = args.replacements[0];
		if (typeof first === 'object' && first !== null) {
			const fp = (first as Record<string, unknown>).filePath;
			if (typeof fp === 'string') { return fp; }
		}
	}

	// apply_patch encodes file paths in the patch input text
	if (toolName === 'apply_patch' && typeof args.input === 'string') {
		return extractFirstFileFromPatch(args.input);
	}

	return undefined;
}

/**
 * Extract the first file path from an apply_patch input string.
 * Matches lines like `*** Update File: /path/to/file` or `*** Add File: /path`.
 */
function extractFirstFileFromPatch(input: string): string | undefined {
	const match = input.match(/^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s*(.+)$/m);
	return match?.[1]?.trim();
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
 * Matches both VS Code-style `mcp_github_*` and CLI-style `github-mcp-server-*` prefixes.
 */
export function isGitHubMcpTool(toolName: string): boolean {
	return GH_MCP_PREFIXES.some(prefix => toolName.startsWith(prefix));
}

/** Truncation suffix appended by truncateForOTel. */
const OTEL_TRUNCATION_MARKER = '...[truncated';

/**
 * Extract assistant response text from the gen_ai.output.messages span attribute.
 * Handles both valid JSON and truncated JSON (where truncateForOTel cut the
 * JSON structure mid-string and appended a suffix).
 *
 * Expected format: [{"role":"assistant","parts":[{"type":"text","content":"..."}]}]
 *
 * @internal Exported for testing.
 */
export function extractAssistantResponse(outputMessagesRaw: string | undefined): string | undefined {
	if (!outputMessagesRaw) {
		return undefined;
	}

	// Fast path: try full JSON parse for non-truncated input
	try {
		const messages = JSON.parse(outputMessagesRaw) as { role: string; parts: { type: string; content: string }[] }[];
		const parts = messages
			.filter(m => m.role === 'assistant')
			.flatMap(m => m.parts)
			.filter(p => p.type === 'text')
			.map(p => p.content);
		return parts.length > 0 ? parts.join('\n') : undefined;
	} catch {
		// JSON parse failed — likely truncated by truncateForOTel
	}

	// Fallback: extract text from truncated JSON by matching the serialized
	// assistant text-part prefix, then reading until the truncation marker.
	if (!outputMessagesRaw.includes(OTEL_TRUNCATION_MARKER)) {
		return undefined;
	}
	const assistantTextContentPrefix = '"type":"text","content":"';
	const prefixStart = outputMessagesRaw.indexOf(assistantTextContentPrefix);
	if (prefixStart === -1) {
		return undefined;
	}
	const textStart = prefixStart + assistantTextContentPrefix.length;
	const truncationIdx = outputMessagesRaw.indexOf(OTEL_TRUNCATION_MARKER, textStart);
	if (truncationIdx === -1) {
		return undefined;
	}
	const extracted = outputMessagesRaw.slice(textStart, truncationIdx);
	if (extracted.length === 0) {
		return undefined;
	}
	// The extracted text is JSON-escaped (e.g. \" \n \\). Unescape by wrapping
	// in quotes and parsing as a JSON string value.
	try {
		return JSON.parse(`"${extracted}"`) as string;
	} catch {
		// If unescape fails (e.g. truncation mid-escape), return the raw text
		return extracted;
	}
}
