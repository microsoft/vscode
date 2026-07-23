/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { buildPlanReviewProgressContent, ChatListItemRenderer, getWorkingProgressRelevantParts, IChatListItemTemplate, isWaitingForMcpServers, reconcileChatItemHeight, renderChatRequestTimestamp, renderChatResponseDetails, shouldCreateGroupedThinkingPart, shouldHideChatUserIdentity, shouldPinToolInvocationToThinking, shouldRenderInitialProgressiveContentImmediately, shouldScheduleInitialHeightChange, shouldShowFileChangesSummaryForSettings, shouldShowPillsSummaryForSettings, shouldStartNewCollapsedThinkingGroup } from '../../../browser/widget/chatListRenderer.js';
import { isChatTurnStatusPillsEnabled } from '../../../browser/widget/chatTurnPills.js';
import { IChatMcpServersStartingSlow, IChatService, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { formatChatRequestTimestamp, formatChatResponseDetails, formatElapsedTime } from '../../../common/chatProgressFormatting.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../common/constants.js';
import { ChatModel } from '../../../common/model/chatModel.js';
import { ChatViewModel, IChatRendererContent, IChatResponseViewModel, isResponseVM } from '../../../common/model/chatViewModel.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { ChatAgentService, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ChatRequestTextPart } from '../../../common/requestParser/chatParserTypes.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';
import { ChatEditorOptions } from '../../../browser/widget/chatOptions.js';
import { MockChatService } from '../../common/chatService/mockChatService.js';

suite('ChatListRenderer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	suite('shouldScheduleInitialHeightChange', () => {
		test('only schedules first measurement updates when needed to avoid clipping', () => {
			assert.deepStrictEqual([
				shouldScheduleInitialHeightChange(120, undefined),
				shouldScheduleInitialHeightChange(120, 120),
				shouldScheduleInitialHeightChange(120, 120.1),
				shouldScheduleInitialHeightChange(121, 120),
				shouldScheduleInitialHeightChange(121, 120.1),
			], [
				true,
				false,
				false,
				true,
				true,
			]);
		});
	});

	suite('reconcileChatItemHeight', () => {
		// Helper: run a sequence of measurements through the reconciler, threading
		// `currentRenderedHeight` the way `fireItemHeightChange` does, and capture the
		// notification kind + the stored height after each step. `initialStored` is the
		// element's `currentRenderedHeight` before the first step (undefined = never measured).
		const run = (steps: readonly { measured: number; isBeingRendered: boolean }[], allocatedHeight: number | undefined, initialStored: number | undefined) => {
			let stored: number | undefined = initialStored;
			return steps.map(({ measured, isBeingRendered }) => {
				const update = reconcileChatItemHeight(measured, stored, isBeingRendered, allocatedHeight);
				stored = update.nextRenderedHeight;
				return { kind: update.kind, height: update.height, stored };
			});
		};

		// Regression test for https://github.com/microsoft/vscode/issues/326952.
		// A row grows during streaming and is measured synchronously while it is being rendered
		// (notification suppressed). The stored height must NOT advance, and a deferred re-measure
		// must be requested, so a follow-up measurement of the grown height actually reaches the
		// tree instead of being deduped away (which would strand the content until a window resize).
		test('does not strand a grown height first seen while the row is being rendered', () => {
			assert.deepStrictEqual(
				run([
					{ measured: 900, isBeingRendered: true },   // grew mid-render -> suppressed, defer
					{ measured: 900, isBeingRendered: false },  // deferred re-measure delivers the height
				], /*allocatedHeight*/ 500, /*initialStored*/ 500),
				[
					{ kind: 'deferReMeasure', height: 900, stored: 500 },
					{ kind: 'fire', height: 900, stored: 900 },
				],
			);
		});

		test('notifies the tree on async growth and ignores an unchanged measurement', () => {
			assert.deepStrictEqual(
				run([
					{ measured: 700, isBeingRendered: false },  // async growth -> notify
					{ measured: 700, isBeingRendered: false },  // unchanged -> no-op
				], /*allocatedHeight*/ 500, /*initialStored*/ 500),
				[
					{ kind: 'fire', height: 700, stored: 700 },
					{ kind: 'none', height: 700, stored: 700 },
				],
			);
		});

		test('first measurement (no stored height) only schedules an update when content would clip', () => {
			assert.deepStrictEqual([
				// Initial measurement that fits within the allocated height -> no notification.
				run([{ measured: 500, isBeingRendered: false }], /*allocatedHeight*/ 500, /*initialStored*/ undefined),
				// Initial measurement larger than the allocation -> schedule an initial update.
				run([{ measured: 700, isBeingRendered: false }], /*allocatedHeight*/ 500, /*initialStored*/ undefined),
			], [
				[{ kind: 'none', height: 500, stored: 500 }],
				[{ kind: 'scheduleInitial', height: 700, stored: 700 }],
			]);
		});
	});

	suite('shouldRenderInitialProgressiveContentImmediately', () => {
		test('renders accumulated markdown immediately only when progressive rendering has not started', () => {
			assert.deepStrictEqual([
				shouldRenderInitialProgressiveContentImmediately(false, true, false),
				shouldRenderInitialProgressiveContentImmediately(false, true, true),
				shouldRenderInitialProgressiveContentImmediately(true, true, false),
				shouldRenderInitialProgressiveContentImmediately(false, false, false),
			], [
				true,
				false,
				false,
				false,
			]);
		});
	});

	suite('shouldStartNewCollapsedThinkingGroup', () => {
		test('separates reasoning and grouped items only in collapsed mode', () => {
			assert.deepStrictEqual({
				reasoningToItems: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, 'reasoning', 'items'),
				itemsToReasoning: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, 'items', 'reasoning'),
				reasoningToReasoning: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, 'reasoning', 'reasoning'),
				itemsToItems: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.Collapsed, 'items', 'items'),
				fixedScrolling: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.FixedScrolling, 'reasoning', 'items'),
				collapsedPreview: shouldStartNewCollapsedThinkingGroup(ThinkingDisplayMode.CollapsedPreview, 'reasoning', 'items'),
			}, {
				reasoningToItems: true,
				itemsToReasoning: true,
				reasoningToReasoning: false,
				itemsToItems: false,
				fixedScrolling: false,
				collapsedPreview: false,
			});
		});
	});

	suite('shouldCreateGroupedThinkingPart', () => {
		test('honors withThinking unless a reasoning group was just separated', () => {
			assert.deepStrictEqual({
				withThinkingWithoutReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.WithThinking, false),
				withThinkingAfterReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.WithThinking, true),
				alwaysWithoutReasoning: shouldCreateGroupedThinkingPart(CollapsedToolsDisplayMode.Always, false),
			}, {
				withThinkingWithoutReasoning: false,
				withThinkingAfterReasoning: true,
				alwaysWithoutReasoning: true,
			});
		});
	});

	suite('formatChatResponseDetails', () => {
		test('formats completion metadata for the footer', () => {
			assert.deepStrictEqual([
				formatChatResponseDetails('GPT-5.6 Sol \u2022 1.5 credits', '4:56 PM'),
				formatChatResponseDetails('GPT-5.6 Sol', undefined),
				formatChatResponseDetails(undefined, '4:56 PM'),
				formatElapsedTime(83_000),
			], [
				'4:56 PM \u2022 GPT-5.6 Sol \u2022 1.5 credits',
				'GPT-5.6 Sol',
				'4:56 PM',
				'1m 23s',
			]);
		});

		test('renders completion time with elapsed-time alternate only in verbose mode', () => {
			const container = document.createElement('div');
			container.className = 'chat-footer-details';
			const completedAt = Date.now() - 60 * 60 * 1000;

			renderChatResponseDetails(container, 'Claude Opus 4.8', completedAt, 24_000, false);
			const compact = {
				text: container.textContent,
				timing: container.querySelector('.chat-response-timing'),
				tabIndex: container.tabIndex,
			};

			renderChatResponseDetails(container, 'Claude Opus 4.8', completedAt, 24_000, true);
			assert.deepStrictEqual({
				compact,
				completionDateTime: container.querySelector('time')?.dateTime,
				hasAlternate: container.querySelector('.chat-response-timing')?.classList.contains('has-alternate'),
				duration: container.querySelector('.chat-response-alternate')?.textContent,
				details: container.querySelector('.chat-response-model-details')?.textContent,
				separatorHidden: container.querySelector('.chat-response-details-separator')?.getAttribute('aria-hidden'),
				ariaIncludesElapsed: container.ariaLabel?.includes('24s') ?? false,
				tabIndex: container.tabIndex,
			}, {
				compact: {
					text: 'Claude Opus 4.8',
					timing: null,
					tabIndex: 0,
				},
				completionDateTime: new Date(completedAt).toISOString(),
				hasAlternate: true,
				duration: '24s',
				details: 'Claude Opus 4.8',
				separatorHidden: 'true',
				ariaIncludesElapsed: true,
				tabIndex: 0,
			});

			renderChatResponseDetails(container, undefined, undefined, 24_000, true);
			assert.deepStrictEqual({
				text: container.textContent,
				timing: container.querySelector('.chat-response-timing'),
				hidden: container.classList.contains('hidden'),
				tabIndex: container.tabIndex,
			}, {
				text: '',
				timing: null,
				hidden: true,
				tabIndex: -1,
			});

			const oldCompletion = Date.now() - 25 * 60 * 60 * 1000;
			renderChatResponseDetails(container, undefined, oldCompletion, 24_000, true);
			assert.deepStrictEqual({
				compact: container.querySelector('.chat-response-completed-at')?.textContent,
				alternateEndsWithElapsed: container.querySelector('.chat-response-alternate')?.textContent?.endsWith(' \u2022 24s'),
				hasAlternate: container.querySelector('.chat-response-timing')?.classList.contains('has-alternate'),
			}, {
				compact: '1 day',
				alternateEndsWithElapsed: true,
				hasAlternate: true,
			});
		});
	});

	suite('formatChatRequestTimestamp', () => {
		test('formats valid persisted timestamps and rejects legacy placeholders', () => {
			const timestamp = Date.UTC(2026, 6, 8, 23, 18, 41);
			const formatted = formatChatRequestTimestamp(timestamp);
			assert.deepStrictEqual({
				hasText: !!formatted?.text,
				hasFullText: !!formatted?.fullText,
				dateTime: formatted?.dateTime,
				invalid: formatChatRequestTimestamp(-1),
			}, {
				hasText: true,
				hasFullText: true,
				dateTime: '2026-07-08T23:18:41.000Z',
				invalid: undefined,
			});
		});

		test('uses relative days after 24 hours', () => {
			assert.deepStrictEqual([
				formatChatRequestTimestamp(Date.now() - 25 * 60 * 60 * 1000)?.text,
				formatChatRequestTimestamp(Date.now() - 49 * 60 * 60 * 1000)?.text,
			], [
				'1 day',
				'2 days',
			]);
		});

		test('renders compact days with an animated full date alternate', () => {
			const container = document.createElement('div');
			const timestamp = Date.now() - 25 * 60 * 60 * 1000;

			const rendered = renderChatRequestTimestamp(container, timestamp);

			assert.deepStrictEqual({
				compact: container.querySelector('.chat-request-relative')?.textContent,
				fullDate: container.querySelector('.chat-request-full-date')?.textContent,
				hasAlternate: container.querySelector('.chat-request-timing')?.classList.contains('has-alternate'),
				focusable: rendered?.element.tabIndex,
				managedHoverText: rendered?.hoverText,
			}, {
				compact: '1 day',
				fullDate: formatChatRequestTimestamp(timestamp)?.fullText,
				hasAlternate: true,
				focusable: 0,
				managedHoverText: undefined,
			});
		});
	});

	suite('turn status pills setting', () => {
		test('normalizes boolean and legacy object values', () => {
			assert.deepStrictEqual([
				isChatTurnStatusPillsEnabled(undefined),
				isChatTurnStatusPillsEnabled(false),
				isChatTurnStatusPillsEnabled(true),
				isChatTurnStatusPillsEnabled({}),
				isChatTurnStatusPillsEnabled({ changes: false, preview: false, browser: false }),
				isChatTurnStatusPillsEnabled({ changes: true }),
				isChatTurnStatusPillsEnabled({ preview: true }),
				isChatTurnStatusPillsEnabled({ browser: true }),
			], [false, false, true, false, false, true, true, true]);
		});

		test('computes pill and legacy file summaries independently', () => {
			assert.deepStrictEqual({
				fileSummary: shouldShowFileChangesSummaryForSettings(true, true, true),
				fileSummaryIncomplete: shouldShowFileChangesSummaryForSettings(false, true, true),
				fileSummaryNonLocal: shouldShowFileChangesSummaryForSettings(true, false, true),
				fileSummaryDisabled: shouldShowFileChangesSummaryForSettings(true, true, false),
				pillsSummary: shouldShowPillsSummaryForSettings(true, true, true),
				pillsSummaryLegacy: shouldShowPillsSummaryForSettings(true, true, { preview: true }),
				pillsSummaryIncomplete: shouldShowPillsSummaryForSettings(false, true, true),
				pillsSummaryNonAgentHost: shouldShowPillsSummaryForSettings(true, false, true),
				pillsSummaryDisabled: shouldShowPillsSummaryForSettings(true, true, false),
			}, {
				fileSummary: true,
				fileSummaryIncomplete: false,
				fileSummaryNonLocal: false,
				fileSummaryDisabled: false,
				pillsSummary: true,
				pillsSummaryLegacy: true,
				pillsSummaryIncomplete: false,
				pillsSummaryNonAgentHost: false,
				pillsSummaryDisabled: false,
			});
		});
	});

	suite('shouldPinToolInvocationToThinking', () => {
		test('keeps tool invocations requiring user input or MCP apps outside Thinking', () => {
			assert.deepStrictEqual({
				executionConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForConfirmation, false, false),
				resultApproval: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForPostApproval, false, false),
				authentication: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForAuthentication, false, false),
				executingWithConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, true, false),
				executingWithoutConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, false, false),
				executingWithMcpApp: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, false, true),
				streamingWithMcpApp: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Streaming, false, true),
			}, {
				executionConfirmation: false,
				resultApproval: false,
				authentication: false,
				executingWithConfirmation: false,
				executingWithoutConfirmation: true,
				executingWithMcpApp: false,
				streamingWithMcpApp: false,
			});
		});
	});

	suite('shouldHideChatUserIdentity', () => {
		test('hides local Copilot and Agent Host Copilot response identity', () => {
			assert.deepStrictEqual([
				shouldHideChatUserIdentity('GitHub Copilot', URI.from({ scheme: 'vscode-chat-editor' }), true, false, false),
				shouldHideChatUserIdentity('Copilot', URI.from({ scheme: 'agent-host-copilotcli' }), true, false, false),
				shouldHideChatUserIdentity('Copilot', URI.from({ scheme: 'agent-host-copilotcli' }), false, false, false),
				shouldHideChatUserIdentity('Copilot', URI.from({ scheme: 'remote-test-authority-copilotcli' }), true, false, false),
				shouldHideChatUserIdentity('Copilot', URI.from({ scheme: 'remote-test-authority-copilotcli' }), false, false, false),
				shouldHideChatUserIdentity('Claude', URI.from({ scheme: 'remote-test-authority-claude' }), true, false, false),
				shouldHideChatUserIdentity('Claude', URI.from({ scheme: 'agent-host-claude' }), true, false, false),
				shouldHideChatUserIdentity('Claude', URI.from({ scheme: 'agent-host-claude' }), true, true, false),
				shouldHideChatUserIdentity('User', URI.from({ scheme: 'vscode-chat-editor' }), false, false, true),
			], [
				true,
				true,
				false,
				true,
				false,
				false,
				false,
				true,
				true,
			]);
		});
	});

	suite('buildPlanReviewProgressContent', () => {
		test('keeps plan summary and full plan link after approval', () => {
			const content = buildPlanReviewProgressContent({
				kind: 'planReview',
				title: 'Review Plan',
				content: '## Plan summary',
				actions: [{ id: 'interactive', label: 'Implement Plan' }],
				canProvideFeedback: true,
				planUri: URI.file('/sessions/abc/plan.md').toJSON(),
				isUsed: true,
				data: { rejected: false, action: 'Implement Plan', actionId: 'interactive' },
			}, 'Approved plan');

			assert.strictEqual(content.value, 'Approved&nbsp;plan\n\n## Plan summary\n\n[Open full plan file (plan.md)](file:///sessions/abc/plan.md?vscodeLinkType=file)');
		});
	});

	test('working progress ignores subagent-owned response parts', () => {
		const parentSubagent: IChatToolInvocationSerialized = {
			kind: 'toolInvocationSerialized',
			toolCallId: 'subagent-1',
			toolId: 'task',
			source: ToolDataSource.Internal,
			invocationMessage: 'Running subagent',
			originMessage: undefined,
			pastTenseMessage: undefined,
			isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
			isComplete: true,
			presentation: undefined,
			toolSpecificData: { kind: 'subagent', description: 'Investigate' },
		};
		const childTool: IChatToolInvocationSerialized = {
			...parentSubagent,
			toolCallId: 'child-1',
			toolId: 'search',
			subAgentInvocationId: 'subagent-1',
			toolSpecificData: undefined,
		};
		const parts: IChatRendererContent[] = [
			{ kind: 'references', references: [] },
			parentSubagent,
			childTool,
			{ kind: 'markdownContent', content: { value: '<vscode_codeblock_uri subAgentInvocationId="subagent-1">file:///test.txt</vscode_codeblock_uri>' } },
			{ kind: 'hook', hookType: 'PreToolUse', subAgentInvocationId: 'subagent-1' },
		];

		assert.deepStrictEqual(getWorkingProgressRelevantParts(parts).map(part => part.kind), ['references']);
	});

	test('working progress is hidden while MCP servers are starting', () => {
		const servers = observableValue('servers', [{ id: 'a', name: 'alpha' }]);
		const part: IChatMcpServersStartingSlow = {
			kind: 'mcpServersStartingSlow',
			sessionResource: URI.parse('chat-session://test/session1'),
			servers,
		};

		const whileStarting = isWaitingForMcpServers([part]);
		servers.set([], undefined);
		const afterStarting = isWaitingForMcpServers([part]);

		assert.deepStrictEqual({ whileStarting, afterStarting }, { whileStarting: true, afterStarting: false });
	});

	test('final markdown remains mounted after thinking and tool progress completes with reduced motion', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		configurationService.setUserConfiguration(ChatConfiguration.IncrementalRendering, false);
		configurationService.setUserConfiguration(ChatConfiguration.ThinkingStyle, ThinkingDisplayMode.FixedScrolling);
		configurationService.setUserConfiguration('chat.agent.thinking.collapsedTools', CollapsedToolsDisplayMode.Always);
		configurationService.setUserConfiguration('chat.checkpoints.enabled', false);
		configurationService.setUserConfiguration('chat.checkpoints.showFileChanges', false);
		configurationService.setUserConfiguration(ChatConfiguration.TurnStatusPills, false);
		configurationService.setUserConfiguration(ChatConfiguration.Verbose, false);
		configurationService.setUserConfiguration('workbench.reduceMotion', 'on');
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'test';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{ progressMessageAtBottomOfResponse: true },
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };

		model.acceptResponseProgress(request, { kind: 'thinking', value: 'Thinking ...', id: 'thinking-1' });
		renderer.renderElement(node, 0, template);

		const toolInvocation = new ChatToolInvocation({
			invocationMessage: 'Running tool...',
			pastTenseMessage: 'Tool completed',
		}, {
			id: 'my-tool',
			displayName: 'My Tool',
			modelDescription: 'Test tool',
			source: ToolDataSource.Internal,
		}, 'call-1', undefined, {}, {}, request.id);
		model.acceptResponseProgress(request, toolInvocation);
		renderer.renderElement(node, 0, template);

		await toolInvocation.didExecuteTool(undefined);
		renderer.renderElement(node, 0, template);

		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Final response') });
		renderer.renderElement(node, 0, template);
		const mountedWhileStreaming = template.value.textContent?.includes('Final response') ?? false;

		request.response?.complete();
		renderer.renderElement(node, 0, template);
		assert.deepStrictEqual({
			mountedWhileStreaming,
			mountedAfterCompletion: template.value.textContent?.includes('Final response') ?? false,
		}, {
			mountedWhileStreaming: true,
			mountedAfterCompletion: true,
		});

		disposables.dispose();
	});

	// End-to-end regression test for https://github.com/microsoft/vscode/issues/326952: a height
	// measured synchronously *during* the render pass must be deferred (not fired re-entrantly and
	// not stored), then reliably delivered to the tree afterwards via a re-measure — so streamed
	// content can't get stranded below a stale row height until a window resize.
	test('fireItemHeightChange defers a mid-render measurement and delivers it after the render pass', async () => {
		const disposables = store.add(new DisposableStore());
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		const configurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatService, new MockChatService());
		instantiationService.stub(IChatAgentService, disposables.add(instantiationService.createInstance(ChatAgentService)));

		const model = disposables.add(instantiationService.createInstance(ChatModel, undefined, { initialLocation: ChatAgentLocation.Chat, canUseTools: true }));
		const viewModel = disposables.add(instantiationService.createInstance(ChatViewModel, model, undefined));
		const text = 'test';
		const request = model.addRequest({
			text,
			parts: [new ChatRequestTextPart(new OffsetRange(0, text.length), new Range(1, 1, 1, text.length + 1), text)]
		}, { variables: [] }, 0);
		const response = viewModel.getItems().find(isResponseVM);
		assert.ok(response);

		const container = mainWindow.document.createElement('div');
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		const renderer = disposables.add(instantiationService.createInstance(
			ChatListItemRenderer,
			{} as ChatEditorOptions,
			{ progressMessageAtBottomOfResponse: true },
			{
				getListLength: () => 1,
				onDidScroll: () => toDisposable(() => { }),
				container,
				currentChatMode: () => ChatModeKind.Agent,
			},
			undefined,
			viewModel,
		));
		const template = renderer.renderTemplate(container);
		disposables.add(toDisposable(() => renderer.disposeTemplate(template)));
		const node = { element: response, children: [], depth: 0, visibleChildrenCount: 0, visibleChildIndex: 0, collapsible: false, collapsed: false, visible: true, filterData: undefined };
		model.acceptResponseProgress(request, { kind: 'markdownContent', content: new MarkdownString('Some initial content') });
		renderer.renderElement(node, 0, template);
		// Complete the response so progressive rendering stops. Otherwise a streaming response keeps
		// scheduling `runProgressiveRender` on animation frames, which creates a
		// ChatWorkingProgressContentPart that outlives the test (leaked disposable + stray console
		// output during teardown).
		request.response?.complete();
		renderer.renderElement(node, 0, template);

		const privateRenderer = renderer as unknown as {
			_elementBeingRendered: IChatResponseViewModel | undefined;
			fireItemHeightChange(template: IChatListItemTemplate, measuredHeight?: number): void;
		};
		const nextFrame = () => new Promise<void>(resolve => dom.scheduleAtNextAnimationFrame(dom.getWindow(container), () => resolve()));

		// Let the initial render's height activity (ResizeObserver / scheduled updates) settle.
		await nextFrame();
		await nextFrame();

		// The row's real rendered height. The DOM is NOT mutated after this point, so the row's
		// ResizeObserver stays quiet and only the code under test can deliver a further update.
		const renderedHeight = Math.ceil(template.rowContainer.getBoundingClientRect().height);
		assert.ok(renderedHeight > 1, 'row should have a real rendered height');

		// Simulate streaming that grew the row past the height the tree last acknowledged.
		response.currentRenderedHeight = renderedHeight - 1;
		const heightEvents: number[] = [];
		disposables.add(renderer.onDidChangeItemHeight(e => heightEvents.push(e.height)));

		// (a) A measurement seen synchronously during the render pass must not notify the tree
		// re-entrantly and must not advance the stored height.
		privateRenderer._elementBeingRendered = response;
		privateRenderer.fireItemHeightChange(template);
		assert.deepStrictEqual(
			{ events: [...heightEvents], stored: response.currentRenderedHeight },
			{ events: [], stored: renderedHeight - 1 },
		);

		// (b) Once the render pass is over the deferred re-measure delivers the real height.
		privateRenderer._elementBeingRendered = undefined;
		await nextFrame();
		assert.deepStrictEqual(
			{ events: [...heightEvents], stored: response.currentRenderedHeight },
			{ events: [renderedHeight], stored: renderedHeight },
		);

		disposables.dispose();
	});

});
