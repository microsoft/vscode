/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, test } from 'vitest';
import type * as vscode from 'vscode';
import { TestLogService } from '../../../../platform/testing/common/testLogService';
import { NullToolsService } from '../toolsService';

describe('Tool Service', () => {
	describe('validateToolInput', () => {
		let toolsService: NullToolsService;

		beforeEach(() => {
			const logService = new TestLogService();
			toolsService = new NullToolsService(logService);
		});

		test('should return error for non-existent tool', () => {
			const result = toolsService.validateToolInput('nonExistentTool', '{}');

			expect(result).toEqual({
				error: 'ERROR: The tool "nonExistentTool" does not exist'
			});
		});

		test('should validate tool input with schema', () => {
			// Add a mock tool with a schema
			const mockTool: vscode.LanguageModelToolInformation = {
				name: 'testTool',
				description: 'A test tool',
				inputSchema: {
					type: 'object',
					properties: {
						message: {
							type: 'string',
							description: 'A message parameter'
						},
						count: {
							type: 'number',
							description: 'A numeric parameter'
						}
					},
					required: ['message']
				},
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(mockTool);

			// Test valid input
			const validResult = toolsService.validateToolInput('testTool', '{"message": "hello", "count": 42}');
			expect(validResult).toEqual({
				inputObj: { message: 'hello', count: 42 }
			});

			// Test missing required field
			const invalidResult = toolsService.validateToolInput('testTool', '{"count": 42}');
			expect(invalidResult).toMatchObject({
				error: expect.stringContaining('ERROR: Your input to the tool was invalid')
			});

			// Test invalid JSON
			const malformedResult = toolsService.validateToolInput('testTool', '{"message": "hello"');
			expect(malformedResult).toMatchObject({
				error: expect.stringContaining('ERROR: Your input to the tool was invalid')
			});
		});

		test('should handle empty input with optional properties', () => {
			const emptyTool: vscode.LanguageModelToolInformation = {
				name: 'emptyTool',
				description: 'A tool with optional parameters',
				inputSchema: {
					type: 'object',
					properties: {
						optionalParam: {
							type: 'string',
							description: 'An optional parameter'
						}
					}
				},
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(emptyTool);
			const emptyResult = toolsService.validateToolInput('emptyTool', '');
			expect(emptyResult).toMatchObject({
				inputObj: undefined
			});
		});

		test('should handle tool without schema', () => {
			const toolWithoutSchema: vscode.LanguageModelToolInformation = {
				name: 'schemaLessTool',
				description: 'A tool without input schema',
				inputSchema: undefined,
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(toolWithoutSchema);

			const result = toolsService.validateToolInput('schemaLessTool', '{"anyParam": "anyValue"}');
			expect(result).toEqual({
				inputObj: { anyParam: 'anyValue' }
			});
		});

		test('should handle type coercion', () => {
			const coercionTool: vscode.LanguageModelToolInformation = {
				name: 'coercionTool',
				description: 'A tool that tests type coercion',
				inputSchema: {
					type: 'object',
					properties: {
						numberAsString: {
							type: 'number'
						},
						booleanAsString: {
							type: 'boolean'
						}
					}
				},
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(coercionTool);

			// Test that AJV coerces string numbers to numbers and string booleans to booleans
			const result = toolsService.validateToolInput('coercionTool', '{"numberAsString": "42", "booleanAsString": "true"}');
			expect(result).toEqual({
				inputObj: { numberAsString: 42, booleanAsString: true }
			});
		});

		test('should handle nested JSON strings', () => {
			const nestedJsonTool: vscode.LanguageModelToolInformation = {
				name: 'nestedJsonTool',
				description: 'A tool that expects nested objects',
				inputSchema: {
					type: 'object',
					properties: {
						thread_id: {
							type: 'string',
							description: 'Thread identifier'
						},
						action_json: {
							type: 'object',
							description: 'Action configuration',
							properties: {
								command: {
									type: 'string'
								}
							},
							required: ['command']
						}
					},
					required: ['thread_id', 'action_json']
				},
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(nestedJsonTool);

			// Test that nested JSON strings are automatically parsed
			const result = toolsService.validateToolInput('nestedJsonTool', '{"thread_id": "i6747", "action_json": "{\\"command\\": \\"ls -la\\"}"}');
			expect(result).toEqual({
				inputObj: {
					thread_id: 'i6747',
					action_json: { command: 'ls -la' }
				}
			});

			// Test with multiple nested JSON strings
			const multiNestedTool: vscode.LanguageModelToolInformation = {
				name: 'multiNestedTool',
				description: 'A tool with multiple nested objects',
				inputSchema: {
					type: 'object',
					properties: {
						config: {
							type: 'object',
							properties: {
								setting: { type: 'string' }
							}
						},
						metadata: {
							type: 'object',
							properties: {
								tags: { type: 'array' }
							}
						}
					}
				},
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(multiNestedTool);

			const multiResult = toolsService.validateToolInput('multiNestedTool', '{"config": "{\\"setting\\": \\"value\\"}", "metadata": "{\\"tags\\": [\\"tag1\\", \\"tag2\\"]}"}');
			expect(multiResult).toEqual({
				inputObj: {
					config: { setting: 'value' },
					metadata: { tags: ['tag1', 'tag2'] }
				}
			});


			const multiResult2 = toolsService.validateToolInput('multiNestedTool', JSON.stringify({
				config: { setting: 'value' },
				metadata: { tags: JSON.stringify(['tag1', 'tag2']) }
			}));
			expect(multiResult2).toEqual({
				inputObj: {
					config: { setting: 'value' },
					metadata: { tags: ['tag1', 'tag2'] }
				}
			});

			// Test that malformed nested JSON strings still fail gracefully
			const malformedResult = toolsService.validateToolInput('nestedJsonTool', '{"thread_id": "i6747", "action_json": "{\\"command\\": invalid}"}');
			expect(malformedResult).toMatchObject({
				error: expect.stringContaining('ERROR: Your input to the tool was invalid')
			});
		});
	});
});
