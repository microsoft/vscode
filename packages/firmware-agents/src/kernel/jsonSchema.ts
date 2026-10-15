/*---------------------------------------------------------------------------------------------
 *  Copyright (c) RoboAgent. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The subset of JSON Schema that tool inputs use. It is what LLM tool-calling APIs accept, and
 * what {@link validateJsonSchema} checks before a tool runs.
 */
export interface JsonSchema {
	readonly type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
	readonly description?: string;
	readonly properties?: { readonly [name: string]: JsonSchema };
	readonly required?: readonly string[];
	readonly additionalProperties?: boolean;
	readonly items?: JsonSchema;
	readonly enum?: readonly (string | number | boolean)[];
	readonly minimum?: number;
	readonly maximum?: number;
	readonly maxLength?: number;
	readonly maxItems?: number;
	readonly default?: unknown;
}

/** Keys that could reach an object's prototype if a tool copies or merges its input. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/** Deepest nesting accepted in tool input; real tool inputs are a few levels deep. */
export const MAX_INPUT_DEPTH = 64;

/**
 * Problems with the shape of untrusted input that a schema cannot express: prototype-reaching
 * keys at any depth, and nesting beyond {@link MAX_INPUT_DEPTH}. Iterative, so hostile input
 * cannot overflow the stack.
 */
export function findInputHazards(value: unknown): string[] {
	const problems: string[] = [];
	// Depth-first in document order, so problems are reported in the order they appear.
	const stack: { value: unknown; path: string; depth: number; forbidden?: boolean }[] = [{ value, path: 'input', depth: 0 }];
	while (stack.length) {
		const { value: v, path, depth, forbidden } = stack.pop()!;
		if (forbidden) {
			problems.push(`${path} is not allowed`);
			continue;
		}
		if (typeof v !== 'object' || v === null) {
			continue;
		}
		if (depth >= MAX_INPUT_DEPTH) {
			problems.push(`${path} is nested too deeply (limit ${MAX_INPUT_DEPTH})`);
			continue;
		}
		const entries: [string, unknown][] = Array.isArray(v)
			? v.map((item, i) => [`${path}[${i}]`, item])
			: Object.keys(v).map(key => [`${path}.${key}`, (v as Record<string, unknown>)[key]]);
		const isArray = Array.isArray(v);
		for (const [childPath, child] of entries.reverse()) {
			const forbiddenKey = !isArray && FORBIDDEN_KEYS.has(childPath.slice(childPath.lastIndexOf('.') + 1));
			stack.push({ value: child, path: childPath, depth: depth + 1, forbidden: forbiddenKey });
		}
	}
	return problems;
}

/**
 * Validates `value` against `schema` and returns human-readable errors (empty when valid). The
 * errors go back to the model, so they name the offending path.
 */
export function validateJsonSchema(schema: JsonSchema, value: unknown, path = 'input'): string[] {
	const errors: string[] = [];
	if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
		errors.push(`${path} must be one of ${schema.enum.map(v => JSON.stringify(v)).join(', ')}`);
		return errors;
	}
	switch (schema.type) {
		case undefined:
			break;
		case 'object': {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) {
				errors.push(`${path} must be an object`);
				break;
			}
			const record = value as Record<string, unknown>;
			for (const name of schema.required ?? []) {
				if (!hasOwn(record, name) || record[name] === undefined) {
					errors.push(`${path}.${name} is required`);
				}
			}
			for (const name of Object.keys(record)) {
				if (FORBIDDEN_KEYS.has(name)) {
					errors.push(`${path}.${name} is not allowed`);
				}
			}
			for (const [name, child] of Object.entries(record)) {
				if (FORBIDDEN_KEYS.has(name)) {
					continue;
				}
				const childSchema = schema.properties && hasOwn(schema.properties, name) ? schema.properties[name] : undefined;
				if (childSchema) {
					if (child !== undefined) {
						errors.push(...validateJsonSchema(childSchema, child, `${path}.${name}`));
					}
				} else if (schema.additionalProperties === false) {
					errors.push(`${path}.${name} is not allowed`);
				}
			}
			break;
		}
		case 'array':
			if (!Array.isArray(value)) {
				errors.push(`${path} must be an array`);
			} else if (schema.maxItems !== undefined && value.length > schema.maxItems) {
				errors.push(`${path} must have at most ${schema.maxItems} items`);
			} else if (schema.items) {
				value.forEach((item, i) => errors.push(...validateJsonSchema(schema.items!, item, `${path}[${i}]`)));
			}
			break;
		case 'integer':
		case 'number':
			if (typeof value !== 'number' || Number.isNaN(value) || (schema.type === 'integer' && !Number.isInteger(value))) {
				errors.push(`${path} must be ${schema.type === 'integer' ? 'an integer' : 'a number'}`);
			} else {
				if (schema.minimum !== undefined && value < schema.minimum) {
					errors.push(`${path} must be >= ${schema.minimum}`);
				}
				if (schema.maximum !== undefined && value > schema.maximum) {
					errors.push(`${path} must be <= ${schema.maximum}`);
				}
			}
			break;
		case 'null':
			if (value !== null) {
				errors.push(`${path} must be null`);
			}
			break;
		default:
			if (typeof value !== schema.type) {
				errors.push(`${path} must be a ${schema.type}`);
			} else if (schema.type === 'string' && schema.maxLength !== undefined && (value as string).length > schema.maxLength) {
				errors.push(`${path} must be at most ${schema.maxLength} characters`);
			}
	}
	return errors;
}
