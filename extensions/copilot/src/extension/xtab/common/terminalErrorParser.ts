/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { removeAnsiEscapeCodes } from '../../../util/vs/base/common/strings';

/**
 * A single structured error parsed from terminal output.
 */
export interface ParsedTerminalError {
	/** File path as it appears in the tool output (possibly relative to {@link TerminalErrorParserInput.cwd}). */
	readonly file: string;
	/** 1-based line number. */
	readonly line: number;
	/** 1-based column number, when known. */
	readonly column?: number;
	/** Single-line, trimmed diagnostic message. */
	readonly message: string;
	/** Identifier of the parser that produced this entry (e.g. `tsc`, `eslint`). */
	readonly source: TerminalErrorSource;
}

export type TerminalErrorSource = 'tsc' | 'eslint' | 'python' | 'pytest' | 'gcc' | 'node' | 'rust' | 'go';

export interface TerminalErrorParserInput {
	readonly commandLine: string | undefined;
	readonly output: string;
	readonly cwd?: string;
}

/**
 * Maximum number of errors returned by {@link parseTerminalErrors}. Caps the
 * prompt budget impact of noisy linters.
 */
export const MAX_PARSED_TERMINAL_ERRORS = 5;

/**
 * Parse the terminal output produced by a failed command into structured errors.
 *
 * The parser is regex-based and does not validate that the referenced files
 * exist — that filtering is the caller's responsibility (it requires workspace
 * knowledge).
 */
export function parseTerminalErrors(input: TerminalErrorParserInput): ParsedTerminalError[] {
	const stripped = removeAnsiEscapeCodes(input.output);
	const owners = PARSERS.filter(p => p.claim(input.commandLine));
	const candidates = owners.length > 0 ? owners : PARSERS;

	const results: ParsedTerminalError[] = [];
	const seen = new Set<string>();
	for (const parser of candidates) {
		for (const raw of parser.parse(stripped)) {
			const key = `${raw.file}:${raw.line}:${raw.column ?? 0}`;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			results.push({ ...raw, source: parser.id });
			if (results.length >= MAX_PARSED_TERMINAL_ERRORS) {
				return results;
			}
		}
	}
	return results;
}

interface ErrorParser {
	readonly id: TerminalErrorSource;
	readonly claim: (cmd: string | undefined) => boolean;
	readonly parse: (output: string) => Array<Omit<ParsedTerminalError, 'source'>>;
}

const tscParser: ErrorParser = {
	id: 'tsc',
	claim: cmd => /\btsc(\.cmd|\.js)?\b/i.test(cmd ?? ''),
	parse: output => {
		const results: Array<Omit<ParsedTerminalError, 'source'>> = [];
		// Default pretty=false form: `path(line,col): error TS1234: message`
		const reParen = /^(.+?)\((\d+),(\d+)\):\s+(?:error|warning)\s+TS\d+:\s+(.+)$/gm;
		// Pretty form: `path:line:col - error TS1234: message`
		const reColon = /^(.+?):(\d+):(\d+)\s+-\s+(?:error|warning)\s+TS\d+:\s+(.+)$/gm;
		for (const re of [reParen, reColon]) {
			let m: RegExpExecArray | null;
			while ((m = re.exec(output))) {
				results.push({
					file: m[1].trim(),
					line: Number(m[2]),
					column: Number(m[3]),
					message: m[4].trim(),
				});
			}
		}
		return results;
	},
};

const eslintParser: ErrorParser = {
	id: 'eslint',
	claim: cmd => /\beslint\b/i.test(cmd ?? ''),
	parse: output => {
		// ESLint stylish formatter:
		//   /abs/path/to/file.js
		//     10:5  error  Some message  rule-name
		const results: Array<Omit<ParsedTerminalError, 'source'>> = [];
		const lines = output.split(/\r?\n/);
		let currentFile: string | undefined;
		const fileLineRe = /^(\/|[a-zA-Z]:[\\/]|\.{1,2}[\\/]).+$/; // absolute, drive-letter, or ./ ../
		const diagRe = /^\s+(\d+):(\d+)\s+(?:error|warning)\s+(.+?)(?:\s{2,}[\w-]+)?\s*$/;
		for (const raw of lines) {
			if (fileLineRe.test(raw) && !diagRe.test(raw)) {
				currentFile = raw.trim();
				continue;
			}
			const m = diagRe.exec(raw);
			if (m && currentFile) {
				results.push({
					file: currentFile,
					line: Number(m[1]),
					column: Number(m[2]),
					message: m[3].trim(),
				});
			}
		}
		return results;
	},
};

const pythonParser: ErrorParser = {
	id: 'python',
	claim: cmd => /\bpython3?(\.exe)?\b/i.test(cmd ?? ''),
	parse: output => {
		// Take the last `File "...", line N` frame as the most-immediate one,
		// pair with the final exception line.
		const frameRe = /^\s*File "(.+?)", line (\d+)(?:, in .+)?$/gm;
		const frames: Array<{ file: string; line: number }> = [];
		let m: RegExpExecArray | null;
		while ((m = frameRe.exec(output))) {
			frames.push({ file: m[1], line: Number(m[2]) });
		}
		const last = frames[frames.length - 1];
		if (!last) {
			return [];
		}
		const lines = output.split(/\r?\n/);
		let message = '';
		for (let i = lines.length - 1; i >= 0; i--) {
			const candidate = lines[i].trim();
			// Exception line looks like `ValueError: oops` or `AssertionError`.
			if (/^[A-Z][\w.]*(Error|Exception|Warning)\b/.test(candidate)) {
				message = candidate;
				break;
			}
		}
		return [{ file: last.file, line: last.line, message: message || 'Python exception' }];
	},
};

const pytestParser: ErrorParser = {
	id: 'pytest',
	claim: cmd => /\bpytest\b/i.test(cmd ?? ''),
	parse: output => {
		const results: Array<Omit<ParsedTerminalError, 'source'>> = [];
		// `path/to/test_foo.py:10: AssertionError`
		const re = /^([^\s:][^:\n]*\.py):(\d+):\s*(.+)$/gm;
		let m: RegExpExecArray | null;
		while ((m = re.exec(output))) {
			results.push({
				file: m[1].trim(),
				line: Number(m[2]),
				message: m[3].trim(),
			});
		}
		// Also catch `FAILED path/to/test_foo.py::test_bar - AssertionError: ...`
		const failedRe = /^FAILED\s+([^\s:]+\.py)::[^\s-]+\s+-\s+(.+)$/gm;
		while ((m = failedRe.exec(output))) {
			results.push({
				file: m[1].trim(),
				line: 1,
				message: m[2].trim(),
			});
		}
		return results;
	},
};

const gccParser: ErrorParser = {
	id: 'gcc',
	claim: cmd => /\b(gcc|g\+\+|clang(\+\+)?|cc)\b/i.test(cmd ?? ''),
	parse: output => {
		const results: Array<Omit<ParsedTerminalError, 'source'>> = [];
		// `path:line:col: error: message`  (also `warning:`/`note:`/`fatal error:`)
		const re = /^(.+?):(\d+):(\d+):\s+(?:fatal\s+)?(?:error|warning|note):\s+(.+)$/gm;
		let m: RegExpExecArray | null;
		while ((m = re.exec(output))) {
			results.push({
				file: m[1].trim(),
				line: Number(m[2]),
				column: Number(m[3]),
				message: m[4].trim(),
			});
		}
		return results;
	},
};

const nodeParser: ErrorParser = {
	id: 'node',
	claim: cmd => /\bnode(\.exe)?\b/i.test(cmd ?? ''),
	parse: output => {
		const results: Array<Omit<ParsedTerminalError, 'source'>> = [];
		// `    at fn (/abs/path/file.js:10:5)`  or  `    at /abs/path/file.js:10:5`
		const re = /^\s*at\s+(?:[^()]+\s+\()?([^()\s][^()]*?):(\d+):(\d+)\)?\s*$/gm;
		let m: RegExpExecArray | null;
		while ((m = re.exec(output))) {
			const file = m[1].trim();
			if (file.startsWith('node:') || file.includes('node_modules/')) {
				continue; // skip runtime + dependency frames
			}
			results.push({
				file,
				line: Number(m[2]),
				column: Number(m[3]),
				message: 'Stack frame',
			});
		}
		// Try to find the actual error message line above the first frame.
		if (results.length > 0) {
			const lines = output.split(/\r?\n/);
			for (const raw of lines) {
				const candidate = raw.trim();
				if (/^[A-Z][\w.]*(Error|Exception)\b.*/.test(candidate)) {
					return results.map((r, i) => (i === 0 ? { ...r, message: candidate } : r));
				}
			}
		}
		return results;
	},
};

const rustParser: ErrorParser = {
	id: 'rust',
	claim: cmd => /\b(cargo|rustc)\b/i.test(cmd ?? ''),
	parse: output => {
		const results: Array<Omit<ParsedTerminalError, 'source'>> = [];
		// rustc/cargo:
		//   error[E0425]: cannot find value `foo` in this scope
		//     --> src/main.rs:5:9
		const blockRe = /^error(?:\[[A-Z]\d+\])?:\s+(.+?)\n(?:[^\n]*\n)*?\s+-->\s+(.+?):(\d+):(\d+)/gm;
		let m: RegExpExecArray | null;
		while ((m = blockRe.exec(output))) {
			results.push({
				file: m[2].trim(),
				line: Number(m[3]),
				column: Number(m[4]),
				message: m[1].trim(),
			});
		}
		return results;
	},
};

const goParser: ErrorParser = {
	id: 'go',
	claim: cmd => /\bgo\b/i.test(cmd ?? ''),
	parse: output => {
		const results: Array<Omit<ParsedTerminalError, 'source'>> = [];
		// `./main.go:10:5: undefined: foo`  or  `pkg/foo.go:10: syntax error`
		const re = /^(?:\t)?((?:\.[\\/])?[^\s:][^:\n]*\.go):(\d+)(?::(\d+))?:\s+(.+)$/gm;
		let m: RegExpExecArray | null;
		while ((m = re.exec(output))) {
			const col = m[3] !== undefined ? Number(m[3]) : undefined;
			results.push({
				file: m[1].trim(),
				line: Number(m[2]),
				column: col,
				message: m[4].trim(),
			});
		}
		return results;
	},
};

const PARSERS: readonly ErrorParser[] = [
	tscParser,
	eslintParser,
	pythonParser,
	pytestParser,
	gccParser,
	nodeParser,
	rustParser,
	goParser,
];
