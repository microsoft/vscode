/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Tool, ToolExecutionContext, ToolExecutionResult } from './types';

const MAX_FILE_CHARS = 50_000;
const MAX_DIR_ENTRIES = 1000;
const DEFAULT_MAX_MATCHES = 50;
const MAX_MAX_MATCHES = 200;

function isUnsafePath(relPath: string): boolean {
	if (typeof relPath !== 'string') {
		return true;
	}
	if (relPath.includes('\0')) {
		return true;
	}
	if (relPath.startsWith('/') || relPath.startsWith('\\')) {
		return true;
	}
	const segments = relPath.split(/[/\\]/);
	for (const segment of segments) {
		if (segment === '..') {
			return true;
		}
	}
	return false;
}

function describeError(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export const READ_FILE_TOOL: Tool = {
	definition: {
		name: 'read_file',
		description: 'Read the contents of a workspace-relative file. Use this to inspect specific files the user is asking about.',
		inputSchema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Workspace-relative path, e.g. "src/foo.ts".',
				},
			},
			required: ['path'],
		},
	},
	async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
		const path = input['path'];
		if (typeof path !== 'string' || isUnsafePath(path)) {
			return { content: 'Path rejected: must be a workspace-relative path without traversal.', isError: true };
		}
		try {
			const text = await ctx.readFile(path);
			if (text.length > MAX_FILE_CHARS) {
				const truncated = text.length - MAX_FILE_CHARS;
				return { content: `${text.slice(0, MAX_FILE_CHARS)}\n…(${truncated} more characters truncated)` };
			}
			return { content: text };
		} catch (err) {
			return { content: `Could not read ${path}: ${describeError(err)}`, isError: true };
		}
	},
};

export const LIST_DIRECTORY_TOOL: Tool = {
	definition: {
		name: 'list_directory',
		description: 'List the entries in a workspace-relative directory. Use this to discover the layout of a folder.',
		inputSchema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Workspace-relative directory path; pass "" for the workspace root.',
				},
			},
			required: ['path'],
		},
	},
	async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
		const path = input['path'];
		if (typeof path !== 'string' || isUnsafePath(path)) {
			return { content: 'Path rejected: must be a workspace-relative path without traversal.', isError: true };
		}
		try {
			const entries = await ctx.readDir(path);
			const formatted: string[] = [];
			const limit = Math.min(entries.length, MAX_DIR_ENTRIES);
			for (let i = 0; i < limit; i++) {
				const entry = entries[i];
				formatted.push(entry.isDirectory ? `${entry.name}/` : entry.name);
			}
			if (entries.length > MAX_DIR_ENTRIES) {
				const remaining = entries.length - MAX_DIR_ENTRIES;
				formatted.push(`…(${remaining} more entries truncated)`);
			}
			return { content: formatted.join('\n') };
		} catch (err) {
			return { content: `Could not read ${path}: ${describeError(err)}`, isError: true };
		}
	},
};

export const SEARCH_WORKSPACE_TOOL: Tool = {
	definition: {
		name: 'search_workspace',
		description: 'Find files in the workspace whose contents contain the given text. Returns up to 50 matches with file path, line number, and a preview of the matching line.',
		inputSchema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'Plain-text search string (not regex).',
				},
				maxMatches: {
					type: 'integer',
					description: 'Maximum matches to return (default 50, max 200).',
				},
			},
			required: ['query'],
		},
	},
	async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
		const query = input['query'];
		if (typeof query !== 'string' || query.length === 0) {
			return { content: 'Query cannot be empty.', isError: true };
		}
		const rawMax = input['maxMatches'];
		let max = DEFAULT_MAX_MATCHES;
		if (typeof rawMax === 'number' && Number.isFinite(rawMax)) {
			const candidate = Math.floor(rawMax);
			if (candidate > 0) {
				max = Math.min(candidate, MAX_MAX_MATCHES);
			}
		}
		try {
			const matches = await ctx.searchTextInWorkspace(query, max);
			if (matches.length === 0) {
				return { content: 'No matches found.' };
			}
			const lines = matches.map(m => `${m.relPath}:${m.line}: ${m.preview}`);
			return { content: lines.join('\n') };
		} catch (err) {
			return { content: `Search failed: ${describeError(err)}`, isError: true };
		}
	},
};

export const WRITE_FILE_TOOL: Tool = {
	definition: {
		name: 'write_file',
		description: 'Write or replace the contents of a workspace-relative file. The user is shown a confirmation prompt before each write — they may decline. Use this for code edits, scaffolding files, or saving generated content. Path-traversal is rejected.',
		inputSchema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Workspace-relative path. Must not contain "..", and must not start with "/" or "\\".',
				},
				content: {
					type: 'string',
					description: 'Full text content to write. Replaces any existing file at this path.',
				},
			},
			required: ['path', 'content'],
		},
	},
	async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
		const rawPath = input['path'];
		const rawContent = input['content'];
		const path = typeof rawPath === 'string' ? rawPath : '';
		if (!path) {
			return { content: 'Path is required.', isError: true };
		}
		if (isUnsafePath(path)) {
			return { content: 'Path rejected: must be a workspace-relative path without traversal.', isError: true };
		}
		if (typeof rawContent !== 'string') {
			return { content: 'Content must be a string.', isError: true };
		}
		const content = rawContent;
		try {
			const result = await ctx.writeFile(path, content);
			if (result.written) {
				return { content: `Wrote ${path} (${content.length} bytes).` };
			}
			return { content: `Did not write ${path}: ${result.reason ?? 'declined by user'}.`, isError: true };
		} catch (err) {
			return { content: `Failed to write ${path}: ${describeError(err)}`, isError: true };
		}
	},
};

export const RUN_COMMAND_TOOL: Tool = {
	definition: {
		name: 'run_command',
		description: 'Run a shell command from the workspace root (with user confirmation). Returns stdout, stderr, and exit code. Output is capped at 50KB total. Use for build, test, lint, git, package-manager, or other read-only or idempotent commands. The user is shown a confirmation modal before each run.',
		inputSchema: {
			type: 'object',
			properties: {
				command: { type: 'string', description: 'The executable to run, e.g. "npm", "git", "ls", "cargo".' },
				args: { type: 'array', items: { type: 'string' }, description: 'Arguments to pass to the command, as an array of strings. Each entry is a single argv element. e.g. ["test", "--coverage"].' },
				cwd: { type: 'string', description: 'Optional workspace-relative working directory. Defaults to workspace root. Must not contain ".." or start with "/".' },
				timeoutMs: { type: 'integer', description: 'Optional timeout in milliseconds. Default 30000 (30s). Maximum 120000 (2 min). The command is killed if it exceeds this.' },
			},
			required: ['command'],
		},
	},
	async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
		const command = typeof input['command'] === 'string' ? (input['command'] as string) : '';
		if (!command || !command.trim()) {
			return { content: 'command is required.', isError: true };
		}
		// Reject anything that looks like a shell metacharacter — we run via spawn,
		// not a shell, so semicolons / pipes / redirects in the command name are
		// almost certainly an attempt to break out. Args are passed safely.
		if (/[;&|<>$`\\]/.test(command)) {
			return { content: 'Command contains shell metacharacters; use the args array for parameters.', isError: true };
		}
		const rawArgs = input['args'];
		const args = Array.isArray(rawArgs) ? (rawArgs as ReadonlyArray<unknown>).filter((a): a is string => typeof a === 'string') : [];
		const rawCwd = input['cwd'];
		const cwd = typeof rawCwd === 'string' && rawCwd ? rawCwd : undefined;
		if (cwd && (cwd.includes('..') || cwd.startsWith('/') || cwd.startsWith('\\'))) {
			return { content: 'cwd rejected: must be workspace-relative without traversal.', isError: true };
		}
		const rawTimeout = input['timeoutMs'];
		let timeoutMs = typeof rawTimeout === 'number' && Number.isFinite(rawTimeout) ? rawTimeout : 30_000;
		timeoutMs = Math.max(100, Math.min(timeoutMs, 120_000));

		const result = await ctx.runCommand(command, args, { cwd, timeoutMs });

		if (!result.ran) {
			return { content: `Did not run "${command}": ${result.reason ?? 'declined by user'}.`, isError: true };
		}

		const lines: string[] = [];
		lines.push(`exit code: ${result.exitCode ?? 'unknown'}${result.timedOut ? ' (timed out)' : ''}`);
		const stdout = (result.stdout ?? '').slice(0, 25_000);
		const stderr = (result.stderr ?? '').slice(0, 25_000);
		if (stdout) {
			lines.push('--- stdout ---');
			lines.push(stdout);
		}
		if (stderr) {
			lines.push('--- stderr ---');
			lines.push(stderr);
		}
		const text = lines.join('\n');
		const isError = result.timedOut || (result.exitCode !== undefined && result.exitCode !== 0);
		return { content: text, isError };
	},
};

export const BUILTIN_TOOLS: ReadonlyArray<Tool> = [READ_FILE_TOOL, LIST_DIRECTORY_TOOL, SEARCH_WORKSPACE_TOOL, WRITE_FILE_TOOL, RUN_COMMAND_TOOL];
