/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A JSON value in an extensible API payload. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;

/** A JSON object whose property names are defined by the producing service. */
export interface JsonObject {
	/** A named JSON value preserved without interpreting its schema. */
	readonly [key: string]: JsonValue;
}

/** Indicates that a value does not match the expected schema. */
export class SchemaError extends Error {
	/** Creates a schema validation error with the supplied diagnostic message. */
	constructor(message: string) {
		super(message);
		this.name = 'SchemaError';
	}
}

/** Composable parsers for validating API values and response shapes. */
export namespace parse {
	/** Parses a value without including it in validation errors. */
	export type Parser<T> = (value: unknown) => T;

	/** Requires a parser for every declared property, including optional properties. */
	export type ObjectSchema<T extends object> = { [K in keyof T]-?: Parser<T[K]> };

	/** Reads a string, including the empty string. */
	export function string(value: unknown): string {
		if (typeof value !== 'string') {
			throw new SchemaError('Expected a string');
		}
		return value;
	}

	/** Reads a non-empty string without trimming whitespace. */
	export function nonEmptyString(value: unknown): string {
		if (typeof value !== 'string' || value.length === 0) {
			throw new SchemaError('Expected a non-empty string');
		}
		return value;
	}

	/** Reads an RFC 3339 date-time string without changing its representation. */
	export const dateTime = refine(
		string,
		value => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)),
		'Expected a date-time in RFC 3339 format',
	);

	/** Reads a boolean without coercing other values. */
	export function boolean(value: unknown): boolean {
		if (typeof value !== 'boolean') {
			throw new SchemaError('Expected a boolean value');
		}
		return value;
	}

	/** Reads a finite JSON number, including fractional values. */
	export function finiteNumber(value: unknown): number {
		if (typeof value !== 'number' || !Number.isFinite(value)) {
			throw new SchemaError('Expected a finite number');
		}
		return value;
	}

	/** Reads a safe integer, including negative values. */
	export function integer(value: unknown): number {
		if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
			throw new SchemaError('Expected a safe integer');
		}
		return value;
	}

	/** Builds a parser for safe integers within inclusive bounds. */
	export function range(min: number, max: number): Parser<number> {
		return value => {
			if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) {
				throw new SchemaError(`Expected a safe integer in range [${min}, ${max}]`);
			}
			return value;
		};
	}

	/** Reads a nonnegative safe integer. */
	export const nonNegativeInteger = range(0, Number.MAX_SAFE_INTEGER);

	/** Parses every array element without dropping malformed entries. */
	export function arrayOf<T>(parser: Parser<T>): Parser<T[]> {
		return value => {
			if (!Array.isArray(value)) {
				throw new SchemaError('Expected an array');
			}
			return value.map((entry, index) => parseAt(entry, parser, index));
		};
	}

	/** Reads an array containing only strings. */
	export const strings = arrayOf(string);

	/** Builds a reusable object parser that omits unknown and undefined properties. */
	export function object<T extends object>(schema: ObjectSchema<T>): Parser<T> {
		return value => {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) {
				throw new SchemaError('Expected an object');
			}
			const record = value as Record<string, unknown>;
			const result: Partial<T> = {};
			for (const key in schema) {
				const property = parseAt(record[key], schema[key], key);
				if (property !== undefined) {
					result[key] = property;
				}
			}
			return result as T;
		};
	}

	/** Parses an object whose keys are supplied by the service. */
	export function dictionary<T>(parser: Parser<T>): Parser<Record<string, T>> {
		return value => {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) {
				throw new SchemaError('Expected a record');
			}
			return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, parseAt(entry, parser, key)]));
		};
	}

	/** Preserves opaque JSON payloads without interpreting event-specific fields. */
	export function jsonValue(value: unknown): JsonValue {
		if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (Array.isArray(value)) {
			return value.map((entry, index) => parseAt(entry, jsonValue, index));
		}
		return jsonObject(value);
	}

	/** Parses each object property as a JSON value while preserving its key. */
	export function jsonObject(value: unknown): JsonObject {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			throw new SchemaError('Expected a JSON object');
		}
		return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, parseAt(entry, jsonValue, key)]));
	}

	/** Reads a declared string, numeric, or boolean literal. */
	export function oneOf<const T extends string | number | boolean>(...values: readonly T[]): Parser<T> {
		return value => {
			for (const candidate of values) {
				if (value === candidate) {
					return candidate;
				}
			}
			throw new SchemaError('Expected a supported value');
		};
	}

	/** Adds a predicate constraint without changing the parsed value. */
	export function refine<T>(parser: Parser<T>, predicate: (value: T) => boolean, message: string): Parser<T> {
		return value => {
			const result = parser(value);
			if (!predicate(result)) {
				throw new SchemaError(message);
			}
			return result;
		};
	}

	/** Merges amendments into a parsed object without mutating it, with amended fields taking precedence. */
	export function amend<T extends object, U extends object>(parser: Parser<T>, amendment: (value: T) => U): Parser<Omit<T, keyof U> & U> {
		return value => {
			const result = parser(value);
			return { ...result, ...amendment(result) };
		};
	}

	/** Allows an omitted property without collapsing an explicit null. */
	export function optional<T>(parser: Parser<T>): Parser<T | undefined> {
		return value => value === undefined ? undefined : parser(value);
	}

	/** Allows an explicit null without accepting a missing property. */
	export function nullable<T>(parser: Parser<T>): Parser<T | null> {
		return value => value === null ? null : parser(value);
	}

	/** Adds property or array-index context to schema validation errors. */
	function parseAt<T>(value: unknown, parser: Parser<T>, key: string | number): T {
		try {
			return parser(value);
		} catch (error) {
			if (error instanceof SchemaError) {
				const location = typeof key === 'number' ? `index ${key}` : `key ${JSON.stringify(key)}`;
				throw new SchemaError(`Invalid value at ${location}: ${error.message}`);
			}
			throw error;
		}
	}
}
