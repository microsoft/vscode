/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** Selector matching and payload reading shared by JSON payloads delivered as experiment treatments. */

import { ILanguageModelChatMetadata } from './languageModels.js';

const MAX_SELECTORS = 32;

export const MAX_ID_LENGTH = 64;

/** Ids appear in telemetry, so they are restricted to a shape that needs no sanitization. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the versioned envelope every treatment payload shares, returning the object or the
 * reason it was rejected. Never throws, so a malformed treatment cannot break a caller.
 */
export function parseExpPayloadEnvelope(raw: string | undefined, version: number): Record<string, unknown> | string {
	if (typeof raw !== 'string' || !raw.trim()) {
		return 'empty payload';
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch (err) {
		return `payload is not valid JSON: ${err instanceof Error ? err.message : String(err)}`;
	}

	if (!isObject(parsed)) {
		return 'payload is not an object';
	}
	if (parsed.version !== version) {
		return `unsupported version ${JSON.stringify(parsed.version)}, expected ${version}`;
	}
	return parsed;
}

/** Reads a trimmed string, optionally lower-cased and constrained to `pattern`. */
export function readText(raw: unknown, maxLength: number, pattern?: RegExp): string | undefined {
	if (typeof raw !== 'string') {
		return undefined;
	}
	const trimmed = pattern ? raw.trim().toLowerCase() : raw.trim();
	if (!trimmed || trimmed.length > maxLength || (pattern && !pattern.test(trimmed))) {
		return undefined;
	}
	return trimmed;
}

export function normalizeSelector(value: string): string {
	return value.trim().toLowerCase().replace(/[\s_]+/g, '-');
}

/** Reads a list of match selectors, normalizing each so authoring casing does not matter. */
export function readSelectorList(raw: unknown, path: string): string[] | string {
	if (raw === undefined) {
		return [];
	}
	if (!Array.isArray(raw)) {
		return `${path} must be an array of strings`;
	}
	if (raw.length > MAX_SELECTORS) {
		return `${path} exceeds ${MAX_SELECTORS} entries`;
	}
	const out: string[] = [];
	for (const entry of raw) {
		if (typeof entry !== 'string') {
			return `${path} must contain only strings`;
		}
		const normalized = normalizeSelector(entry);
		if (!normalized) {
			return `${path} must not contain empty strings`;
		}
		out.push(normalized);
	}
	return out;
}

/**
 * Builds every string a selector may match for a model.
 *
 * Identifiers are qualified differently across harnesses. The language model service uses
 * `<vendor>/<group>/<id>` while agent host sessions use `<sessionType>:<id>`, so a selector is
 * compared against each segment as well as the whole id. That lets `auto` match both
 * `copilot/auto` and `agent-host-copilotcli:auto`.
 */
export function expandModelMatchCandidates(modelId: string | undefined, aliases?: readonly string[]): Set<string> {
	const candidates = new Set<string>();
	const add = (value: string | undefined): void => {
		const normalized = value === undefined ? '' : normalizeSelector(value);
		if (normalized) {
			candidates.add(normalized);
		}
	};

	if (modelId) {
		add(modelId);
		for (const segment of modelId.split(/[/:]/)) {
			add(segment);
		}
	}
	for (const alias of aliases ?? []) {
		add(alias);
	}

	return candidates;
}

/** The identifiers a selector may name a model by, besides its qualified id. */
export function modelSelectorAliases(metadata: ILanguageModelChatMetadata): string[] {
	return [metadata.id, metadata.family, metadata.name, metadata.vendor];
}
