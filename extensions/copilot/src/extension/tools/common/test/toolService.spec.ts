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

		test('should reconstruct flattened path keys', () => {
			const askQuestionsTool: vscode.LanguageModelToolInformation = {
				name: 'askQuestionsTool',
				description: 'A tool that expects an array of nested question objects',
				inputSchema: {
					type: 'object',
					properties: {
						questions: {
							type: 'array',
							items: {
								type: 'object',
								properties: {
									header: { type: 'string' },
									question: { type: 'string' },
									allowFreeformInput: { type: 'boolean' },
									options: {
										type: 'array',
										items: {
											type: 'object',
											properties: {
												label: { type: 'string' },
												description: { type: 'string' },
												recommended: { type: 'boolean' }
											},
											required: ['label']
										}
									}
								},
								required: ['header', 'question']
							}
						}
					},
					required: ['questions']
				},
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(askQuestionsTool);

			// Gemini-style flattened path keys instead of a nested object/array.
			const flattenedInput = JSON.stringify({
				'questions[0].allowFreeformInput': true,
				'questions[0].header': 'repro_question_1',
				'questions[0].options[0].description': 'First option description',
				'questions[0].options[0].label': 'Option A',
				'questions[0].options[0].recommended': true,
				'questions[0].options[1].description': 'Second option description',
				'questions[0].options[1].label': 'Option B',
				'questions[0].question': 'Which option do you prefer?',
				'questions[1].allowFreeformInput': false,
				'questions[1].header': 'repro_question_2',
				'questions[1].options[0].label': 'Yes',
				'questions[1].options[1].label': 'No',
				'questions[1].question': 'Do you want to continue?'
			});

			const result = toolsService.validateToolInput('askQuestionsTool', flattenedInput);
			expect(result).toEqual({
				inputObj: {
					questions: [
						{
							allowFreeformInput: true,
							header: 'repro_question_1',
							question: 'Which option do you prefer?',
							options: [
								{ description: 'First option description', label: 'Option A', recommended: true },
								{ description: 'Second option description', label: 'Option B' }
							]
						},
						{
							allowFreeformInput: false,
							header: 'repro_question_2',
							question: 'Do you want to continue?',
							options: [
								{ label: 'Yes' },
								{ label: 'No' }
							]
						}
					]
				}
			});
		});

		test('should not pollute prototype when reconstructing flattened keys', () => {
			const pollutionTool: vscode.LanguageModelToolInformation = {
				name: 'pollutionTool',
				description: 'A tool whose flattened input contains unsafe property names',
				inputSchema: {
					type: 'object',
					properties: {
						data: {
							type: 'object',
							properties: { value: { type: 'string' } }
						}
					},
					required: ['data']
				},
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(pollutionTool);

			const malicious = JSON.stringify({
				'__proto__.polluted': 'yes',
				'data.value': 'ok'
			});

			const result = toolsService.validateToolInput('pollutionTool', malicious);

			// The unsafe key makes reconstruction bail out, so validation fails
			// rather than mutating Object.prototype.
			expect(result).toMatchObject({
				error: expect.stringContaining('ERROR: Your input to the tool was invalid')
			});
			expect(({} as Record<string, unknown>).polluted).toBeUndefined();
		});

		test('should bail out on conflicting flattened keys', () => {
			const conflictTool: vscode.LanguageModelToolInformation = {
				name: 'conflictTool',
				description: 'A tool whose flattened input has conflicting paths',
				inputSchema: {
					type: 'object',
					properties: {
						a: { type: 'object' }
					},
					required: ['a']
				},
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(conflictTool);

			// `a` is both a primitive and a parent of `a.b` — unresolvable.
			const conflicting = JSON.stringify({
				'a': 'primitive',
				'a.b': 'nested'
			});

			const result = toolsService.validateToolInput('conflictTool', conflicting);
			expect(result).toMatchObject({
				error: expect.stringContaining('ERROR: Your input to the tool was invalid')
			});
		});

		test('should reject out-of-range array indices in flattened keys', () => {
			const indexTool: vscode.LanguageModelToolInformation = {
				name: 'indexTool',
				description: 'A tool whose flattened input has an enormous array index',
				inputSchema: {
					type: 'object',
					properties: {
						items: {
							type: 'array',
							items: { type: 'string' }
						}
					},
					required: ['items']
				},
				tags: [],
				source: undefined
			};

			(toolsService.tools as vscode.LanguageModelToolInformation[]).push(indexTool);

			// A huge index would create a massive sparse array; reconstruction
			// must bail rather than produce one.
			const huge = JSON.stringify({ 'items[999999999999]': 'value' });

			const result = toolsService.validateToolInput('indexTool', huge);
			expect(result).toMatchObject({
				error: expect.stringContaining('ERROR: Your input to the tool was invalid')
			});
		});
	});
});
