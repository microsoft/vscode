/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { parse, SchemaError } from '../../common/client/schema.js';

suite('GitHub client schema', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('parses strings, booleans and literal choices without coercion', () => {
		const cases = [
			{ parser: parse.string, valid: ['', 'value'], invalid: [null, undefined, 1, true] },
			{ parser: parse.nonEmptyString, valid: ['value', ' '], invalid: ['', null, undefined] },
			{ parser: parse.boolean, valid: [true, false], invalid: [0, 1, 'true'] },
			{ parser: parse.oneOf('queued', 'done'), valid: ['queued', 'done'], invalid: ['QUEUED', false] },
			{ parser: parse.oneOf(1, 2), valid: [1, 2], invalid: ['1', true, 3] },
			{ parser: parse.oneOf(false), valid: [false], invalid: [true, 'false', 0] },
		];
		for (const { parser, valid, invalid } of cases) {
			assert.deepStrictEqual(valid.map(value => parser(value)), valid);
			for (const value of invalid) {
				assert.throws(() => parser(value), SchemaError);
			}
		}
	});

	test('enforces finite numbers, safe integers and inclusive bounds', () => {
		const cases = [
			{ parser: parse.finiteNumber, valid: [-1, 0, 1.5], invalid: [NaN, Infinity, -Infinity, '1'] },
			{ parser: parse.integer, valid: [-1, 0, Number.MAX_SAFE_INTEGER], invalid: [1.5, Number.MAX_SAFE_INTEGER + 1, '1'] },
			{ parser: parse.nonNegativeInteger, valid: [0, Number.MAX_SAFE_INTEGER], invalid: [-1, 0.5, Infinity] },
			{ parser: parse.range(1, 3), valid: [1, 2, 3], invalid: [0, 4, 2.5, '2'] },
		];
		for (const { parser, valid, invalid } of cases) {
			assert.deepStrictEqual(valid.map(value => parser(value)), valid);
			for (const value of invalid) {
				assert.throws(() => parser(value), SchemaError);
			}
		}
	});

	test('preserves RFC 3339 date-time strings and rejects missing time zones', () => {
		const dates = ['2026-10-07T21:00:00Z', '2026-10-07T21:00:00.123-07:00', '2026-10-08T09:30:00+05:30'];
		assert.deepStrictEqual(dates.map(parse.dateTime), dates);
		for (const value of [null, 123, '2026-10-07', '2026-10-07T21:00:00', '2026-13-07T21:00:00Z']) {
			assert.throws(() => parse.dateTime(value), SchemaError);
		}
	});

	test('distinguishes missing optional fields from explicit null', () => {
		const parser = parse.object({
			required: parse.string,
			optional: parse.optional(parse.string),
			nullable: parse.nullable(parse.string),
			both: parse.optional(parse.nullable(parse.string)),
		});
		assert.deepStrictEqual([
			parser({ required: 'value', nullable: null }),
			parser({ required: 'value', optional: undefined, nullable: null, both: undefined }),
			parser({ required: 'value', optional: '', nullable: '', both: null }),
		], [
			{ required: 'value', nullable: null },
			{ required: 'value', nullable: null },
			{ required: 'value', optional: '', nullable: '', both: null },
		]);
		for (const value of [{ nullable: null }, { required: 'value' }, { required: 'value', nullable: null, optional: null }]) {
			assert.throws(() => parser(value), SchemaError);
		}
	});

	test('composes collections and omits unknown fields without mutating the input', () => {
		const parser = parse.object({
			items: parse.arrayOf(parse.object({
				name: parse.nonEmptyString,
				labels: parse.strings,
				counts: parse.dictionary(parse.integer),
			})),
		});
		const input = { items: [{ name: 'one', labels: ['a', 'b'], counts: { open: 1, closed: 0 }, ignored: 'extra' }], ignored: true };
		const original = structuredClone(input);
		assert.deepStrictEqual({ result: parser(input), input }, {
			result: { items: [{ name: 'one', labels: ['a', 'b'], counts: { open: 1, closed: 0 } }] },
			input: original,
		});
	});

	test('rejects malformed collections and reports nested locations without payload values', () => {
		const parser = parse.object({ items: parse.arrayOf(parse.dictionary(parse.integer)) });
		for (const value of [null, [], {}, { items: {} }, { items: [null] }, { items: [[]] }]) {
			assert.throws(() => parser(value), SchemaError);
		}
		assert.throws(() => parser({ items: [{ count: 1 }, { count: 'secret-value' }] }),
			/^SchemaError: Invalid value at key "items": Invalid value at index 1: Invalid value at key "count": Expected a safe integer$/);
	});

	test('preserves nested JSON and rejects non-JSON values', () => {
		const input = { event: { payload: [null, true, 'value', 1.5, { flags: [] }] } };
		assert.deepStrictEqual([parse.jsonValue(input), parse.jsonObject(input)], [input, input]);
		for (const value of [undefined, NaN, Infinity, () => { }, 1n]) {
			assert.throws(() => parse.jsonObject({ payload: [value] }), SchemaError);
		}
		for (const value of [null, [], 1]) {
			assert.throws(() => parse.jsonObject(value), SchemaError);
		}
	});

	test('refines and amends parsed objects with overrides without mutating the input', () => {
		const parser = parse.amend(parse.object({
			label: parse.refine(parse.string, value => value.length > 0, 'Label must not be empty'),
			count: parse.nonNegativeInteger,
		}), value => ({ label: value.label.trim(), active: value.count > 0 }));
		const input = Object.freeze({ label: '  Ready  ', count: 1 });
		assert.deepStrictEqual({ result: parser(input), input }, {
			result: { label: 'Ready', count: 1, active: true },
			input: { label: '  Ready  ', count: 1 },
		});
		assert.throws(() => parser({ label: '', count: 1 }), /^SchemaError: Invalid value at key "label": Label must not be empty$/);
		assert.throws(() => parser({ label: 42, count: 1 }), /^SchemaError: Invalid value at key "label": Expected a string$/);
	});

	test('propagates non-schema errors unchanged through nested parsers', () => {
		const error = new Error('Parser failed');
		const parser = parse.object({ items: parse.arrayOf(parse.dictionary(() => { throw error; })) });
		assert.throws(() => parser({ items: [{ count: 1 }] }), function isOriginalError(actual: unknown) {
			return actual === error;
		});
	});

	test('returns parsed JSON payloads without copying and rejects non-plain objects and arrays', () => {
		class Payload { readonly value = 1; }
		class PayloadArray extends Array { }
		const plain = JSON.parse('{"nested":{"items":[1,{"ok":true}]}}');
		assert.deepStrictEqual([parse.jsonValue(plain) === plain, parse.jsonObject(plain) === plain], [true, true]);
		for (const value of [new Payload(), new Date(0), new Map(), new Uint8Array(1), Object.create(null), PayloadArray.from([1]), new Array(1)]) {
			assert.throws(() => parse.jsonValue({ payload: [value] }), SchemaError);
		}
		assert.throws(() => parse.jsonValue({ payload: [new Payload()] }),
			/^SchemaError: Invalid value at key "payload": Invalid value at index 0: Expected a JSON object$/);
	});

	test('reads only own properties and preserves __proto__ as a data key', () => {
		const inherited = Object.create({ name: 'inherited' });
		const withProto = JSON.parse('{"__proto__":1,"other":2}');
		const dictionary = parse.dictionary(parse.integer)(withProto);
		const object = parse.object({ name: parse.optional(parse.string) })(inherited);
		assert.deepStrictEqual({
			object,
			dictionaryKeys: Object.keys(dictionary),
			dictionaryPrototype: Object.getPrototypeOf(dictionary) === Object.prototype,
			dictionaryValue: Object.getOwnPropertyDescriptor(dictionary, '__proto__')?.value,
		}, {
			object: {},
			dictionaryKeys: ['__proto__', 'other'],
			dictionaryPrototype: true,
			dictionaryValue: 1,
		});
	});
});
