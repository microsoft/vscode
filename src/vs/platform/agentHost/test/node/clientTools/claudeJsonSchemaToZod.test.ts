/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { z } from 'zod';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { jsonSchemaToZodRawShape } from '../../../node/claude/clientTools/claudeJsonSchemaToZod.js';

function parse(shape: Record<string, z.ZodTypeAny>, value: unknown) {
	return z.object(shape).safeParse(value);
}

suite('claudeJsonSchemaToZod', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty / undefined schema returns empty shape', () => {
		assert.deepStrictEqual(Object.keys(jsonSchemaToZodRawShape(undefined)), []);
		assert.deepStrictEqual(Object.keys(jsonSchemaToZodRawShape({ type: 'object' })), []);
	});

	test('primitives + required vs optional wrapping', () => {
		const shape = jsonSchemaToZodRawShape({
			type: 'object',
			properties: {
				a: { type: 'string' },
				b: { type: 'number' },
				c: { type: 'integer' },
				d: { type: 'boolean' },
			},
			required: ['a'],
		});
		assert.strictEqual(parse(shape, { a: 'x' }).success, true, 'omitting optional props OK');
		assert.strictEqual(parse(shape, {}).success, false, 'missing required a fails');
		assert.strictEqual(parse(shape, { a: 'x', c: 1.5 }).success, false, 'integer rejects float');
		assert.strictEqual(parse(shape, { a: 'x', c: 1, b: 2, d: true }).success, true);
	});

	test('arrays + nested objects + enum + oneOf + null', () => {
		const shape = jsonSchemaToZodRawShape({
			type: 'object',
			properties: {
				list: { type: 'array', items: { type: 'string' } },
				nested: {
					type: 'object',
					properties: { inner: { type: 'number' } },
					required: ['inner'],
				},
				color: { enum: ['red', 'blue', 'green'] },
				one: { enum: ['only'] },
				either: { oneOf: [{ type: 'string' }, { type: 'number' }] },
				nope: { type: 'null' },
			},
			required: ['list', 'nested', 'color', 'one', 'either', 'nope'],
		});
		const ok = parse(shape, {
			list: ['a', 'b'],
			nested: { inner: 1 },
			color: 'red',
			one: 'only',
			either: 'hi',
			nope: null,
		});
		assert.strictEqual(ok.success, true);
		assert.strictEqual(parse(shape, { list: [1], nested: { inner: 1 }, color: 'red', one: 'only', either: 'x', nope: null }).success, false, 'array items typed');
		assert.strictEqual(parse(shape, { list: [], nested: { inner: 1 }, color: 'purple', one: 'only', either: 'x', nope: null }).success, false, 'enum rejects unknown');
		assert.strictEqual(parse(shape, { list: [], nested: { inner: 1 }, color: 'red', one: 'only', either: true, nope: null }).success, false, 'oneOf rejects out-of-union');
	});

	test('nullable + description + default survive conversion', () => {
		const shape = jsonSchemaToZodRawShape({
			type: 'object',
			properties: {
				n: { type: 'string', nullable: true, description: 'a thing', default: 'd' },
			},
			required: ['n'],
		});
		assert.strictEqual(parse(shape, { n: null }).success, true, 'nullable accepts null');
		assert.strictEqual(parse(shape, { n: 'hi' }).success, true);
		assert.strictEqual(parse(shape, { n: 7 }).success, false);
		const withDefault = parse(shape, {});
		assert.strictEqual(withDefault.success, true, 'default fills in missing');
		assert.strictEqual(withDefault.success && (withDefault.data as { n: string }).n, 'd');
	});

	test('unsupported property schema falls back to z.any() — never rejects the tool', () => {
		const shape = jsonSchemaToZodRawShape({
			type: 'object',
			properties: {
				weird: { type: 'totally-bogus' as unknown as string },
				worse: null as unknown as object,
			},
			required: ['weird'],
		});
		assert.strictEqual(parse(shape, { weird: 42 }).success, true, 'any accepts anything');
		assert.strictEqual(parse(shape, { weird: { nested: true }, worse: 'also fine' }).success, true);
	});
});
