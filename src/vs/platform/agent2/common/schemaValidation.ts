/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Simple JSON Schema validator for tool call arguments.
 *
 * This is intentionally minimal -- it validates the most common schema
 * constraints (type, required, properties) without supporting the full
 * JSON Schema specification. The goal is to catch obviously malformed
 * arguments before they reach tool execution, not to be a complete
 * schema validator.
 */

export interface IValidationError {
	readonly path: string;
	readonly message: string;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates a value against a JSON Schema. Returns an array of validation
 * errors, or an empty array if the value is valid.
 */
export function validateSchema(
	value: unknown,
	schema: Record<string, unknown>,
	path: string = '',
): IValidationError[] {
	const errors: IValidationError[] = [];

	// Type check
	const expectedType = schema['type'];
	if (typeof expectedType === 'string') {
		if (!checkType(value, expectedType)) {
			errors.push({
				path: path || '(root)',
				message: `Expected type "${expectedType}", got "${typeof value}"`,
			});
			return errors; // Stop further checks if type is wrong
		}
	}

	// Object property checks
	if (expectedType === 'object' && isObjectRecord(value)) {
		// Required properties
		const required = schema['required'];
		if (Array.isArray(required)) {
			for (const key of required) {
				if (typeof key === 'string' && !Object.prototype.hasOwnProperty.call(value, key)) {
					errors.push({
						path: path ? `${path}.${key}` : key,
						message: `Missing required property "${key}"`,
					});
				}
			}
		}

		// Property schemas
		const properties = schema['properties'];
		if (isObjectRecord(properties)) {
			for (const key of Object.keys(properties)) {
				const propSchema = properties[key];
				if (Object.prototype.hasOwnProperty.call(value, key) && isObjectRecord(propSchema)) {
					const propErrors = validateSchema(
						value[key],
						propSchema,
						path ? `${path}.${key}` : key,
					);
					errors.push(...propErrors);
				}
			}
		}
	}

	// Array item checks
	if (expectedType === 'array' && Array.isArray(value)) {
		const itemsSchema = schema['items'];
		if (isObjectRecord(itemsSchema)) {
			for (let i = 0; i < value.length; i++) {
				const itemErrors = validateSchema(
					value[i],
					itemsSchema,
					`${path}[${i}]`,
				);
				errors.push(...itemErrors);
			}
		}
	}

	// Enum check
	const enumValues = schema['enum'];
	if (Array.isArray(enumValues) && !enumValues.includes(value)) {
		errors.push({
			path: path || '(root)',
			message: `Value must be one of: ${enumValues.join(', ')}`,
		});
	}

	return errors;
}

function checkType(value: unknown, expectedType: string): boolean {
	switch (expectedType) {
		case 'string': return typeof value === 'string';
		case 'number': return typeof value === 'number';
		case 'integer': return typeof value === 'number' && Number.isInteger(value);
		case 'boolean': return typeof value === 'boolean';
		case 'array': return Array.isArray(value);
		case 'object': return typeof value === 'object' && value !== null && !Array.isArray(value);
		case 'null': return value === null;
		default: return true; // Unknown type -- pass through
	}
}

/**
 * Formats validation errors into a human-readable string suitable for
 * feeding back to the model.
 */
export function formatValidationErrors(errors: readonly IValidationError[]): string {
	if (errors.length === 0) {
		return '';
	}
	const lines = errors.map(e => `  - ${e.path}: ${e.message}`);
	return `Invalid tool arguments:\n${lines.join('\n')}`;
}
