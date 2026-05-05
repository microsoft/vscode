/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalToolId } from '../../../../chat/common/tools/terminalToolIds.js';
import { IToolResultCompressor, IToolResultFilter, IToolResultFilterOutput } from '../../../../chat/common/tools/toolResultCompressor.js';

/**
 * Input shape used by the core `run_in_terminal` tool. We only depend on the
 * `command` field; everything else is ignored.
 */
interface ITerminalInput {
	command?: string;
}

/**
 * Returns the "head" of a shell command — the first executable word, after
 * skipping common env-var assignments like `FOO=bar baz`. `sub` is the first
 * non-long-flag token after the head, so `git --no-pager diff` yields
 * `{ head: 'git', sub: 'diff' }`. Returns `undefined` when the command can't
 * be parsed.
 */
export function parseCommandHead(command: string | undefined): { head: string; sub: string | undefined } | undefined {
	if (!command) {
		return undefined;
	}
	// Take only the first pipeline segment so `git diff | cat` still routes to git.
	const firstSegment = command.split(/[|;&]/)[0].trim();
	if (!firstSegment) {
		return undefined;
	}
	const tokens = firstSegment.split(/\s+/).filter(t => !/^[A-Z_][A-Z0-9_]*=/.test(t));
	const head = tokens[0];
	if (!head) {
		return undefined;
	}
	// Skip leading long flags like `--no-pager` so `git --no-pager diff` parses
	// as `{ head: 'git', sub: 'diff' }`. Short flags (`-la`) stay as the sub
	// because for tools like `ls` they're the entire intent.
	let sub: string | undefined;
	for (let i = 1; i < tokens.length; i++) {
		if (tokens[i].startsWith('--')) {
			continue;
		}
		sub = tokens[i];
		break;
	}
	return { head, sub };
}

function isTerminalInput(input: unknown): input is ITerminalInput {
	if (typeof input !== 'object' || input === null) {
		return false;
	}
	const terminalInput = input as { command?: unknown };
	return terminalInput.command === undefined || typeof terminalInput.command === 'string';
}

/**
 * Compresses `git diff` / `git show` output by reducing context lines to a
 * tighter window and dropping the huge no-op chunks that diffs of generated
 * files (lockfiles, snapshots) produce.
 */
export const gitDiffFilter: IToolResultFilter = {
	id: 'terminal.git-diff',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommandHead(input.command);
		return parsed?.head === 'git' && (parsed.sub === 'diff' || parsed.sub === 'show');
	},
	apply(text): IToolResultFilterOutput {
		const lines = text.split('\n');
		const out: string[] = [];
		// Number of context lines to keep at the start of each unchanged run before
		// collapsing the rest into a single "... N omitted ..." marker.
		const KEEP_CONTEXT = 1;
		let contextRun = 0;
		let inBinaryOrLock = false;

		// Pending hunk: we buffer the body so we can rewrite the `@@` header to
		// reflect the line counts we actually emit (otherwise the diff is no
		// longer valid unified-diff syntax and tools/agents that count lines
		// inside a hunk get confused).
		let pendingHunkHeaderIndex = -1;
		let pendingHunkOldStart = 0;
		let pendingHunkNewStart = 0;
		let pendingOldLines = 0;
		let pendingNewLines = 0;

		const HUNK_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

		const flushHunk = () => {
			if (pendingHunkHeaderIndex < 0) {
				return;
			}
			out[pendingHunkHeaderIndex] = `@@ -${pendingHunkOldStart},${pendingOldLines} +${pendingHunkNewStart},${pendingNewLines} @@`;
			pendingHunkHeaderIndex = -1;
		};

		const flushContextRun = () => {
			const omitted = contextRun - KEEP_CONTEXT;
			if (omitted > 0) {
				// Note: this marker is intentionally not valid unified-diff syntax,
				// but the surrounding hunk header counts are kept consistent with
				// the prefixed (' ', '+', '-') lines we actually emit, so a parser
				// that ignores unknown lines still reads correct counts.
				out.push(`... ${omitted} unchanged context line${omitted === 1 ? '' : 's'} omitted ...`);
			}
			contextRun = 0;
		};

		for (const line of lines) {
			if (line.startsWith('diff --git')) {
				flushContextRun();
				flushHunk();
				inBinaryOrLock = /package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb|\.snap$/.test(line);
				if (inBinaryOrLock) {
					out.push(line);
					out.push('... lockfile/snapshot diff omitted ...');
					continue;
				}
				out.push(line);
				continue;
			}
			if (inBinaryOrLock) {
				continue;
			}
			// Drop noisy headers we don't need.
			if (line.startsWith('index ') || line.startsWith('similarity index ') ||
				line.startsWith('dissimilarity index ') || line.startsWith('rename from ') ||
				line.startsWith('rename to ')) {
				continue;
			}
			// Hunk header: start buffering a new hunk so we can rewrite counts on flush.
			const hunkMatch = HUNK_RE.exec(line);
			if (hunkMatch) {
				flushContextRun();
				flushHunk();
				pendingHunkOldStart = parseInt(hunkMatch[1], 10);
				pendingHunkNewStart = parseInt(hunkMatch[3], 10);
				pendingOldLines = 0;
				pendingNewLines = 0;
				pendingHunkHeaderIndex = out.length;
				out.push(line); // placeholder — overwritten by flushHunk()
				continue;
			}
			// File-mode markers and binary notices pass through.
			if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('Binary files ')) {
				flushContextRun();
				flushHunk();
				out.push(line);
				continue;
			}
			// +/- lines: emit verbatim and account for them in the pending hunk.
			if (line.startsWith('+')) {
				flushContextRun();
				out.push(line);
				pendingNewLines++;
				continue;
			}
			if (line.startsWith('-')) {
				flushContextRun();
				out.push(line);
				pendingOldLines++;
				continue;
			}
			// Hunk context lines start with a single space.
			if (!line.startsWith(' ')) {
				flushContextRun();
				out.push(line);
				continue;
			}
			// Unchanged context line: keep the first KEEP_CONTEXT lines of each run,
			// then count the rest so the next non-context line can flush a single
			// summary marker. Only the lines we actually emit count toward the hunk.
			contextRun++;
			if (contextRun <= KEEP_CONTEXT) {
				out.push(line);
				pendingOldLines++;
				pendingNewLines++;
			}
		}
		flushContextRun();
		flushHunk();

		const result = out.join('\n');
		return {
			text: result,
			compressed: result.length < text.length,
		};
	},
};

/**
 * Compresses `ls -l` / `ls -la` output by dropping permission/owner/size
 * columns and keeping only the entry name. Plain `ls` is already terse and
 * passes through.
 */
export const lsFilter: IToolResultFilter = {
	id: 'terminal.ls',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommandHead(input.command);
		if (parsed?.head !== 'ls') {
			return false;
		}
		// Only worth running on long-form listings.
		return /\s-\w*l/.test(input.command ?? '');
	},
	apply(text): IToolResultFilterOutput {
		const lines = text.split('\n');
		const out: string[] = [];
		// `ls -l` line: perms links owner group size date1 date2 date3 name
		const longRe = /^[-dlcbpsDLCBPS][rwx\-tTsS@+.]{9,}\s+\d+\s+\S+\s+\S+\s+\d+\s+\S+\s+\S+\s+\S+\s+(.+)$/;
		for (const line of lines) {
			if (!line.trim()) {
				continue;
			}
			if (line.startsWith('total ')) {
				continue;
			}
			const m = longRe.exec(line);
			if (m) {
				const isDir = line.startsWith('d');
				out.push(isDir ? m[1] + '/' : m[1]);
			} else {
				out.push(line);
			}
		}
		const result = out.join('\n');
		return {
			text: result,
			compressed: result.length < text.length,
		};
	},
};

/**
 * Compresses `npm install` / `yarn` / `pnpm install` output by stripping
 * progress lines and audit summary noise, keeping the package summary plus
 * any error/warning lines.
 */
export const npmInstallFilter: IToolResultFilter = {
	id: 'terminal.npm-install',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommandHead(input.command);
		if (!parsed) {
			return false;
		}
		if (parsed.head === 'npm' && (parsed.sub === 'install' || parsed.sub === 'i' || parsed.sub === 'ci')) {
			return true;
		}
		if ((parsed.head === 'yarn' || parsed.head === 'pnpm') && parsed.sub !== 'test') {
			if (/\binstall\b|\badd\b/.test(input.command ?? '')) {
				return true;
			}
			if (parsed.sub === undefined) {
				return /^\s*(?:[A-Z_][A-Z0-9_]*=\S+\s+)*(?:yarn|pnpm)\s*$/.test(input.command ?? '');
			}
		}
		return false;
	},
	apply(text): IToolResultFilterOutput {
		const lines = text.split('\n');
		const dropPatterns: RegExp[] = [
			/^npm warn deprecated /i,
			/^\s*\[#+>?\s*\] /, // progress bars
			/^npm http /i,
			/^npm timing /i,
			/^npm sill /i,
			/^npm verb /i,
			/^\s*\d+ packages? are looking for funding/i,
			/run `npm fund`/i,
			/^Run `npm audit/i,
		];
		const out: string[] = [];
		for (const line of lines) {
			if (dropPatterns.some(re => re.test(line))) {
				continue;
			}
			out.push(line);
		}
		const result = out.join('\n');
		return {
			text: result,
			compressed: result.length < text.length,
		};
	},
};

export function registerTerminalCompressors(compressor: IToolResultCompressor): void {
	compressor.registerFilter(gitDiffFilter);
	compressor.registerFilter(lsFilter);
	compressor.registerFilter(npmInstallFilter);
}
