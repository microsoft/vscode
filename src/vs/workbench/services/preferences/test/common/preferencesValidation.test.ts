/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationPropertySchema } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { createValidator, getInvalidTypeError } from '../../common/preferencesValidation.js';


suite('Preferences Validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class Tester {
		private validator: (value: any) => string | null;

		constructor(private settings: IConfigurationPropertySchema) {
			this.validator = createValidator(settings)!;
		}

		public accepts(input: any) {
			assert.strictEqual(this.validator(input), '', `Expected ${JSON.stringify(this.settings)} to accept \`${JSON.stringify(input)}\`. Got ${this.validator(input)}.`);
		}

		public rejects(input: any) {
			assert.notStrictEqual(this.validator(input), '', `Expected ${JSON.stringify(this.settings)} to reject \`${JSON.stringify(input)}\`.`);
			return {
				withMessage:
					(message: string) => {
						const actual = this.validator(input);
						assert.ok(actual);
						assert(actual.indexOf(message) > -1,
							`Expected error of ${JSON.stringify(this.settings)} on \`${input}\` to contain ${message}. Got ${this.validator(input)}.`);
					}
			};
		}

		public validatesNumeric() {
			this.accepts('3');
			this.accepts('3.');
			this.accepts('.0');
			this.accepts('3.0');
			this.accepts(' 3.0');
			this.accepts(' 3.0  ');
			this.rejects('3f');
			this.accepts(3);
			this.rejects('test');
		}

		public validatesNullableNumeric() {
			this.validatesNumeric();
			this.accepts(0);
			this.accepts('');
			this.accepts(null);
			this.accepts(undefined);
		}

		public validatesNonNullableNumeric() {
			this.validatesNumeric();
			this.accepts(0);
			this.rejects('');
			this.rejects(null);
			this.rejects(undefined);
		}

		public validatesString() {
			this.accepts('3');
			this.accepts('3.');
			this.accepts('.0');
			this.accepts('3.0');
			this.accepts(' 3.0');
			this.accepts(' 3.0  ');
			this.accepts('');
			this.accepts('3f');
			this.accepts('hello');
			this.rejects(6);
		}
	}


	test('exclusive max and max work together properly', () => {
		{
			const justMax = new Tester({ maximum: 5, type: 'number' });
			justMax.validatesNonNullableNumeric();
			justMax.rejects('5.1');
			justMax.accepts('5.0');
		}
		{
			const justEMax = new Tester({ exclusiveMaximum: 5, type: 'number' });
			justEMax.validatesNonNullableNumeric();
			justEMax.rejects('5.1');
			justEMax.rejects('5.0');
			justEMax.accepts('4.999');
		}
		{
			const bothNumeric = new Tester({ exclusiveMaximum: 5, maximum: 4, type: 'number' });
			bothNumeric.validatesNonNullableNumeric();
			bothNumeric.rejects('5.1');
			bothNumeric.rejects('5.0');
			bothNumeric.rejects('4.999');
			bothNumeric.accepts('4');
		}
		{
			const bothNumeric = new Tester({ exclusiveMaximum: 5, maximum: 6, type: 'number' });
			bothNumeric.validatesNonNullableNumeric();
			bothNumeric.rejects('5.1');
			bothNumeric.rejects('5.0');
			bothNumeric.accepts('4.999');
		}
	});

	test('exclusive min and min work together properly', () => {
		{
			const justMin = new Tester({ minimum: -5, type: 'number' });
			justMin.validatesNonNullableNumeric();
			justMin.rejects('-5.1');
			justMin.accepts('-5.0');
		}
		{
			const justEMin = new Tester({ exclusiveMinimum: -5, type: 'number' });
			justEMin.validatesNonNullableNumeric();
			justEMin.rejects('-5.1');
			justEMin.rejects('-5.0');
			justEMin.accepts('-4.999');
		}
		{
			const bothNumeric = new Tester({ exclusiveMinimum: -5, minimum: -4, type: 'number' });
			bothNumeric.validatesNonNullableNumeric();
			bothNumeric.rejects('-5.1');
			bothNumeric.rejects('-5.0');
			bothNumeric.rejects('-4.999');
			bothNumeric.accepts('-4');
		}
		{
			const bothNumeric = new Tester({ exclusiveMinimum: -5, minimum: -6, type: 'number' });
			bothNumeric.validatesNonNullableNumeric();
			bothNumeric.rejects('-5.1');
			bothNumeric.rejects('-5.0');
			bothNumeric.accepts('-4.999');
		}
	});

	test('multiple of works for both integers and fractions', () => {
		{
			const onlyEvens = new Tester({ multipleOf: 2, type: 'number' });
			onlyEvens.accepts('2.0');
			onlyEvens.accepts('2');
			onlyEvens.accepts('-4');
			onlyEvens.accepts('0');
			onlyEvens.accepts('100');
			onlyEvens.rejects('100.1');
			onlyEvens.rejects('');
			onlyEvens.rejects('we');
		}
		{
			const hackyIntegers = new Tester({ multipleOf: 1, type: 'number' });
			hackyIntegers.accepts('2.0');
			hackyIntegers.rejects('.5');
		}
		{
			const halfIntegers = new Tester({ multipleOf: 0.5, type: 'number' });
			halfIntegers.accepts('0.5');
			halfIntegers.accepts('1.5');
			halfIntegers.rejects('1.51');
		}
	});

	test('integer type correctly adds a validation', () => {
		{
			const integers = new Tester({ multipleOf: 1, type: 'integer' });
			integers.accepts('02');
			integers.accepts('2');
			integers.accepts('20');
			integers.rejects('.5');
			integers.rejects('2j');
			integers.rejects('');
		}
	});

	test('null is allowed only when expected', () => {
		{
			const nullableIntegers = new Tester({ type: ['integer', 'null'] });
			nullableIntegers.accepts('2');
			nullableIntegers.rejects('.5');
			nullableIntegers.accepts('2.0');
			nullableIntegers.rejects('2j');
			nullableIntegers.accepts('');
		}
		{
			const nonnullableIntegers = new Tester({ type: ['integer'] });
			nonnullableIntegers.accepts('2');
			nonnullableIntegers.rejects('.5');
			nonnullableIntegers.accepts('2.0');
			nonnullableIntegers.rejects('2j');
			nonnullableIntegers.rejects('');
		}
		{
			const nullableNumbers = new Tester({ type: ['number', 'null'] });
			nullableNumbers.accepts('2');
			nullableNumbers.accepts('.5');
			nullableNumbers.accepts('2.0');
			nullableNumbers.rejects('2j');
			nullableNumbers.accepts('');
		}
		{
			const nonnullableNumbers = new Tester({ type: ['number'] });
			nonnullableNumbers.accepts('2');
			nonnullableNumbers.accepts('.5');
			nonnullableNumbers.accepts('2.0');
			nonnullableNumbers.rejects('2j');
			nonnullableNumbers.rejects('');
		}
	});

	test('string max min length work', () => {
		{
			const min = new Tester({ minLength: 4, type: 'string' });
			min.rejects('123');
			min.accepts('1234');
			min.accepts('12345');
		}
		{
			const max = new Tester({ maxLength: 6, type: 'string' });
			max.accepts('12345');
			max.accepts('123456');
			max.rejects('1234567');
		}
		{
			const minMax = new Tester({ minLength: 4, maxLength: 6, type: 'string' });
			minMax.rejects('123');
			minMax.accepts('1234');
			minMax.accepts('12345');
			minMax.accepts('123456');
			minMax.rejects('1234567');
		}
	});

	test('objects work', () => {
		{
			const obj = new Tester({ type: 'object', properties: { 'a': { type: 'string', maxLength: 2 } }, additionalProperties: false });
			obj.rejects({ 'a': 'string' });
			obj.accepts({ 'a': 'st' });
			obj.rejects({ 'a': null });
			obj.rejects({ 'a': 7 });
			obj.accepts({});
			obj.rejects('test');
			obj.rejects(7);
			obj.rejects([1, 2, 3]);
		}
		{
			const pattern = new Tester({ type: 'object', patternProperties: { '^a[a-z]$': { type: 'string', minLength: 2 } }, additionalProperties: false });
			pattern.accepts({ 'ab': 'string' });
			pattern.accepts({ 'ab': 'string', 'ac': 'hmm' });
			pattern.rejects({ 'ab': 'string', 'ac': 'h' });
			pattern.rejects({ 'ab': 'string', 'ac': 99999 });
			pattern.rejects({ 'abc': 'string' });
			pattern.rejects({ 'a0': 'string' });
			pattern.rejects({ 'ab': 'string', 'bc': 'hmm' });
			pattern.rejects({ 'be': 'string' });
			pattern.rejects({ 'be': 'a' });
			pattern.accepts({});
		}
		{
			const pattern = new Tester({ type: 'object', patternProperties: { '^#': { type: 'string', minLength: 3 } }, additionalProperties: { type: 'string', maxLength: 3 } });
			pattern.accepts({ '#ab': 'string' });
			pattern.accepts({ 'ab': 'str' });
			pattern.rejects({ '#ab': 's' });
			pattern.rejects({ 'ab': 99999 });
			pattern.rejects({ '#ab': 99999 });
			pattern.accepts({});
		}
		{
			const pattern = new Tester({ type: 'object', properties: { 'hello': { type: 'string' } }, additionalProperties: { type: 'boolean' } });
			pattern.accepts({ 'hello': 'world' });
			pattern.accepts({ 'hello': 'world', 'bye': false });
			pattern.rejects({ 'hello': 'world', 'bye': 'false' });
			pattern.rejects({ 'hello': 'world', 'bye': 1 });
			pattern.rejects({ 'hello': 'world', 'bye': 'world' });
			pattern.accepts({ 'hello': 'test' });
			pattern.accepts({});
		}
	});

	test('numerical objects work', () => {
		{
			const obj = new Tester({ type: 'object', properties: { 'b': { type: 'number' } } });
			obj.accepts({ 'b': 2.5 });
			obj.accepts({ 'b': -2.5 });
			obj.accepts({ 'b': 0 });
			obj.accepts({ 'b': '0.12' });
			obj.rejects({ 'b': 'abc' });
			obj.rejects({ 'b': [] });
			obj.rejects({ 'b': false });
			obj.rejects({ 'b': null });
			obj.rejects({ 'b': undefined });
		}
		{
			const obj = new Tester({ type: 'object', properties: { 'b': { type: 'integer', minimum: 2, maximum: 5.5 } } });
			obj.accepts({ 'b': 2 });
			obj.accepts({ 'b': 3 });
			obj.accepts({ 'b': '3.0' });
			obj.accepts({ 'b': 5 });
			obj.rejects({ 'b': 1 });
			obj.rejects({ 'b': 6 });
			obj.rejects({ 'b': 5.5 });
		}
	});

	test('patterns work', () => {
		{
			const urls = new Tester({ pattern: '^(hello)*$', type: 'string' });
			urls.accepts('');
			urls.rejects('hel');
			urls.accepts('hello');
			urls.rejects('hellohel');
			urls.accepts('hellohello');
		}
		{
			const urls = new Tester({ pattern: '^(hello)*$', type: 'string', patternErrorMessage: 'err: must be friendly' });
			urls.accepts('');
			urls.rejects('hel').withMessage('err: must be friendly');
			urls.accepts('hello');
			urls.rejects('hellohel').withMessage('err: must be friendly');
			urls.accepts('hellohello');
		}
		{
			const unicodePattern = new Tester({ type: 'string', pattern: '^[\\p{L}\\d_. -]*$', minLength: 3 });
			unicodePattern.accepts('_autoload');
			unicodePattern.rejects('#hash');
			unicodePattern.rejects('');
		}
	});

	test('custom error messages are shown', () => {
		const withMessage = new Tester({ minLength: 1, maxLength: 0, type: 'string', errorMessage: 'always error!' });
		withMessage.rejects('').withMessage('always error!');
		withMessage.rejects(' ').withMessage('always error!');
		withMessage.rejects('1').withMessage('always error!');
	});

	class ArrayTester {
		private validator: (value: any) => string | null;

		constructor(private settings: IConfigurationPropertySchema) {
			this.validator = createValidator(settings)!;
		}

		public accepts(input: unknown[]) {
			assert.strictEqual(this.validator(input), '', `Expected ${JSON.stringify(this.settings)} to accept \`${JSON.stringify(input)}\`. Got ${this.validator(input)}.`);
		}

		public rejects(input: any) {
			assert.notStrictEqual(this.validator(input), '', `Expected ${JSON.stringify(this.settings)} to reject \`${JSON.stringify(input)}\`.`);
			return {
				withMessage:
					(message: string) => {
						const actual = this.validator(input);
						assert.ok(actual);
						assert(actual.indexOf(message) > -1,
							`Expected error of ${JSON.stringify(this.settings)} on \`${input}\` to contain ${message}. Got ${this.validator(input)}.`);
					}
			};
		}
	}

	test('simple array', () => {
		{
			const arr = new ArrayTester({ type: 'array', items: { type: 'string' } });
			arr.accepts([]);
			arr.accepts(['foo']);
			arr.accepts(['foo', 'bar']);
			arr.rejects(76);
			arr.rejects([6, '3', 7]);
		}
	});

	test('min-max items array', () => {
		{
			const arr = new ArrayTester({ type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 2 });
			arr.rejects([]).withMessage('Array must have at least 1 items');
			arr.accepts(['a']);
			arr.accepts(['a', 'a']);
			arr.rejects(['a', 'a', 'a']).withMessage('Array must have at most 2 items');
		}
	});

	test('array of enums', () => {
		{
			const arr = new ArrayTester({ type: 'array', items: { type: 'string', enum: ['a', 'b'] } });
			arr.accepts(['a']);
			arr.accepts(['a', 'b']);

			arr.rejects(['c']).withMessage(`Value 'c' is not one of`);
			arr.rejects(['a', 'c']).withMessage(`Value 'c' is not one of`);

			arr.rejects(['c', 'd']).withMessage(`Value 'c' is not one of`);
			arr.rejects(['c', 'd']).withMessage(`Value 'd' is not one of`);
		}
	});

	test('array of numbers', () => {
		// We accept parseable strings since the view handles strings
		{
			const arr = new ArrayTester({ type: 'array', items: { type: 'number' } });
			arr.accepts([]);
			arr.accepts([2]);
			arr.accepts([2, 3]);
			arr.accepts(['2', '3']);
			arr.accepts([6.6, '3', 7]);
			arr.rejects(76);
			arr.rejects(7.6);
			arr.rejects([6, 'a', 7]);
		}
		{
			const arr = new ArrayTester({ type: 'array', items: { type: 'integer', minimum: -2, maximum: 3 }, maxItems: 4 });
			arr.accepts([]);
			arr.accepts([-2, 3]);
			arr.accepts([2, 3]);
			arr.accepts(['2', '3']);
			arr.accepts(['-2', '0', '3']);
			arr.accepts(['-2', 0.0, '3']);
			arr.rejects(2);
			arr.rejects(76);
			arr.rejects([6, '3', 7]);
			arr.rejects([2, 'a', 3]);
			arr.rejects([-2, 4]);
			arr.rejects([-1.2, 2.1]);
			arr.rejects([-3, 3]);
			arr.rejects([-3, 4]);
			arr.rejects([2, 2, 2, 2, 2]);
		}
	});

	test('min-max and enum', () => {
		const arr = new ArrayTester({ type: 'array', items: { type: 'string', enum: ['a', 'b'] }, minItems: 1, maxItems: 2 });

		arr.rejects(['a', 'b', 'c']).withMessage('Array must have at most 2 items');
		arr.rejects(['a', 'b', 'c']).withMessage(`Value 'c' is not one of`);
	});

	test('pattern', () => {
		const arr = new ArrayTester({ type: 'array', items: { type: 'string', pattern: '^(hello)*$' } });

		arr.accepts(['hello']);
		arr.rejects(['a']).withMessage(`Value 'a' must match regex`);
	});

	test('Unicode pattern', () => {
		const arr = new ArrayTester({ type: 'array', items: { type: 'string', pattern: '^[\\p{L}\\d_. -]*$' } });

		arr.accepts(['hello', 'world']);
		arr.rejects(['hello', '#world']).withMessage(`Value '#world' must match regex`);
	});

	test('pattern with error message', () => {
		const arr = new ArrayTester({ type: 'array', items: { type: 'string', pattern: '^(hello)*$', patternErrorMessage: 'err: must be friendly' } });

		arr.rejects(['a']).withMessage(`err: must be friendly`);
	});

	test('uniqueItems', () => {
		const arr = new ArrayTester({ type: 'array', items: { type: 'string' }, uniqueItems: true });

		arr.rejects(['a', 'a']).withMessage(`Array has duplicate items`);
	});

	test('getInvalidTypeError', () => {
		function testInvalidTypeError(value: any, type: string | string[], shouldValidate: boolean) {
			const message = `value: ${value}, type: ${JSON.stringify(type)}, expected: ${shouldValidate ? 'valid' : 'invalid'}`;
			if (shouldValidate) {
				assert.ok(!getInvalidTypeError(value, type), message);
			} else {
				assert.ok(getInvalidTypeError(value, type), message);
			}
		}

		testInvalidTypeError(1, 'number', true);
		testInvalidTypeError(1.5, 'number', true);
		testInvalidTypeError([1], 'number', false);
		testInvalidTypeError('1', 'number', false);
		testInvalidTypeError({ a: 1 }, 'number', false);
		testInvalidTypeError(null, 'number', false);

		testInvalidTypeError('a', 'string', true);
		testInvalidTypeError('1', 'string', true);
		testInvalidTypeError([], 'string', false);
		testInvalidTypeError({}, 'string', false);

		testInvalidTypeError([1], 'array', true);
		testInvalidTypeError([], 'array', true);
		testInvalidTypeError([{}, [[]]], 'array', true);
		testInvalidTypeError({ a: ['a'] }, 'array', false);
		testInvalidTypeError('hello', 'array', false);

		testInvalidTypeError(true, 'boolean', true);
		testInvalidTypeError('hello', 'boolean', false);
		testInvalidTypeError(null, 'boolean', false);
		testInvalidTypeError([true], 'boolean', false);

		testInvalidTypeError(null, 'null', true);
		testInvalidTypeError(false, 'null', false);
		testInvalidTypeError([null], 'null', false);
		testInvalidTypeError('null', 'null', false);
	});

	test('uri checks work', () => {
		const tester = new Tester({ type: 'string', format: 'uri' });
		tester.rejects('example.com');
		tester.rejects('example.com/example');
		tester.rejects('example/example.html');
		tester.rejects('www.example.com');
		tester.rejects('');
		tester.rejects(' ');
		tester.rejects('example');

		tester.accepts('https:');
		tester.accepts('https://');
		tester.accepts('https://example.com');
		tester.accepts('https://www.example.com');
	});
});
