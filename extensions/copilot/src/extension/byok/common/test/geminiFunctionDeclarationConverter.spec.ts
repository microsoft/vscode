/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Type } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { toGeminiFunction, ToolJsonSchema } from '../geminiFunctionDeclarationConverter';

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

		it('should handle anyOf composition by using first option', () => {
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

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.properties).toBeDefined();
			const valueProperty = result.parameters!.properties!['value'];
			expect(valueProperty.type).toBe(Type.STRING);
			expect(valueProperty.description).toBe('String value');
		});

		it('should handle oneOf composition by using first option', () => {
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

			expect(result.parameters).toBeDefined();
			expect(result.parameters!.properties).toBeDefined();
			const dataProperty = result.parameters!.properties!['data'];
			expect(dataProperty.type).toBe(Type.BOOLEAN);
			expect(dataProperty.description).toBe('Boolean data');
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
});