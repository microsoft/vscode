/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { toJsonSchema } from '../../common/toJsonSchema';

describe('toJsonSchema', () => {
	describe('primitive types', () => {
		it('handles null', () => {
			expect(toJsonSchema(null)).toEqual({ type: 'null' });
		});

		it('handles string', () => {
			expect(toJsonSchema('hello')).toEqual({ type: 'string' });
		});

		it('handles integer', () => {
			expect(toJsonSchema(42)).toEqual({ type: 'integer' });
		});

		it('handles float', () => {
			expect(toJsonSchema(3.14)).toEqual({ type: 'number' });
		});

		it('handles boolean true', () => {
			expect(toJsonSchema(true)).toEqual({ type: 'boolean' });
		});

		it('handles boolean false', () => {
			expect(toJsonSchema(false)).toEqual({ type: 'boolean' });
		});

		it('handles undefined as empty schema', () => {
			expect(toJsonSchema(undefined)).toEqual({});
		});
	});

	describe('arrays', () => {
		it('handles empty array', () => {
			expect(toJsonSchema([])).toEqual({ type: 'array' });
		});

		it('handles array of strings', () => {
			expect(toJsonSchema(['a', 'b', 'c'])).toEqual({
				type: 'array',
				items: { type: 'string' },
			});
		});

		it('handles array of integers', () => {
			expect(toJsonSchema([1, 2, 3])).toEqual({
				type: 'array',
				items: { type: 'integer' },
			});
		});

		it('handles array of objects', () => {
			expect(toJsonSchema([{ name: 'Alice' }])).toEqual({
				type: 'array',
				items: {
					type: 'object',
					properties: {
						name: { type: 'string' },
					},
					required: ['name'],
				},
			});
		});

		it('handles nested arrays', () => {
			expect(toJsonSchema([[1, 2], [3, 4]])).toEqual({
				type: 'array',
				items: {
					type: 'array',
					items: { type: 'integer' },
				},
			});
		});

		it('merges object schemas with common properties required', () => {
			const input = [
				{ id: 1, name: 'Alice' },
				{ id: 2, email: 'bob@example.com' },
			];
			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'integer' },
						name: { type: 'string' },
						email: { type: 'string' },
					},
					required: ['id'],
				},
			});
		});

		it('merges objects with no common properties', () => {
			const input = [
				{ name: 'Alice' },
				{ age: 30 },
			];
			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					type: 'object',
					properties: {
						name: { type: 'string' },
						age: { type: 'integer' },
					},
				},
			});
		});

		it('uses oneOf for mixed primitive types', () => {
			const input = ['hello', 42];
			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					oneOf: [
						{ type: 'string' },
						{ type: 'integer' },
					],
				},
			});
		});

		it('uses oneOf for primitives and objects', () => {
			const input = ['text', { value: 1 }];
			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					oneOf: [
						{ type: 'string' },
						{
							type: 'object',
							properties: { value: { type: 'integer' } },
							required: ['value'],
						},
					],
				},
			});
		});

		it('merges multiple different objects in mixed array', () => {
			const input = ['text', { a: 1 }, { b: 2 }];
			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					oneOf: [
						{ type: 'string' },
						{
							type: 'object',
							properties: {
								a: { type: 'integer' },
								b: { type: 'integer' },
							},
						},
					],
				},
			});
		});

		it('uses oneOf for primitives and null', () => {
			const input = [1, null, 2];
			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					oneOf: [
						{ type: 'integer' },
						{ type: 'null' },
					],
				},
			});
		});

		it('deduplicates same primitive types', () => {
			const input = [1, 2, 3, 'a', 'b'];
			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					oneOf: [
						{ type: 'integer' },
						{ type: 'string' },
					],
				},
			});
		});

		it('treats array with null as non-object mixed type', () => {
			const input = [{ id: 1 }, null];
			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					oneOf: [
						{ type: 'null' },
						{
							type: 'object',
							properties: { id: { type: 'integer' } },
							required: ['id'],
						},
					],
				},
			});
		});
	});

	describe('objects', () => {
		it('handles empty object', () => {
			expect(toJsonSchema({})).toEqual({
				type: 'object',
				properties: {},
			});
		});

		it('handles simple object', () => {
			expect(toJsonSchema({ name: 'John', age: 30 })).toEqual({
				type: 'object',
				properties: {
					name: { type: 'string' },
					age: { type: 'integer' },
				},
				required: ['name', 'age'],
			});
		});

		it('handles nested objects', () => {
			expect(toJsonSchema({
				person: {
					name: 'Alice',
					address: {
						city: 'Seattle',
					},
				},
			})).toEqual({
				type: 'object',
				properties: {
					person: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							address: {
								type: 'object',
								properties: {
									city: { type: 'string' },
								},
								required: ['city'],
							},
						},
						required: ['name', 'address'],
					},
				},
				required: ['person'],
			});
		});

		it('handles object with mixed types', () => {
			expect(toJsonSchema({
				name: 'Test',
				count: 5,
				active: true,
				tags: ['a', 'b'],
				meta: null,
			})).toEqual({
				type: 'object',
				properties: {
					name: { type: 'string' },
					count: { type: 'integer' },
					active: { type: 'boolean' },
					tags: {
						type: 'array',
						items: { type: 'string' },
					},
					meta: { type: 'null' },
				},
				required: ['name', 'count', 'active', 'tags', 'meta'],
			});
		});
	});

	describe('complex structures', () => {
		it('handles array of objects with nested arrays', () => {
			const input = [{
				id: 1,
				items: ['x', 'y'],
			}];

			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'integer' },
						items: {
							type: 'array',
							items: { type: 'string' },
						},
					},
					required: ['id', 'items'],
				},
			});
		});

		it('handles deeply nested structure', () => {
			const input = {
				level1: {
					level2: {
						level3: {
							value: 42,
						},
					},
				},
			};

			expect(toJsonSchema(input)).toEqual({
				type: 'object',
				properties: {
					level1: {
						type: 'object',
						properties: {
							level2: {
								type: 'object',
								properties: {
									level3: {
										type: 'object',
										properties: {
											value: { type: 'integer' },
										},
										required: ['value'],
									},
								},
								required: ['level3'],
							},
						},
						required: ['level2'],
					},
				},
				required: ['level1'],
			});
		});

		it('merges deeply nested objects with different leaf types', () => {
			const input = [
				{ foo: { bar: { baz: 1 } } },
				{ foo: { bar: { baz: 'str' } } },
			];

			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					type: 'object',
					properties: {
						foo: {
							type: 'object',
							properties: {
								bar: {
									type: 'object',
									properties: {
										baz: {
											oneOf: [
												{ type: 'integer' },
												{ type: 'string' },
											],
										},
									},
									required: ['baz'],
								},
							},
							required: ['bar'],
						},
					},
					required: ['foo'],
				},
			});
		});

		it('merges objects with same property having different types', () => {
			const input = [
				{ value: 42 },
				{ value: 'text' },
				{ value: true },
			];

			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					type: 'object',
					properties: {
						value: {
							oneOf: [
								{ type: 'integer' },
								{ type: 'string' },
								{ type: 'boolean' },
							],
						},
					},
					required: ['value'],
				},
			});
		});

		it('merges properties at different nesting levels', () => {
			const input = [
				{ a: { x: 1 }, b: 'hello' },
				{ a: { y: 2 }, b: 42 },
			];

			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					type: 'object',
					properties: {
						a: {
							type: 'object',
							properties: {
								x: { type: 'integer' },
								y: { type: 'integer' },
							},
						},
						b: {
							oneOf: [
								{ type: 'string' },
								{ type: 'integer' },
							],
						},
					},
					required: ['a', 'b'],
				},
			});
		});

		it('handles object property becoming null in another object', () => {
			const input = [
				{ data: { value: 1 } },
				{ data: null },
			];

			expect(toJsonSchema(input)).toEqual({
				type: 'array',
				items: {
					type: 'object',
					properties: {
						data: {
							oneOf: [
								{ type: 'null' },
								{
									type: 'object',
									properties: { value: { type: 'integer' } },
									required: ['value'],
								},
							],
						},
					},
					required: ['data'],
				},
			});
		});
	});
});
