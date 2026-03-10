/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILiquidModuleRegistry } from '../common/liquidModule.js';
import type { CompositionLayout } from '../common/liquidGraftTypes.js';

/** Allowed actions for intent validation. */
const ALLOWED_ACTIONS = ['show', 'compare', 'summarize', 'navigate', 'filter'] as const;
export type IntentAction = typeof ALLOWED_ACTIONS[number];

/** Allowed layouts for intent validation. */
const ALLOWED_LAYOUTS: readonly CompositionLayout[] = ['single', 'split-horizontal', 'split-vertical', 'grid', 'stack'];

/** Maximum depth for related-entity expansion. */
const MAX_DEPTH = 2;

/** Maximum string length for parameters. */
const MAX_STRING_LENGTH = 500;

/** Maximum array length for parameters. */
const MAX_ARRAY_LENGTH = 50;

/** Maximum number for numeric parameters. */
const MAX_NUMBER = 1_000_000;

/** Maximum nesting depth for parameter sanitization. */
const MAX_PARAM_NESTING = 3;

/** Result of gatekeeper validation. */
export interface IGatekeeperResult {
	readonly valid: boolean;
	readonly gate?: number;
	readonly gateName?: string;
	readonly error?: string;
	/** Sanitized version of the intent parameters (after gate 7). */
	readonly sanitizedParams?: Record<string, unknown>;
}

/** Raw intent to validate (before composition). */
export interface IRawIntent {
	readonly action?: string;
	readonly entities?: readonly string[];
	readonly depth?: number;
	readonly preferredLayout?: string;
	readonly params?: Record<string, unknown>;
}

function fail(gate: number, gateName: string, error: string): IGatekeeperResult {
	return { valid: false, gate, gateName, error };
}

/**
 * Recursively sanitize a parameter value.
 * - Strings are truncated to MAX_STRING_LENGTH.
 * - Numbers are clamped to [-MAX_NUMBER, MAX_NUMBER]. NaN/Infinity are removed.
 * - Booleans pass through.
 * - Arrays are truncated to MAX_ARRAY_LENGTH items, each element sanitized.
 * - Objects are recursed up to `remainingDepth` levels.
 * - Anything else (functions, symbols, etc.) is removed (returns undefined).
 */
function sanitizeValue(value: unknown, remainingDepth: number): unknown {
	if (typeof value === 'string') {
		return value.length > MAX_STRING_LENGTH ? value.slice(0, MAX_STRING_LENGTH) : value;
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) {
			return undefined;
		}
		return Math.max(-MAX_NUMBER, Math.min(MAX_NUMBER, value));
	}
	if (typeof value === 'boolean') {
		return value;
	}
	if (Array.isArray(value)) {
		const truncated = value.length > MAX_ARRAY_LENGTH ? value.slice(0, MAX_ARRAY_LENGTH) : value;
		const sanitized: unknown[] = [];
		for (const item of truncated) {
			const clean = sanitizeValue(item, remainingDepth);
			if (clean !== undefined) {
				sanitized.push(clean);
			}
		}
		return sanitized;
	}
	if (value !== null && typeof value === 'object' && remainingDepth > 0) {
		return sanitizeParams(value as Record<string, unknown>, remainingDepth - 1);
	}
	// Non-primitive leaf at max depth or unsupported type: remove
	return undefined;
}

/**
 * Sanitize a params record: sanitize each value, drop undefined results.
 */
function sanitizeParams(params: Record<string, unknown>, remainingDepth: number): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(params)) {
		const clean = sanitizeValue(value, remainingDepth);
		if (clean !== undefined) {
			result[key] = clean;
		}
	}
	return result;
}

/**
 * Validate a raw intent through 7 sequential gates. Fail fast: the first
 * gate that fails stops validation and returns the error immediately.
 *
 * This is a pure function (stateless). It takes the registry as a parameter
 * so it can check entity existence and graft availability.
 *
 * Gate 1 - Structure: valid object with at least action or entities.
 * Gate 2 - Action: in the allowlist (defaults to 'show' if missing).
 * Gate 3 - Entity: every declared entity exists in the registry.
 * Gate 4 - Existence: at least one graft can show each requested entity.
 * Gate 5 - Depth: clamped to [0, MAX_DEPTH].
 * Gate 6 - Layout: preferred layout in the allowlist.
 * Gate 7 - Params: sanitize all parameter values.
 */
export function validateIntent(intent: unknown, registry: ILiquidModuleRegistry): IGatekeeperResult {

	// Gate 1 - Structure
	if (intent === null || intent === undefined || typeof intent !== 'object' || Array.isArray(intent)) {
		return fail(1, 'Structure', 'Intent must be an object with action or entities');
	}

	const raw = intent as Record<string, unknown>;

	if (raw.action === undefined && raw.entities === undefined) {
		return fail(1, 'Structure', 'Intent must be an object with action or entities');
	}

	// Gate 2 - Action
	let action: IntentAction;
	if (raw.action !== undefined) {
		if (typeof raw.action !== 'string' || !(ALLOWED_ACTIONS as readonly string[]).includes(raw.action)) {
			return fail(2, 'Action', `Unknown action: ${String(raw.action)}. Allowed: show, compare, summarize, navigate, filter`);
		}
		action = raw.action as IntentAction;
	} else {
		action = 'show';
	}

	// Gate 3 - Entity
	const entities: string[] = [];
	if (raw.entities !== undefined) {
		if (!Array.isArray(raw.entities)) {
			return fail(3, 'Entity', 'entities must be an array');
		}
		const availableIds = registry.entities.map(e => e.id);
		for (const entity of raw.entities) {
			if (typeof entity !== 'string') {
				return fail(3, 'Entity', `Entity must be a string, got ${typeof entity}`);
			}
			if (!availableIds.includes(entity)) {
				return fail(3, 'Entity', `Unknown entity: ${entity}. Available: ${availableIds.join(', ')}`);
			}
			entities.push(entity);
		}
	}

	// Gate 4 - Existence
	for (const entity of entities) {
		const grafts = registry.findByEntity(entity);
		if (grafts.length === 0) {
			return fail(4, 'Existence', `No graft can show entity: ${entity}`);
		}
	}

	// Gate 5 - Depth
	let depth = 0;
	if (raw.depth !== undefined) {
		if (typeof raw.depth !== 'number' || !Number.isFinite(raw.depth)) {
			depth = 0;
		} else {
			depth = Math.max(0, Math.min(MAX_DEPTH, Math.round(raw.depth)));
		}
	}

	// Gate 6 - Layout
	let preferredLayout: CompositionLayout | undefined;
	if (raw.preferredLayout !== undefined) {
		if (typeof raw.preferredLayout !== 'string' || !(ALLOWED_LAYOUTS as readonly string[]).includes(raw.preferredLayout)) {
			return fail(6, 'Layout', `Unknown layout: ${String(raw.preferredLayout)}. Allowed: ${ALLOWED_LAYOUTS.join(', ')}`);
		}
		preferredLayout = raw.preferredLayout as CompositionLayout;
	}

	// Gate 7 - Params
	let sanitizedParams: Record<string, unknown> = {};
	if (raw.params !== undefined && raw.params !== null && typeof raw.params === 'object') {
		sanitizedParams = sanitizeParams(raw.params as Record<string, unknown>, MAX_PARAM_NESTING);
	}

	// Assemble the validated result. Params are nested to prevent collision
	// with gate-validated fields (action, entities, depth, preferredLayout).
	const result: Record<string, unknown> = {
		action,
		...(entities.length > 0 ? { entities } : {}),
		depth,
		...(preferredLayout ? { preferredLayout } : {}),
		...(Object.keys(sanitizedParams).length > 0 ? { params: sanitizedParams } : {}),
	};

	return { valid: true, sanitizedParams: result };
}
