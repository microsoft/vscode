/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { formatValidationErrors, validateSchema } from '../../common/schemaValidation.js';

suite('Schema Validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('validateSchema', () => {
		test('validates correct object', () => {
			const schema = {
				type: 'object',
				properties: {
					name: { type: 'string' },
					age: { type: 'number' },
				},
				required: ['name'],
			};
			const errors = validateSchema({ name: 'Alice', age: 30 }, schema);
			assert.strictEqual(errors.length, 0);
		});

		test('detects missing required property', () => {
			const schema = {
				type: 'object',
				properties: {
					path: { type: 'string' },
				},
				required: ['path'],
			};
			const errors = validateSchema({}, schema);
			assert.strictEqual(errors.length, 1);
			assert.ok(errors[0].message.includes('Missing required'));
			assert.ok(errors[0].message.includes('path'));
		});

		test('detects wrong type', () => {
			const schema = { type: 'string' };
			const errors = validateSchema(42, schema);
			assert.strictEqual(errors.length, 1);
			assert.ok(errors[0].message.includes('Expected type "string"'));
		});

		test('validates nested objects', () => {
			const schema = {
				type: 'object',
				properties: {
					config: {
						type: 'object',
						properties: {
							timeout: { type: 'number' },
						},
						required: ['timeout'],
					},
				},
			};
			const errors = validateSchema({ config: {} }, schema);
			assert.strictEqual(errors.length, 1);
			assert.ok(errors[0].path.includes('config.timeout'));
		});

		test('validates array items', () => {
			const schema = {
				type: 'array',
				items: { type: 'string' },
			};
			const errors = validateSchema(['a', 42, 'c'], schema);
			assert.strictEqual(errors.length, 1);
			assert.ok(errors[0].path.includes('[1]'));
		});

		test('validates enum values', () => {
			const schema = {
				type: 'string',
				enum: ['low', 'medium', 'high'],
			};
			const errors = validateSchema('invalid', schema);
			assert.strictEqual(errors.length, 1);
			assert.ok(errors[0].message.includes('must be one of'));
		});

		test('passes valid enum value', () => {
			const schema = {
				type: 'string',
				enum: ['low', 'medium', 'high'],
			};
			const errors = validateSchema('medium', schema);
			assert.strictEqual(errors.length, 0);
		});

		test('validates integer type', () => {
			const errors1 = validateSchema(3, { type: 'integer' });
			assert.strictEqual(errors1.length, 0);

			const errors2 = validateSchema(3.5, { type: 'integer' });
			assert.strictEqual(errors2.length, 1);
		});

		test('passes through unknown types', () => {
			const errors = validateSchema('anything', { type: 'custom-type' });
			assert.strictEqual(errors.length, 0);
		});

		test('handles empty schema', () => {
			const errors = validateSchema({ anything: 'goes' }, {});
			assert.strictEqual(errors.length, 0);
		});

		test('validates boolean type', () => {
			const errors = validateSchema(true, { type: 'boolean' });
			assert.strictEqual(errors.length, 0);

			const errors2 = validateSchema('true', { type: 'boolean' });
			assert.strictEqual(errors2.length, 1);
		});
	});

	suite('formatValidationErrors', () => {
		test('returns empty string for no errors', () => {
			assert.strictEqual(formatValidationErrors([]), '');
		});

		test('formats single error', () => {
			const result = formatValidationErrors([
				{ path: 'path', message: 'Missing required property "path"' },
			]);
			assert.ok(result.includes('Invalid tool arguments'));
			assert.ok(result.includes('path'));
			assert.ok(result.includes('Missing required'));
		});

		test('formats multiple errors', () => {
			const result = formatValidationErrors([
				{ path: 'name', message: 'Expected type "string"' },
				{ path: 'age', message: 'Expected type "number"' },
			]);
			assert.ok(result.includes('name'));
			assert.ok(result.includes('age'));
		});
	});
});
