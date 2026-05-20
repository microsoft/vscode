/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { expect, suite, test } from 'vitest';
import { ChatFetchResponseType } from '../../../../platform/chat/common/commonTypes';
import { ConfigKey } from '../../../../platform/configuration/common/configurationService';
import { toolCategories, ToolCategory, ToolName } from '../../common/toolNames';
import { ToolRegistry } from '../../common/toolsRegistry';

// Ensure side-effect registration
import { CONTEXT_OVERFLOW_FALLBACK, mapLoopResponseToText } from '../searchSubagentTool';

/** Minimal stub for LanguageModelToolInformation */
function makeToolInfo(overrides: Partial<vscode.LanguageModelToolInformation> = {}): vscode.LanguageModelToolInformation {
	return {
		name: ToolName.SearchSubagent,
		description: 'base description',
		inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
		tags: [],
		parametersSchema: {},
		...overrides,
	} as unknown as vscode.LanguageModelToolInformation;
}

/** Returns an instance of the (private) SearchSubagentTool via the registry */
function makeToolInstance(thoroughnessEnabled: boolean, toolCallLimit: number = 4) {
	const toolCtor = ToolRegistry.getTools().find(t => t.toolName === ToolName.SearchSubagent)!;

	const configService = {
		getExperimentBasedConfig(key: { id: string }) {
			if (key.id === ConfigKey.Advanced.SearchSubagentThoroughnessEnabled.id) {
				return thoroughnessEnabled;
			}
			if (key.id === ConfigKey.Advanced.SearchSubagentToolCallLimit.id) {
				return toolCallLimit;
			}
			return undefined;
		},
	};
	const experimentationService = {};

	// instantiationService just passes through createInstance calls with the remaining args
	const capturedLoopOptions: { toolCallLimit?: number; thoroughness?: string }[] = [];
	const instantiationService = {
		createInstance(_ctor: unknown, options: { toolCallLimit: number; thoroughness?: string }) {
			capturedLoopOptions.push({ toolCallLimit: options.toolCallLimit, thoroughness: options.thoroughness });
			// Return a minimal stub that exposes run()
			return { run: async () => ({ response: { type: 'error', reason: 'stub' }, toolCallRounds: [], round: { response: '' } }) };
		},
	};

	const tool = new (toolCtor as any)(
		instantiationService,
		{ captureInvocation: async (_token: unknown, fn: () => unknown) => fn() }, // requestLogger
		{ getWorkspaceFolders: () => [], openTextDocument: async () => { throw new Error('stub'); } }, // workspaceService
		configService,
		experimentationService,
	);

	return { tool, capturedLoopOptions };
}

suite('SearchSubagentTool', () => {
	test('is registered and categorized as Core', () => {
		const isRegistered = ToolRegistry.getTools().some(t => t.toolName === ToolName.SearchSubagent);
		expect(isRegistered).toBe(true);
		expect(toolCategories[ToolName.SearchSubagent]).toBe(ToolCategory.Core);
	});

	suite('alternativeDefinition', () => {
		test('returns tool unchanged when thoroughness is disabled', () => {
			const { tool } = makeToolInstance(false);
			const base = makeToolInfo();
			const result = tool.alternativeDefinition(base);
			expect(result).toBe(base);
		});

		test('appends thoroughness description when enabled', () => {
			const { tool } = makeToolInstance(true);
			const result = tool.alternativeDefinition(makeToolInfo());
			expect(result.description).toContain('thoroughness');
			expect(result.description).toContain('normal');
			expect(result.description).toContain('deep');
		});

		test('adds thoroughness enum to inputSchema when enabled', () => {
			const { tool } = makeToolInstance(true);
			const result = tool.alternativeDefinition(makeToolInfo());
			const props = (result.inputSchema as { properties: Record<string, unknown> }).properties;
			expect(props).toHaveProperty('thoroughness');
			expect((props['thoroughness'] as { enum: string[] }).enum).toEqual(['normal', 'deep']);
		});

		test('preserves existing schema properties when enabled', () => {
			const { tool } = makeToolInstance(true);
			const result = tool.alternativeDefinition(makeToolInfo());
			const props = (result.inputSchema as { properties: Record<string, unknown> }).properties;
			expect(props).toHaveProperty('query');
		});
	});

	suite('thoroughness tool-call limit', () => {
		test('deep doubles the base toolCallLimit', async () => {
			const baseLimit = 4;
			const { tool, capturedLoopOptions } = makeToolInstance(true, baseLimit);
			tool['_inputContext'] = {
				request: { location: 1 },
				conversation: { sessionId: 'test-session' },
				stream: undefined,
			};

			await tool.invoke({
				input: { query: 'test', description: 'desc', details: 'details', thoroughness: 'deep' },
				chatStreamToolCallId: undefined,
			}, { isCancellationRequested: true } as vscode.CancellationToken).catch(() => { /* stub errors expected */ });

			expect(capturedLoopOptions[0]?.toolCallLimit).toBe(baseLimit * 2);
		});

		test('normal uses base toolCallLimit unchanged', async () => {
			const baseLimit = 4;
			const { tool, capturedLoopOptions } = makeToolInstance(true, baseLimit);
			tool['_inputContext'] = {
				request: { location: 1 },
				conversation: { sessionId: 'test-session' },
				stream: undefined,
			};

			await tool.invoke({
				input: { query: 'test', description: 'desc', details: 'details', thoroughness: 'normal' },
				chatStreamToolCallId: undefined,
			}, { isCancellationRequested: true } as vscode.CancellationToken).catch(() => { /* stub errors expected */ });

			expect(capturedLoopOptions[0]?.toolCallLimit).toBe(baseLimit);
		});

		test('thoroughness disabled: omitted thoroughness uses base limit', async () => {
			const baseLimit = 4;
			const { tool, capturedLoopOptions } = makeToolInstance(false, baseLimit);
			tool['_inputContext'] = {
				request: { location: 1 },
				conversation: { sessionId: 'test-session' },
				stream: undefined,
			};

			await tool.invoke({
				input: { query: 'test', description: 'desc', details: 'details' },
				chatStreamToolCallId: undefined,
			}, { isCancellationRequested: true } as vscode.CancellationToken).catch(() => { /* stub errors expected */ });

			expect(capturedLoopOptions[0]?.toolCallLimit).toBe(baseLimit);
		});

		test('thoroughness disabled: deep is ignored and base limit is used', async () => {
			const baseLimit = 4;
			const { tool, capturedLoopOptions } = makeToolInstance(false, baseLimit);
			tool['_inputContext'] = {
				request: { location: 1 },
				conversation: { sessionId: 'test-session' },
				stream: undefined,
			};

			await tool.invoke({
				input: { query: 'test', description: 'desc', details: 'details', thoroughness: 'deep' },
				chatStreamToolCallId: undefined,
			}, { isCancellationRequested: true } as vscode.CancellationToken).catch(() => { /* stub errors expected */ });

			expect(capturedLoopOptions[0]?.toolCallLimit).toBe(baseLimit);
		});
	});
});

suite('mapLoopResponseToText', () => {
	function makeRound(response: string) {
		return { id: 'r', response, toolInputRetry: 0, toolCalls: [] };
	}

	test('success returns the last tool-call round response', () => {
		const text = mapLoopResponseToText({
			response: { type: ChatFetchResponseType.Success },
			toolCallRounds: [makeRound('first'), makeRound('last')],
			round: makeRound('final-round'),
		} as any);
		expect(text).toBe('last');
	});

	test('success falls back to round.response when toolCallRounds is empty', () => {
		const text = mapLoopResponseToText({
			response: { type: ChatFetchResponseType.Success },
			toolCallRounds: [],
			round: makeRound('final-round'),
		} as any);
		expect(text).toBe('final-round');
	});

	test('success returns empty string when no responses are available', () => {
		const text = mapLoopResponseToText({
			response: { type: ChatFetchResponseType.Success },
			toolCallRounds: [],
			round: makeRound(''),
		} as any);
		expect(text).toBe('');
	});

	test('context-overflow BadRequest is converted to the benign final_answer fallback', () => {
		const overflowReasons = [
			'context_length_exceeded',
			'Request too large for model',
			'prompt is too long for this model',
			'maximum context length is 200000 tokens',
		];

		for (const reason of overflowReasons) {
			const text = mapLoopResponseToText({
				response: { type: ChatFetchResponseType.BadRequest, reason },
				toolCallRounds: [],
				round: makeRound('ignored'),
			} as any);
			expect(text, `reason "${reason}" should map to fallback`).toBe(CONTEXT_OVERFLOW_FALLBACK);
		}
	});

	test('non-overflow failures surface the response type and reason to the main agent', () => {
		const text = mapLoopResponseToText({
			response: { type: ChatFetchResponseType.Failed, reason: 'network down' },
			toolCallRounds: [],
			round: makeRound(''),
		} as any);
		expect(text).toContain(ChatFetchResponseType.Failed);
		expect(text).toContain('network down');
		expect(text).not.toBe(CONTEXT_OVERFLOW_FALLBACK);
	});
});
