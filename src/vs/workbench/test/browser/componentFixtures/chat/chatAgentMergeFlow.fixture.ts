/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { agentMergeDisableReasons, agentMergeEnabledNotice, defaultAgentMergeConfiguration } from '../../../../../platform/agentHost/common/agentMerge.js';
import { buildAgentMergePrompt } from '../../../../../platform/agentHost/common/agentMergePrompt.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta } from '../../../../../platform/agentHost/common/meta/agentSystemNotificationMeta.js';
import { systemNotificationToChatPart } from '../../../../contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { IChatSystemNotificationPart } from '../../../../contrib/chat/common/chatService/chatService.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IFixtureMessage, renderChatWidget } from './chatWidget.fixture.js';

const pullRequestUrl = 'https://github.com/microsoft/vscode/pull/333964';

function agentMergeNotification(content: string, kind: AgentSystemNotificationKind): IChatSystemNotificationPart {
	const notification = systemNotificationToChatPart(content, 'fixture', toAgentSystemNotificationMeta({ kind }));
	if (notification?.kind !== 'systemNotification') {
		throw new Error('Expected an Agent Merge system notification');
	}
	return notification;
}

const agentMergePrompt = buildAgentMergePrompt(['fixCI'], {
	pullRequestUrl,
	title: 'agentHost: add draft PR Agent Merge operation',
	headSha: '9665aca22f3e3147ee87449bf3cb0592a7345847',
	headRef: 'sessions/draft-pr-agent-merge',
	baseRef: 'main',
	reviewThreads: [],
	reviewSummaries: [],
	newComments: [],
	failedChecks: ['Linux Unit Tests'],
	behind: false,
	conflicting: false,
	commentWatermark: '2026-09-02T12:00:00.000Z',
});

const agentMergeFlow: IFixtureMessage[] = [
	{
		user: 'Create a draft pull request and enable Agent Merge.',
		assistant: [{
			kind: 'markdown',
			text: `Created draft pull request [#333964](${pullRequestUrl}) and enabled Agent Merge.`,
		}],
		details: 'GPT-5.6 Sol - 2 credits',
	},
	{
		user: 'Agent Merge enabled',
		requestHidden: true,
		assistant: [{
			kind: 'systemNotification',
			notification: agentMergeNotification(
				agentMergeEnabledNotice({
					branchName: 'sessions/draft-pr-agent-merge',
					pullRequestUrl,
				}, defaultAgentMergeConfiguration),
				AgentSystemNotificationKind.AgentMergeEnabled,
			),
		}],
	},
	{
		user: agentMergePrompt,
		isSystemInitiated: true,
		assistant: [{
			kind: 'markdown',
			text: 'Fixed the failing Linux unit test and pushed the updated commit. Agent Merge will wait for the new CI results.',
		}],
		details: 'GPT-5.6 Sol - 1 credit',
	},
	{
		user: 'Agent Merge completed',
		requestHidden: true,
		assistant: [{
			kind: 'systemNotification',
			notification: agentMergeNotification(
				agentMergeDisableReasons.pullRequestMerged(333964, pullRequestUrl).notice,
				AgentSystemNotificationKind.AgentMergePullRequestMerged,
			),
		}],
	},
];

async function renderAgentMergeFlow(context: ComponentFixtureContext, hoverMergedNotice: boolean): Promise<void> {
	await renderChatWidget(context, {
		messages: agentMergeFlow,
		width: 720,
		height: 760,
		listHeight: 740,
		inputVisible: false,
		responseFooterAction: true,
		verbose: true,
	});

	const targetWindow = dom.getWindow(context.container);
	const nextFrame = () => new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	await nextFrame();
	await nextFrame();

	const notificationRows = [...context.container.querySelectorAll<HTMLElement>('.chat-system-notification-response')];
	if (notificationRows.length !== 2) {
		throw new Error(`Expected two Agent Merge notification rows, got ${notificationRows.length}`);
	}
	for (const row of notificationRows) {
		const footer = row.querySelector<HTMLElement>('.chat-footer-toolbar');
		if (!footer || dom.getWindow(row).getComputedStyle(footer).display !== 'none') {
			throw new Error('Agent Merge notification footer toolbar is visible');
		}
		if (!row.querySelector('.chat-system-notification-timing .chat-response-timing')) {
			throw new Error('Agent Merge notification is missing inline response timing');
		}
		const layout = row.querySelector<HTMLElement>('.chat-system-notification-layout')!;
		const timing = row.querySelector<HTMLElement>('.chat-system-notification-timing')!;
		if (targetWindow.getComputedStyle(layout).alignItems !== 'last baseline') {
			throw new Error('Agent Merge notification timing is not baseline-aligned');
		}
		if (Math.abs(layout.getBoundingClientRect().right - timing.getBoundingClientRect().right) > 1) {
			throw new Error('Agent Merge notification timing is not right-aligned');
		}
	}

	if (hoverMergedNotice) {
		notificationRows.at(-1)?.querySelector<HTMLElement>(':scope > .value')?.dispatchEvent(new targetWindow.MouseEvent('mouseenter'));
		await nextFrame();
		const timing = notificationRows.at(-1)?.querySelector<HTMLElement>('.chat-system-notification-timing');
		if (!timing || Number(targetWindow.getComputedStyle(timing).opacity) === 0) {
			throw new Error('Agent Merge notification timing did not appear on hover');
		}
	}
}

export default defineThemedFixtureGroup({ path: 'chat/' }, {
	FullConversation: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAgentMergeFlow(context, false),
	}),
	FullConversationMergedNoticeHovered: defineComponentFixture({
		labels: { kind: 'screenshot' },
		render: context => renderAgentMergeFlow(context, true),
	}),
});
