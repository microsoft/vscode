/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals } from '../../../base/common/objects.js';
import { invalidCanvasParams, isBoundedCanvasJson, isCanvasRecord } from '../common/agentHostCanvasValidation.js';

const annotations = new Set(['$schema', '$id', '$comment', 'title', 'description', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'default']);
const keywords = new Set([
	...annotations, 'type', 'enum', 'const', '$ref', '$defs', 'definitions', 'properties', 'required', 'additionalProperties',
	'items', 'prefixItems', 'additionalItems', 'minItems', 'maxItems', 'minLength', 'maxLength',
	'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'allOf', 'anyOf', 'oneOf',
]);
const types = new Set(['object', 'array', 'string', 'number', 'integer', 'boolean', 'null']);
type Check = (value: unknown) => boolean;

/** Exact decimal arithmetic for JSON's finite, serialized numeric values. */
function isMultipleOf(value: number, divisor: number): boolean {
	const parts = (number: number) => {
		const [mantissa, exponent = '0'] = number.toString().split('e');
		const [whole, fraction = ''] = mantissa.split('.');
		return { integer: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
	};
	const left = parts(value);
	const right = parts(divisor);
	const exponent = Math.min(left.exponent, right.exponent);
	return left.integer * 10n ** BigInt(left.exponent - exponent) % (right.integer * 10n ** BigInt(right.exponent - exponent)) === 0n;
}

/**
 * A bounded, non-transforming JSON Schema subset. Unsupported assertions and
 * recursive/external references fail explicitly before provider execution.
 *
 * Zod's installed experimental JSON-Schema converter silently accepts malformed
 * numeric assertions, ignores const beside enum, and counts UTF-16 code units.
 * Those semantics cannot be used as an admission check.
 */
export function validateCanvasInput(schema: object, input: unknown): void {
	if (!isBoundedCanvasJson(schema, 1024 * 1024) || !isBoundedCanvasJson(input === undefined ? {} : input)) {
		throw invalidCanvasParams('Canvas schema or input exceeds the JSON bound.');
	}
	const compiled = new Map<object, Check>();
	const ancestors = new Set<object>();
	let steps = 0;
	let nodes = 0;
	const unsupported = (): never => { throw invalidCanvasParams('Canvas schema is malformed or uses an unsupported assertion or reference. No provider action was invoked.'); };
	const compile = (value: unknown, depth: number): Check => {
		if (depth > 32 || ++nodes > 16384) {
			return unsupported();
		}
		if (typeof value === 'boolean') {
			return () => value;
		}
		if (!isCanvasRecord(value) || ancestors.has(value)) {
			return unsupported();
		}
		const cached = compiled.get(value);
		if (cached) {
			return cached;
		}
		ancestors.add(value);
		for (const key of Object.keys(value)) {
			if (!keywords.has(key)) {
				return unsupported();
			}
		}
		if (value.$schema !== undefined && value.$schema !== 'https://json-schema.org/draft/2020-12/schema'
			&& value.$schema !== 'http://json-schema.org/draft-07/schema#' && value.$schema !== 'https://json-schema.org/draft-07/schema#') {
			return unsupported();
		}
		if (value.$id !== undefined && (depth !== 1 || typeof value.$id !== 'string')) {
			return unsupported();
		}
		const checks: Check[] = [];
		if (value.type !== undefined) {
			const declared = Array.isArray(value.type) ? value.type : [value.type];
			if (!declared.length || declared.some(type => typeof type !== 'string' || !types.has(type)) || new Set(declared).size !== declared.length) {
				return unsupported();
			}
			checks.push(input => declared.some(type => type === 'integer' ? typeof input === 'number' && Number.isInteger(input)
				: type === 'null' ? input === null : type === 'array' ? Array.isArray(input)
					: type === 'object' ? isCanvasRecord(input) : typeof input === type));
		}
		if (value.enum !== undefined) {
			const choices = value.enum;
			if (!Array.isArray(choices) || !choices.length || choices.length > 4096) {
				return unsupported();
			}
			checks.push(input => choices.some(choice => equals(choice, input)));
		}
		if (Object.hasOwn(value, 'const')) {
			checks.push(input => equals(value.const, input));
		}
		if (value.$ref !== undefined) {
			if (typeof value.$ref !== 'string' || !/^#\/(?:\$defs|definitions)\/[^/~]+$/.test(value.$ref)) {
				return unsupported();
			}
			let target: unknown = schema;
			for (const segment of value.$ref.slice(2).split('/')) {
				target = isCanvasRecord(target) && Object.hasOwn(target, segment) ? target[segment] : undefined;
			}
			checks.push(compile(target, depth + 1));
		}
		for (const key of ['$defs', 'definitions']) {
			if (value[key] !== undefined) {
				const definitions = value[key];
				if (!isCanvasRecord(definitions) || Object.keys(definitions).length > 4096) {
					return unsupported();
				}
				for (const definition of Object.values(definitions)) {
					compile(definition, depth + 1);
				}
			}
		}
		for (const key of ['allOf', 'anyOf', 'oneOf']) {
			if (value[key] !== undefined) {
				const alternatives = value[key];
				if (!Array.isArray(alternatives) || !alternatives.length || alternatives.length > 64) {
					return unsupported();
				}
				const alternativesChecks = alternatives.map(alternative => compile(alternative, depth + 1));
				checks.push(input => key === 'allOf' ? alternativesChecks.every(check => check(input))
					: key === 'anyOf' ? alternativesChecks.some(check => check(input))
						: alternativesChecks.filter(check => check(input)).length === 1);
			}
		}
		for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems', 'minLength', 'maxLength']) {
			if (value[key] !== undefined) {
				const bound = value[key];
				if (typeof bound !== 'number' || !Number.isFinite(bound)
					|| key === 'multipleOf' && bound <= 0
					|| ['minItems', 'maxItems', 'minLength', 'maxLength'].includes(key) && (!Number.isSafeInteger(bound) || bound < 0)) {
					return unsupported();
				}
				checks.push(input => {
					switch (key) {
						case 'minimum': return typeof input !== 'number' || input >= bound;
						case 'maximum': return typeof input !== 'number' || input <= bound;
						case 'exclusiveMinimum': return typeof input !== 'number' || input > bound;
						case 'exclusiveMaximum': return typeof input !== 'number' || input < bound;
						case 'multipleOf': return typeof input !== 'number' || isMultipleOf(input, bound);
						case 'minItems': return !Array.isArray(input) || input.length >= bound;
						case 'maxItems': return !Array.isArray(input) || input.length <= bound;
						case 'minLength': return typeof input !== 'string' || [...input].length >= bound;
						default: return typeof input !== 'string' || [...input].length <= bound;
					}
				});
			}
		}
		const properties = new Map<string, Check>();
		if (value.properties !== undefined) {
			if (!isCanvasRecord(value.properties) || Object.keys(value.properties).length > 4096) {
				return unsupported();
			}
			for (const [key, child] of Object.entries(value.properties)) {
				properties.set(key, compile(child, depth + 1));
			}
		}
		const required = value.required ?? [];
		if (!Array.isArray(required) || !required.every((key): key is string => typeof key === 'string') || new Set(required).size !== required.length) {
			return unsupported();
		}
		const additionalProperties = compile(value.additionalProperties ?? true, depth + 1);
		checks.push(input => !isCanvasRecord(input) || required.every(key => Object.hasOwn(input, key))
			&& Object.entries(input).every(([key, input]) => (properties.get(key) ?? additionalProperties)(input)));
		if (value.prefixItems !== undefined && Array.isArray(value.items)
			|| value.additionalItems !== undefined && !Array.isArray(value.items)) {
			return unsupported();
		}
		const prefix = value.prefixItems ?? (Array.isArray(value.items) ? value.items : []);
		if (!Array.isArray(prefix) || prefix.length > 64) {
			return unsupported();
		}
		const prefixChecks = prefix.map(child => compile(child, depth + 1));
		const items = compile(Array.isArray(value.items) ? value.additionalItems ?? true : value.items ?? true, depth + 1);
		checks.push(input => !Array.isArray(input) || input.every((entry, index) => (prefixChecks[index] ?? items)(entry)));
		const check: Check = input => {
			if (++steps > 65536) {
				throw invalidCanvasParams('Canvas schema validation exceeded its bounded work budget. No provider action was invoked.');
			}
			return checks.every(check => check(input));
		};
		compiled.set(value, check);
		ancestors.delete(value);
		return check;
	};
	if (!compile(schema, 1)(input === undefined ? {} : input)) {
		throw invalidCanvasParams('Canvas input does not match the current declared schema.');
	}
}
