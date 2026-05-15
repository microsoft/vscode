/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { vBoolean, vNumber, vObj, vRequired, vString } from '../../common/validator';

describe('vRequired', () => {
	it('should mark a field as required', () => {
		const validator = vObj({
			name: vRequired(vString()),
			age: vNumber(),
		});

		// Missing required field should fail
		const result1 = validator.validate({ age: 25 });
		expect(result1.error).toBeDefined();
		expect(result1.error?.message).toContain(`Required field 'name' is missing`);

		// Providing required field should succeed
		const result2 = validator.validate({ name: 'John', age: 25 });
		expect(result2.error).toBeUndefined();
		expect(result2.content).toEqual({ name: 'John', age: 25 });
	});

	it('should allow optional fields to be missing', () => {
		const validator = vObj({
			name: vRequired(vString()),
			age: vNumber(), // optional
			city: vString(), // optional
		});

		// Only required field provided
		const result = validator.validate({ name: 'John' });
		expect(result.error).toBeUndefined();
		expect(result.content).toEqual({ name: 'John' });
	});

	it('should validate the value when required field is provided', () => {
		const validator = vObj({
			name: vRequired(vString()),
		});

		// Wrong type for required field
		const result = validator.validate({ name: 123 });
		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain('Expected string');
	});

	it('should handle multiple required fields', () => {
		const validator = vObj({
			firstName: vRequired(vString()),
			lastName: vRequired(vString()),
			age: vNumber(), // optional
		});

		// Missing one required field
		const result1 = validator.validate({ firstName: 'John' });
		expect(result1.error).toBeDefined();
		expect(result1.error?.message).toContain(`Required field 'lastName' is missing`);

		// All required fields provided
		const result2 = validator.validate({ firstName: 'John', lastName: 'Doe' });
		expect(result2.error).toBeUndefined();
		expect(result2.content).toEqual({ firstName: 'John', lastName: 'Doe' });

		// All fields provided
		const result3 = validator.validate({ firstName: 'John', lastName: 'Doe', age: 30 });
		expect(result3.error).toBeUndefined();
		expect(result3.content).toEqual({ firstName: 'John', lastName: 'Doe', age: 30 });
	});

	it('should generate correct JSON schema with required fields', () => {
		const validator = vObj({
			name: vRequired(vString()),
			age: vNumber(),
			isActive: vRequired(vBoolean()),
		});

		const schema = validator.toSchema();
		expect(schema).toEqual({
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'number' },
				isActive: { type: 'boolean' },
			},
			required: ['name', 'isActive'],
		});
	});

	it('should generate JSON schema without required array when no fields are required', () => {
		const validator = vObj({
			name: vString(),
			age: vNumber(),
		});

		const schema = validator.toSchema();
		expect(schema).toEqual({
			type: 'object',
			properties: {
				name: { type: 'string' },
				age: { type: 'number' },
			},
		});
		expect((schema as any).required).toBeUndefined();
	});

	it('should handle nested objects with required fields', () => {
		const validator = vObj({
			user: vRequired(vObj({
				name: vRequired(vString()),
				email: vString(), // optional
			})),
			metadata: vObj({
				created: vString(),
			}),
		});

		// Missing required nested object
		const result1 = validator.validate({});
		expect(result1.error).toBeDefined();
		expect(result1.error?.message).toContain(`Required field 'user' is missing`);

		// Required object present but missing required nested field
		const result2 = validator.validate({ user: {} });
		expect(result2.error).toBeDefined();
		expect(result2.error?.message).toContain(`Required field 'name' is missing`);

		// Valid nested structure
		const result3 = validator.validate({ user: { name: 'John' } });
		expect(result3.error).toBeUndefined();
		expect(result3.content).toEqual({ user: { name: 'John' } });
	});

	it('should handle explicit undefined for required fields', () => {
		const validator = vObj({
			name: vRequired(vString()),
		});

		// Explicitly setting to undefined should fail
		const result = validator.validate({ name: undefined });
		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain(`Required field 'name' is missing`);
	});

	it('should allow null for optional fields but not required fields', () => {
		const validator = vObj({
			requiredField: vRequired(vString()),
			optionalField: vString(),
		});

		// null for required field should validate as wrong type (not string)
		const result1 = validator.validate({ requiredField: null });
		expect(result1.error).toBeDefined();

		// null for optional field when optional field is present should validate as wrong type
		const result2 = validator.validate({ requiredField: 'test', optionalField: null });
		expect(result2.error).toBeDefined();
	});
});
