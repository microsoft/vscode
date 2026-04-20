/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterAll, beforeAll, beforeEach, expect, suite, test } from 'vitest';
import { IChatMLFetcher } from '../../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../../platform/chat/common/commonTypes';
import { StaticChatMLFetcher } from '../../../../../platform/chat/test/common/staticChatMLFetcher';
import { CodeGenerationTextInstruction, ConfigKey, IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { messageToMarkdown } from '../../../../../platform/log/common/messageStringify';
import { IResponseDelta } from '../../../../../platform/networking/common/fetch';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { createTextDocumentData } from '../../../../../util/common/test/shims/textDocument';
import { URI } from '../../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../../../vscodeTypes';
import { addCacheBreakpoints } from '../../../../intents/node/cacheBreakpoints';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { Conversation, ICopilotChatResultIn, normalizeSummariesOnRounds, Turn, TurnStatus } from '../../../../prompt/common/conversation';
import { IBuildPromptContext, IToolCall } from '../../../../prompt/common/intents';
import { ToolCallRound } from '../../../../prompt/common/toolCallRound';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { PromptRenderer } from '../../base/promptRenderer';
import { AgentPrompt, AgentPromptProps } from '../agentPrompt';
import { PromptRegistry } from '../promptRegistry';
import { ISessionTranscriptService, NullSessionTranscriptService } from '../../../../../platform/chat/common/sessionTranscriptService';
import { appendTranscriptHintToSummary, ConversationHistorySummarizationPrompt, extractInlineSummary, stripToolSearchMessages, SummarizedConversationHistory, SummarizedConversationHistoryMetadata, SummarizedConversationHistoryPropsBuilder } from '../summarizedConversationHistory';

suite('Agent Summarization', () => {
	let accessor: ITestingServicesAccessor;
	let chatResponse: (string | IResponseDelta[])[] = [];
	const fileTsUri = URI.file('/workspace/file.ts');

	let conversation: Conversation;

	beforeAll(() => {
		const testDoc = createTextDocumentData(fileTsUri, 'line 1\nline 2\n\nline 4\nline 5', 'ts').document;

		const services = createExtensionUnitTestingServices();
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[
				[URI.file('/workspace')],
				[testDoc]
			]
		));
		chatResponse = [];
		services.define(IChatMLFetcher, new StaticChatMLFetcher(chatResponse));
		accessor = services.createTestingAccessor();
		accessor.get(IConfigurationService).setConfig(ConfigKey.CodeGenerationInstructions, [{
			text: 'This is a test custom instruction file',
		} satisfies CodeGenerationTextInstruction]);
	});

	beforeEach(() => {
		const turn = new Turn('turnId', { type: 'user', message: 'hello' });
		conversation = new Conversation('sessionId', [turn]);
	});

	afterAll(() => {
		accessor.dispose();
	});

	enum TestPromptType {
		Agent = 'Agent',
		FullSummarization = 'FullSumm',
		SimpleSummarization = 'SimpleSummarizedHistory'
	}

	async function agentPromptToString(accessor: ITestingServicesAccessor, promptContext: IBuildPromptContext, otherProps?: Partial<AgentPromptProps>, promptType: TestPromptType = TestPromptType.Agent): Promise<string> {
		const instaService = accessor.get(IInstantiationService);
		const endpoint = instaService.createInstance(MockEndpoint, undefined);
		normalizeSummariesOnRounds(promptContext.history);
		if (!promptContext.conversation) {
			promptContext = { ...promptContext, conversation };
		}

		const baseProps = {
			priority: 1,
			endpoint,
			location: ChatLocation.Panel,
			promptContext,
			maxToolResultLength: Infinity,
			...otherProps
		};

		let renderer;
		if (promptType === 'Agent') {
			const customizations = await PromptRegistry.resolveAllCustomizations(instaService, endpoint);
			const props: AgentPromptProps = { ...baseProps, customizations };
			renderer = PromptRenderer.create(instaService, endpoint, AgentPrompt, props);
		} else {
			const propsInfo = instaService.createInstance(SummarizedConversationHistoryPropsBuilder).getProps(baseProps);
			const simpleMode = promptType === TestPromptType.SimpleSummarization;
			renderer = PromptRenderer.create(instaService, endpoint, ConversationHistorySummarizationPrompt, { ...propsInfo.props, simpleMode });
		}

		const r = await renderer.render();
		const summarizedConversationMetadata = r.metadata.get(SummarizedConversationHistoryMetadata);
		if (summarizedConversationMetadata && promptContext.toolCallRounds) {
			for (const toolCallRound of promptContext.toolCallRounds) {
				if (toolCallRound.id === summarizedConversationMetadata.toolCallRoundId) {
					toolCallRound.summary = summarizedConversationMetadata.text;
				}
			}
		}
		addCacheBreakpoints(r.messages);
		return r.messages
			.filter(message => message.role !== Raw.ChatRole.System)
			.map(m => messageToMarkdown(m))
			.join('\n\n')
			.replace(/\\+/g, '/')
			.replace(/The current date is.*/g, '(Date removed from snapshot)');
	}

	function createEditFileToolCall(idx: number): IToolCall {
		return {
			id: `tooluse_${idx}`,
			name: ToolName.EditFile,
			arguments: JSON.stringify({
				filePath: fileTsUri.fsPath, code: `// existing code...\nconsole.log('hi')`
			})
		};
	}

	function createEditFileToolResult(...idxs: number[]): Record<string, LanguageModelToolResult> {
		const result: Record<string, LanguageModelToolResult> = {};
		for (const idx of idxs) {
			result[`tooluse_${idx}`] = new LanguageModelToolResult([new LanguageModelTextPart('success')]);
		}
		return result;
	}

	function getSnapshotFile(promptType: TestPromptType, name: string): string {
		return `./__snapshots__/summarization-${name}-${promptType}.spec.snap`;
	}

	const tools: IBuildPromptContext['tools'] = {
		availableTools: [],
		toolInvocationToken: null as never,
		toolReferences: [],
	};

	test('continuation turns are not rendered in conversation history', async () => {
		const firstTurn = new Turn('id1', { type: 'user', message: 'previous turn message' });
		const continuationTurn = new Turn('id2', { type: 'user', message: 'continuation turn message' }, undefined, [], undefined, undefined, true);

		const promptContext: IBuildPromptContext = {
			chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
			history: [firstTurn, continuationTurn],
			query: 'edit this file',
			toolCallRounds: [],
			tools,
		};

		const rendered = await agentPromptToString(
			accessor,
			promptContext,
			{ enableCacheBreakpoints: true },
			TestPromptType.Agent
		);

		expect(rendered).toContain('previous turn message');
		expect(rendered).not.toContain('continuation turn message');
	});

	test('cannot summarize with no history', async () => {
		const promptContextNoHistory: IBuildPromptContext = {
			chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
			history: [],
			query: 'edit this file',
			toolCallRounds: [],
			tools,
		};
		await expect(() => agentPromptToString(
			accessor, promptContextNoHistory, undefined, TestPromptType.FullSummarization)).rejects.toThrow();
		await expect(() => agentPromptToString(
			accessor,
			{
				...promptContextNoHistory,
				toolCallRounds: [
					new ToolCallRound('ok', [createEditFileToolCall(1)]),
				],
				toolCallResults: createEditFileToolResult(1),
				tools,
			}, undefined, TestPromptType.FullSummarization)).rejects.toThrow();
	});

	async function testTriggerSummarizationDuringToolCalling(promptType: TestPromptType) {
		chatResponse[0] = 'summarized!';
		const toolCallRounds = [
			new ToolCallRound('ok', [createEditFileToolCall(1)]),
			new ToolCallRound('ok 2', [createEditFileToolCall(2)]),
			new ToolCallRound('ok 3', [createEditFileToolCall(3)]),
		];
		await expect(await agentPromptToString(
			accessor,
			{
				chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
				history: [],
				query: 'edit this file',
				toolCallRounds,
				toolCallResults: createEditFileToolResult(1, 2, 3),
				tools
			},
			{
				enableCacheBreakpoints: true,
				triggerSummarize: true,
			}, promptType)).toMatchFileSnapshot(getSnapshotFile(promptType, 'duringToolCalling'));
		if (promptType === TestPromptType.Agent) {
			expect(toolCallRounds.at(-2)?.summary).toBe('summarized!');
		}
	}

	// Summarization for rounds in current turn
	test('trigger summarization during tool calling', async () => await testTriggerSummarizationDuringToolCalling(TestPromptType.Agent));
	test('FullSummarization - trigger summarization during tool calling', async () => await testTriggerSummarizationDuringToolCalling(TestPromptType.FullSummarization));
	test('SimpleSummarization - trigger summarization during tool calling', async () => await testTriggerSummarizationDuringToolCalling(TestPromptType.SimpleSummarization));

	async function testSummaryCurrentTurn(promptType: TestPromptType) {
		const excludedPreviousRound = new ToolCallRound('previous round EXCLUDED', [createEditFileToolCall(1)]);
		const round = new ToolCallRound('ok', [createEditFileToolCall(2)]);
		round.summary = 'summarized!';
		await expect(await agentPromptToString(
			accessor,
			{
				chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
				history: [],
				query: 'edit this file',
				toolCallRounds: [
					excludedPreviousRound,
					round
				],
				toolCallResults: createEditFileToolResult(1, 2),
				tools
			},
			{
				enableCacheBreakpoints: true,
			}, promptType)).toMatchFileSnapshot(getSnapshotFile(promptType, 'currentTurn'));
	}

	// SummarizationPrompt test is not relevant when the last round was summarized
	test('render summary in current turn', async () => await testSummaryCurrentTurn(TestPromptType.Agent));

	async function testSummaryCurrentTurnEarlierRound(promptType: TestPromptType) {
		const round = new ToolCallRound('round 1', [createEditFileToolCall(1)]);
		round.summary = 'summarized!';
		const round2 = new ToolCallRound('round 2', [createEditFileToolCall(2)]);
		const round3 = new ToolCallRound('round 3', [createEditFileToolCall(3)]);
		await expect(await agentPromptToString(
			accessor,
			{
				chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
				history: [],
				query: 'edit this file',
				toolCallRounds: [
					round,
					round2,
					round3
				],
				toolCallResults: createEditFileToolResult(1, 2, 3),
				tools
			},
			{
				enableCacheBreakpoints: true,
			}, promptType)).toMatchFileSnapshot(getSnapshotFile(promptType, 'currentTurnEarlierRound'));
	}

	test('render summary in previous turn', async () => await testSummaryCurrentTurnEarlierRound(TestPromptType.Agent));
	test('FullSummarization - render summary in previous turn', async () => await testSummaryCurrentTurnEarlierRound(TestPromptType.FullSummarization));
	test('SimpleSummarization - render summary in previous turn', async () => await testSummaryCurrentTurnEarlierRound(TestPromptType.SimpleSummarization));

	async function testSummaryPrevTurnMultiple(promptType: TestPromptType) {
		const previousTurn = new Turn('id', { type: 'user', message: 'previous turn excluded' });
		const previousTurnResult: ICopilotChatResultIn = {
			metadata: {
				summary: {
					text: 'summarized 1!',
					toolCallRoundId: 'toolCallRoundId1'
				},
				toolCallRounds: [
					new ToolCallRound('response', [createEditFileToolCall(1)], undefined, 'toolCallRoundId1'),
				],
				toolCallResults: createEditFileToolResult(1),
			}
		};
		previousTurn.setResponse(TurnStatus.Success, { type: 'user', message: 'response' }, 'responseId', previousTurnResult);

		const turn = new Turn('id', { type: 'user', message: 'hello' });
		const result: ICopilotChatResultIn = {
			metadata: {
				summary: {
					text: 'summarized 2!',
					toolCallRoundId: 'toolCallRoundId3'
				},
				toolCallRounds: [
					new ToolCallRound('response excluded', [createEditFileToolCall(2)], undefined, 'toolCallRoundId2'),
					new ToolCallRound('response with summary', [createEditFileToolCall(3)], undefined, 'toolCallRoundId3'),
					new ToolCallRound('next response', [createEditFileToolCall(4)], undefined, 'toolCallRoundId4'),
				],
				toolCallResults: createEditFileToolResult(2, 3, 4),
			}
		};
		turn.setResponse(TurnStatus.Success, { type: 'user', message: 'response' }, 'responseId', result);

		await expect(await agentPromptToString(
			accessor,
			{
				chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
				history: [previousTurn, turn],
				query: 'edit this file',
				toolCallRounds: [(new ToolCallRound('hello next round', [createEditFileToolCall(5)]))],
				toolCallResults: createEditFileToolResult(5),
				tools
			},
			{
				enableCacheBreakpoints: true,
			}, promptType)).toMatchFileSnapshot(getSnapshotFile(promptType, 'previousTurnMultiple'));
	}

	test('render summary in previous turn (with multiple)', () => testSummaryPrevTurnMultiple(TestPromptType.Agent));
	test('FullSummarization - render summary in previous turn (with multiple)', () => testSummaryPrevTurnMultiple(TestPromptType.FullSummarization));
	test('SimpleSummarization - render summary in previous turn (with multiple)', () => testSummaryPrevTurnMultiple(TestPromptType.SimpleSummarization));

	async function testSummarizeWithNoRoundsInCurrentTurn(promptType: TestPromptType) {
		const previousTurn1 = new Turn('id', { type: 'user', message: 'previous turn 1' });
		previousTurn1.setResponse(TurnStatus.Success, { type: 'user', message: 'response' }, 'responseId', {});

		const previousTurn2 = new Turn('id', { type: 'user', message: 'previous turn 2' });
		const previousTurn2Result: ICopilotChatResultIn = {
			metadata: {
				toolCallRounds: [],
				summary: {
					toolCallRoundId: 'previous',
					text: 'previous turn 1 summary'
				}
			}
		};
		previousTurn2.setResponse(TurnStatus.Success, { type: 'user', message: 'response' }, 'responseId', previousTurn2Result);

		await expect(await agentPromptToString(
			accessor,
			{
				chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
				history: [previousTurn1, previousTurn2],
				query: 'hello',
				tools
			},
			{
				enableCacheBreakpoints: true,
			}, promptType)).toMatchFileSnapshot(getSnapshotFile(promptType, 'previousTurnNoRounds'));
	}

	test('summary for previous turn, no tool call rounds', async () => testSummarizeWithNoRoundsInCurrentTurn(TestPromptType.Agent));
	test('FullSummarization - summary for previous turn, no tool call rounds', async () => testSummarizeWithNoRoundsInCurrentTurn(TestPromptType.FullSummarization));
	test('SimpleSummarization - summary for previous turn, no tool call rounds', async () => testSummarizeWithNoRoundsInCurrentTurn(TestPromptType.SimpleSummarization));

	function createSummarizationTestContext() {
		const instaService = accessor.get(IInstantiationService);
		const endpoint = instaService.createInstance(MockEndpoint, undefined);

		const toolCallRounds = [
			new ToolCallRound('ok', [createEditFileToolCall(1)]),
			new ToolCallRound('ok 2', [createEditFileToolCall(2)]),
			new ToolCallRound('ok 3', [createEditFileToolCall(3)]),
		];

		const turn = new Turn('turnId', { type: 'user', message: 'hello' });
		const testConversation = new Conversation('sessionId', [turn]);

		const promptContext: IBuildPromptContext = {
			chatVariables: new ChatVariablesCollection([{ id: 'vscode.file', name: 'file', value: fileTsUri }]),
			history: [],
			query: 'edit this file',
			toolCallRounds,
			toolCallResults: createEditFileToolResult(1, 2, 3),
			tools,
			conversation: testConversation,
		};

		const historyProps = {
			priority: 1,
			endpoint,
			location: ChatLocation.Panel,
			promptContext,
			maxToolResultLength: Infinity,
			enableCacheBreakpoints: true,
			triggerSummarize: true,
		};

		return { instaService, endpoint, toolCallRounds, turn, testConversation, promptContext, historyProps };
	}

	test('failed summarization throws from renderer (fallback is in agentIntent)', async () => {
		// Keep the summary tiny-budgeted so the failure is immediate. The PromptRenderer propagates the error;
		// the fallback to a no-cache-breakpoints render lives in agentIntent.ts's
		// renderWithSummarization, not here.
		chatResponse[0] = 'summary that is definitely too large for one token';
		const { instaService, endpoint, historyProps } = createSummarizationTestContext();

		const renderer = PromptRenderer.create(instaService, endpoint, SummarizedConversationHistory, {
			...historyProps,
			maxSummaryTokens: 1,
		});
		await expect(renderer.render()).rejects.toThrow('Summary too large');
	});

	test('successful summarization records metadata on render result', async () => {
		chatResponse[0] = 'summarized successfully!';
		const { instaService, endpoint, historyProps } = createSummarizationTestContext();

		const renderer = PromptRenderer.create(instaService, endpoint, SummarizedConversationHistory, historyProps);
		const result = await renderer.render();

		const summaryMeta = result.metadata.get(SummarizedConversationHistoryMetadata);
		expect(summaryMeta).toBeDefined();
		expect(summaryMeta!.text).toBe('summarized successfully!');
		expect(summaryMeta!.toolCallRoundId).toBeTruthy();
	});

	test('failed summarization does not set round.summary', async () => {
		chatResponse[0] = 'summary that is definitely too large for one token';
		const { instaService, endpoint, toolCallRounds, historyProps } = createSummarizationTestContext();

		const renderer = PromptRenderer.create(instaService, endpoint, SummarizedConversationHistory, {
			...historyProps,
			maxSummaryTokens: 1,
		});
		await expect(renderer.render()).rejects.toThrow('Summary too large');

		// None of the rounds should have summary set since summarization failed
		for (const round of toolCallRounds) {
			expect(round.summary).toBeUndefined();
		}
	});

	test('simple mode summarization with small token budget renders zero messages (repro for No messages provided)', async () => {
		// Repro for: "Prompt failed validation with the reason: No messages provided"
		//
		// Root cause: when modelMaxPromptTokens is small enough that the summarization
		// prompt content exceeds the budget, prompt-tsx prunes all child elements.
		// After pruning, toChatMessages() silently skips messages whose content is
		// empty (isEmpty check), producing an empty messages array — without throwing
		// BudgetExceededError. The downstream makeChatRequest2 then hits the
		// isValidChatPayload check: "No messages provided".
		const instaService = accessor.get(IInstantiationService);
		const endpoint = instaService.createInstance(MockEndpoint, 'claude-sonnet');
		endpoint.modelMaxPromptTokens = 5; // So small that even a single short message cannot fit

		const toolCallRounds = [
			new ToolCallRound('ok', [createEditFileToolCall(1)]),
			new ToolCallRound('ok 2', [createEditFileToolCall(2)]),
		];

		const turn = new Turn('turnId', { type: 'user', message: 'hello' });
		const testConversation = new Conversation('sessionId', [turn]);

		const promptContext: IBuildPromptContext = {
			chatVariables: new ChatVariablesCollection([]),
			history: [],
			query: 'edit this file',
			toolCallRounds,
			toolCallResults: createEditFileToolResult(1, 2),
			tools,
			conversation: testConversation,
		};

		const baseProps = {
			priority: 1,
			endpoint,
			location: ChatLocation.Panel,
			promptContext,
			maxToolResultLength: Infinity,
		};

		const propsInfo = instaService.createInstance(SummarizedConversationHistoryPropsBuilder).getProps(baseProps);
		const renderer = PromptRenderer.create(instaService, endpoint, ConversationHistorySummarizationPrompt, { ...propsInfo.props, simpleMode: true });
		const result = await renderer.render();

		// prompt-tsx prunes all content and silently drops empty messages → 0 messages
		expect(result.messages.length).toBe(0);
	});

	test('failure metadata on turn prevents repeated foreground summarization attempts', async () => {
		// This test verifies the contract that agentIntent.ts relies on:
		// after a foreground summarization failure, setting SummarizedConversationHistoryMetadata
		// with outcome !== 'success' on the turn causes the retry guard to skip summarization.

		const turn = new Turn('turnId', { type: 'user', message: 'hello' });

		// Simulate what agentIntent.ts does after a failed foreground summarization
		turn.setMetadata(new SummarizedConversationHistoryMetadata(
			'', // no toolCallRoundId for failures
			'', // no summary text for failures
			{
				model: 'test-model',
				source: 'foreground',
				outcome: 'budgetExceeded',
				contextLengthBefore: 100_000,
			},
		));

		// Verify the retry guard condition from renderWithSummarization matches
		const previousForegroundSummary = turn.getMetadata(SummarizedConversationHistoryMetadata);
		expect(previousForegroundSummary).toBeDefined();
		expect(previousForegroundSummary!.source).toBe('foreground');
		expect(previousForegroundSummary!.outcome).toBe('budgetExceeded');
		expect(previousForegroundSummary!.outcome).not.toBe('success');

		// The guard condition: source === 'foreground' && outcome && outcome !== 'success'
		const shouldSkip = previousForegroundSummary!.source === 'foreground'
			&& !!previousForegroundSummary!.outcome
			&& previousForegroundSummary!.outcome !== 'success';
		expect(shouldSkip).toBe(true);

		// Also verify that successful summarization does NOT trigger the skip guard
		turn.setMetadata(new SummarizedConversationHistoryMetadata(
			'roundId',
			'summary text',
			{
				model: 'test-model',
				source: 'foreground',
				outcome: 'success',
			},
		));
		const successMeta = turn.getMetadata(SummarizedConversationHistoryMetadata);
		const shouldSkipAfterSuccess = successMeta!.source === 'foreground'
			&& !!successMeta!.outcome
			&& successMeta!.outcome !== 'success';
		expect(shouldSkipAfterSuccess).toBe(false);
	});
});

suite('extractInlineSummary', () => {
	test('extracts clean summary tags', () => {
		const text = 'Some preamble\n<summary>\nThis is the summary content.\n</summary>\nSome trailing text';
		const result = extractInlineSummary(text);
		expect(result).toBe('This is the summary content.');
	});

	test('extracts summary with no closing tag', () => {
		const text = 'Preamble text\n<summary>\nThis is a partial summary that was cut off';
		const result = extractInlineSummary(text);
		expect(result).toBe('This is a partial summary that was cut off');
	});

	test('returns undefined when no tags found', () => {
		const text = 'This is just a normal response with no summary tags at all.';
		const result = extractInlineSummary(text);
		expect(result).toBeUndefined();
	});

	test('uses first complete summary when multiple blocks exist', () => {
		const text = '<summary>First summary</summary>\n<summary>Second summary</summary>';
		const result = extractInlineSummary(text);
		expect(result).toBe('First summary');
	});

	test('handles empty summary tags', () => {
		const text = '<summary></summary>';
		const result = extractInlineSummary(text);
		expect(result).toBe('');
	});

	test('handles summary with analysis tags inside', () => {
		const text = '<summary>\n<analysis>Some analysis</analysis>\n\n1. Overview: test\n2. Details: test\n</summary>';
		const result = extractInlineSummary(text);
		expect(result).toContain('1. Overview: test');
		expect(result).toContain('<analysis>Some analysis</analysis>');
	});

	test('trims whitespace from extracted summary', () => {
		const text = '<summary>\n\n  Padded summary text  \n\n</summary>';
		const result = extractInlineSummary(text);
		expect(result).toBe('Padded summary text');
	});
});

suite('stripToolSearchMessages', () => {
	function makeAssistantMessage(toolCalls: { id: string; name: string }[], text = 'response'): Raw.ChatMessage {
		return {
			role: Raw.ChatRole.Assistant,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text }],
			toolCalls: toolCalls.map(tc => ({
				type: 'function' as const,
				id: tc.id,
				function: { name: tc.name, arguments: '{}' },
			})),
		};
	}

	function makeToolResult(toolCallId: string, text = 'result'): Raw.ChatMessage {
		return {
			role: Raw.ChatRole.Tool,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text }],
			toolCallId,
		};
	}

	function makeUserMessage(text = 'hello'): Raw.ChatMessage {
		return {
			role: Raw.ChatRole.User,
			content: [{ type: Raw.ChatCompletionContentPartKind.Text, text }],
		};
	}

	test('returns messages unchanged when no tool_search calls present', () => {
		const messages = [
			makeUserMessage(),
			makeAssistantMessage([{ id: 'tc1', name: 'read_file' }]),
			makeToolResult('tc1'),
		];
		const result = stripToolSearchMessages(messages);
		expect(result).toBe(messages);
	});

	test('strips custom tool_search tool_use and tool_result', () => {
		const messages = [
			makeUserMessage(),
			makeAssistantMessage([
				{ id: 'tc1', name: 'read_file' },
				{ id: 'tc2', name: 'tool_search' },
			]),
			makeToolResult('tc1'),
			makeToolResult('tc2', '["read_file", "edit_file"]'),
		];
		const result = stripToolSearchMessages(messages);
		expect(result).toHaveLength(3);
		const assistant = result[1];
		expect(assistant.role).toBe(Raw.ChatRole.Assistant);
		if (assistant.role === Raw.ChatRole.Assistant) {
			expect(assistant.toolCalls).toHaveLength(1);
			expect(assistant.toolCalls![0].id).toBe('tc1');
		}
		expect(result.find(m => m.role === Raw.ChatRole.Tool && m.toolCallId === 'tc2')).toBeUndefined();
	});

	test('removes toolCalls property when all tool calls are tool_search', () => {
		const messages = [
			makeUserMessage(),
			makeAssistantMessage([{ id: 'tc1', name: 'tool_search' }]),
			makeToolResult('tc1'),
		];
		const result = stripToolSearchMessages(messages);
		expect(result).toHaveLength(2);
		const assistant = result[1];
		if (assistant.role === Raw.ChatRole.Assistant) {
			expect(assistant.toolCalls).toBeUndefined();
		}
	});

	test('preserves non-tool messages', () => {
		const messages = [
			makeUserMessage('first'),
			makeAssistantMessage([{ id: 'tc1', name: 'tool_search' }]),
			makeToolResult('tc1'),
			makeUserMessage('second'),
			makeAssistantMessage([{ id: 'tc2', name: 'edit_file' }]),
			makeToolResult('tc2'),
		];
		const result = stripToolSearchMessages(messages);
		expect(result).toHaveLength(5);
		expect(result[0].content[0]).toEqual({ type: Raw.ChatCompletionContentPartKind.Text, text: 'first' });
		expect(result[2].content[0]).toEqual({ type: Raw.ChatCompletionContentPartKind.Text, text: 'second' });
	});
});

suite('appendTranscriptHintToSummary', () => {
	class FakeTranscriptService extends NullSessionTranscriptService {
		constructor(
			private readonly path: URI | undefined,
			private readonly lineCount: number | undefined,
		) {
			super();
		}
		override getTranscriptPath(): URI | undefined { return this.path; }
		override getLineCount(): number | undefined { return this.lineCount; }
	}

	function makeService(path: URI | undefined, lineCount: number | undefined): ISessionTranscriptService {
		return new FakeTranscriptService(path, lineCount);
	}

	test('returns summary unchanged when no transcript path is available', () => {
		const svc = makeService(undefined, undefined);
		const result = appendTranscriptHintToSummary('original summary', 'session-1', svc);
		expect(result).toBe('original summary');
	});

	test('appends path-only hint when line count is missing', () => {
		const transcript = URI.file('/tmp/transcript.jsonl');
		const svc = makeService(transcript, undefined);
		const result = appendTranscriptHintToSummary('S', 'session-1', svc);
		expect(result.startsWith('S\n')).toBe(true);
		expect(result).toContain(transcript.fsPath);
		expect(result).toContain(`${ToolName.ReadFile}`);
		expect(result).not.toContain('the transcript had');
	});

	test('bakes line count snapshot into hint when available', () => {
		const transcript = URI.file('/tmp/transcript.jsonl');
		const svc = makeService(transcript, 42);
		const result = appendTranscriptHintToSummary('S', 'session-1', svc);
		expect(result).toContain('At the time this summary was created, the transcript had 42 lines.');
		expect(result).toContain(transcript.fsPath);
	});
});
