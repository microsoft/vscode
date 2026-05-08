/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptPiece, PromptSizing, Raw, RenderPromptResult, UserMessage } from '@vscode/prompt-tsx';
import { beforeEach, expect, suite, test } from 'vitest';
import { getTextPart, roleToString } from '../../../../platform/chat/common/globalStringUtils';
import { rawPartAsThinkingData } from '../../../../platform/endpoint/common/thinkingDataContainer';
import { MockEndpoint } from '../../../../platform/endpoint/test/node/mockEndpoint';
import { ITestingServicesAccessor } from '../../../../platform/test/node/services';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../../vscodeTypes';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { ToolCallRound } from '../../../prompt/common/toolCallRound';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { ChatToolCalls, ChatToolCallsProps, ToolFailureEncountered, ToolResultMetadata } from '../../../prompts/node/panel/toolCalling';
import { createExtensionUnitTestingServices } from '../../../test/node/services';
import { IToolsService } from '../../common/toolsService';
import { TestToolsService } from './testToolsService';

suite('TestFailureTool', () => {
	let accessor: ITestingServicesAccessor;
	let testToolsService: TestToolsService;

	beforeEach(async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		accessor = testingServiceCollection.createTestingAccessor();
		testToolsService = accessor.get(IToolsService) as TestToolsService;
	});

	async function doTest(toolCallRounds: ToolCallRound[], toolCallResults?: Record<string, LanguageModelToolResult>, otherProps?: Partial<ChatToolCallsProps>): Promise<RenderPromptResult> {
		const element = otherProps?.isHistorical ? ChatToolCallsWrapper : ChatToolCalls;
		const renderer = PromptRenderer.create(accessor.get(IInstantiationService), accessor.get(IInstantiationService).createInstance(MockEndpoint, undefined), element, {
			promptContext: {
				tools: {
					toolInvocationToken: '1' as never,
					toolReferences: [],
					availableTools: testToolsService.tools
				}
			} as any as IBuildPromptContext,
			toolCallResults,
			toolCallRounds,
			...otherProps
		});
		const r = await renderer.render();

		expect(r.messages.map(m => `# ${roleToString(m.role).toUpperCase()}\n${getTextPart(m.content)}`).join('\n\n')).toMatchSnapshot();

		return r;
	}

	test('tool does not exist', async () => {
		await doTest([
			new ToolCallRound('I will run the tool', [{ id: '1', name: 'tool', arguments: '{}' }], 0, 'id-1')
		]);
	});

	test('includes text responses with no tool calls in historical rounds', async () => {
		await doTest([
			new ToolCallRound('I will run the tool', [{ id: '1', name: 'tool', arguments: '{}' }], 0, 'id-2'),
			new ToolCallRound('I ran it!', [], 0, 'id-3')
		], {
			'1': new LanguageModelToolResult([new LanguageModelTextPart('result')])
		}, {
			isHistorical: true
		});
	});

	test('tool fails on first call, not second', async () => {
		let i = 0;
		testToolsService.addTestToolOverride(
			{ name: 'testTool', description: '', inputSchema: undefined, tags: [], source: undefined },
			{
				invoke: async () => {
					if (i++ !== 1) {
						throw new Error('failed!');
					}

					return new LanguageModelToolResult([new LanguageModelTextPart('result')]);
				}
			});

		const toolCallResults: Record<string, LanguageModelToolResult> = {};
		const id1 = '1';
		const toolCallRounds: ToolCallRound[] = [
			new ToolCallRound('I will run the tool', [{ id: id1, name: 'testTool', arguments: '{}' }], 0, 'id-4')
		];
		const result = await doTest(toolCallRounds, toolCallResults);
		result.metadata.getAll(ToolResultMetadata).forEach(renderedResult => {
			toolCallResults[renderedResult.toolCallId] = renderedResult.result;
		});
		const toolFailMetadata = result.metadata.getAll(ToolFailureEncountered);
		expect(toolFailMetadata.length).toBe(1);

		toolCallRounds.push(new ToolCallRound('I will retry the tool', [{ id: '2', name: 'testTool', arguments: '{}' }], 1, 'id-5'));
		await doTest(toolCallRounds, toolCallResults);
		expect(i).toBe(2);
		expect(toolCallResults[id1]).toBeDefined();
	});

	test('invalid JSON on first call, not second', async () => {
		let i = 0;
		testToolsService.addTestToolOverride(
			{ name: 'testTool', description: '', inputSchema: undefined, tags: [], source: undefined },
			{
				invoke: async (options) => {
					i++;
					if ((options.input as any).xyz !== 123) {
						throw new Error('Invalid input');
					}

					return new LanguageModelToolResult([new LanguageModelTextPart('result')]);
				}
			});

		const toolCallResults: Record<string, LanguageModelToolResult> = {};
		const id1 = '1';
		const toolCallRounds: ToolCallRound[] = [
			new ToolCallRound('I will run the tool', [{ id: id1, name: 'testTool', arguments: '{ "xyz": ' }], 0, 'id-6')
		];
		const result = await doTest(toolCallRounds, toolCallResults);
		result.metadata.getAll(ToolResultMetadata).forEach(renderedResult => {
			toolCallResults[renderedResult.toolCallId] = renderedResult.result;
		});
		const toolFailMetadata = result.metadata.getAll(ToolFailureEncountered);
		expect(toolFailMetadata.length).toBe(1);

		toolCallRounds.push(new ToolCallRound('I will retry the tool', [{ id: '2', name: 'testTool', arguments: '{ "xyz": 123}' }], 1, 'id-7'));
		await doTest(toolCallRounds, toolCallResults);
		expect(i).toBe(1);
		expect(toolCallResults[id1]).toBeDefined();
	});

	test('tool does exist', async () => {
		await doTest([
			new ToolCallRound('I will run the tool', [{ id: '1', name: 'testTool', arguments: '{}' }], 0, 'id-8')
		], {});
	});
});

class ChatToolCallsWrapper extends PromptElement<ChatToolCallsProps, void> {
	override async render(state: void, sizing: PromptSizing): Promise<PromptPiece<any, any> | undefined> {
		return <>
			<ChatToolCalls {...this.props} />
			<UserMessage>Required user message for test</UserMessage>
		</>;
	}
}

suite('ChatToolCalls thinking handling', () => {
	let accessor: ITestingServicesAccessor;

	beforeEach(async () => {
		const testingServiceCollection = createExtensionUnitTestingServices();
		accessor = testingServiceCollection.createTestingAccessor();
	});

	function makeEndpoint(model: string, apiType: string | undefined): MockEndpoint {
		const endpoint = accessor.get(IInstantiationService).createInstance(MockEndpoint, undefined);
		(endpoint as { model: string }).model = model;
		(endpoint as { apiType?: string }).apiType = apiType;
		return endpoint;
	}

	function makeThinkingRound(modelId: string): ToolCallRound {
		return ToolCallRound.create({
			id: 'r1',
			response: 'thinking response',
			toolCalls: [],
			toolInputRetry: 0,
			thinking: { id: 'th1', text: 'reasoning content' },
			modelId,
		});
	}

	async function render(endpoint: MockEndpoint, rounds: ToolCallRound[], isHistorical: boolean): Promise<RenderPromptResult> {
		const renderer = PromptRenderer.create(accessor.get(IInstantiationService), endpoint, ChatToolCallsWrapper, {
			promptContext: {
				tools: {
					toolInvocationToken: '1' as never,
					toolReferences: [],
					availableTools: []
				}
			} as any as IBuildPromptContext,
			toolCallResults: {},
			toolCallRounds: rounds,
			isHistorical,
		});
		return renderer.render();
	}

	function hasThinkingPart(result: RenderPromptResult): boolean {
		return result.messages.some(m => Array.isArray(m.content) && m.content.some(c =>
			c.type === Raw.ChatCompletionContentPartKind.Opaque && rawPartAsThinkingData(c) !== undefined));
	}

	test('historical: includes thinking when responses API and modelId matches', async () => {
		const endpoint = makeEndpoint('gpt-5', 'responses');
		const result = await render(endpoint, [makeThinkingRound('gpt-5')], true);
		expect(hasThinkingPart(result)).toBe(true);
	});

	test('historical: drops thinking on messages API even with matching modelId', async () => {
		const endpoint = makeEndpoint('claude-3.7-sonnet', 'messages');
		const result = await render(endpoint, [makeThinkingRound('claude-3.7-sonnet')], true);
		expect(hasThinkingPart(result)).toBe(false);
	});

	test('historical: drops thinking on responses API when modelId mismatches', async () => {
		const endpoint = makeEndpoint('gpt-5', 'responses');
		const result = await render(endpoint, [makeThinkingRound('claude-3.7-sonnet')], true);
		expect(hasThinkingPart(result)).toBe(false);
	});

	test('historical: drops thinking when round has no modelId', async () => {
		const endpoint = makeEndpoint('gpt-5', 'responses');
		const round = ToolCallRound.create({
			id: 'r1',
			response: 'thinking response',
			toolCalls: [],
			toolInputRetry: 0,
			thinking: { id: 'th1', text: 'reasoning content' },
		});
		const result = await render(endpoint, [round], true);
		expect(hasThinkingPart(result)).toBe(false);
	});

	test('non-historical: includes thinking regardless of apiType/modelId', async () => {
		const endpoint = makeEndpoint('gpt-5', 'chatCompletions');
		const result = await render(endpoint, [makeThinkingRound('claude-3.7-sonnet')], false);
		expect(hasThinkingPart(result)).toBe(true);
	});

	test('historical: backward-compat reads phaseModelId when modelId is missing', async () => {
		const endpoint = makeEndpoint('gpt-5', 'responses');
		// Older persisted rounds use `phaseModelId` instead of `modelId`.
		const round = ToolCallRound.create({
			id: 'r1',
			response: 'thinking response',
			toolCalls: [],
			toolInputRetry: 0,
			thinking: { id: 'th1', text: 'reasoning content' },
		});
		(round as ToolCallRound & { phaseModelId?: string }).phaseModelId = 'gpt-5';
		const result = await render(endpoint, [round], true);
		expect(hasThinkingPart(result)).toBe(true);
	});
});
