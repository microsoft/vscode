/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ShellExecutionMetadata, Tool, ToolExecutionContext, ToolExecutionResult, UiBlockMetadata, WriteFileMetadata } from './types';
import { fetchUrlAsText } from '../util/urlFetch';

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
		category: 'read',
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
		category: 'read',
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
		category: 'read',
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
		riskLevel: 'requiresApproval',
		category: 'write',
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
				// Attach structured write metadata so the chat surface can
				// surface a "View diff" button that opens a side-by-side
				// editor against the captured pre-image. The plain `content`
				// string above remains the canonical text representation
				// for LLM consumption — consumers that ignore `metadata`
				// keep working unchanged.
				const metadata: WriteFileMetadata = {
					kind: 'write',
					path,
					existed: result.existed === true,
					preImage: typeof result.preImage === 'string' ? result.preImage : undefined,
					bytesWritten: content.length,
				};
				return { content: `Wrote ${path} (${content.length} bytes).`, metadata };
			}
			return { content: `Did not write ${path}: ${result.reason ?? 'declined by user'}.`, isError: true };
		} catch (err) {
			return { content: `Failed to write ${path}: ${describeError(err)}`, isError: true };
		}
	},
};

/**
 * `edit_file` — surgical find-and-replace edit. Lower fragility than diff
 * parsing and lower payload size than `write_file` for small changes; the
 * agent picks a unique anchor string already present in the file and a
 * replacement, the tool performs the substitution and writes the result.
 *
 * Match semantics:
 *   - The `find` string MUST appear EXACTLY once in the current file
 *     contents. Zero matches → error (model probably has stale context);
 *     two-or-more matches → error (the model picked an ambiguous anchor).
 *   - Whitespace and indentation are matched literally — no fuzzy match.
 *
 * On success the tool returns the same WriteFileMetadata shape as
 * write_file so the chat surface can render the diff button uniformly.
 */
export const EDIT_FILE_TOOL: Tool = {
	definition: {
		name: 'edit_file',
		description: 'Apply a surgical edit to an existing file. Provide an exact `find` string that appears EXACTLY ONCE in the current file, and a `replace` string that takes its place. Use this for small targeted edits — adding an import, fixing a typo, replacing a function body. For larger changes use write_file. The user is shown a confirmation prompt before the edit is applied. The find string must include enough surrounding context to be unique; if it matches zero or more than one location, the tool fails so the model can re-read the file and try again.',
		inputSchema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description: 'Workspace-relative path to the file to edit. The file must already exist; use write_file to create new files.',
				},
				find: {
					type: 'string',
					description: 'Exact substring that appears once in the file. Whitespace, indentation, and newlines are matched literally.',
				},
				replace: {
					type: 'string',
					description: 'Replacement text. Use an empty string to delete the matched region.',
				},
			},
			required: ['path', 'find', 'replace'],
		},
		riskLevel: 'requiresApproval',
		category: 'write',
	},
	async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
		const rawPath = input['path'];
		const path = typeof rawPath === 'string' ? rawPath : '';
		if (!path) {
			return { content: 'Path is required.', isError: true };
		}
		if (isUnsafePath(path)) {
			return { content: 'Path rejected: must be a workspace-relative path without traversal.', isError: true };
		}
		const find = input['find'];
		const replace = input['replace'];
		if (typeof find !== 'string' || typeof replace !== 'string') {
			return { content: '`find` and `replace` must both be strings.', isError: true };
		}
		if (find.length === 0) {
			return { content: '`find` cannot be empty.', isError: true };
		}

		let current: string;
		try {
			current = await ctx.readFile(path);
		} catch (err) {
			return { content: `Could not read ${path}: ${describeError(err)}`, isError: true };
		}

		const firstIndex = current.indexOf(find);
		if (firstIndex === -1) {
			return {
				content: `edit_file: \`find\` string not found in ${path}. Re-read the file before retrying — your view of the contents may be stale.`,
				isError: true,
			};
		}
		const secondIndex = current.indexOf(find, firstIndex + 1);
		if (secondIndex !== -1) {
			return {
				content: `edit_file: \`find\` string is ambiguous — it appears at least twice in ${path} (offsets ${firstIndex} and ${secondIndex}). Provide a longer anchor that includes more surrounding context.`,
				isError: true,
			};
		}

		const next = current.slice(0, firstIndex) + replace + current.slice(firstIndex + find.length);
		try {
			const result = await ctx.writeFile(path, next);
			if (result.written) {
				const metadata: WriteFileMetadata = {
					kind: 'write',
					path,
					existed: result.existed === true,
					preImage: typeof result.preImage === 'string' ? result.preImage : current,
					bytesWritten: next.length,
				};
				const delta = next.length - current.length;
				const deltaSign = delta > 0 ? `+${delta}` : `${delta}`;
				return { content: `Edited ${path} (${deltaSign} bytes).`, metadata };
			}
			return { content: `Did not edit ${path}: ${result.reason ?? 'declined by user'}.`, isError: true };
		} catch (err) {
			return { content: `Failed to write ${path}: ${describeError(err)}`, isError: true };
		}
	},
};

const MAX_GLOB_MATCHES = 500;
const MAX_GLOB_DEPTH = 12;
const GLOB_DEFAULT_IGNORES: ReadonlyArray<string> = [
	'node_modules', '.git', 'dist', 'out', 'build', '.next', '.turbo', '.cache',
	'__pycache__', '.venv', 'venv', 'target', '.gradle', '.idea', '.vscode-test',
];

/**
 * `glob` — fast filename enumeration. Returns paths matching a glob pattern,
 * walking the workspace tree but skipping conventional vendored / build /
 * VCS directories. Pattern syntax is the common subset most agents already
 * know:
 *   - `*` matches any sequence of characters except `/`.
 *   - `**` matches any sequence including `/`.
 *   - `?` matches a single non-slash character.
 *   - `{a,b}` matches either branch.
 *   - `[abc]` matches one of the listed characters.
 *
 * Compared to `search_workspace`, `glob` is much faster for "find all .ts
 * files under src/" queries because it doesn't read file contents — only
 * directory entries. Capped at MAX_GLOB_MATCHES results.
 */
export const GLOB_TOOL: Tool = {
	definition: {
		name: 'glob',
		description: 'List workspace-relative file paths matching a glob pattern. Supports `*`, `**`, `?`, `{a,b}`, and character classes `[abc]`. Conventional ignored directories (node_modules, .git, dist, build, target, etc.) are skipped automatically. Much faster than search_workspace for "find all files matching pattern X" — does not read file contents. Returns at most 500 paths.',
		inputSchema: {
			type: 'object',
			properties: {
				pattern: {
					type: 'string',
					description: 'Glob pattern relative to the workspace root, e.g. "src/**/*.ts" or "test/{unit,integration}/*.{ts,tsx}".',
				},
			},
			required: ['pattern'],
		},
		category: 'read',
	},
	async execute(input: Record<string, unknown>, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
		const rawPattern = input['pattern'];
		if (typeof rawPattern !== 'string' || !rawPattern.trim()) {
			return { content: '`pattern` is required.', isError: true };
		}
		const pattern = rawPattern.trim();
		if (pattern.includes('..')) {
			return { content: 'Glob pattern rejected: contains `..` traversal.', isError: true };
		}
		const matcher = compileGlob(pattern);
		const matches: string[] = [];
		try {
			await walkAndMatch(ctx, '', matcher, matches, 0);
		} catch (err) {
			return { content: `Glob walk failed: ${describeError(err)}`, isError: true };
		}
		matches.sort();
		if (matches.length === 0) {
			return { content: `No files match pattern "${pattern}".` };
		}
		const truncated = matches.length > MAX_GLOB_MATCHES;
		const shown = truncated ? matches.slice(0, MAX_GLOB_MATCHES) : matches;
		const header = truncated
			? `${shown.length} of ${matches.length}+ matches (truncated):`
			: `${shown.length} match${shown.length === 1 ? '' : 'es'}:`;
		return { content: `${header}\n${shown.join('\n')}` };
	},
};

/**
 * Compile a glob pattern to a RegExp. Honours the documented subset:
 *   - `**` → match across path separators (greedy non-back-tracking)
 *   - `*`  → match within a single path segment (no `/`)
 *   - `?`  → match exactly one non-`/` character
 *   - `{a,b,c}` → alternation
 *   - `[abc]` → character class (passes through to regex)
 */
function compileGlob(pattern: string): (relPath: string) => boolean {
	let regex = '^';
	let i = 0;
	while (i < pattern.length) {
		const ch = pattern[i];
		if (ch === '*' && pattern[i + 1] === '*') {
			regex += '.*';
			i += 2;
			if (pattern[i] === '/') {
				i++;
			}
			continue;
		}
		if (ch === '*') {
			regex += '[^/]*';
			i++;
			continue;
		}
		if (ch === '?') {
			regex += '[^/]';
			i++;
			continue;
		}
		if (ch === '{') {
			const close = pattern.indexOf('}', i);
			if (close === -1) {
				regex += '\\{';
				i++;
				continue;
			}
			const branches = pattern.slice(i + 1, close).split(',');
			regex += `(?:${branches.map(b => b.replace(/[.+^$()|\\]/g, '\\$&')).join('|')})`;
			i = close + 1;
			continue;
		}
		if (ch === '[') {
			const close = pattern.indexOf(']', i);
			if (close === -1) {
				regex += '\\[';
				i++;
				continue;
			}
			regex += pattern.slice(i, close + 1);
			i = close + 1;
			continue;
		}
		if (/[.+^$()|\\]/.test(ch)) {
			regex += '\\' + ch;
		} else {
			regex += ch;
		}
		i++;
	}
	regex += '$';
	const re = new RegExp(regex);
	return (relPath: string) => re.test(relPath);
}

async function walkAndMatch(
	ctx: ToolExecutionContext,
	relDir: string,
	matcher: (path: string) => boolean,
	matches: string[],
	depth: number,
): Promise<void> {
	if (matches.length >= MAX_GLOB_MATCHES) {
		return;
	}
	if (depth > MAX_GLOB_DEPTH) {
		return;
	}
	let entries: ReadonlyArray<{ name: string; isDirectory: boolean }>;
	try {
		entries = await ctx.readDir(relDir);
	} catch {
		return;
	}
	for (const entry of entries) {
		if (matches.length >= MAX_GLOB_MATCHES) {
			return;
		}
		if (GLOB_DEFAULT_IGNORES.includes(entry.name)) {
			continue;
		}
		const childPath = relDir ? `${relDir}/${entry.name}` : entry.name;
		if (entry.isDirectory) {
			await walkAndMatch(ctx, childPath, matcher, matches, depth + 1);
		} else if (matcher(childPath)) {
			matches.push(childPath);
		}
	}
}

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
		riskLevel: 'requiresApproval',
		category: 'shell',
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

		// Attach structured shell metadata so the chat surface can render the
		// output as a Cline-style terminal block. The plain `content` string
		// above stays the canonical text representation for LLM consumption.
		const metadata: ShellExecutionMetadata = {
			kind: 'shell',
			command,
			args,
			cwd,
			exitCode: result.exitCode,
			stdout,
			stderr,
			cancelled: result.timedOut === true,
		};
		return { content: text, isError, metadata };
	},
};

export const URL_FETCH_TOOL: Tool = {
	definition: {
		name: 'fetch_url',
		description: 'Fetch the contents of an HTTP/HTTPS URL as plain text. HTML tags, scripts, and styles are stripped. Useful when the user asks the agent to read documentation, an article, or a public web page. Output is capped at 64KB; non-2xx responses are reported as errors.',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string', description: 'Absolute http(s) URL to fetch.' },
			},
			required: ['url'],
		},
		riskLevel: 'safe',
		category: 'read',
	},
	async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
		const url = typeof input['url'] === 'string' ? (input['url'] as string) : '';
		const result = await fetchUrlAsText(url);
		if (!result.ok) {
			return { content: `Fetch failed: ${result.error ?? 'unknown error'}`, isError: true };
		}
		return { content: result.text ?? '', isError: false };
	},
};

/**
 * Set of generative-UI components recognised by `emit_ui_block`. Mirrors the
 * webview-side renderer registry; adding a renderer requires extending this
 * set so the tool's input schema reflects the available components.
 */
export const UI_BLOCK_COMPONENTS = ['card', 'form', 'confirm', 'table', 'chart', 'progress'] as const;
export type UiBlockComponent = typeof UI_BLOCK_COMPONENTS[number];

function generateUiBlockId(): string {
	const rand = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
	return `block-${rand}`;
}

/**
 * `emit_ui_block` — generative-UI primitive. The LLM calls this like any
 * other tool to render an interactive block (card, form, confirmation,
 * table, chart, progress) inline in the assistant message. The chat
 * surface intercepts the resulting `metadata.kind === 'ui-block'`
 * payload, posts a `uiBlock` message to the webview, and bypasses the
 * usual generic tool-result card rendering. The text `content` is a
 * concise human summary kept for transcripts and CLI surfaces that
 * don't render rich UI.
 */
export const EMIT_UI_BLOCK_TOOL: Tool = {
	definition: {
		name: 'emit_ui_block',
		description: 'Render an interactive UI block inline in the chat. Use for cards, forms, confirmation prompts, tables, charts, and progress bars. Use `form` or `confirm` to ask the user a question and wait for their answer (the answer is forwarded back as a synthetic user turn).',
		inputSchema: {
			type: 'object',
			properties: {
				component: {
					type: 'string',
					description: 'Which UI block to render. One of: card, form, confirm, table, chart, progress.',
					enum: UI_BLOCK_COMPONENTS as ReadonlyArray<string>,
				},
				props: {
					type: 'object',
					description: 'Component-specific props. See docs/generative-ui.md for the per-component shape.',
				},
			},
			required: ['component', 'props'],
		},
		riskLevel: 'safe',
		category: 'read',
	},
	async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
		const rawComponent = input['component'];
		if (typeof rawComponent !== 'string' || !(UI_BLOCK_COMPONENTS as ReadonlyArray<string>).includes(rawComponent)) {
			return {
				content: `Unknown UI component "${String(rawComponent)}". Supported: ${UI_BLOCK_COMPONENTS.join(', ')}.`,
				isError: true,
			};
		}
		const rawProps = input['props'];
		if (rawProps === null || typeof rawProps !== 'object' || Array.isArray(rawProps)) {
			return { content: 'props must be an object.', isError: true };
		}
		const props = rawProps as Record<string, unknown>;
		const blockId = generateUiBlockId();
		const metadata: UiBlockMetadata = {
			kind: 'ui-block',
			component: rawComponent,
			props,
			blockId,
		};
		return {
			content: `Rendered ${rawComponent} block (${blockId}).`,
			metadata,
		};
	},
};

export const BUILTIN_TOOLS: ReadonlyArray<Tool> = [
	READ_FILE_TOOL,
	LIST_DIRECTORY_TOOL,
	SEARCH_WORKSPACE_TOOL,
	GLOB_TOOL,
	WRITE_FILE_TOOL,
	EDIT_FILE_TOOL,
	RUN_COMMAND_TOOL,
	URL_FETCH_TOOL,
	EMIT_UI_BLOCK_TOOL,
];
