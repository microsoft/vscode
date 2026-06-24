/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TerminalToolId } from '../../../../chat/common/tools/terminalToolIds.js';
import { IToolResultCompressor, IToolResultFilter, IToolResultFilterOutput } from '../../../../chat/common/tools/toolResultCompressor.js';
import { ICommandSegment, parseCommand, parseCommandHead as _parseCommandHead, segmentHasFlag, segmentHead } from './terminalCommandParser.js';
import { TerminalOutputCache } from './terminalOutputCache.js';

/**
 * Input shape used by the core `run_in_terminal` tool. We only depend on the
 * `command` field; everything else is ignored.
 */
interface ITerminalInput {
	command?: string;
}

function isTerminalInput(input: unknown): input is ITerminalInput {
	if (typeof input !== 'object' || input === null) {
		return false;
	}
	const terminalInput = input as { command?: unknown };
	return terminalInput.command === undefined || typeof terminalInput.command === 'string';
}

/** Backwards-compatible re-export so existing tests/consumers keep working. */
export const parseCommandHead = _parseCommandHead;

/**
 * Build a filter matcher that fires when any segment of the command line
 * has the given `(head, sub)` shape, optionally restricted by a flag
 * predicate. `sub === '*'` matches any subcommand; `sub === null` matches
 * commands with no subcommand.
 */
function makeMatcher(opts: {
	head: string;
	sub?: string | readonly string[] | '*' | null;
	flag?: (seg: ICommandSegment) => boolean;
}) {
	const allowedSubs = opts.sub === '*' || opts.sub === undefined ? undefined
		: opts.sub === null ? null
			: typeof opts.sub === 'string' ? new Set([opts.sub])
				: new Set(opts.sub);
	return (input: unknown): boolean => {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		for (const seg of parsed.segments) {
			const head = segmentHead(seg);
			if (!head || head.head !== opts.head) {
				continue;
			}
			if (allowedSubs === null) {
				if (head.sub !== undefined) {
					continue;
				}
			} else if (allowedSubs !== undefined) {
				if (head.sub === undefined || !allowedSubs.has(head.sub)) {
					continue;
				}
			}
			if (opts.flag && !opts.flag(seg)) {
				continue;
			}
			return true;
		}
		return false;
	};
}

// ---------------------------------------------------------------------------
// VCS
// ---------------------------------------------------------------------------

/**
 * Compresses `git diff` / `git show` output by reducing context lines to a
 * tighter window and dropping the huge no-op chunks that diffs of generated
 * files (lockfiles, snapshots) produce.
 *
 * Notably this does **not** match `git difftool`, which prints a different
 * format and would be corrupted by hunk-header rewriting.
 */
export const gitDiffFilter: IToolResultFilter = {
	id: 'terminal.git-diff',
	toolIds: [TerminalToolId.RunInTerminal],
	matches: (_toolId, input) => makeMatcher({ head: 'git', sub: ['diff', 'show'] })(input),
	apply(text): IToolResultFilterOutput {
		const lines = text.split('\n');
		const out: string[] = [];
		const KEEP_CONTEXT = 1;
		let contextRun = 0;
		let inBinaryOrLock = false;

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
			if (line.startsWith('index ') || line.startsWith('similarity index ') ||
				line.startsWith('dissimilarity index ') || line.startsWith('rename from ') ||
				line.startsWith('rename to ')) {
				continue;
			}
			const hunkMatch = HUNK_RE.exec(line);
			if (hunkMatch) {
				flushContextRun();
				flushHunk();
				pendingHunkOldStart = parseInt(hunkMatch[1], 10);
				pendingHunkNewStart = parseInt(hunkMatch[3], 10);
				pendingOldLines = 0;
				pendingNewLines = 0;
				pendingHunkHeaderIndex = out.length;
				out.push(line);
				continue;
			}
			if (line.startsWith('+++ ') || line.startsWith('--- ') || line.startsWith('Binary files ')) {
				flushContextRun();
				flushHunk();
				out.push(line);
				continue;
			}
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
			if (!line.startsWith(' ')) {
				flushContextRun();
				out.push(line);
				continue;
			}
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
		return { text: result, compressed: result.length < text.length };
	},
};

/** Trim `git log` output: collapse multiple blank-line runs. */
export const gitLogFilter: IToolResultFilter = {
	id: 'terminal.git-log',
	toolIds: [TerminalToolId.RunInTerminal],
	matches: (_toolId, input) => makeMatcher({ head: 'git', sub: ['log', 'reflog', 'shortlog'] })(input),
	apply(text): IToolResultFilterOutput {
		const lines = text.split('\n');
		const out: string[] = [];
		let blankRun = 0;
		for (const line of lines) {
			if (line.trim() === '') {
				blankRun++;
				if (blankRun <= 1) {
					out.push(line);
				}
				continue;
			}
			blankRun = 0;
			out.push(line);
		}
		while (out.length > 0 && out[out.length - 1].trim() === '') {
			out.pop();
		}
		const result = out.join('\n');
		return { text: result, compressed: result.length < text.length };
	},
};

/** Drop the long "(use ... )" hint blocks in `git status`. */
export const gitStatusFilter: IToolResultFilter = {
	id: 'terminal.git-status',
	toolIds: [TerminalToolId.RunInTerminal],
	matches: (_toolId, input) => makeMatcher({ head: 'git', sub: 'status' })(input),
	apply(text): IToolResultFilterOutput {
		const HINT_PATTERNS = [
			/^\s*\(use "git add.*"\s+to.*\)\s*$/,
			/^\s*\(use "git restore.*"\s+to.*\)\s*$/,
			/^\s*\(use "git rm --cached.*"\s+to.*\)\s*$/,
			/^\s*\(use "git push" to publish.*\)\s*$/,
			/^\s*\(commit or discard.*\)\s*$/,
		];
		const lines = text.split('\n');
		const out: string[] = [];
		for (const line of lines) {
			if (HINT_PATTERNS.some(re => re.test(line))) {
				continue;
			}
			out.push(line);
		}
		const result = out.join('\n');
		return { text: result, compressed: result.length < text.length };
	},
};

// ---------------------------------------------------------------------------
// File ops
// ---------------------------------------------------------------------------

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
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		for (const seg of parsed.segments) {
			const head = segmentHead(seg);
			if (head?.head !== 'ls') {
				continue;
			}
			if (segmentHasFlag(seg, ['l'])) {
				return true;
			}
		}
		return false;
	},
	apply(text): IToolResultFilterOutput {
		const lines = text.split('\n');
		const out: string[] = [];
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
		return { text: result, compressed: result.length < text.length };
	},
};

const MAX_LIST_LINES = 200;

function capLines(text: string, max: number, label: string): IToolResultFilterOutput {
	const lines = text.split('\n');
	if (lines.length <= max + 1) {
		return { text, compressed: false };
	}
	const kept = lines.slice(0, max);
	const omitted = lines.length - max;
	kept.push(`... ${omitted} ${label} lines omitted ...`);
	const result = kept.join('\n');
	return { text: result, compressed: result.length < text.length };
}

export const findFilter: IToolResultFilter = {
	id: 'terminal.find',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		return parsed.segments.some(seg => segmentHead(seg)?.head === 'find');
	},
	apply: (text) => capLines(text, MAX_LIST_LINES, 'find result'),
};

export const grepFilter: IToolResultFilter = {
	id: 'terminal.grep',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		return parsed.segments.some(seg => {
			const head = segmentHead(seg);
			return head !== undefined && (head.head === 'grep' || head.head === 'rg' || head.head === 'ack' || head.head === 'ag');
		});
	},
	apply: (text) => capLines(text, MAX_LIST_LINES, 'matching'),
};

export const treeFilter: IToolResultFilter = {
	id: 'terminal.tree',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		return parsed.segments.some(seg => segmentHead(seg)?.head === 'tree');
	},
	apply: (text) => capLines(text, MAX_LIST_LINES, 'tree'),
};

// ---------------------------------------------------------------------------
// Test runners
// ---------------------------------------------------------------------------

function compressTestRunnerOutput(text: string): IToolResultFilterOutput {
	const lines = text.split('\n');
	const dropPatterns: RegExp[] = [
		/^\s*PASS\s+\S+/,
		/^\s*ok\s+\d+\s+/,
		/^\s*\u2713\s/,
		/^\s*[.sSEFx]{10,}\s*$/,
		/^test\s.+ \.\.\. ok\s*$/,
		/^running \d+ tests?$/i,
	];
	const out: string[] = [];
	for (const line of lines) {
		if (dropPatterns.some(re => re.test(line))) {
			continue;
		}
		out.push(line);
	}
	const result = out.join('\n');
	return { text: result, compressed: result.length < text.length };
}

export const testRunnerFilter: IToolResultFilter = {
	id: 'terminal.test-runner',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		for (const seg of parsed.segments) {
			const head = segmentHead(seg);
			if (!head) {
				continue;
			}
			if (head.head === 'pytest' || head.head === 'jest' || head.head === 'vitest' || head.head === 'playwright' || head.head === 'mocha') {
				return true;
			}
			if (head.head === 'cargo' && head.sub && /^(test|nextest)$/.test(head.sub)) {
				return true;
			}
			if (head.head === 'go' && head.sub === 'test') {
				return true;
			}
			if ((head.head === 'npm' || head.head === 'pnpm' || head.head === 'yarn') && head.sub === 'test') {
				return true;
			}
			if (head.head === 'npx' && head.sub && /^(jest|vitest|playwright|mocha)$/.test(head.sub)) {
				return true;
			}
		}
		return false;
	},
	apply: (text) => compressTestRunnerOutput(text),
};

// ---------------------------------------------------------------------------
// Build tools
// ---------------------------------------------------------------------------

function compressBuildOutput(text: string): IToolResultFilterOutput {
	const dropPatterns: RegExp[] = [
		/^\s*Compiling\s+\S+\s+v\S+/,
		/^\s*Downloading\s+\S+/,
		/^\s*Downloaded\s+\S+/,
		/^\s*Updating\s+crates\.io\s+index/,
		/^\s*Finished\s+(dev|release|test)/,
		/^make\[\d+\]: (Entering|Leaving) directory/,
		/^Download(ed|ing) https?:/,
		/^\[INFO\] Downloading from /,
		/^\[INFO\] Downloaded from /,
		/^> Task :/,
	];
	const lines = text.split('\n');
	const out: string[] = [];
	for (const line of lines) {
		if (dropPatterns.some(re => re.test(line))) {
			continue;
		}
		out.push(line);
	}
	const result = out.join('\n');
	return { text: result, compressed: result.length < text.length };
}

export const buildToolFilter: IToolResultFilter = {
	id: 'terminal.build-tool',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		for (const seg of parsed.segments) {
			const head = segmentHead(seg);
			if (!head) {
				continue;
			}
			if (head.head === 'cargo' && head.sub && /^(build|check|clippy)$/.test(head.sub)) {
				return true;
			}
			if (head.head === 'go' && (head.sub === 'build' || head.sub === 'vet')) {
				return true;
			}
			if (head.head === 'make' || head.head === 'tsc' || head.head === 'gradle' || head.head === 'mvn') {
				return true;
			}
			if (head.head === 'dotnet' && head.sub === 'build') {
				return true;
			}
		}
		return false;
	},
	apply: (text) => compressBuildOutput(text),
};

// ---------------------------------------------------------------------------
// Linters
// ---------------------------------------------------------------------------

function compressLinterOutput(text: string): IToolResultFilterOutput {
	const lines = text.split('\n');
	const dropPatterns: RegExp[] = [
		/^\s*Success: no issues found\s*$/i,
		/^\s*All checks passed\.?\s*$/i,
		/^\s*Success:\s*0 errors/i,
	];
	const out: string[] = [];
	for (const line of lines) {
		if (dropPatterns.some(re => re.test(line))) {
			continue;
		}
		out.push(line);
	}
	const result = out.join('\n');
	return { text: result, compressed: result.length < text.length };
}

export const linterFilter: IToolResultFilter = {
	id: 'terminal.linter',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		for (const seg of parsed.segments) {
			const head = segmentHead(seg);
			if (!head) {
				continue;
			}
			if (head.head === 'eslint' || head.head === 'ruff' || head.head === 'mypy' || head.head === 'prettier' || head.head === 'rubocop' || head.head === 'golangci-lint') {
				return true;
			}
			if (head.head === 'cargo' && head.sub === 'clippy') {
				return true;
			}
			if (head.head === 'npx' && head.sub && /^(eslint|prettier|tsc)$/.test(head.sub)) {
				return true;
			}
		}
		return false;
	},
	apply: (text) => compressLinterOutput(text),
};

// ---------------------------------------------------------------------------
// Package managers
// ---------------------------------------------------------------------------

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
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		for (const seg of parsed.segments) {
			const head = segmentHead(seg);
			if (!head) {
				continue;
			}
			if (head.head === 'npm' && head.sub && /^(install|i|ci|add)$/.test(head.sub)) {
				return true;
			}
			if (head.head === 'yarn' || head.head === 'pnpm') {
				if (head.sub === 'install' || head.sub === 'add' || head.sub === 'i') {
					return true;
				}
				if (head.sub === undefined) {
					// Bare `yarn` / `pnpm` is implicit install in the project root.
					return true;
				}
			}
		}
		return false;
	},
	apply(text): IToolResultFilterOutput {
		const lines = text.split('\n');
		const dropPatterns: RegExp[] = [
			/^npm warn deprecated /i,
			/^\s*\[#+>?\s*\] /,
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
		return { text: result, compressed: result.length < text.length };
	},
};

// ---------------------------------------------------------------------------
// Misc utilities
// ---------------------------------------------------------------------------

/** Sort + dedupe `env` / `printenv` output. */
export const envFilter: IToolResultFilter = {
	id: 'terminal.env',
	toolIds: [TerminalToolId.RunInTerminal],
	matches(_toolId, input) {
		if (!isTerminalInput(input)) {
			return false;
		}
		const parsed = parseCommand(input.command);
		if (!parsed) {
			return false;
		}
		// We don't go through makeMatcher() here because `env` is also a
		// wrapper and gets stripped during parsing — only fire when there's
		// nothing else (i.e. `env` is itself the program).
		for (const seg of parsed.segments) {
			const head = segmentHead(seg);
			if (head?.head === 'printenv') {
				return true;
			}
			// After wrapper-stripping, bare `env` survives only when there was
			// no inner program (i.e. the user invoked `env` with no args).
			if (head === undefined && seg.wrappers.length > 0 && seg.wrappers[seg.wrappers.length - 1] === 'env' && seg.tokens.length === 0) {
				return true;
			}
		}
		return false;
	},
	apply(text): IToolResultFilterOutput {
		const lines = text.split('\n').filter(l => l.trim() !== '');
		const unique = Array.from(new Set(lines)).sort();
		const result = unique.join('\n');
		return { text: result, compressed: result.length < text.length };
	},
};

export function registerTerminalCompressors(compressor: IToolResultCompressor): void {
	// VCS
	compressor.registerFilter(gitDiffFilter);
	compressor.registerFilter(gitLogFilter);
	compressor.registerFilter(gitStatusFilter);
	// File ops
	compressor.registerFilter(lsFilter);
	compressor.registerFilter(findFilter);
	compressor.registerFilter(grepFilter);
	compressor.registerFilter(treeFilter);
	// Test / build / lint
	compressor.registerFilter(testRunnerFilter);
	compressor.registerFilter(buildToolFilter);
	compressor.registerFilter(linterFilter);
	// Package managers
	compressor.registerFilter(npmInstallFilter);
	// Misc
	compressor.registerFilter(envFilter);

	compressor.registerCache(new TerminalOutputCache());
}
