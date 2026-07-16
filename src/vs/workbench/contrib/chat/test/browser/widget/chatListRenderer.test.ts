/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { buildPlanReviewProgressContent, getWorkingProgressRelevantParts, isWaitingForMcpServers, shouldCreateGroupedThinkingPart, shouldHideChatUserIdentity, shouldPinToolInvocationToThinking, shouldRenderInitialProgressiveContentImmediately, shouldScheduleInitialHeightChange, shouldShowFileChangesSummaryForSettings, shouldShowPillsSummaryForSettings, shouldStartNewCollapsedThinkingGroup } from '../../../browser/widget/chatListRenderer.js';
import { isChatTurnStatusPillsEnabled } from '../../../browser/widget/chatTurnPills.js';
import { IChatMcpServersStartingSlow, IChatToolInvocation, IChatToolInvocationSerialized, ToolConfirmKind } from '../../../common/chatService/chatService.js';
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
		test('keeps tool invocations requiring user input outside Thinking', () => {
			assert.deepStrictEqual({
				executionConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForConfirmation, false),
				resultApproval: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForPostApproval, false),
				authentication: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.WaitingForAuthentication, false),
				executingWithConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, true),
				executingWithoutConfirmation: shouldPinToolInvocationToThinking(IChatToolInvocation.StateKind.Executing, false),
			}, {
				executionConfirmation: false,
				resultApproval: false,
				authentication: false,
				executingWithConfirmation: false,
				executingWithoutConfirmation: true,
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

});
