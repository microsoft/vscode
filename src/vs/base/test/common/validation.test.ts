/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import {
	IValidator,
	ValidatorBase,
	vString,
	vNumber,
	vBoolean,
	vObjAny,
	vUnchecked,
	vUndefined,
	vObj,
	vOptionalProp,
	vArray,
	vTuple,
	vUnion,
	vEnum,
	vLiteral,
	vLazy,
	vWithJsonSchemaRef,
	vObjType
} from '../../common/validation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Validation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('vString', () => {
		const validator = vString();

		test('validates strings', () => {
			const result = validator.validate('hello');
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, 'hello');
		});

		test('rejects non-strings', () => {
			const result = validator.validate(123);
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('Expected string'), true);
		});

		test('rejects objects', () => {
			const result = validator.validate({});
			assert.notStrictEqual(result.error, undefined);
		});

		test('rejects arrays', () => {
			const result = validator.validate([]);
			assert.notStrictEqual(result.error, undefined);
		});

		test('getJSONSchema returns string type', () => {
			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.type, 'string');
		});
	});

	suite('vNumber', () => {
		const validator = vNumber();

		test('validates numbers', () => {
			const result = validator.validate(42);
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, 42);
		});

		test('validates zero', () => {
			const result = validator.validate(0);
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, 0);
		});

		test('validates negative numbers', () => {
			const result = validator.validate(-42);
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, -42);
		});

		test('rejects non-numbers', () => {
			const result = validator.validate('123');
			assert.notStrictEqual(result.error, undefined);
		});

		test('getJSONSchema returns number type', () => {
			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.type, 'number');
		});
	});

	suite('vBoolean', () => {
		const validator = vBoolean();

		test('validates true', () => {
			const result = validator.validate(true);
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, true);
		});

		test('validates false', () => {
			const result = validator.validate(false);
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, false);
		});

		test('rejects non-booleans', () => {
			const result = validator.validate(0);
			assert.notStrictEqual(result.error, undefined);
		});

		test('getJSONSchema returns boolean type', () => {
			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.type, 'boolean');
		});
	});

	suite('vObjAny', () => {
		const validator = vObjAny();

		test('validates objects', () => {
			const result = validator.validate({ key: 'value' });
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, { key: 'value' });
		});

		test('rejects null', () => {
			const result = validator.validate(null);
			assert.notStrictEqual(result.error, undefined);
		});

		test('rejects primitives', () => {
			const result = validator.validate('string');
			assert.notStrictEqual(result.error, undefined);
		});

		test('getJSONSchema returns object type', () => {
			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.type, 'object');
		});
	});

	suite('vUnchecked', () => {
		const validator = vUnchecked<string>();

		test('accepts anything', () => {
			assert.strictEqual(validator.validate('string').error, undefined);
			assert.strictEqual(validator.validate(123).error, undefined);
			assert.strictEqual(validator.validate({}).error, undefined);
			assert.strictEqual(validator.validate(null).error, undefined);
		});

		test('returns content as-is', () => {
			const obj = { key: 'value' };
			const result = validator.validate(obj);
			assert.strictEqual(result.content, obj);
		});

		test('getJSONSchema returns empty object', () => {
			const schema = validator.getJSONSchema();
			assert.deepStrictEqual(schema, {});
		});
	});

	suite('vUndefined', () => {
		const validator = vUndefined();

		test('validates undefined', () => {
			const result = validator.validate(undefined);
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, undefined);
		});

		test('rejects null', () => {
			const result = validator.validate(null);
			assert.notStrictEqual(result.error, undefined);
		});

		test('rejects other values', () => {
			const result = validator.validate(0);
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('Expected undefined'), true);
		});

		test('getJSONSchema returns empty object', () => {
			const schema = validator.getJSONSchema();
			assert.deepStrictEqual(schema, {});
		});
	});

	suite('ValidatorBase.validateOrThrow', () => {
		test('returns content on success', () => {
			const validator = vString();
			const result = validator.validateOrThrow('hello');
			assert.strictEqual(result, 'hello');
		});

		test('throws error on validation failure', () => {
			const validator = vString();
			assert.throws(() => validator.validateOrThrow(123), /Expected string/);
		});

		test('throws error with message', () => {
			const validator = vNumber();
			try {
				validator.validateOrThrow('not a number');
				assert.fail('Should have thrown');
			} catch (e) {
				assert.ok((e as Error).message.includes('Expected number'));
			}
		});
	});

	suite('vObj', () => {
		test('validates objects with required properties', () => {
			const validator = vObj({
				name: vString(),
				age: vNumber()
			});

			const result = validator.validate({ name: 'John', age: 30 });
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, { name: 'John', age: 30 });
		});

		test('rejects objects missing required properties', () => {
			const validator = vObj({
				name: vString(),
				age: vNumber()
			});

			const result = validator.validate({ name: 'John' });
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('age'), true);
		});

		test('rejects objects with invalid property types', () => {
			const validator = vObj({
				name: vString(),
				age: vNumber()
			});

			const result = validator.validate({ name: 'John', age: 'thirty' });
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('age'), true);
		});

		test('accepts objects with optional properties', () => {
			const validator = vObj({
				name: vString(),
				age: vOptionalProp(vNumber())
			});

			const result = validator.validate({ name: 'John' });
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, { name: 'John' });
		});

		test('accepts objects with optional properties provided', () => {
			const validator = vObj({
				name: vString(),
				age: vOptionalProp(vNumber())
			});

			const result = validator.validate({ name: 'John', age: 30 });
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, { name: 'John', age: 30 });
		});

		test('rejects non-objects', () => {
			const validator = vObj({
				name: vString()
			});

			const result = validator.validate('not an object');
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('Expected object'), true);
		});

		test('rejects null', () => {
			const validator = vObj({
				name: vString()
			});

			const result = validator.validate(null);
			assert.notStrictEqual(result.error, undefined);
		});

		test('getJSONSchema includes required fields', () => {
			const validator = vObj({
				name: vString(),
				age: vNumber()
			});

			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.type, 'object');
			assert.ok(schema.properties);
			assert.strictEqual(schema.properties!.name?.type, 'string');
			assert.strictEqual(schema.properties!.age?.type, 'number');
			assert.ok(schema.required);
			assert.strictEqual(schema.required!.length, 2);
		});

		test('getJSONSchema excludes optional fields from required', () => {
			const validator = vObj({
				name: vString(),
				age: vOptionalProp(vNumber())
			});

			const schema = validator.getJSONSchema();
			assert.ok(schema.required);
			assert.strictEqual(schema.required!.length, 1);
			assert.strictEqual(schema.required![0], 'name');
		});
	});

	suite('vArray', () => {
		test('validates arrays of strings', () => {
			const validator = vArray(vString());
			const result = validator.validate(['a', 'b', 'c']);
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, ['a', 'b', 'c']);
		});

		test('validates empty arrays', () => {
			const validator = vArray(vString());
			const result = validator.validate([]);
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, []);
		});

		test('validates arrays of numbers', () => {
			const validator = vArray(vNumber());
			const result = validator.validate([1, 2, 3]);
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, [1, 2, 3]);
		});

		test('rejects arrays with invalid elements', () => {
			const validator = vArray(vString());
			const result = validator.validate(['a', 123, 'c']);
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('Error in element 1'), true);
		});

		test('rejects non-arrays', () => {
			const validator = vArray(vString());
			const result = validator.validate('not an array');
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('Expected array'), true);
		});

		test('getJSONSchema returns array type', () => {
			const validator = vArray(vString());
			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.type, 'array');
			assert.ok(schema.items);
		});
	});

	suite('vTuple', () => {
		test('validates tuples with correct types', () => {
			const validator = vTuple(vString(), vNumber(), vBoolean());
			const result = validator.validate(['hello', 42, true]);
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, ['hello', 42, true]);
		});

		test('rejects tuples with wrong length', () => {
			const validator = vTuple(vString(), vNumber());
			const result = validator.validate(['hello', 42, true]);
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('Expected tuple of length 2'), true);
		});

		test('rejects tuples with invalid element types', () => {
			const validator = vTuple(vString(), vNumber());
			const result = validator.validate(['hello', 'not a number']);
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('Error in element 1'), true);
		});

		test('rejects non-arrays', () => {
			const validator = vTuple(vString(), vNumber());
			const result = validator.validate('not an array');
			assert.notStrictEqual(result.error, undefined);
		});

		test('getJSONSchema returns array with items array', () => {
			const validator = vTuple(vString(), vNumber());
			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.type, 'array');
			assert.ok(Array.isArray(schema.items));
		});
	});

	suite('vUnion', () => {
		test('validates first matching validator', () => {
			const validator = vUnion(vString(), vNumber());
			const result = validator.validate('hello');
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, 'hello');
		});

		test('validates second matching validator', () => {
			const validator = vUnion(vString(), vNumber());
			const result = validator.validate(42);
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, 42);
		});

		test('rejects values that match no validators', () => {
			const validator = vUnion(vString(), vNumber());
			const result = validator.validate(true);
			assert.notStrictEqual(result.error, undefined);
		});

		test('validates union with undefined', () => {
			const validator = vUnion(vString(), vUndefined());
			const result = validator.validate(undefined);
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, undefined);
		});

		test('getJSONSchema returns oneOf with non-undefined validators', () => {
			const validator = vUnion(vString(), vNumber(), vUndefined());
			const schema = validator.getJSONSchema();
			assert.ok(schema.oneOf);
			// Should filter out undefined validator
			assert.ok((schema.oneOf as any[]).length <= 2);
		});
	});

	suite('vEnum', () => {
		test('validates enum values', () => {
			const validator = vEnum('red', 'green', 'blue');
			const result = validator.validate('red');
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, 'red');
		});

		test('rejects invalid enum values', () => {
			const validator = vEnum('red', 'green', 'blue');
			const result = validator.validate('yellow');
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('Expected one of'), true);
		});

		test('rejects non-strings', () => {
			const validator = vEnum('red', 'green', 'blue');
			const result = validator.validate(123);
			assert.notStrictEqual(result.error, undefined);
		});

		test('getJSONSchema returns enum', () => {
			const validator = vEnum('red', 'green', 'blue');
			const schema = validator.getJSONSchema();
			assert.ok(schema.enum);
			assert.deepStrictEqual(schema.enum, ['red', 'green', 'blue']);
		});
	});

	suite('vLiteral', () => {
		test('validates literal value', () => {
			const validator = vLiteral('hello');
			const result = validator.validate('hello');
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, 'hello');
		});

		test('rejects non-matching values', () => {
			const validator = vLiteral('hello');
			const result = validator.validate('world');
			assert.notStrictEqual(result.error, undefined);
			assert.strictEqual(result.error?.message.includes('Expected: hello'), true);
		});

		test('rejects different types', () => {
			const validator = vLiteral('123');
			const result = validator.validate(123);
			assert.notStrictEqual(result.error, undefined);
		});

		test('getJSONSchema returns const', () => {
			const validator = vLiteral('hello');
			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.const, 'hello');
		});
	});

	suite('vLazy', () => {
		test('validates using lazy validator', () => {
			const validator = vLazy(() => vString());
			const result = validator.validate('hello');
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, 'hello');
		});

		test('rejects invalid values', () => {
			const validator = vLazy(() => vNumber());
			const result = validator.validate('not a number');
			assert.notStrictEqual(result.error, undefined);
		});

		test('supports recursive validation with lazy evaluation', () => {
			// Lazy validator defers creation until validation time
			let callCount = 0;
			const validator = vLazy(() => {
				callCount++;
				return vString();
			});

			const result = validator.validate('hello');
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(callCount, 1);
		});

		test('getJSONSchema delegates to lazy validator', () => {
			const validator = vLazy(() => vString());
			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.type, 'string');
		});
	});

	suite('vWithJsonSchemaRef', () => {
		test('validates using inner validator', () => {
			const validator = vWithJsonSchemaRef('#/definitions/MyType', vString());
			const result = validator.validate('hello');
			assert.strictEqual(result.error, undefined);
			assert.strictEqual(result.content, 'hello');
		});

		test('rejects invalid values', () => {
			const validator = vWithJsonSchemaRef('#/definitions/MyType', vNumber());
			const result = validator.validate('not a number');
			assert.notStrictEqual(result.error, undefined);
		});

		test('getJSONSchema returns $ref', () => {
			const validator = vWithJsonSchemaRef('#/definitions/MyType', vString());
			const schema = validator.getJSONSchema();
			assert.strictEqual(schema.$ref, '#/definitions/MyType');
		});
	});

	suite('Complex nested structures', () => {
		test('validates complex nested object with arrays', () => {
			const validator = vObj({
				name: vString(),
				tags: vArray(vString()),
				metadata: vObj({
					created: vNumber(),
					modified: vNumber()
				})
			});

			const result = validator.validate({
				name: 'Test',
				tags: ['a', 'b', 'c'],
				metadata: {
					created: 1000,
					modified: 2000
				}
			});

			assert.strictEqual(result.error, undefined);
		});

		test('validates complex union types', () => {
			const validator = vUnion(
				vObj({ type: vLiteral('string'), value: vString() }),
				vObj({ type: vLiteral('number'), value: vNumber() })
			);

			const result1 = validator.validate({ type: 'string', value: 'hello' });
			assert.strictEqual(result1.error, undefined);

			const result2 = validator.validate({ type: 'number', value: 42 });
			assert.strictEqual(result2.error, undefined);

			const result3 = validator.validate({ type: 'boolean', value: true });
			assert.notStrictEqual(result3.error, undefined);
		});

		test('validates tuple with optional object', () => {
			const validator = vTuple(
				vString(),
				vOptionalProp(vObj({
					key: vString()
				}))
			);

			const result = validator.validate(['value']);
			assert.strictEqual(result.error, undefined);
		});
	});

	suite('Edge cases', () => {
		test('handles empty objects', () => {
			const validator = vObj({});
			const result = validator.validate({});
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, {});
		});

		test('handles objects with extra properties', () => {
			const validator = vObj({
				name: vString()
			});
			const result = validator.validate({ name: 'test', extra: 'ignored' });
			assert.strictEqual(result.error, undefined);
			assert.deepStrictEqual(result.content, { name: 'test' });
		});

		test('handles deeply nested structures', () => {
			const validator = vObj({
				level1: vObj({
					level2: vObj({
						level3: vArray(vNumber())
					})
				})
			});

			const result = validator.validate({
				level1: {
					level2: {
						level3: [1, 2, 3]
					}
				}
			});

			assert.strictEqual(result.error, undefined);
		});
	});
});
