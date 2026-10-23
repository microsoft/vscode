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
			{
				parser: parse.sha,
				valid: ['0123456789abcdef0123456789abcdef01234567', '0'.repeat(40), '0123456789abcdef'.repeat(4)],
				invalid: ['', null, undefined, 1, 'a'.repeat(39), 'a'.repeat(41), 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(40), 'g'.repeat(40), 'A'.repeat(64), `${'a'.repeat(40)}\n`, `${'a'.repeat(64)}\n`],
			},
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
			{ required: 'value', optional: undefined, nullable: null, both: undefined },
			{ required: 'value', optional: '', nullable: '', both: null },
		]);
		for (const value of [{ nullable: null }, { required: 'value' }, { required: 'value', nullable: null, optional: null }]) {
			assert.throws(() => parser(value), SchemaError);
		}
	});

	test('reuses unchanged collections and preserves extra fields without mutating the input', () => {
		const parser = parse.object({
			items: parse.arrayOf(parse.object({
				name: parse.nonEmptyString,
				labels: parse.strings,
				counts: parse.dictionary(parse.integer),
			})),
		});
		const input = { items: [{ name: 'one', labels: ['a', 'b'], counts: { open: 1, closed: 0 }, ignored: 'extra' }], ignored: true };
		const original = structuredClone(input);
		const result = parser(input);
		assert.deepStrictEqual({
			result, input,
			shared: [
				result === input,
				result.items === input.items,
				result.items[0] === input.items[0],
				result.items[0].labels === input.items[0].labels,
				result.items[0].counts === input.items[0].counts,
			],
		}, {
			result: original,
			input: original,
			shared: [true, true, true, true, true],
		});
	});

	test('copyObject creates fresh objects and omits unknown and undefined fields', () => {
		const parser = parse.copyObject({
			name: value => parse.string(value).trim(),
			optional: parse.optional(parse.string),
			nullable: parse.nullable(parse.string),
		});
		const input = Object.freeze({ name: ' value ', optional: undefined, nullable: null, extra: true });
		const result = parser(input);
		const copied = parser(result);
		assert.deepStrictEqual({
			result,
			copied,
			fresh: [result !== input, copied !== result],
			input,
		}, {
			result: { name: 'value', nullable: null },
			copied: { name: 'value', nullable: null },
			fresh: [true, true],
			input: { name: ' value ', optional: undefined, nullable: null, extra: true },
		});
	});

	test('copyObject uses nested parsers to choose filtering or reuse', () => {
		const input = {
			filtered: { value: 1, extra: true },
			retained: { value: 2, extra: true },
			extra: true,
		};
		const result = parse.copyObject({
			filtered: parse.copyObject({ value: parse.integer }),
			retained: parse.object({ value: parse.integer }),
		})(input);
		assert.deepStrictEqual({
			result,
			filteredCopied: result.filtered !== input.filtered,
			retainedShared: result.retained === input.retained,
			inputUnchanged: input.filtered.extra,
		}, {
			result: { filtered: { value: 1 }, retained: { value: 2, extra: true } },
			filteredCopied: true,
			retainedShared: true,
			inputUnchanged: true,
		});
	});

	test('copyObject validates own fields and preserves nested error locations', () => {
		const parser = parse.copyObject({ name: parse.string });
		for (const value of [null, [], 'value', {}, Object.create({ name: 'inherited' })]) {
			assert.throws(() => parser(value), SchemaError);
		}
		const nested = parse.copyObject({ items: parse.arrayOf(parse.copyObject({ count: parse.integer })) });
		assert.throws(() => nested({ items: [{ count: 'private-value' }] }),
			/^SchemaError: Invalid value at key "items": Invalid value at index 0: Invalid value at key "count": Expected a safe integer$/);
		const withProto = parse.copyObject({
			['__proto__']: parse.integer,
			constructor: parse.optional(parse.string),
			toString: parse.optional(parse.string),
		})(JSON.parse('{"__proto__":1,"extra":true}'));
		assert.deepStrictEqual({
			keys: Object.keys(withProto),
			prototype: Object.getPrototypeOf(withProto) === Object.prototype,
			value: Object.getOwnPropertyDescriptor(withProto, '__proto__')?.value,
		}, { keys: ['__proto__'], prototype: true, value: 1 });
	});

	test('copies only transformed collections and preserves untouched children', () => {
		const unchanged = Object.freeze({ label: 'Ready', extra: true });
		const changed = Object.freeze({ label: ' Updated ', extra: true });
		const input = Object.freeze({
			items: Object.freeze([unchanged, changed]),
			counts: Object.freeze({ value: -0 }),
			extra: 'preserved',
		});
		const parser = parse.object({
			items: parse.arrayOf(parse.object({ label: value => parse.string(value).trim() })),
			counts: parse.dictionary(parse.exact(0)),
		});
		const result = parser(input);
		assert.deepStrictEqual({
			result,
			copied: [!Object.is(result, input), !Object.is(result.items, input.items), !Object.is(result.items[1], changed), !Object.is(result.counts, input.counts)],
			sharedChild: result.items[0] === unchanged,
			inputLabel: changed.label,
			inputNegativeZero: Object.is(input.counts.value, -0),
		}, {
			result: { items: [unchanged, { label: 'Updated', extra: true }], counts: { value: 0 }, extra: 'preserved' },
			copied: [true, true, true, true],
			sharedChild: true,
			inputLabel: ' Updated ',
			inputNegativeZero: true,
		});
	});

	test('preserves own non-enumerable fields when a transformation requires a copy', () => {
		const input = Object.defineProperty({ count: 1, extra: true }, 'name', { value: 'one' });
		const result = parse.object({ name: parse.string, count: value => parse.integer(value) + 1 })(input);
		assert.deepStrictEqual({
			result,
			inputCount: input.count,
			name: Object.getOwnPropertyDescriptor(result, 'name')?.value,
		}, {
			result: { count: 2, extra: true, name: 'one' },
			inputCount: 1,
			name: 'one',
		});
	});

	test('applies defaults and undefined transformations without modifying input', () => {
		const input = Object.freeze({ clear: 1, optional: undefined, extra: true });
		const result = parse.object({
			clear: () => undefined,
			optional: parse.optional(parse.string),
			added: value => value === undefined ? 'default' : parse.string(value),
		})(input);
		assert.deepStrictEqual({ result, input }, {
			result: { clear: undefined, optional: undefined, extra: true, added: 'default' },
			input: { clear: 1, optional: undefined, extra: true },
		});
	});

	test('does not mutate collections when a later value fails validation', () => {
		const input = Object.freeze({ first: ' trim ', second: 1 });
		const parser = parse.dictionary(value => parse.string(value).trim());
		assert.throws(() => parser(input), SchemaError);
		assert.deepStrictEqual(input, { first: ' trim ', second: 1 });
	});

	test('validates retained non-enumerable dictionary values', () => {
		const valid = Object.defineProperty({ count: 1 }, 'hidden', { value: 2 });
		const invalid = Object.defineProperty({ count: 1 }, 'hidden', { value: 'invalid' });
		const parser = parse.dictionary(parse.integer);
		assert.strictEqual(parser(valid), valid);
		assert.throws(() => parser(invalid), SchemaError);
	});

	test('validates sparse array holes as undefined', () => {
		const input = new Array<number>(2);
		input[1] = 1;
		assert.throws(() => parse.arrayOf(parse.integer)(input),
			/^SchemaError: Invalid value at index 0: Expected a safe integer$/);
		assert.strictEqual(parse.arrayOf(parse.optional(parse.integer))(input), input);
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

	test('transforms __proto__ data fields without changing prototypes or inputs', () => {
		const input = JSON.parse('{"__proto__":1,"other":2}');
		const increment = (value: unknown) => parse.integer(value) + 1;
		const dictionary = parse.dictionary(increment)(input);
		const object = parse.object({ ['__proto__']: increment })(input);
		assert.deepStrictEqual({
			values: [dictionary.__proto__, object.__proto__, input.__proto__],
			ordinaryPrototypes: [dictionary, object, input].map(value => Object.getPrototypeOf(value) === Object.prototype),
			dictionaryKeys: Object.keys(dictionary),
			objectKeys: Object.keys(object),
		}, {
			values: [2, 2, 1],
			ordinaryPrototypes: [true, true, true],
			dictionaryKeys: ['__proto__', 'other'],
			objectKeys: ['__proto__', 'other'],
		});
	});

	test('copying an object-valued __proto__ field preserves it as data and retains symbols', () => {
		const marker = Symbol('marker');
		const prototypeValue = Object.freeze({ inherited: true });
		const input = Object.freeze({ ['__proto__']: prototypeValue, count: 1, [marker]: 'retained' });
		const result = parse.object({ count: value => parse.integer(value) + 1 })(input);
		assert.deepStrictEqual({
			count: result.count,
			inputCount: input.count,
			plainPrototype: Object.getPrototypeOf(result) === Object.prototype,
			prototypeField: Object.getOwnPropertyDescriptor(result, '__proto__')?.value === prototypeValue,
			symbolValue: Object.getOwnPropertyDescriptor(result, marker)?.value,
		}, {
			count: 2,
			inputCount: 1,
			plainPrototype: true,
			prototypeField: true,
			symbolValue: 'retained',
		});
	});
});
