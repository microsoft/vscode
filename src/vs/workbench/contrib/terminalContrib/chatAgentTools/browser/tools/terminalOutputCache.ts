/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IToolResultCache, IToolResultCacheHit } from '../../../../chat/common/tools/toolResultCompressor.js';
import { TerminalToolId } from '../../../../chat/common/tools/terminalToolIds.js';
import { parseCommand, segmentHead } from './terminalCommandParser.js';

/**
 * Session-memory dedup cache for `run_in_terminal` output. Keyed on
 * `<cwd>::<command>` (cwd currently best-effort — pulled from the input's
 * `cwd` field when present, falling back to a single shared bucket).
 *
 * Read-only command classes ({@link CacheClass}) define TTLs; only
 * read-only commands are stored. Mutation commands trigger
 * {@link _invalidateSiblings} when observed so a later `git status` won't
 * return a stale entry from before a `git commit`.
 *
 * Designed to live as long as the chat session; entries also age out by TTL.
 */

interface ITerminalInput {
	command?: unknown;
	cwd?: unknown;
}

export const enum CacheClass {
	/** `git status`, `ls`, `pwd` — likely to change quickly. */
	Fast = 'fast',
	/** test runners. */
	Medium = 'medium',
	/** `git log`, `find`, `tree`. */
	Slow = 'slow',
}

const TTL_MS: Record<CacheClass, number> = {
	[CacheClass.Fast]: 30_000,
	[CacheClass.Medium]: 120_000,
	[CacheClass.Slow]: 300_000,
};

const MAX_ENTRIES = 256;

interface IClassification {
	readonly cls: CacheClass | undefined;
	/** Programs whose cached entries should be invalidated when this command runs. */
	readonly invalidates: readonly string[];
}

/** Classify a command's first segment. `cls === undefined` => do not cache. */
function classifyCommand(command: string | undefined): IClassification {
	const parsed = parseCommand(command);
	if (!parsed || parsed.segments.length === 0) {
		return { cls: undefined, invalidates: [] };
	}
	// For compound commands (e.g. `git status && git commit`), disable caching
	// entirely — classifying only the first segment could miss mutations or
	// return stale results.
	if (parsed.segments.length > 1) {
		// Still check all segments for invalidation targets.
		const allInvalidates: string[] = [];
		for (const seg of parsed.segments) {
			const h = segmentHead(seg);
			if (h) {
				const sub = classifySingleHead(h);
				allInvalidates.push(...sub.invalidates);
			}
		}
		return { cls: undefined, invalidates: allInvalidates };
	}
	const head = segmentHead(parsed.segments[0]);
	if (!head) {
		return { cls: undefined, invalidates: [] };
	}
	return classifySingleHead(head);
}

function classifySingleHead(head: { head: string; sub: string | undefined }): IClassification {
	switch (head.head) {
		case 'git': {
			// Mutations clear all cached `git ...` results in this cwd.
			if (head.sub && /^(add|commit|push|pull|fetch|merge|rebase|reset|checkout|switch|restore|cherry-pick|revert|stash|tag|branch|am|apply|clean|rm|mv)$/.test(head.sub)) {
				return { cls: undefined, invalidates: ['git'] };
			}
			if (head.sub === 'status' || head.sub === 'diff' || head.sub === 'show' || head.sub === 'blame') {
				return { cls: CacheClass.Fast, invalidates: [] };
			}
			if (head.sub === 'log' || head.sub === 'reflog' || head.sub === 'shortlog') {
				return { cls: CacheClass.Slow, invalidates: [] };
			}
			return { cls: undefined, invalidates: [] };
		}
		case 'ls':
		case 'pwd':
		case 'tree':
		case 'find':
			return { cls: head.head === 'find' || head.head === 'tree' ? CacheClass.Slow : CacheClass.Fast, invalidates: [] };
		case 'npm':
		case 'pnpm':
		case 'yarn':
			if (head.sub === 'ls' || head.sub === 'list' || head.sub === 'outdated') {
				return { cls: CacheClass.Slow, invalidates: [] };
			}
			if (head.sub === 'install' || head.sub === 'i' || head.sub === 'ci' || head.sub === 'add' || head.sub === 'remove' || head.sub === 'uninstall' || head.sub === 'update') {
				return { cls: undefined, invalidates: ['npm', 'pnpm', 'yarn'] };
			}
			if (head.sub === 'test' || head.sub === 'run' || head.sub === undefined) {
				return { cls: CacheClass.Medium, invalidates: [] };
			}
			return { cls: undefined, invalidates: [] };
		case 'pytest':
		case 'jest':
		case 'vitest':
		case 'cargo':
			if (head.head === 'cargo' && head.sub && /^(test|nextest|check|build)$/.test(head.sub)) {
				return { cls: CacheClass.Medium, invalidates: [] };
			}
			if (head.head !== 'cargo') {
				return { cls: CacheClass.Medium, invalidates: [] };
			}
			return { cls: undefined, invalidates: [] };
		case 'go':
			if (head.sub === 'test' || head.sub === 'build' || head.sub === 'vet') {
				return { cls: CacheClass.Medium, invalidates: [] };
			}
			return { cls: undefined, invalidates: [] };
		case 'docker':
		case 'kubectl':
			if (head.sub === 'ps' || head.sub === 'images' || head.sub === 'get' || head.sub === 'describe') {
				return { cls: CacheClass.Fast, invalidates: [] };
			}
			return { cls: undefined, invalidates: [] };
		case 'env':
		case 'printenv':
			return { cls: CacheClass.Slow, invalidates: [] };
		case 'gh':
			return { cls: CacheClass.Medium, invalidates: [] };
	}
	return { cls: undefined, invalidates: [] };
}

interface ICacheEntry {
	readonly cwd: string;
	readonly command: string;
	readonly text: string;
	readonly timestamp: number;
	readonly cls: CacheClass;
}

function getInput(input: unknown): { command: string; cwd: string } | undefined {
	if (typeof input !== 'object' || input === null) {
		return undefined;
	}
	const i = input as ITerminalInput;
	if (typeof i.command !== 'string' || !i.command.trim()) {
		return undefined;
	}
	const cwd = typeof i.cwd === 'string' ? i.cwd : '';
	return { command: i.command, cwd };
}

export class TerminalOutputCache implements IToolResultCache {
	readonly id = 'terminal.session-dedup';
	readonly toolIds = [TerminalToolId.RunInTerminal];

	private readonly _entries = new Map<string, ICacheEntry>();
	private readonly _now: () => number;

	constructor(now: () => number = () => Date.now()) {
		this._now = now;
	}

	private _key(cwd: string, command: string): string {
		return `${cwd}::${command.trim()}`;
	}

	observe(_toolId: string, input: unknown): void {
		const parsed = getInput(input);
		if (!parsed) {
			return;
		}
		const { invalidates } = classifyCommand(parsed.command);
		if (invalidates.length === 0) {
			return;
		}
		this._invalidateByProgram(parsed.cwd, invalidates);
	}

	lookup(_toolId: string, input: unknown): IToolResultCacheHit | undefined {
		const parsed = getInput(input);
		if (!parsed) {
			return undefined;
		}
		const { cls } = classifyCommand(parsed.command);
		if (cls === undefined) {
			return undefined;
		}
		const key = this._key(parsed.cwd, parsed.command);
		const entry = this._entries.get(key);
		if (!entry) {
			return undefined;
		}
		const ttl = TTL_MS[entry.cls];
		if (this._now() - entry.timestamp > ttl) {
			this._entries.delete(key);
			return undefined;
		}
		return { text: entry.text, timestamp: entry.timestamp };
	}

	record(_toolId: string, input: unknown, text: string): void {
		const parsed = getInput(input);
		if (!parsed) {
			return;
		}
		const { cls } = classifyCommand(parsed.command);
		if (cls === undefined) {
			return;
		}
		const key = this._key(parsed.cwd, parsed.command);
		// LRU-ish: re-insert at the end to bump recency.
		if (this._entries.has(key)) {
			this._entries.delete(key);
		}
		this._entries.set(key, {
			cwd: parsed.cwd,
			command: parsed.command,
			text,
			timestamp: this._now(),
			cls,
		});
		while (this._entries.size > MAX_ENTRIES) {
			const oldestKey = this._entries.keys().next().value;
			if (oldestKey === undefined) {
				break;
			}
			this._entries.delete(oldestKey);
		}
	}

	/** External hook for editor file-write notifications etc. */
	invalidateCwd(cwd: string): void {
		for (const key of [...this._entries.keys()]) {
			const e = this._entries.get(key)!;
			if (e.cwd === cwd) {
				this._entries.delete(key);
			}
		}
	}

	private _invalidateByProgram(cwd: string, programs: readonly string[]): void {
		const progSet = new Set(programs);
		for (const key of [...this._entries.keys()]) {
			const e = this._entries.get(key)!;
			if (e.cwd !== cwd) {
				continue;
			}
			const head = segmentHead(parseCommand(e.command)?.segments[0] ?? { raw: '', tokens: [], rawTokens: [], envPrefixes: [], wrappers: [], trailingSeparator: undefined });
			if (head && progSet.has(head.head)) {
				this._entries.delete(key);
			}
		}
	}
}
