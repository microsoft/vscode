/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../base/browser/dom.js';
import { toAction } from '../../../../../base/common/actions.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { agentMergeEnabledNotice, defaultAgentMergeConfiguration } from '../../../../../platform/agentHost/common/agentMerge.js';
import { buildAgentMergePrompt } from '../../../../../platform/agentHost/common/agentMergePrompt.js';
import { AgentSystemNotificationKind, toAgentSystemNotificationMeta } from '../../../../../platform/agentHost/common/meta/agentSystemNotificationMeta.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { CHAT_INPUT_PILLS_ROW_HEIGHT, ChatPillsRow, ChatPillsWidget } from '../../../../../workbench/browser/chatPills.js';
import { systemNotificationToChatPart } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import type { IChatWidgetFixtureOptions } from '../../../../../workbench/test/browser/componentFixtures/chat/chatWidget.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { activeSessionViewBackground } from '../../../../common/theme.js';
import { SessionsChatBackgroundRenderer } from '../../../../services/chatBackground/browser/chatBackgroundRenderer.js';

import '../../../../browser/media/style.css';
import '../../../../browser/parts/media/sessionView.css';
import '../../browser/media/chatView.css';

const fixtureWidth = 800;
const fixtureHeight = 720;
const plainContentHorizontalPadding = 64;
const backgroundContentHorizontalPadding = 88;

function createChatBackgroundPart(container: HTMLElement, disposableStore: DisposableStore): HTMLElement {
	const part = dom.append(container, dom.$('.part.sessionspart'));
	part.style.position = 'relative';
	part.style.width = '100%';
	part.style.height = '100%';
	part.style.backgroundColor = asCssVariable(activeSessionViewBackground);
	const renderer = disposableStore.add(new SessionsChatBackgroundRenderer(part));
	renderer.setBackground({ kind: 'codicons' });
	return part;
}

const assistantResponse = [
	'## Background-aware response',
	'',
	'The assistant surface keeps every response element together:',
	'',
	'| Element | Presentation |',
	'| --- | --- |',
	'| Markdown | Neutral surface |',
	'| Code | Contained with padding |',
	'| Footer | Inside the same bubble |',
	'',
	'```ts',
	'const presentation = {',
	'\tbackground: "editorWidget",',
	'\tpadding: { vertical: 8, horizontal: 12 },',
	'\tcontained: true,',
	'};',
	'```',
	'',
	'The wallpaper remains visible around the response.',
].join('\n');

async function renderChatView(context: ComponentFixtureContext, withBackground: boolean, options: IChatWidgetFixtureOptions): Promise<void> {
	const { container, disposableStore } = context;
	const { renderChatWidget } = await import('../../../../../workbench/test/browser/componentFixtures/chat/chatWidget.fixture.js');
	container.style.width = `${fixtureWidth}px`;
	container.style.height = `${options.height ?? fixtureHeight}px`;
	container.classList.add('monaco-workbench', 'agent-sessions-workbench');

	const part = withBackground
		? createChatBackgroundPart(container, disposableStore)
		: dom.append(container, dom.$('.part.sessionspart'));
	part.style.position = 'relative';
	part.style.width = '100%';
	part.style.height = '100%';
	part.style.backgroundColor = asCssVariable(activeSessionViewBackground);

	const chatView = dom.append(part, dom.$('.chat-view'));
	chatView.style.setProperty('--session-view-background', asCssVariable(activeSessionViewBackground));

	await renderChatWidget({ ...context, container: chatView }, {
		width: fixtureWidth,
		height: fixtureHeight,
		listHeight: 430,
		contentHorizontalPadding: withBackground ? backgroundContentHorizontalPadding : plainContentHorizontalPadding,
		hostLayoutMode: 'listOnly',
		persistentContentHeight: CHAT_INPUT_PILLS_ROW_HEIGHT,
		responseFooterAction: true,
		...options,
	});

	chatView.style.backgroundColor = 'transparent';
	const auxiliaryBar = chatView.querySelector<HTMLElement>('.part.auxiliarybar');
	auxiliaryBar?.classList.remove('auxiliarybar');
}

async function renderAssistantResponse(context: ComponentFixtureContext, withBackground: boolean): Promise<void> {
	const { disposableStore } = context;
	await renderChatView(context, withBackground, {
		messages: [{
			user: 'Show how assistant responses read over a custom background.',
			assistant: [{ kind: 'markdown', text: assistantResponse }],
		}],
		decorateInputPart: (inputPart, instantiationService) => {
			const row = disposableStore.add(new ChatPillsRow('ChatView.fixture', {
				compact: 'auto',
				targetWindow: dom.getWindow(inputPart.element),
			}));
			const pills = disposableStore.add(instantiationService.createInstance(ChatPillsWidget, {
				pills: constObservable([
					{ action: toAction({ id: 'fixture.mode', label: 'Interactive', class: ThemeIcon.asClassName(Codicon.commentDiscussion), run: () => { } }) },
					{ action: toAction({ id: 'fixture.permissions', label: 'Default Permissions', class: ThemeIcon.asClassName(Codicon.shield), run: () => { } }) },
				]),
			}, { ariaLabel: 'Session status' }));
			const persistentContent = inputPart.persistentContentContainerElement;
			persistentContent.appendChild(row.element);
			persistentContent.classList.add('chat-persistent-content-visible');
			row.content.appendChild(pills.element);
			row.observe(persistentContent);
			row.observe(pills.element);
		},
	});
}

async function renderAgentMergeBackground(context: ComponentFixtureContext): Promise<void> {
	const pullRequestUrl = 'https://github.com/microsoft/vscode/pull/333964';
	const branchName = 'agent-merge-background';
	const notification = systemNotificationToChatPart(
		agentMergeEnabledNotice({ branchName, pullRequestUrl }, defaultAgentMergeConfiguration),
		'fixture',
		toAgentSystemNotificationMeta({ kind: AgentSystemNotificationKind.AgentMergeEnabled }),
	);
	if (notification?.kind !== 'systemNotification') {
		throw new Error('Expected an Agent Merge enablement notification');
	}

	await renderChatView(context, true, {
		height: 520,
		listHeight: 500,
		inputVisible: false,
		messages: [
			{
				user: 'Enable Agent Merge for this pull request.',
				assistant: [{ kind: 'markdown', text: 'I will monitor the checks.' }],
			},
			{
				user: 'Agent Merge enabled',
				requestHidden: true,
				assistant: [{ kind: 'systemNotification', notification }],
			},
			{
				user: buildAgentMergePrompt(['fixCI'], {
					pullRequestUrl,
					title: 'Keep Agent Merge messages opaque',
					headSha: '9665aca22f3e3147ee87449bf3cb0592a7345847',
					headRef: branchName,
					baseRef: 'main',
					reviewThreads: [],
					reviewSummaries: [],
					newComments: [],
					failedChecks: ['Linux Unit Tests'],
					behind: false,
					conflicting: false,
					commentWatermark: '2026-09-09T10:00:00.000Z',
				}),
				isSystemInitiated: true,
				assistant: [{ kind: 'markdown', text: 'Fixed the failing test.' }],
			},
		],
	});
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/view/' }, {
	AgentMergeBackground: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A compact conversation on the built-in Codicons wallpaper shows an opaque user message, a short assistant reply, the Agent Merge enablement notice, an opaque Agent Merge request card, and a short final reply. All messages are visible together without scrolling, and the wallpaper remains visible around their surfaces.'],
		render: renderAgentMergeBackground,
	}),
	AssistantResponseBackground: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The Agents chat shows a tinted user request above a distinct neutral assistant bubble on a Codicons wallpaper. The assistant heading, Markdown table, code editor, response footer, and persistent status controls are contained and aligned; the wallpaper remains visible around the response and behind the transparent status-row parent.'],
		render: context => renderAssistantResponse(context, true),
	}),
	AssistantResponsePlain: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['The Agents chat without a wallpaper keeps the assistant response unboxed. The heading, Markdown table, code editor, and response footer use the normal transcript alignment, while the user request and composer retain their established surfaces.'],
		render: context => renderAssistantResponse(context, false),
	}),
});
