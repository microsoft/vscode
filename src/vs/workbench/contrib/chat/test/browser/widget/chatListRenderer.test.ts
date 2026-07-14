/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildPlanReviewProgressContent, getWorkingProgressRelevantParts, renderChatRequestTimestamp, renderChatResponseDetails, shouldCreateGroupedThinkingPart, shouldHideChatUserIdentity, shouldRenderInitialProgressiveContentImmediately, shouldScheduleInitialHeightChange, shouldStartNewCollapsedThinkingGroup } from '../../../browser/widget/chatListRenderer.js';
import { IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
import { formatChatRequestTimestamp, formatChatResponseDetails, formatElapsedTime } from '../../../common/chatProgressFormatting.js';
import { CollapsedToolsDisplayMode, ThinkingDisplayMode } from '../../../common/constants.js';
import { IChatRendererContent } from '../../../common/model/chatViewModel.js';
import { ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('ChatListRenderer', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
				compact: '1d',
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
				'1d',
				'2d',
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
				compact: '1d',
				fullDate: formatChatRequestTimestamp(timestamp)?.fullText,
				hasAlternate: true,
				focusable: 0,
				managedHoverText: undefined,
			});
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

});
