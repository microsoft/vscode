/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schema, Type } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { toGeminiFunction, ToolJsonSchema } from '../geminiFunctionDeclarationConverter';

// The JSON Schema keys that Gemini's `Schema` type accepts (see @google/genai types).
// Anything the converter emits outside this set would be rejected by the API.
const GEMINI_SCHEMA_KEYS = [
	'anyOf', 'default', 'description', 'enum', 'example', 'format', 'items',
	'maxItems', 'maxLength', 'maxProperties', 'maximum', 'minItems', 'minLength',
	'minProperties', 'minimum', 'nullable', 'pattern', 'properties', 'propertyOrdering',
	'required', 'title', 'type'
];

function assertOnlyGeminiSchemaKeys(schema: Schema): void {
	for (const key of Object.keys(schema)) {
		expect(GEMINI_SCHEMA_KEYS).toContain(key);
	}
	for (const child of Object.values(schema.properties ?? {})) {
		assertOnlyGeminiSchemaKeys(child);
	}
	if (schema.items) {
		assertOnlyGeminiSchemaKeys(schema.items);
	}
	for (const child of schema.anyOf ?? []) {
		assertOnlyGeminiSchemaKeys(child);
	}
}

describe('GeminiFunctionDeclarationConverter', () => {
	describe('toGeminiFunction', () => {
		it('should convert basic function with simple parameters', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					name: {
						type: 'string',
						description: 'The name parameter'
					},
					age: {
						type: 'number',
						description: 'The age parameter'
					},
					isActive: {
						type: 'boolean',
						description: 'Whether the user is active'
					}
				},
				required: ['name', 'age']
			};

			const result = toGeminiFunction('testFunction', 'A test function', schema);

			expect(result.name).toBe('testFunction');
			expect(result.description).toBe('A test function');
			expect(result.parameters).toBeDefined();
			expect(result.parameters!.type).toBe(Type.OBJECT);
			expect(result.parameters!.required).toEqual(['name', 'age']);
			expect(result.parameters!.properties).toBeDefined();
			expect(result.parameters!.properties!['name']).toEqual({
				type: Type.STRING,
				description: 'The name parameter'
			});
			expect(result.parameters!.properties!['age']).toEqual({
				type: Type.NUMBER,
				description: 'The age parameter'
			});
			expect(result.parameters!.properties!['isActive']).toEqual({
				type: Type.BOOLEAN,
				description: 'Whether the user is active'
			});
		});

		it('should handle function with no description', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					value: { type: 'string' }
				}
			};

			const result = toGeminiFunction('noDescFunction', '', schema);

			expect(result.description).toBe('No description provided.');
		});

		it('should handle integer type by mapping to INTEGER', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					count: {
						type: 'integer',
						description: 'An integer count'
					},
					groupIndex: {
						type: 'integer',
						description: 'Group index'
					}
				},
				required: ['count']
			};

			const result = toGeminiFunction('integerFunction', 'Function with integer parameters', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.type).toBe(Type.OBJECT);
			expect(result.parameters!.required).toEqual(['count']);
			expect(result.parameters!.properties).toBeDefined();
			expect(result.parameters!.properties!['count']).toEqual({
				type: Type.INTEGER,
				description: 'An integer count'
			});
			expect(result.parameters!.properties!['groupIndex']).toEqual({
				type: Type.INTEGER,
				description: 'Group index'
			});
		});

		it('should handle null type by mapping to NULL', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					nullableField: {
						type: 'null',
						description: 'A nullable field'
					}
				}
			};

			const result = toGeminiFunction('nullFunction', 'Function with null parameter', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.properties).toBeDefined();
			expect(result.parameters!.properties!['nullableField']).toEqual({
				type: Type.NULL,
				description: 'A nullable field'
			});
		});

		it('should handle nullable type arrays', () => {
			const result = toGeminiFunction('nullableFunction', 'Function with nullable parameters', {
				type: 'object',
				properties: {
					value: {
						type: ['string', 'null'],
						description: 'An optional string'
					}
				}
			});

			expect(result.parameters!.properties!['value']).toEqual({
				type: Type.STRING,
				nullable: true,
				description: 'An optional string'
			});
		});

		it('should handle nullable array items', () => {
			const result = toGeminiFunction('nullableArrayFunction', 'Function with nullable array items', {
				type: 'object',
				properties: {
					values: {
						type: 'array',
						items: { type: ['integer', 'null'] }
					}
				}
			});

			expect(result.parameters!.properties!['values']).toEqual({
				type: Type.ARRAY,
				items: {
					type: Type.INTEGER,
					nullable: true
				}
			});
		});

		it('should omit non-string enums from nested schemas', () => {
			const result = toGeminiFunction('nestedEnumFunction', 'Function with nested non-string enums', {
				type: 'object',
				properties: {
					values: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								enabled: {
									type: 'boolean',
									enum: [true]
								},
								count: {
									type: 'integer',
									enum: [1, 2]
								}
							}
						}
					}
				}
			});

			expect(result.parameters!.properties!['values']).toEqual({
				type: Type.ARRAY,
				items: {
					type: Type.OBJECT,
					properties: {
						enabled: { type: Type.BOOLEAN },
						count: { type: Type.INTEGER }
					}
				}
			});
		});

		it('should handle nullable anyOf schemas', () => {
			const result = toGeminiFunction('nullableAnyOfFunction', 'Function with nullable anyOf', {
				type: 'object',
				properties: {
					value: {
						description: 'A nullable value',
						anyOf: [
							{ type: 'string' },
							{ type: 'null' }
						]
					}
				}
			});

			expect(result.parameters!.properties!['value']).toEqual({
				type: Type.STRING,
				nullable: true,
				description: 'A nullable value'
			});
		});

		it('should preserve unions with multiple non-null types', () => {
			const result = toGeminiFunction('unionFunction', 'Function with a union parameter', {
				type: 'object',
				properties: {
					value: {
						type: ['string', 'number', 'null'],
						description: 'A string or number'
					}
				}
			});

			expect(result.parameters!.properties!['value']).toEqual({
				anyOf: [
					{ type: Type.STRING },
					{ type: Type.NUMBER }
				],
				nullable: true,
				description: 'A string or number'
			});
		});

		it('should handle array schema by using items as parameters', () => {
			const schema: ToolJsonSchema = {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						id: { type: 'string' },
						count: { type: 'number' }
					},
					required: ['id']
				}
			};

			const result = toGeminiFunction('arrayFunction', 'Array function', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.type).toBe(Type.OBJECT);
			expect(result.parameters!.required).toEqual(['id']);
			expect(result.parameters!.properties).toBeDefined();
			expect(result.parameters!.properties!['id']).toEqual({
				type: Type.STRING
			});
			expect(result.parameters!.properties!['count']).toEqual({
				type: Type.NUMBER
			});
		});

		it('should handle nested object properties', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					user: {
						type: 'object',
						description: 'User information',
						properties: {
							profile: {
								type: 'object',
								properties: {
									firstName: { type: 'string' },
									lastName: { type: 'string' }
								},
								required: ['firstName']
							},
							settings: {
								type: 'object',
								properties: {
									theme: { type: 'string' },
									notifications: { type: 'boolean' }
								}
							}
						},
						required: ['profile']
					}
				}
			};

			const result = toGeminiFunction('nestedFunction', 'Function with nested objects', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.properties).toBeDefined();
			const userProperty = result.parameters!.properties!['user'];
			expect(userProperty.type).toBe(Type.OBJECT);
			expect(userProperty.description).toBe('User information');
			expect(userProperty.required).toEqual(['profile']);
			expect(userProperty.properties).toBeDefined();

			const profileProperty = userProperty.properties!['profile'];
			expect(profileProperty.type).toBe(Type.OBJECT);
			expect(profileProperty.required).toEqual(['firstName']);
			expect(profileProperty.properties).toBeDefined();
			expect(profileProperty.properties!['firstName']).toEqual({
				type: Type.STRING
			});
			expect(profileProperty.properties!['lastName']).toEqual({
				type: Type.STRING
			});

			const settingsProperty = userProperty.properties!['settings'];
			expect(settingsProperty.type).toBe(Type.OBJECT);
			expect(settingsProperty.properties).toBeDefined();
			expect(settingsProperty.properties!['theme']).toEqual({
				type: Type.STRING
			});
			expect(settingsProperty.properties!['notifications']).toEqual({
				type: Type.BOOLEAN
			});
		});

		it('should handle array properties with primitive items', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					tags: {
						type: 'array',
						description: 'List of tags',
						items: {
							type: 'string',
							description: 'Individual tag'
						}
					},
					scores: {
						type: 'array',
						items: {
							type: 'number'
						}
					}
				}
			};

			const result = toGeminiFunction('arrayPropsFunction', 'Function with arrays', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.properties).toBeDefined();
			const tagsProperty = result.parameters!.properties!['tags'];
			expect(tagsProperty.type).toBe(Type.ARRAY);
			expect(tagsProperty.description).toBe('List of tags');
			expect(tagsProperty.items).toEqual({
				type: Type.STRING,
				description: 'Individual tag'
			});

			const scoresProperty = result.parameters!.properties!['scores'];
			expect(scoresProperty.type).toBe(Type.ARRAY);
			expect(scoresProperty.items).toEqual({
				type: Type.NUMBER
			});
		});

		it('should handle array properties with object items', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					items: {
						type: 'array',
						description: 'List of items',
						items: {
							type: 'object',
							description: 'Individual item',
							properties: {
								id: { type: 'string' },
								name: { type: 'string' },
								metadata: {
									type: 'object',
									properties: {
										created: { type: 'string' },
										version: { type: 'number' }
									}
								}
							},
							required: ['id', 'name']
						}
					}
				}
			};

			const result = toGeminiFunction('complexArrayFunction', 'Function with complex arrays', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.properties).toBeDefined();
			const itemsProperty = result.parameters!.properties!['items'];
			expect(itemsProperty.type).toBe(Type.ARRAY);
			expect(itemsProperty.description).toBe('List of items');
			expect(itemsProperty.items).toBeDefined();
			expect(itemsProperty.items!.type).toBe(Type.OBJECT);
			expect(itemsProperty.items!.description).toBe('Individual item');
			expect(itemsProperty.items!.required).toEqual(['id', 'name']);
			expect(itemsProperty.items!.properties).toBeDefined();
			expect(itemsProperty.items!.properties!['id']).toEqual({
				type: Type.STRING
			});
			expect(itemsProperty.items!.properties!['name']).toEqual({
				type: Type.STRING
			});
			expect(itemsProperty.items!.properties!['metadata'].type).toBe(Type.OBJECT);
			expect(itemsProperty.items!.properties!['metadata'].properties).toBeDefined();
			expect(itemsProperty.items!.properties!['metadata'].properties!['created']).toEqual({
				type: Type.STRING
			});
			expect(itemsProperty.items!.properties!['metadata'].properties!['version']).toEqual({
				type: Type.NUMBER
			});
		});

		it('should handle enum properties', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					status: {
						type: 'string',
						description: 'Status value',
						enum: ['active', 'inactive', 'pending']
					},
					priority: {
						type: 'string',
						enum: ['1', '2', '3', '4', '5']
					}
				}
			};

			const result = toGeminiFunction('enumFunction', 'Function with enums', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.properties).toBeDefined();
			const statusProperty = result.parameters!.properties!['status'];
			expect(statusProperty.type).toBe(Type.STRING);
			expect(statusProperty.description).toBe('Status value');
			expect(statusProperty.enum).toEqual(['active', 'inactive', 'pending']);

			const priorityProperty = result.parameters!.properties!['priority'];
			expect(priorityProperty.type).toBe(Type.STRING);
			expect(priorityProperty.enum).toEqual(['1', '2', '3', '4', '5']);
		});

		it('should preserve all anyOf alternatives as a Gemini anyOf', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					value: {
						anyOf: [
							{ type: 'string', description: 'String value' },
							{ type: 'number', description: 'Number value' }
						]
					}
				}
			};

			const result = toGeminiFunction('anyOfFunction', 'Function with anyOf', schema);

			expect(result.parameters!.properties!['value']).toEqual({
				anyOf: [
					{ type: Type.STRING, description: 'String value' },
					{ type: Type.NUMBER, description: 'Number value' }
				]
			});
		});

		it('should preserve all oneOf alternatives as a Gemini anyOf', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					data: {
						oneOf: [
							{ type: 'boolean', description: 'Boolean data' },
							{ type: 'string', description: 'String data' }
						]
					}
				}
			};

			const result = toGeminiFunction('oneOfFunction', 'Function with oneOf', schema);

			expect(result.parameters!.properties!['data']).toEqual({
				anyOf: [
					{ type: Type.BOOLEAN, description: 'Boolean data' },
					{ type: Type.STRING, description: 'String data' }
				]
			});
		});

		it('should keep non-null alternatives when a branch is itself nullable', () => {
			const result = toGeminiFunction('combinedUnionFunction', 'Function with a combined nullable union', {
				type: 'object',
				properties: {
					value: {
						anyOf: [
							{ type: ['string', 'null'] },
							{ type: 'number' }
						]
					}
				}
			});

			expect(result.parameters!.properties!['value']).toEqual({
				anyOf: [
					{ type: Type.STRING },
					{ type: Type.NUMBER }
				],
				nullable: true
			});
		});

		it('should keep nullability when the null branch is not first', () => {
			const result = toGeminiFunction('reversedUnionFunction', 'Function with a reversed nullable union', {
				type: 'object',
				properties: {
					value: {
						anyOf: [
							{ type: 'number' },
							{ type: ['string', 'null'] }
						]
					}
				}
			});

			expect(result.parameters!.properties!['value']).toEqual({
				anyOf: [
					{ type: Type.NUMBER },
					{ type: Type.STRING }
				],
				nullable: true
			});
		});

		it('should handle allOf composition by using first option', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					config: {
						allOf: [
							{ type: 'object', description: 'Config object' },
							{ type: 'string', description: 'Config string' }
						]
					}
				}
			};

			const result = toGeminiFunction('allOfFunction', 'Function with allOf', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.properties).toBeDefined();
			const configProperty = result.parameters!.properties!['config'];
			expect(configProperty.type).toBe(Type.OBJECT);
			expect(configProperty.description).toBe('Config object');
		});

		it('should handle schema with no properties', () => {
			const schema: ToolJsonSchema = {
				type: 'object'
			};

			const result = toGeminiFunction('emptyFunction', 'Function with no properties', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.type).toBe(Type.OBJECT);
			expect(result.parameters!.properties).toEqual({});
			expect(result.parameters!.required).toEqual([]);
		});

		it('should handle schema with no required fields', () => {
			const schema: ToolJsonSchema = {
				type: 'object',
				properties: {
					optional1: { type: 'string' },
					optional2: { type: 'number' }
				}
			};

			const result = toGeminiFunction('optionalFunction', 'Function with optional params', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.required).toEqual([]);
			expect(result.parameters!.properties).toBeDefined();
			expect(result.parameters!.properties!['optional1']).toEqual({
				type: Type.STRING
			});
			expect(result.parameters!.properties!['optional2']).toEqual({
				type: Type.NUMBER
			});
		});

		it('should default to object type when type is missing', () => {
			const schema: ToolJsonSchema = {
				properties: {
					field: {
						description: 'Field without type'
					}
				}
			};

			const result = toGeminiFunction('defaultTypeFunction', 'Function with missing types', schema);

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.properties).toBeDefined();
			const fieldProperty = result.parameters!.properties!['field'];
			expect(fieldProperty.type).toBe(Type.OBJECT);
			expect(fieldProperty.description).toBe('Field without type');
		});
	});

	describe('nullable and union handling', () => {
		it('should map a nullable object while preserving its properties and required list', () => {
			const result = toGeminiFunction('nullableObjectFunction', 'Function with a nullable object', {
				type: 'object',
				properties: {
					address: {
						type: ['object', 'null'],
						description: 'Optional address',
						properties: {
							city: { type: 'string' },
							zip: { type: 'string' }
						},
						required: ['city']
					}
				}
			});

			expect(result.parameters!.properties!['address']).toEqual({
				type: Type.OBJECT,
				nullable: true,
				description: 'Optional address',
				properties: {
					city: { type: Type.STRING },
					zip: { type: Type.STRING }
				},
				required: ['city']
			});
		});

		it('should map a nullable array container while keeping its items', () => {
			const result = toGeminiFunction('nullableArrayContainerFunction', 'Function with a nullable array', {
				type: 'object',
				properties: {
					tags: {
						type: ['array', 'null'],
						items: { type: 'string' }
					}
				}
			});

			expect(result.parameters!.properties!['tags']).toEqual({
				type: Type.ARRAY,
				nullable: true,
				items: { type: Type.STRING }
			});
		});

		it('should keep enum values on a nullable field', () => {
			const result = toGeminiFunction('nullableEnumFunction', 'Function with a nullable enum', {
				type: 'object',
				properties: {
					status: {
						type: ['string', 'null'],
						enum: ['active', 'inactive']
					}
				}
			});

			expect(result.parameters!.properties!['status']).toEqual({
				type: Type.STRING,
				nullable: true,
				enum: ['active', 'inactive']
			});
		});

		it('should propagate nullability through nested arrays and objects', () => {
			const result = toGeminiFunction('deepNullableFunction', 'Function with deep nullability', {
				type: 'object',
				properties: {
					people: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								name: { type: ['string', 'null'] }
							},
							required: ['name']
						}
					}
				}
			});

			expect(result.parameters!.properties!['people']).toEqual({
				type: Type.ARRAY,
				items: {
					type: Type.OBJECT,
					properties: {
						name: { type: Type.STRING, nullable: true }
					},
					required: ['name']
				}
			});
		});

		it('should preserve object alternatives in a discriminated union', () => {
			const result = toGeminiFunction('discriminatedUnionFunction', 'Function with an object union', {
				type: 'object',
				properties: {
					payload: {
						anyOf: [
							{ type: 'object', properties: { kind: { type: 'string' }, a: { type: 'number' } }, required: ['kind'] },
							{ type: 'object', properties: { kind: { type: 'string' }, b: { type: 'boolean' } }, required: ['kind'] }
						]
					}
				}
			});

			expect(result.parameters!.properties!['payload']).toEqual({
				anyOf: [
					{ type: Type.OBJECT, properties: { kind: { type: Type.STRING }, a: { type: Type.NUMBER } }, required: ['kind'] },
					{ type: Type.OBJECT, properties: { kind: { type: Type.STRING }, b: { type: Type.BOOLEAN } }, required: ['kind'] }
				]
			});
		});

		it('should collapse a oneOf with a null branch to a nullable single type', () => {
			const result = toGeminiFunction('oneOfNullableFunction', 'Function with a nullable oneOf', {
				type: 'object',
				properties: {
					value: {
						oneOf: [
							{ type: 'string' },
							{ type: 'null' }
						]
					}
				}
			});

			expect(result.parameters!.properties!['value']).toEqual({
				type: Type.STRING,
				nullable: true
			});
		});

		it('should map an all-null union to the NULL type', () => {
			const result = toGeminiFunction('allNullUnionFunction', 'Function with an all-null union', {
				type: 'object',
				properties: {
					value: {
						anyOf: [
							{ type: 'null' },
							{ type: 'null' }
						]
					}
				}
			});

			expect(result.parameters!.properties!['value']).toEqual({ type: Type.NULL });
		});
	});

	describe('schema safety', () => {
		it('should throw a clean single-type error for an unknown scalar type', () => {
			expect(() => toGeminiFunction('unknownTypeFunction', 'Function with an unknown type', {
				type: 'object',
				properties: {
					value: { type: 'foobar' }
				}
			})).toThrow('Unsupported type: foobar');
		});

		it('should name a single offending type rather than a comma-joined list', () => {
			let message = '';
			try {
				toGeminiFunction('unknownUnionTypeFunction', 'Function with an unknown union type', {
					type: 'object',
					properties: {
						value: { type: ['string', 'garbage'] }
					}
				});
			} catch (err) {
				message = err instanceof Error ? err.message : String(err);
			}

			expect(message).toBe('Unsupported type: garbage');
		});

		it('should never emit keys outside Gemini schema, even for unsupported JSON Schema keywords', () => {
			// Real tool schemas carry JSON Schema keywords beyond what Gemini accepts
			// (format, $ref, additionalProperties, min/max, ...). They may be dropped,
			// but must never leak through as invalid keys on the Gemini schema.
			const raw = {
				type: 'object',
				properties: {
					when: { type: ['string', 'null'], format: 'date-time', minLength: 1 },
					count: { type: 'integer', minimum: 0, maximum: 10 },
					ref: { description: 'A $ref that Gemini cannot resolve', $ref: '#/$defs/Foo' },
					bag: { type: 'object', additionalProperties: false, properties: { x: { type: 'boolean' } } }
				},
				required: ['when']
			};

			const result = toGeminiFunction('kitchenSinkFunction', 'Function with unsupported keywords', raw);

			assertOnlyGeminiSchemaKeys(result.parameters!);
		});
	});
});