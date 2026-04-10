/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ParsedClaudeModelId {
	readonly name: string;
	readonly version: string;
	readonly modifiers: string;
	toSdkModelId(): string;
	toEndpointModelId(): string;
}

/**
 * Known model suffixes that are meaningful variants and should be preserved
 * in SDK/endpoint model IDs. Mapped per model family. Date-based suffixes
 * (e.g. 20251101) are intentionally excluded — they are build identifiers
 * that should not appear in the normalized output.
 */
const VALID_SUFFIXES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
	['opus', new Set(['1m'])],
]);

const cache = new Map<string, ParsedClaudeModelId | undefined>();

/**
 * Parses a Claude model ID string (SDK or endpoint format) into its components.
 * Throws if the model ID is unparseable or not a Claude ID.
 *
 * Use {@link tryParseClaudeModelId} when the input may not be a valid Claude model ID
 * (e.g. model IDs from disk or external sources).
 */
export function parseClaudeModelId(modelId: string): ParsedClaudeModelId {
	const result = tryParseClaudeModelId(modelId);
	if (!result) {
		throw new Error(`Unable to parse Claude model ID: '${modelId}'`);
	}
	return result;
}

/**
 * Attempts to parse a Claude model ID string (SDK or endpoint format) into its components.
 *
 * Accepts either format:
 * - SDK: `claude-opus-4-5-20251101`, `claude-3-5-sonnet-20241022`, `claude-sonnet-4-20250514`
 * - Endpoint: `claude-opus-4.5`, `claude-sonnet-4`, `claude-haiku-3.5`
 *
 * Returns `undefined` for unparseable or non-Claude IDs.
 */
export function tryParseClaudeModelId(modelId: string): ParsedClaudeModelId | undefined {
	const cacheKey = modelId.toLowerCase();
	if (cache.has(cacheKey)) {
		return cache.get(cacheKey);
	}

	const result = doParse(cacheKey);
	cache.set(cacheKey, result);
	return result;
}

const DATE_SUFFIX_RE = /^(?<base>.*)-(?<date>\d{8})$/;

function doParse(lower: string): ParsedClaudeModelId | undefined {
	let dateSuffix = '';
	let base = lower;

	const dateMatch = DATE_SUFFIX_RE.exec(lower);
	if (dateMatch?.groups) {
		base = dateMatch.groups.base;
		dateSuffix = dateMatch.groups.date;
	}

	// Pattern 1: claude-{name}-{major}-{minor}[-{mod}] (e.g. claude-opus-4-5, claude-opus-4-6-1m)
	const p1 = base.match(/^claude-(?<name>\w+)-(?<major>\d+)-(?<minor>\d+)(?:-(?<mod>.+))?$/);
	if (p1?.groups) {
		return makeResult(p1.groups.name, p1.groups.major, p1.groups.minor, joinModifiers(p1.groups.mod, dateSuffix));
	}

	// Pattern 2: claude-{major}-{minor}-{name}[-{mod}] (e.g. claude-3-5-sonnet)
	const p2 = base.match(/^claude-(?<major>\d+)-(?<minor>\d+)-(?<name>\w+)(?:-(?<mod>.+))?$/);
	if (p2?.groups) {
		return makeResult(p2.groups.name, p2.groups.major, p2.groups.minor, joinModifiers(p2.groups.mod, dateSuffix));
	}

	// Pattern 3: claude-{name}-{major}.{minor}[-{mod}] (e.g. claude-opus-4.5, claude-opus-4.6-1m)
	const p3 = base.match(/^claude-(?<name>\w+)-(?<major>\d+)\.(?<minor>\d+)(?:-(?<mod>.+))?$/);
	if (p3?.groups) {
		return makeResult(p3.groups.name, p3.groups.major, p3.groups.minor, joinModifiers(p3.groups.mod, dateSuffix));
	}

	// Pattern 4: claude-{name}-{major}[-{mod}] (e.g. claude-sonnet-4, claude-sonnet-4-1m)
	const p4 = base.match(/^claude-(?<name>\w+)-(?<major>\d+)(?:-(?<mod>.+))?$/);
	if (p4?.groups) {
		return makeResult(p4.groups.name, p4.groups.major, undefined, joinModifiers(p4.groups.mod, dateSuffix));
	}

	// Pattern 5: claude-{major}-{name}[-{mod}] (e.g. claude-3-opus)
	const p5 = base.match(/^claude-(?<major>\d+)-(?<name>\w+)(?:-(?<mod>.+))?$/);
	if (p5?.groups) {
		return makeResult(p5.groups.name, p5.groups.major, undefined, joinModifiers(p5.groups.mod, dateSuffix));
	}

	// Pattern 6: bare model name with no version (e.g. nectarine)
	const p6 = base.match(/^(?<name>\w+)$/);
	if (p6?.groups) {
		return makeBareResult(p6.groups.name);
	}

	return undefined;
}

function joinModifiers(mod: string | undefined, dateSuffix: string): string {
	if (mod && dateSuffix) {
		return `${mod}-${dateSuffix}`;
	}
	return mod || dateSuffix;
}

function formatModelId(name: string, major: string, minor: string | undefined, versionSep: string, validSuffix: string): string {
	const base = minor !== undefined
		? `claude-${name}-${major}${versionSep}${minor}`
		: `claude-${name}-${major}`;
	return validSuffix ? `${base}-${validSuffix}` : base;
}

function makeBareResult(name: string): ParsedClaudeModelId {
	return {
		name,
		version: '',
		modifiers: '',
		toSdkModelId: () => name,
		toEndpointModelId: () => name,
	};
}

function makeResult(name: string, major: string, minor: string | undefined, modifiers: string): ParsedClaudeModelId {
	const version = minor !== undefined ? `${major}.${minor}` : major;
	const validSuffix = extractValidSuffix(name, modifiers);
	return {
		name,
		version,
		modifiers,
		toSdkModelId: () => formatModelId(name, major, minor, '-', validSuffix),
		toEndpointModelId: () => formatModelId(name, major, minor, '.', validSuffix),
	};
}

/**
 * Extracts the valid suffix portion from modifiers for a given model family.
 * For example, given modifiers '1m-20251101' and family 'opus', returns '1m'.
 * Returns an empty string if no valid suffix is found.
 */
function extractValidSuffix(name: string, modifiers: string): string {
	if (!modifiers) {
		return '';
	}
	const allowedSuffixes = VALID_SUFFIXES.get(name);
	if (!allowedSuffixes) {
		return '';
	}
	// Check the full modifier string first (e.g. '1m')
	if (allowedSuffixes.has(modifiers)) {
		return modifiers;
	}
	// Check the first segment of compound modifiers (e.g. '1m' from '1m-20251101')
	const firstSegment = modifiers.split('-')[0];
	if (allowedSuffixes.has(firstSegment)) {
		return firstSegment;
	}
	return '';
}
