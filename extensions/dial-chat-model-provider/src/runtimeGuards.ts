/**
 * Runtime type guards and parsers for untrusted JSON payloads.
 *
 * Network responses (axios `response.data`, OIDC token endpoints, DIAL deployments,
 * SSE chunks) arrive as {@link JsonValue} — these helpers validate shape at the
 * boundary before the rest of the code may rely on the static types.
 *
 * This module is intentionally low-level: it does not import from `./types` to keep
 * the dependency graph acyclic. We use the literal `T | undefined` here instead of
 * the `Nullable<T>` alias defined in `./types`.
 */

/** Common JSON ancestor: everything {@link JSON.parse} or a JSON HTTP response can yield. */
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export interface JsonObject {
	readonly [key: string]: JsonValue;
}
export type JsonArray = readonly JsonValue[];

export function isRecord(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function asRecord(value: unknown): JsonObject {
	if (!isRecord(value)) {
		throw new TypeError(`Expected JSON object, got ${value === null ? 'null' : typeof value}`);
	}
	return value;
}

export function asString(value: unknown, name: string): string {
	if (typeof value !== 'string') {
		throw new TypeError(`Expected string for ${name}, got ${typeof value}`);
	}
	return value;
}

export function asNonEmptyString(value: unknown, name: string): string {
	const str = asString(value, name);
	if (!str) {
		throw new TypeError(`Expected non-empty string for ${name}`);
	}
	return str;
}

export function readString(record: JsonObject, key: string): string | undefined {
	const value = record[key];
	return typeof value === 'string' ? value : undefined;
}

export function readNonEmptyString(record: JsonObject, key: string): string | undefined {
	const value = readString(record, key);
	return value && value.length > 0 ? value : undefined;
}

export function readNumber(record: JsonObject, key: string): number | undefined {
	const value = record[key];
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readBoolean(record: JsonObject, key: string): boolean | undefined {
	const value = record[key];
	return typeof value === 'boolean' ? value : undefined;
}

export function readStringArray(record: JsonObject, key: string): readonly string[] {
	const value = record[key];
	return isStringArray(value) ? value : [];
}

export function readObject(record: JsonObject, key: string): JsonObject | undefined {
	const value = record[key];
	return isRecord(value) ? value : undefined;
}
