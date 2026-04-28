/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createSchema, platformSessionSchema, schemaProperty, type AutoApproveLevel, type IPermissionsValue } from '../../common/agentHostSchema.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';

/**
 * Invokes `fn` and returns the thrown {@link ProtocolError}. Avoids
 * passing an arrow-function validator to `assert.throws` — the unit-test
 * assert shim does `actual instanceof expected` with that validator, and
 * arrow functions have no `prototype` property, which WebKit rejects.
 */
function captureProtocolError(fn: () => void): ProtocolError {
	try {
		fn();
	} catch (err) {
		assert.ok(err instanceof ProtocolError, `expected ProtocolError, got: ${err}`);
		return err;
	}
	assert.fail('expected fn to throw, but it did not');
}

suite('agentHostSchema', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- schemaProperty / individual validators ---------------------------

	suite('schemaProperty', () => {

		test('validates primitive types', () => {
			const str = schemaProperty<string>({ type: 'string', title: 's' });
			assert.strictEqual(str.validate('hello'), true);
			assert.strictEqual(str.validate(42), false);
			assert.strictEqual(str.validate(undefined), false);
			assert.strictEqual(str.validate(null), false);

			const num = schemaProperty<number>({ type: 'number', title: 'n' });
			assert.strictEqual(num.validate(42), true);
			assert.strictEqual(num.validate('42'), false);

			const bool = schemaProperty<boolean>({ type: 'boolean', title: 'b' });
			assert.strictEqual(bool.validate(true), true);
			assert.strictEqual(bool.validate(0), false);
		});

		test('enforces enum values', () => {
			const prop = schemaProperty<'a' | 'b'>({
				type: 'string',
				title: 'letters',
				enum: ['a', 'b'],
			});
			assert.strictEqual(prop.validate('a'), true);
			assert.strictEqual(prop.validate('b'), true);
			assert.strictEqual(prop.validate('c'), false);
			assert.strictEqual(prop.validate(42), false);
		});

		test('enumDynamic bypasses enum check but keeps type check', () => {
			const prop = schemaProperty<string>({
				type: 'string',
				title: 'dyn',
				enum: ['seed'],
				enumDynamic: true,
			});
			assert.strictEqual(prop.validate('seed'), true);
			assert.strictEqual(prop.validate('anything-else'), true);
			assert.strictEqual(prop.validate(42), false);
		});

		test('validates nested objects and required keys', () => {
			const prop = schemaProperty<{ name: string; age?: number }>({
				type: 'object',
				title: 'person',
				properties: {
					name: { type: 'string', title: 'name' },
					age: { type: 'number', title: 'age' },
				},
				required: ['name'],
			});
			assert.strictEqual(prop.validate({ name: 'alice' }), true);
			assert.strictEqual(prop.validate({ name: 'alice', age: 30 }), true);
			assert.strictEqual(prop.validate({ age: 30 }), false);
			assert.strictEqual(prop.validate({ name: 42 }), false);
			assert.strictEqual(prop.validate([]), false);
			assert.strictEqual(prop.validate(null), false);
		});

		test('validates arrays with item schema', () => {
			const prop = schemaProperty<string[]>({
				type: 'array',
				title: 'names',
				items: { type: 'string', title: 'name' },
			});
			assert.strictEqual(prop.validate(['a', 'b']), true);
			assert.strictEqual(prop.validate([]), true);
			assert.strictEqual(prop.validate(['a', 42]), false);
			assert.strictEqual(prop.validate('a'), false);
		});

		test('assertValid throws ProtocolError with offending path for primitive mismatch', () => {
			const prop = schemaProperty<string>({ type: 'string', title: 's' });
			const err = captureProtocolError(() => prop.assertValid(42, 'myKey'));
			assert.strictEqual(err.code, JsonRpcErrorCodes.InvalidParams);
			assert.ok(err.message.includes('myKey'), err.message);
			assert.ok(err.message.includes('string'), err.message);
		});

		test('assertValid path annotates array index and nested property', () => {
			const prop = schemaProperty<{ allow: string[] }>({
				type: 'object',
				title: 'perms',
				properties: {
					allow: {
						type: 'array',
						title: 'allow',
						items: { type: 'string', title: 'name' },
					},
				},
			});
			const err = captureProtocolError(() => prop.assertValid({ allow: ['ok', 42] }, 'permissions'));
			assert.ok(err.message.includes('permissions.allow[1]'), err.message);
			assert.ok(err.message.includes('string'), err.message);
		});

		test('assertValid path reports missing required property', () => {
			const prop = schemaProperty<{ name: string }>({
				type: 'object',
				title: 'person',
				properties: { name: { type: 'string', title: 'name' } },
				required: ['name'],
			});
			const err = captureProtocolError(() => prop.assertValid({}, 'person'));
			assert.ok(err.message.includes('person.name'), err.message);
			assert.ok(err.message.toLowerCase().includes('required'), err.message);
		});

		test('assertValid reports enum violation with the allowed set', () => {
			const prop = schemaProperty<'a' | 'b'>({
				type: 'string',
				title: 'letters',
				enum: ['a', 'b'],
			});
			const err = captureProtocolError(() => prop.assertValid('c', 'choice'));
			assert.ok(err.message.includes('choice'), err.message);
			assert.ok(err.message.includes('"a"'), err.message);
			assert.ok(err.message.includes('"b"'), err.message);
		});
	});

	// ---- createSchema ------------------------------------------------------

	suite('createSchema', () => {

		const fixture = () => createSchema({
			name: schemaProperty<string>({ type: 'string', title: 'name' }),
			count: schemaProperty<number>({ type: 'number', title: 'count' }),
			level: schemaProperty<'low' | 'high'>({
				type: 'string',
				title: 'level',
				enum: ['low', 'high'],
			}),
		});

		test('toProtocol emits a JSON-Schema-compatible object', () => {
			const schema = fixture();
			const protocol = schema.toProtocol();
			assert.strictEqual(protocol.type, 'object');
			assert.deepStrictEqual(Object.keys(protocol.properties), ['name', 'count', 'level']);
			assert.strictEqual(protocol.properties.name.type, 'string');
			assert.deepStrictEqual(protocol.properties.level.enum, ['low', 'high']);
		});

		test('validate returns false for unknown keys', () => {
			const schema = fixture();
			assert.strictEqual(schema.validate('name', 'ok'), true);
			assert.strictEqual(schema.validate('name', 42), false);
			assert.strictEqual(schema.validate('unknown' as 'name', 'ok'), false);
		});

		test('assertValid throws for unknown keys', () => {
			const schema = fixture();
			const err = captureProtocolError(() => schema.assertValid('unknown' as 'name', 'x'));
			assert.ok(err.message.includes('unknown'), err.message);
		});

		test('values returns a shallow copy and passes through unknown keys', () => {
			const schema = fixture();
			const input = { name: 'alice', count: 3, extra: 'forward-compat' };
			const out = schema.values(input);
			assert.notStrictEqual(out, input);
			assert.deepStrictEqual(out, input);
		});

		test('values skips undefined entries without throwing', () => {
			const schema = fixture();
			const out = schema.values({ name: 'alice' });
			assert.deepStrictEqual(out, { name: 'alice' });
		});

		test('values throws a path-annotated ProtocolError on invalid entry', () => {
			const schema = fixture();
			const err = captureProtocolError(() => schema.values({ name: 42 as unknown as string }));
			assert.strictEqual(err.code, JsonRpcErrorCodes.InvalidParams);
			assert.ok(err.message.includes('name'), err.message);
		});

		test('definition is preserved for spread-based composition', () => {
			const base = createSchema({
				a: schemaProperty<string>({ type: 'string', title: 'a' }),
			});
			const extended = createSchema({
				...base.definition,
				b: schemaProperty<number>({ type: 'number', title: 'b' }),
			});
			assert.deepStrictEqual(Object.keys(extended.toProtocol().properties), ['a', 'b']);
			assert.strictEqual(extended.validate('a', 'hi'), true);
			assert.strictEqual(extended.validate('b', 3), true);
		});
	});

	// ---- validateOrDefault -------------------------------------------------

	suite('validateOrDefault', () => {

		const fixture = () => createSchema({
			name: schemaProperty<string>({ type: 'string', title: 'name' }),
			count: schemaProperty<number>({ type: 'number', title: 'count' }),
		});

		test('substitutes defaults for missing or invalid values', () => {
			const schema = fixture();
			const defaults = { name: 'default', count: 0 };
			const result = schema.validateOrDefault({ name: 42, count: 5 }, defaults);
			assert.deepStrictEqual(result, { name: 'default', count: 5 });
		});

		test('passes through all-valid values', () => {
			const schema = fixture();
			const result = schema.validateOrDefault({ name: 'alice', count: 3 }, { name: 'd', count: 0 });
			assert.deepStrictEqual(result, { name: 'alice', count: 3 });
		});

		test('uses defaults when input is undefined', () => {
			const schema = fixture();
			const result = schema.validateOrDefault(undefined, { name: 'd', count: 7 });
			assert.deepStrictEqual(result, { name: 'd', count: 7 });
		});

		test('ignores keys not in defaults', () => {
			const schema = fixture();
			// @ts-expect-error: test that extra keys not in the defaults are ignored, even if they pass validation.
			const result = schema.validateOrDefault({ name: 'a', count: 1, ignored: true }, { name: 'd', count: 0 });
			assert.deepStrictEqual(result, { name: 'a', count: 1 });
		});

		test('omits schema keys that are missing from both values and defaults', () => {
			// Regression coverage for the partial-defaults contract that
			// underpins host-level inheritance: if the caller doesn't supply
			// a default and no incoming value is valid, the key is left out
			// entirely so higher-scope defaults can fill in.
			const schema = fixture();
			const result = schema.validateOrDefault({ count: 9 }, { count: 0 });
			assert.deepStrictEqual(result, { count: 9 });
			assert.ok(!result.hasOwnProperty('name'), '`name` should be absent when neither values nor defaults supply it');
		});

		test('omits schema keys when value is invalid and no default is supplied', () => {
			const schema = fixture();
			// @ts-expect-error: test that invalid values are dropped even when the caller doesn't provide a default.
			const result = schema.validateOrDefault({ name: 42, count: 3 }, { count: 0 });
			// `name` has no default and the incoming value is invalid → dropped.
			assert.deepStrictEqual(result, { count: 3 });
		});
	});

	// ---- platformSessionSchema sanity --------------------------------------

	suite('platformSessionSchema', () => {

		test('validates the three autoApprove levels', () => {
			const levels: AutoApproveLevel[] = ['default', 'autoApprove', 'autopilot'];
			for (const level of levels) {
				assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, level), true, level);
			}
			assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.AutoApprove, 'bogus'), false);
		});

		test('validates permissions shape', () => {
			const ok: IPermissionsValue = { allow: ['read'], deny: [] };
			assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Permissions, ok), true);
			assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Permissions, { allow: [42], deny: [] }), false);
			assert.strictEqual(platformSessionSchema.validate(SessionConfigKey.Permissions, { allow: [] }), true);
		});
	});
});
