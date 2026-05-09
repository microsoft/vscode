/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Raw } from '@vscode/prompt-tsx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatHookResult } from 'vscode';
import { IChatHookService, PreCompactHookInput } from '../../../../../platform/chat/common/chatHookService';
import { IChatMLFetcher } from '../../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../../platform/chat/common/commonTypes';
import { StreamingMockChatMLFetcher } from '../../../../../platform/chat/test/common/streamingMockChatMLFetcher';
import { MockEndpoint } from '../../../../../platform/endpoint/test/node/mockEndpoint';
import { messageToMarkdown } from '../../../../../platform/log/common/messageStringify';
import { IChatEndpoint } from '../../../../../platform/networking/common/networking';
import { ITestingServicesAccessor } from '../../../../../platform/test/node/services';
import { TestWorkspaceService } from '../../../../../platform/test/node/testWorkspaceService';
import { IWorkspaceService } from '../../../../../platform/workspace/common/workspaceService';
import { createTextDocumentData } from '../../../../../util/common/test/shims/textDocument';
import { DisposableStore } from '../../../../../util/vs/base/common/lifecycle';
import { URI } from '../../../../../util/vs/base/common/uri';
import { SyncDescriptor } from '../../../../../util/vs/platform/instantiation/common/descriptors';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult } from '../../../../../vscodeTypes';
import { MockChatHookService } from '../../../../intents/test/node/toolCallingLoopHooks.spec';
import { ChatVariablesCollection } from '../../../../prompt/common/chatVariablesCollection';
import { Conversation, Turn } from '../../../../prompt/common/conversation';
import { IBuildPromptContext } from '../../../../prompt/common/intents';
import { ToolCallRound } from '../../../../prompt/common/toolCallRound';
import { createExtensionUnitTestingServices } from '../../../../test/node/services';
import { ToolName } from '../../../../tools/common/toolNames';
import { PromptRenderer } from '../../base/promptRenderer';
import { SummarizedConversationHistory, SummarizedConversationHistoryMetadata } from '../summarizedConversationHistory';

const fileTsUri = URI.file('/workspace/file.ts');

describe('PreCompact Hook Integration', () => {
	let disposables: DisposableStore;
	let mockHookService: MockChatHookService;
	let streamingFetcher: StreamingMockChatMLFetcher;
	let hookAccessor: ITestingServicesAccessor;

	beforeEach(() => {
		disposables = new DisposableStore();
		mockHookService = new MockChatHookService();
		streamingFetcher = new StreamingMockChatMLFetcher();
		streamingFetcher.setStreamingLines(['summarized conversation']);

		const testDoc = createTextDocumentData(fileTsUri, 'line 1\nline 2\n\nline 4\nline 5', 'ts').document;
		const services = disposables.add(createExtensionUnitTestingServices());
		services.define(IWorkspaceService, new SyncDescriptor(
			TestWorkspaceService,
			[
				[URI.file('/workspace')],
				[testDoc]
			]
		));
		services.define(IChatHookService, mockHookService);
		services.define(IChatMLFetcher, streamingFetcher);
		hookAccessor = services.createTestingAccessor();
	});

	afterEach(() => {
		disposables.dispose();
	});

	function createHookTestProps() {
		const instaService = hookAccessor.get(IInstantiationService);
		const endpoint = instaService.createInstance(MockEndpoint, undefined);

		const toolCallRounds = [
			new ToolCallRound('ok', [{
				id: 'tooluse_1',
				name: ToolName.EditFile,
				arguments: JSON.stringify({ filePath: fileTsUri.fsPath, code: 'console.log("hi")' }),
			}]),
			new ToolCallRound('ok 2', [{
				id: 'tooluse_2',
				name: ToolName.EditFile,
				arguments: JSON.stringify({ filePath: fileTsUri.fsPath, code: 'console.log("hello")' }),
			}]),
		];
		const turn = new Turn('turnId', { type: 'user', message: 'hello' });
		const testConversation = new Conversation('sessionId', [turn]);

		const promptContext: IBuildPromptContext = {
			chatVariables: new ChatVariablesCollection([]),
			history: [],
			query: 'edit this file',
			toolCallRounds,
			toolCallResults: {
				'tooluse_1': new LanguageModelToolResult([new LanguageModelTextPart('success')]),
				'tooluse_2': new LanguageModelToolResult([new LanguageModelTextPart('success')]),
			},
			tools: {
				availableTools: [],
				toolInvocationToken: null as never,
				toolReferences: [],
			},
			conversation: testConversation,
			request: { hooks: { PreCompact: [] } } as any,
		};

		return { instaService, endpoint, promptContext };
	}

	function renderSummarization(instaService: IInstantiationService, endpoint: IChatEndpoint, promptContext: IBuildPromptContext) {
		return PromptRenderer.create(instaService, endpoint, SummarizedConversationHistory, {
			priority: 1,
			endpoint,
			location: ChatLocation.Panel,
			promptContext,
			maxToolResultLength: Infinity,
			triggerSummarize: true,
		});
	}

	describe('hook execution conditions', () => {
		it('should call PreCompact hook with trigger auto during summarization', async () => {
			const { instaService, endpoint, promptContext } = createHookTestProps();
			await renderSummarization(instaService, endpoint, promptContext).render();

			const preCompactCalls = mockHookService.getCallsForHook('PreCompact' as any);
			expect(preCompactCalls).toHaveLength(1);
			expect((preCompactCalls[0].input as PreCompactHookInput).trigger).toBe('auto');
		});

		it('should not call PreCompact hook when promptContext has no request hooks', async () => {
			const { instaService, endpoint, promptContext } = createHookTestProps();
			// Create new context without request to simulate background compaction without hooks
			const { request: _, ...contextWithoutRequest } = promptContext;
			const noHooksContext: IBuildPromptContext = { ...contextWithoutRequest };

			await renderSummarization(instaService, endpoint, noHooksContext).render();

			const preCompactCalls = mockHookService.getCallsForHook('PreCompact' as any);
			expect(preCompactCalls).toHaveLength(0);
		});
	});

	describe('additionalContext injection', () => {
		it('should include hook additionalContext in summarization prompt sent to LLM', async () => {
			mockHookService.setHookResults('PreCompact' as any, [{
				resultKind: 'success' as const,
				output: {
					hookSpecificOutput: { additionalContext: 'Focus on preserving database query details' },
				},
			} as ChatHookResult]);

			const { instaService, endpoint, promptContext } = createHookTestProps();
			await renderSummarization(instaService, endpoint, promptContext).render();

			expect(streamingFetcher.callCount).toBeGreaterThan(0);
			const capturedMessages = streamingFetcher.capturedOptions[0]?.messages;
			expect(capturedMessages).toBeDefined();
			const allSystemContent = capturedMessages!
				.filter(m => m.role === Raw.ChatRole.System)
				.map(m => messageToMarkdown(m))
				.join('\n');
			expect(allSystemContent).toContain('Additional summarization instructions:');
			expect(allSystemContent).toContain('Additional instructions from hooks:');
			expect(allSystemContent).toContain('Focus on preserving database query details');
		});

		it('should concatenate additionalContext from multiple hook results', async () => {
			mockHookService.setHookResults('PreCompact' as any, [
				{
					resultKind: 'success' as const,
					output: {
						hookSpecificOutput: { additionalContext: 'Keep file paths' },
					},
				} as ChatHookResult,
				{
					resultKind: 'success' as const,
					output: {
						hookSpecificOutput: { additionalContext: 'Remember error messages' },
					},
				} as ChatHookResult,
			]);

			const { instaService, endpoint, promptContext } = createHookTestProps();
			await renderSummarization(instaService, endpoint, promptContext).render();

			const capturedMessages = streamingFetcher.capturedOptions[0]?.messages;
			const allSystemContent = capturedMessages!
				.filter(m => m.role === Raw.ChatRole.System)
				.map(m => messageToMarkdown(m))
				.join('\n');
			expect(allSystemContent).toContain('Additional instructions from hooks:');
			expect(allSystemContent).toContain('Keep file paths');
			expect(allSystemContent).toContain('Remember error messages');
		});

		it('should not include additional instructions section when hook returns no additionalContext', async () => {
			mockHookService.setHookResults('PreCompact' as any, [{
				resultKind: 'success' as const,
				output: {},
			} as ChatHookResult]);

			const { instaService, endpoint, promptContext } = createHookTestProps();
			await renderSummarization(instaService, endpoint, promptContext).render();

			expect(streamingFetcher.callCount).toBeGreaterThan(0);
			const capturedMessages = streamingFetcher.capturedOptions[0]?.messages;
			expect(capturedMessages).toBeDefined();
			const allSystemContent = capturedMessages!
				.filter(m => m.role === Raw.ChatRole.System)
				.map(m => messageToMarkdown(m))
				.join('\n');
			expect(allSystemContent).not.toContain('Additional summarization instructions:');
		});
	});

	describe('error handling', () => {
		it('should complete summarization when hook throws an error', async () => {
			mockHookService.setHookError('PreCompact' as any, new Error('Hook script failed'));

			const { instaService, endpoint, promptContext } = createHookTestProps();
			const result = await renderSummarization(instaService, endpoint, promptContext).render();

			const summaryMeta = result.metadata.get(SummarizedConversationHistoryMetadata);
			expect(summaryMeta).toBeDefined();
			expect(summaryMeta!.text).toContain('summarized conversation');
		});

		it('should not include additional instructions when hook returns error result', async () => {
			mockHookService.setHookResults('PreCompact' as any, [{
				resultKind: 'error' as const,
				output: 'Hook execution failed',
			} as ChatHookResult]);

			const { instaService, endpoint, promptContext } = createHookTestProps();
			await renderSummarization(instaService, endpoint, promptContext).render();

			expect(streamingFetcher.callCount).toBeGreaterThan(0);
			const capturedMessages = streamingFetcher.capturedOptions[0]?.messages;
			const allSystemContent = capturedMessages!
				.filter(m => m.role === Raw.ChatRole.System)
				.map(m => messageToMarkdown(m))
				.join('\n');
			expect(allSystemContent).not.toContain('Additional summarization instructions:');
		});
	});
});
