/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool, ToolResultObject } from '@github/copilot-sdk';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { parse } from '../../../../base/common/glob.js';
import { posix } from '../../../../base/common/path.js';
import type { CopilotVirtualSessionFs } from './copilotVirtualSessionFs.js';

interface IVirtualGlobArgs {
	pattern: string;
	paths?: string | string[];
}

interface IVirtualGrepArgs extends IVirtualGlobArgs {
	output_mode?: 'content' | 'files_with_matches' | 'count';
	glob?: string;
	type?: string;
	'-i'?: boolean;
	'-A'?: number;
	'-B'?: number;
	'-C'?: number;
	'-n'?: boolean;
	head_limit?: number;
	multiline?: boolean;
}

const maxResults = 200;
const maxEntries = 10000;
const maxFileSize = 1024 * 1024;
const maxLineLength = 2000;
const pathsSchema = {
	anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
	description: 'Directories or files to search; defaults to the virtual workspace root. Paths may be absolute SDK paths or relative to the workspace root.',
};

/** Replaces disk-only built-ins with bounded searches over the session filesystem, returning SDK-form paths. */
export function createCopilotVirtualSearchTools(fileSystem: CopilotVirtualSessionFs): [grep: Tool<unknown>, glob: Tool<unknown>] {
	const mapper = fileSystem.pathMapper;

	const run = async (operation: () => Promise<string>): Promise<ToolResultObject> => {
		try {
			return { resultType: 'success', textResultForLlm: await operation() };
		} catch (error) {
			const message = getErrorMessage(error);
			return { resultType: 'failure', textResultForLlm: message, error: message };
		}
	};

	const search = async (args: IVirtualGlobArgs, grep: IVirtualGrepArgs | undefined, signal: AbortSignal | undefined): Promise<string> => {
		const inputPaths = typeof args.paths === 'string' ? [args.paths] : args.paths ?? [mapper.rootSdkPath];
		const pending: { path: string; type?: 'file' | 'directory' }[] = inputPaths.map(path => ({ path: mapper.toSdkPath(mapper.toUri(posix.resolve(mapper.rootSdkPath, path))) }));
		const visited = new Set<string>();
		const results: string[] = [];
		// Known limitation: a model-supplied pattern can backtrack catastrophically, and a running
		// match cannot observe cancellation, so it can block the agent host. A non-backtracking
		// matcher or a worker with a timeout would remove this risk.
		const pattern = grep ? new RegExp(grep.pattern, `${grep['-i'] ? 'i' : ''}${grep.multiline ? 'gm' : ''}`) : undefined;
		const include = parse(grep ? grep.glob ?? '**/*' : args.pattern);
		const typeFilter = grep?.type ? parse(typeGlob(grep.type)) : undefined;
		const limit = Math.max(1, Math.min(maxResults, Math.floor(grep?.head_limit ?? maxResults)));
		let entries = 0;
		let truncated = false;

		while (pending.length > 0 && results.length < limit) {
			signal?.throwIfAborted();
			const entry = pending.pop()!;
			const { path } = entry;
			if (visited.has(path)) {
				continue;
			}
			visited.add(path);
			if (++entries > maxEntries) {
				truncated = true;
				break;
			}
			const relative = posix.relative(mapper.rootSdkPath, path);
			if (relative.split('/').some(part => part === '.git' || part === 'node_modules')) {
				continue;
			}
			let type = entry.type;
			if (!type) {
				const stat = await fileSystem.stat(path);
				type = stat.isDirectory ? 'directory' : stat.isFile ? 'file' : undefined;
			}
			signal?.throwIfAborted();
			if (type === 'directory') {
				const children = await fileSystem.readdirWithTypes(path);
				children.sort((a, b) => a.name.localeCompare(b.name));
				for (const child of children.reverse()) {
					if (pending.length + entries >= maxEntries) {
						truncated = true;
						break;
					}
					pending.push({ path: posix.join(path, child.name), type: child.type });
				}
				continue;
			}
			if (type !== 'file' || !(include(relative) || include(posix.basename(path))) || (typeFilter && !typeFilter(posix.basename(path)))) {
				continue;
			}
			if (!grep || !pattern) {
				results.push(path);
				continue;
			}
			if ((await fileSystem.stat(path)).size > maxFileSize) {
				continue;
			}
			const bytes = await fileSystem.readFileBytes(path);
			signal?.throwIfAborted();
			if (bytes.length > maxFileSize || bytes.includes(0)) {
				continue;
			}
			const text = VSBuffer.wrap(bytes).toString();
			const lines = text.split(/\r?\n/);
			const matchingLines = new Set<number>();
			if (grep.multiline) {
				let offset = 0;
				let first = 0;
				for (const match of text.matchAll(pattern)) {
					signal?.throwIfAborted();
					first += text.slice(offset, match.index).split('\n').length - 1;
					const last = first + match[0].split('\n').length - 1;
					for (let line = first; line <= last; line++) {
						matchingLines.add(line);
					}
					offset = match.index + match[0].length;
					first = last;
				}
			} else {
				for (let line = 0; line < lines.length; line++) {
					signal?.throwIfAborted();
					if (pattern.test(lines[line])) {
						matchingLines.add(line);
					}
				}
			}
			if (matchingLines.size === 0) {
				continue;
			}
			switch (grep.output_mode ?? 'files_with_matches') {
				case 'files_with_matches':
					results.push(path);
					break;
				case 'count':
					results.push(`${path}:${matchingLines.size}`);
					break;
				case 'content': {
					const before = contextLines(grep['-B'] ?? grep['-C']);
					const after = contextLines(grep['-A'] ?? grep['-C']);
					const selected = new Set<number>();
					for (const line of matchingLines) {
						for (let context = Math.max(0, line - before); context <= Math.min(lines.length - 1, line + after); context++) {
							selected.add(context);
						}
					}
					for (const line of [...selected].sort((a, b) => a - b)) {
						if (results.length >= limit) {
							truncated = true;
							break;
						}
						results.push(`${path}:${grep['-n'] ? `${line + 1}:` : ''}${lines[line].slice(0, maxLineLength)}`);
					}
					break;
				}
			}
		}
		truncated ||= pending.length > 0;
		return `${results.join('\n') || 'No matches found.'}${truncated ? '\nResults truncated.' : ''}`;
	};

	return [{
		name: 'grep',
		description: 'Search text in virtual workspace files with a JavaScript regular expression. Use for file contents; use glob for file names. Defaults to matching file paths; skips .git, node_modules, binary files and files over 1 MiB. Returns at most 200 results.',
		parameters: {
			type: 'object',
			properties: {
				pattern: { type: 'string', description: 'JavaScript regular expression to match.' },
				paths: pathsSchema,
				output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'] },
				glob: { type: 'string', description: 'Include files matching this glob.' },
				type: { type: 'string', description: 'File type, for example ts, js, py or rust.' },
				'-i': { type: 'boolean', description: 'Case-insensitive search.' },
				'-A': { type: 'number', description: 'Context lines after a match (content mode).' },
				'-B': { type: 'number', description: 'Context lines before a match (content mode).' },
				'-C': { type: 'number', description: 'Context lines around a match (content mode).' },
				'-n': { type: 'boolean', description: 'Include line numbers (content mode).' },
				head_limit: { type: 'number', description: 'Maximum results, capped at 200.' },
				multiline: { type: 'boolean', description: 'Allow matches across lines.' },
			},
			required: ['pattern'],
			additionalProperties: false,
		},
		overridesBuiltInTool: true,
		// Read-only, and paths are confined to the virtual workspace by the SDK path mapper.
		skipPermission: true,
		defer: 'auto',
		handler: (args, invocation) => run(() => search(args as IVirtualGrepArgs, args as IVirtualGrepArgs, invocation.signal)),
	}, {
		name: 'glob',
		description: 'Find virtual workspace files by glob pattern. Use for file names and paths; use grep for contents. Skips .git and node_modules; returns at most 200 paths.',
		parameters: {
			type: 'object',
			properties: { pattern: { type: 'string', description: 'Glob pattern, for example **/*.ts.' }, paths: pathsSchema },
			required: ['pattern'],
			additionalProperties: false,
		},
		overridesBuiltInTool: true,
		// Read-only, and paths are confined to the virtual workspace by the SDK path mapper.
		skipPermission: true,
		defer: 'auto',
		handler: (args, invocation) => run(() => search(args as IVirtualGlobArgs, undefined, invocation.signal)),
	}];
}

function contextLines(value: number | undefined): number {
	return Math.max(0, Math.min(20, Math.floor(value ?? 0)));
}

function typeGlob(type: string): string {
	switch (type) {
		case 'ts':
		case 'tsx': return '*.{ts,tsx}';
		case 'js':
		case 'jsx': return '*.{js,jsx,mjs,cjs}';
		case 'py':
		case 'python': return '*.py';
		case 'rust': return '*.rs';
		case 'go': return '*.go';
		case 'java': return '*.java';
		case 'json': return '*.json';
		case 'yaml': return '*.{yml,yaml}';
		case 'md':
		case 'markdown': return '*.md';
		default: return `*.${type}`;
	}
}
