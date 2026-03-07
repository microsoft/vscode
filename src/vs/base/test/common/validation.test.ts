/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';
import {
	vString, vNumber, vBoolean, vObjAny, vUnchecked, vUndefined, vUnknown,
	vOptionalProp, vObj, vArray, vTuple, vUnion, vEnum, vLiteral, vLazy,
	vWithJsonSchemaRef
} from '../../common/validation.js';

suite('Validation', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('vString', () => {
		const validator = vString();
		assert.deepStrictEqual(validator.validate('hello'), { content: 'hello', error: undefined });
		assert.deepStrictEqual(validator.validate(123), { content: undefined, error: { message: 'Expected string, but got number' } });
		assert.deepStrictEqual(validator.getJSONSchema(), { type: 'string' });
	});

	test('vNumber', () => {
		const validator = vNumber();
		assert.deepStrictEqual(validator.validate(123), { content: 123, error: undefined });
		assert.deepStrictEqual(validator.validate('hello'), { content: undefined, error: { message: 'Expected number, but got string' } });
		assert.deepStrictEqual(validator.getJSONSchema(), { type: 'number' });
	});

	test('vBoolean', () => {
		const validator = vBoolean();
		assert.deepStrictEqual(validator.validate(true), { content: true, error: undefined });
		assert.deepStrictEqual(validator.validate(false), { content: false, error: undefined });
		assert.deepStrictEqual(validator.validate('hello'), { content: undefined, error: { message: 'Expected boolean, but got string' } });
		assert.deepStrictEqual(validator.getJSONSchema(), { type: 'boolean' });
	});

	test('vObjAny', () => {
		const validator = vObjAny();
		assert.deepStrictEqual(validator.validate({}), { content: {}, error: undefined });
		assert.deepStrictEqual(validator.validate({ a: 1 }), { content: { a: 1 }, error: undefined });
		assert.deepStrictEqual(validator.validate('hello'), { content: undefined, error: { message: 'Expected object, but got string' } });
		assert.deepStrictEqual(validator.getJSONSchema(), { type: 'object' });
	});

	test('vUnchecked', () => {
		const validator = vUnchecked<any>();
		assert.deepStrictEqual(validator.validate(123), { content: 123, error: undefined });
		assert.deepStrictEqual(validator.validate('hello'), { content: 'hello', error: undefined });
		assert.deepStrictEqual(validator.getJSONSchema(), {});
	});

	test('vUndefined', () => {
		const validator = vUndefined();
		assert.deepStrictEqual(validator.validate(undefined), { content: undefined, error: undefined });
		assert.deepStrictEqual(validator.validate(null), { content: undefined, error: { message: 'Expected undefined, but got object' } });
		assert.deepStrictEqual(validator.validate(123), { content: undefined, error: { message: 'Expected undefined, but got number' } });
		assert.deepStrictEqual(validator.getJSONSchema(), {});
	});

	test('vUnknown', () => {
		const validator = vUnknown();
		assert.deepStrictEqual(validator.validate(123), { content: 123, error: undefined });
		assert.deepStrictEqual(validator.validate('hello'), { content: 'hello', error: undefined });
		assert.deepStrictEqual(validator.getJSONSchema(), {});
	});

	test('vObj', () => {
		const validator = vObj({
			a: vString(),
			b: vOptionalProp(vNumber())
		});

		assert.deepStrictEqual(validator.validate({ a: 'hello', b: 123 }), { content: { a: 'hello', b: 123 }, error: undefined });
		assert.deepStrictEqual(validator.validate({ a: 'hello' }), { content: { a: 'hello' }, error: undefined });

		const r1 = validator.validate({ a: 123 });
		assert.strictEqual(r1.content, undefined);
		assert.strictEqual(r1.error?.message, "Error in property 'a': Expected string, but got number");

		const r2 = validator.validate({ a: 'hello', b: 'world' });
		assert.strictEqual(r2.content, undefined);
		assert.strictEqual(r2.error?.message, "Error in property 'b': Expected number, but got string");

		const r3 = validator.validate(null);
		assert.strictEqual(r3.content, undefined);
		assert.strictEqual(r3.error?.message, 'Expected object');

		assert.deepStrictEqual(validator.getJSONSchema(), {
			type: 'object',
			properties: {
				a: { type: 'string' },
				b: { type: 'number' }
			},
			required: ['a']
		});
	});

	test('vArray', () => {
		const validator = vArray(vString());
		assert.deepStrictEqual(validator.validate(['hello', 'world']), { content: ['hello', 'world'], error: undefined });
		assert.deepStrictEqual(validator.validate([]), { content: [], error: undefined });

		const r1 = validator.validate(['hello', 123]);
		assert.strictEqual(r1.content, undefined);
		assert.strictEqual(r1.error?.message, 'Error in element 1: Expected string, but got number');

		const r2 = validator.validate('hello');
		assert.strictEqual(r2.content, undefined);
		assert.strictEqual(r2.error?.message, 'Expected array');

		assert.deepStrictEqual(validator.getJSONSchema(), {
			type: 'array',
			items: { type: 'string' }
		});
	});

	test('vTuple', () => {
		const validator = vTuple(vString(), vNumber());
		assert.deepStrictEqual(validator.validate(['hello', 123]), { content: ['hello', 123], error: undefined });

		const r1 = validator.validate(['hello', 'world']);
		assert.strictEqual(r1.content, undefined);
		assert.strictEqual(r1.error?.message, 'Error in element 1: Expected number, but got string');

		const r2 = validator.validate(['hello']);
		assert.strictEqual(r2.content, undefined);
		assert.strictEqual(r2.error?.message, 'Expected tuple of length 2, but got 1');

		const r3 = validator.validate('hello');
		assert.strictEqual(r3.content, undefined);
		assert.strictEqual(r3.error?.message, 'Expected array');

		assert.deepStrictEqual(validator.getJSONSchema(), {
			type: 'array',
			items: [{ type: 'string' }, { type: 'number' }]
		});
	});

	test('vUnion', () => {
		const validator = vUnion(vString(), vNumber());
		assert.deepStrictEqual(validator.validate('hello'), { content: 'hello', error: undefined });
		assert.deepStrictEqual(validator.validate(123), { content: 123, error: undefined });

		const r1 = validator.validate(true);
		assert.strictEqual(r1.content, undefined);
		assert.strictEqual(r1.error?.message, 'Expected number, but got boolean'); // Returns the error from the last validator

		assert.deepStrictEqual(validator.getJSONSchema(), {
			oneOf: [{ type: 'string' }, { type: 'number' }]
		});
	});

	test('vUnion with Undefined', () => {
		const validator = vUnion(vString(), vUndefined());
		assert.deepStrictEqual(validator.validate('hello'), { content: 'hello', error: undefined });
		assert.deepStrictEqual(validator.validate(undefined), { content: undefined, error: undefined });

		assert.deepStrictEqual(validator.getJSONSchema(), {
			oneOf: [{ type: 'string' }]
		});
	});

	test('vEnum', () => {
		const validator = vEnum('a', 'b', 'c');
		assert.deepStrictEqual(validator.validate('a'), { content: 'a', error: undefined });
		assert.deepStrictEqual(validator.validate('b'), { content: 'b', error: undefined });

		const r1 = validator.validate('d');
		assert.strictEqual(r1.content, undefined);
		assert.strictEqual(r1.error?.message, 'Expected one of: a, b, c');

		assert.deepStrictEqual(validator.getJSONSchema(), {
			enum: ['a', 'b', 'c']
		});
	});

	test('vLiteral', () => {
		const validator = vLiteral('hello');
		assert.deepStrictEqual(validator.validate('hello'), { content: 'hello', error: undefined });

		const r1 = validator.validate('world');
		assert.strictEqual(r1.content, undefined);
		assert.strictEqual(r1.error?.message, 'Expected: hello');

		assert.deepStrictEqual(validator.getJSONSchema(), {
			const: 'hello'
		});
	});

	test('vLazy', () => {
		const validator = vLazy(() => vString());
		assert.deepStrictEqual(validator.validate('hello'), { content: 'hello', error: undefined });

		const r1 = validator.validate(123);
		assert.strictEqual(r1.content, undefined);
		assert.strictEqual(r1.error?.message, 'Expected string, but got number');

		assert.deepStrictEqual(validator.getJSONSchema(), { type: 'string' });
	});

	test('vWithJsonSchemaRef', () => {
		const validator = vWithJsonSchemaRef('#/definitions/hello', vString());
		assert.deepStrictEqual(validator.validate('hello'), { content: 'hello', error: undefined });

		const r1 = validator.validate(123);
		assert.strictEqual(r1.content, undefined);
		assert.strictEqual(r1.error?.message, 'Expected string, but got number');

		assert.deepStrictEqual(validator.getJSONSchema(), { $ref: '#/definitions/hello' });
	});

	test('validateOrThrow', () => {
		const validator = vString();
		assert.strictEqual(validator.validateOrThrow('hello'), 'hello');

		assert.throws(() => validator.validateOrThrow(123), new Error('Expected string, but got number'));
	});
});
