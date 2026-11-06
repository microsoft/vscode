/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IToolResult } from './languageModelToolsService.js';

export const IToolResultCompressor = createDecorator<IToolResultCompressor>('IToolResultCompressor');

/**
 * Result of running a {@link IToolResultFilter}.
 *
 * `text` is the new text to substitute back into the corresponding text part.
 * `compressed` is `true` if any compression actually happened — used purely
 * for telemetry / accounting.
 */
export interface IToolResultFilterOutput {
	readonly text: string;
	readonly compressed: boolean;
}

/**
 * A pure function that compresses a single text part of a tool result.
 *
 * Implementations MUST never make output worse than the input. If a filter
 * cannot improve a piece of text, it should return the original `text` and
 * `compressed: false`.
 */
export interface IToolResultFilter {
	readonly id: string;
	/** Tool ids this filter applies to. */
	readonly toolIds: readonly string[];
	/**
	 * Decide whether this filter wants to handle the result. May inspect tool
	 * input (e.g. for `run_in_terminal`, the command being run).
	 */
	matches(toolId: string, input: unknown): boolean;
	apply(text: string, input: unknown): IToolResultFilterOutput;
}

/**
 * Result of looking up a tool invocation in an {@link IToolResultCache}.
 */
export interface IToolResultCacheHit {
	/** The cached output content from the previous run. */
	readonly text: string;
	/** Wall-clock timestamp (ms since epoch) of when the cached entry was produced. */
	readonly timestamp: number;
}

/**
 * A read-through / write-through cache for tool results. Used to implement
 * "same as last run" response dedup for read-only, deterministic tool calls.
 *
 * The compressor invokes caches in this order on every `maybeCompress` call:
 *   1. `observe(toolId, input)` — caches may use this hook to invalidate
 *      sibling entries (e.g. a `git commit` clears `git status` / `git diff`).
 *   2. `lookup(toolId, input)` — if any cache returns a hit, the compressor
 *      substitutes the result with a single-line "same output as last run"
 *      reply and emits `cacheHit: true` telemetry.
 *   3. If no hit, after compression the compressor calls `record` so the
 *      cache can store the (possibly compressed) output.
 */
export interface IToolResultCache {
	readonly id: string;
	readonly toolIds: readonly string[];
	observe(toolId: string, input: unknown): void;
	lookup(toolId: string, input: unknown): IToolResultCacheHit | undefined;
	record(toolId: string, input: unknown, text: string): void;
}

export interface IToolResultCompressor {
	readonly _serviceBrand: undefined;
	registerFilter(filter: IToolResultFilter): void;
	registerCache(cache: IToolResultCache): void;
	/**
	 * Returns a possibly-compressed copy of `result`, or `undefined` if no
	 * compression was applied (caller should pass through the original).
	 */
	maybeCompress(toolId: string, input: unknown, result: IToolResult): IToolResult | undefined;
}

/**
 * Heuristically decide whether a text part should be excluded from filter
 * rewriting because it carries structured data the model is likely to parse.
 *
 * Currently detects:
 * - Top-level JSON objects/arrays (parsed to verify)
 * - YAML documents (leading `---` header)
 * - TOML-style documents (leading `[section]` header)
 *
 * Returning `true` means: the registry will NOT pass this text part to any
 * filter, even if the filter says it matches.
 *
 * This is intentionally cheap and conservative — false negatives just mean
 * a filter may decline to compress; false positives could corrupt structured
 * payloads.
 */
export function isProtectedFromCompression(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) {
		return false;
	}
	// Top-level JSON object or array — refuse to touch.
	const first = trimmed[0];
	const last = trimmed[trimmed.length - 1];
	if ((first === '{' && last === '}') || (first === '[' && last === ']')) {
		try {
			JSON.parse(trimmed);
			return true;
		} catch {
			// fall through
		}
	}
	// TOML / YAML-style documents at the top level: a line `---` opener or
	// a file-level table header like `[section]`.
	// These are cheap heuristics — we don't try to parse YAML/TOML.
	if (/^---\s*\n/.test(trimmed) || /^\[[A-Za-z_][A-Za-z0-9_.-]*\]\s*\n/.test(trimmed)) {
		return true;
	}
	return false;
}

/**
 * Outputs below this many characters (UTF-16 code units, i.e.
 * `string.length`) are not worth compressing: filter savings on short
 * outputs rarely outweigh the banner overhead, and skipping them avoids
 * the agent issuing redundant `read_file` / `get_terminal_output` calls
 * to recover content that would have fit uncompressed.
 */
export const MIN_COMPRESSIBLE_LENGTH = 1024;

/**
 * Format the banner that gets prepended to compressed text parts so the
 * model knows compression happened, which filters fired, and how to opt out.
 */
export function formatCompressionBanner(filterIds: readonly string[], beforeChars: number, afterChars: number): string {
	const ids = filterIds.length > 0 ? filterIds.join(', ') : 'unknown';
	return `[Output compressed by ${ids} (${beforeChars} → ${afterChars} chars). To disable, set chat.tools.compressOutput.enabled to false.]`;
}
