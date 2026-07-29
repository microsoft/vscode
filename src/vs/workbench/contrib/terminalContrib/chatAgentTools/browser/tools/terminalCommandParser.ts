/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Lightweight POSIX-ish command line tokenizer / segmenter used by the
 * `run_in_terminal` output-compression filters. We deliberately do NOT
 * implement a real shell parser — we only need enough to:
 *
 *   1. Split a pipeline / `&&` / `||` / `;` chain into segments,
 *   2. Tokenize each segment into argv-style words while respecting single
 *      quotes, double quotes, and backslash escapes,
 *   3. Strip leading `FOO=bar` env assignments and common wrapper programs
 *      (`sudo`, `time`, `nice`, `env`, `xargs`, `stdbuf`) so the filter
 *      registry can see the "real" program being invoked.
 *
 * Heredocs, command substitution, brace expansion, glob expansion, and
 * arithmetic are intentionally out of scope.
 */

/** Programs that "wrap" the actual program we want to identify. */
const WRAPPER_PROGRAMS = new Set([
	'sudo', 'doas', 'time', 'command', 'builtin', 'exec',
	'nice', 'ionice', 'nohup', 'env', 'xargs', 'stdbuf',
	'unbuffer', 'script', 'timeout',
]);

const ENV_ASSIGN_RE = /^[A-Za-z_][A-Za-z0-9_]*=.*$/;

/**
 * Tokenize a single command segment (no `|`, `&&`, `||`, `;`) into argv-style
 * words. Respects single quotes (no escaping), double quotes (with `\\`,
 * `\"`, `\$`, `\`` escapes), and backslash-escapes outside of quotes.
 *
 * Returns `[]` for empty input. Never throws on malformed input — unterminated
 * quotes are treated as if they ran to end of string.
 */
export function tokenize(segment: string): string[] {
	const tokens: string[] = [];
	let cur = '';
	let inSingle = false;
	let inDouble = false;
	let hasContent = false;
	for (let i = 0; i < segment.length; i++) {
		const ch = segment[i];
		if (inSingle) {
			if (ch === '\'') {
				inSingle = false;
			} else {
				cur += ch;
			}
			continue;
		}
		if (inDouble) {
			if (ch === '\\' && i + 1 < segment.length) {
				const next = segment[i + 1];
				// Inside double quotes, only \, ", $, ` are escaped.
				if (next === '\\' || next === '"' || next === '$' || next === '`') {
					cur += next;
					i++;
					continue;
				}
				cur += ch;
				continue;
			}
			if (ch === '"') {
				inDouble = false;
			} else {
				cur += ch;
			}
			continue;
		}
		if (ch === '\\' && i + 1 < segment.length) {
			cur += segment[i + 1];
			i++;
			hasContent = true;
			continue;
		}
		if (ch === '\'') {
			inSingle = true;
			hasContent = true;
			continue;
		}
		if (ch === '"') {
			inDouble = true;
			hasContent = true;
			continue;
		}
		if (/\s/.test(ch)) {
			if (cur.length > 0 || hasContent) {
				tokens.push(cur);
				cur = '';
				hasContent = false;
			}
			continue;
		}
		cur += ch;
		hasContent = true;
	}
	if (cur.length > 0 || hasContent) {
		tokens.push(cur);
	}
	return tokens;
}

export type SegmentSeparator = '|' | '&&' | '||' | ';' | '|&';

export interface ICommandSegment {
	readonly raw: string;
	/** Argv-style tokens after stripping env prefixes / wrappers. */
	readonly tokens: readonly string[];
	/** Argv as written, before stripping env prefixes / wrappers. */
	readonly rawTokens: readonly string[];
	/** Env assignments stripped from the head, in source order. */
	readonly envPrefixes: readonly string[];
	/** Wrapper programs stripped from the head, in source order. */
	readonly wrappers: readonly string[];
	/** Separator that ended this segment, or `undefined` for the last segment. */
	readonly trailingSeparator: SegmentSeparator | undefined;
}

export interface IParsedCommand {
	readonly raw: string;
	readonly segments: readonly ICommandSegment[];
}

/**
 * Split a command line into segments using `|`, `||`, `&&`, `;`, `|&` as
 * separators. Honors quoting so that `echo "a;b" | wc -l` splits into two
 * segments, not three.
 */
function splitSegments(command: string): Array<{ raw: string; sep: SegmentSeparator | undefined }> {
	const out: Array<{ raw: string; sep: SegmentSeparator | undefined }> = [];
	let cur = '';
	let inSingle = false;
	let inDouble = false;
	const push = (sep: SegmentSeparator | undefined) => {
		const trimmed = cur.trim();
		if (trimmed.length > 0 || sep !== undefined) {
			out.push({ raw: trimmed, sep });
		}
		cur = '';
	};
	for (let i = 0; i < command.length; i++) {
		const ch = command[i];
		if (inSingle) {
			cur += ch;
			if (ch === '\'') {
				inSingle = false;
			}
			continue;
		}
		if (inDouble) {
			if (ch === '\\' && i + 1 < command.length) {
				cur += ch + command[i + 1];
				i++;
				continue;
			}
			cur += ch;
			if (ch === '"') {
				inDouble = false;
			}
			continue;
		}
		if (ch === '\\' && i + 1 < command.length) {
			cur += ch + command[i + 1];
			i++;
			continue;
		}
		if (ch === '\'') {
			inSingle = true;
			cur += ch;
			continue;
		}
		if (ch === '"') {
			inDouble = true;
			cur += ch;
			continue;
		}
		if (ch === '|' && command[i + 1] === '|') {
			push('||');
			i++;
			continue;
		}
		if (ch === '|' && command[i + 1] === '&') {
			push('|&');
			i++;
			continue;
		}
		if (ch === '|') {
			push('|');
			continue;
		}
		if (ch === '&' && command[i + 1] === '&') {
			push('&&');
			i++;
			continue;
		}
		if (ch === ';') {
			push(';');
			continue;
		}
		cur += ch;
	}
	push(undefined);
	return out;
}

/**
 * Strip leading env assignments and wrapper programs from a token list. For
 * wrappers that take a value flag (e.g. `env -i FOO=bar prog`, `timeout 10 prog`)
 * we conservatively consume `--`-terminated flag arguments but keep moving the
 * head pointer until we hit a non-flag, non-env, non-wrapper token.
 */
function stripPrefixesAndWrappers(rawTokens: readonly string[]): {
	tokens: string[];
	envPrefixes: string[];
	wrappers: string[];
} {
	const envPrefixes: string[] = [];
	const wrappers: string[] = [];
	let i = 0;
	// Leading env assignments.
	while (i < rawTokens.length && ENV_ASSIGN_RE.test(rawTokens[i])) {
		envPrefixes.push(rawTokens[i]);
		i++;
	}
	// Wrapper programs. Walk until we either run out of tokens or hit a token
	// that doesn't look like a wrapper or a flag for one.
	while (i < rawTokens.length) {
		const tok = rawTokens[i];
		if (WRAPPER_PROGRAMS.has(tok)) {
			wrappers.push(tok);
			i++;
			// Skip flags that belong to the wrapper, plus inner env assignments
			// (e.g. `env -i PATH=/usr/bin prog`).
			while (i < rawTokens.length) {
				const next = rawTokens[i];
				if (next === '--') {
					i++;
					break;
				}
				if (next.startsWith('-')) {
					i++;
					continue;
				}
				if (ENV_ASSIGN_RE.test(next)) {
					envPrefixes.push(next);
					i++;
					continue;
				}
				// `timeout` and `nice` take a numeric / signal value before the
				// program; consume one such token if present.
				if ((tok === 'timeout' || tok === 'nice' || tok === 'ionice') && /^\d/.test(next)) {
					i++;
					continue;
				}
				break;
			}
			continue;
		}
		break;
	}
	return {
		tokens: rawTokens.slice(i),
		envPrefixes,
		wrappers,
	};
}

/**
 * Parse a full command line into segments. Each segment carries both the raw
 * tokens and the "effective" tokens (with env / wrapper prefixes stripped).
 */
export function parseCommand(command: string | undefined): IParsedCommand | undefined {
	if (!command) {
		return undefined;
	}
	const trimmed = command.trim();
	if (!trimmed) {
		return undefined;
	}
	const rawSegments = splitSegments(trimmed);
	if (rawSegments.length === 0) {
		return undefined;
	}
	const segments: ICommandSegment[] = rawSegments.map(seg => {
		const rawTokens = tokenize(seg.raw);
		const { tokens, envPrefixes, wrappers } = stripPrefixesAndWrappers(rawTokens);
		return {
			raw: seg.raw,
			rawTokens,
			tokens,
			envPrefixes,
			wrappers,
			trailingSeparator: seg.sep,
		};
	});
	return { raw: trimmed, segments };
}

/**
 * Returns the head program (after stripping env / wrappers) and the first
 * subcommand-like token. Long flags (`--no-pager`) are skipped between head
 * and sub. Returns `undefined` when the segment has no tokens.
 */
export function segmentHead(segment: ICommandSegment): { head: string; sub: string | undefined } | undefined {
	const tokens = segment.tokens;
	if (tokens.length === 0) {
		return undefined;
	}
	const head = tokens[0];
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

/** Convenience: parse + return head of first segment. */
export function parseCommandHead(command: string | undefined): { head: string; sub: string | undefined } | undefined {
	const parsed = parseCommand(command);
	if (!parsed || parsed.segments.length === 0) {
		return undefined;
	}
	return segmentHead(parsed.segments[0]);
}

/**
 * Does the segment's flag set contain any of `flags`? Recognizes both
 * short-bundled flags (`-la` contains `l` and `a`) and long flags.
 */
export function segmentHasFlag(segment: ICommandSegment, flags: readonly string[]): boolean {
	const longFlags = flags.filter(f => f.length > 1).map(f => `--${f}`);
	const shortFlags = flags.filter(f => f.length === 1);
	for (const tok of segment.tokens) {
		if (!tok.startsWith('-') || tok === '--') {
			continue;
		}
		if (tok.startsWith('--')) {
			const name = tok.slice(2).split('=')[0];
			if (longFlags.includes(`--${name}`)) {
				return true;
			}
			continue;
		}
		// Short-bundled.
		const bundled = tok.slice(1);
		for (const f of shortFlags) {
			if (bundled.includes(f)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Iterate over every segment in the parsed command. Useful for filters that
 * want to act on any segment of a pipeline (e.g. `cat foo.txt | grep bar`
 * — the `cat` filter wants to fire on the first segment).
 */
export function findSegments(
	parsed: IParsedCommand,
	predicate: (head: { head: string; sub: string | undefined }, segment: ICommandSegment) => boolean,
): ICommandSegment[] {
	const out: ICommandSegment[] = [];
	for (const seg of parsed.segments) {
		const head = segmentHead(seg);
		if (!head) {
			continue;
		}
		if (predicate(head, seg)) {
			out.push(seg);
		}
	}
	return out;
}
