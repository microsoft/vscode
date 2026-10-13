/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { JsonObject, JsonValue } from './types.js';

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

	const dateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

	/** Reads an RFC 3339 date-time string without changing its representation. */
	export const dateTime = refine(
		string,
		value => dateTimePattern.test(value) && Number.isFinite(Date.parse(value)),
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
		const keys = Object.keys(schema) as (keyof T & string)[];
		return value => {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) {
				throw new SchemaError('Expected an object');
			}
			const record = value as Record<string, unknown>;
			const result: Record<string, unknown> = {};
			for (const key of keys) {
				const property = parseAt(Object.hasOwn(record, key) ? record[key] : undefined, schema[key], key);
				if (property !== undefined) {
					defineEntry(result, key, property);
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
			const record = value as Record<string, unknown>;
			const result: Record<string, T> = {};
			for (const key of Object.keys(record)) {
				defineEntry(result, key, parseAt(record[key], parser, key));
			}
			return result;
		};
	}

	/**
	 * Preserves opaque JSON payloads without interpreting event-specific fields.
	 * Accepts only values that `JSON.parse` can produce and returns them without copying.
	 */
	export function jsonValue(value: unknown): JsonValue {
		if (isJsonPrimitive(value)) {
			return value;
		}
		if (Array.isArray(value)) {
			return jsonArray(value);
		}
		if (typeof value !== 'object' || value === null) {
			throw new SchemaError('Expected a JSON value');
		}
		return jsonObject(value);
	}

	/**
	 * Validates each property of a plain object as a JSON value and returns the object without copying.
	 * Rejects objects with any other prototype, such as class instances, `Date` or `Map`.
	 */
	export function jsonObject(value: unknown): JsonObject {
		if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) {
			throw new SchemaError('Expected a JSON object');
		}
		const record = value as Record<string, unknown>;
		for (const key of Object.keys(record)) {
			const entry = record[key];
			if (!isJsonPrimitive(entry)) {
				parseAt(entry, jsonValue, key);
			}
		}
		return record as JsonObject;
	}

	/** Reads a declared string, numeric, or boolean literal. */
	export function oneOf<const T extends string | number | boolean>(...values: readonly T[]): Parser<T> {
		const allowed = new Set<unknown>(values);
		return value => {
			if (!allowed.has(value)) {
				throw new SchemaError('Expected a supported value');
			}
			return value as T;
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

	/**
	 * Adds property or array-index context to schema validation errors. The original
	 * error is rethrown so that nested failures allocate a single error object.
	 */
	function parseAt<T>(value: unknown, parser: Parser<T>, key: string | number): T {
		try {
			return parser(value);
		} catch (error) {
			if (error instanceof SchemaError) {
				const location = typeof key === 'number' ? `index ${key}` : `key ${JSON.stringify(key)}`;
				error.message = `Invalid value at ${location}: ${error.message}`;
			}
			throw error;
		}
	}

	/** Checks for JSON scalars, excluding non-finite numbers. */
	function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
		return value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value);
	}

	/** Validates every entry of a plain array, rejecting holes and array subclasses, and returns it without copying. */
	function jsonArray(value: readonly unknown[]): readonly JsonValue[] {
		if (Object.getPrototypeOf(value) !== Array.prototype) {
			throw new SchemaError('Expected a JSON array');
		}
		for (let index = 0; index < value.length; index++) {
			const entry = value[index];
			if (!isJsonPrimitive(entry)) {
				parseAt(entry, jsonValue, index);
			}
		}
		return value as readonly JsonValue[];
	}

	/** Assigns an own property, defining `__proto__` as data instead of changing the prototype. */
	function defineEntry(target: Record<string, unknown>, key: string, value: unknown): void {
		if (key === '__proto__') {
			Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
		} else {
			target[key] = value;
		}
	}
}
