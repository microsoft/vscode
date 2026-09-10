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
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { asCssVariable } from '../../../../../platform/theme/common/colorUtils.js';
import { CHAT_INPUT_PILLS_ROW_HEIGHT, ChatPillsRow, ChatPillsWidget } from '../../../../../workbench/browser/chatPills.js';
import { ForkConversationActionId } from '../../../../../workbench/contrib/chat/browser/actions/chatForkActions.js';
import { RestoreCheckpointActionId } from '../../../../../workbench/contrib/chat/browser/chatEditing/chatEditingActions.js';
import { systemNotificationToChatPart } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import type { IChatRequestVariableEntry } from '../../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import type { IChatWidgetFixtureOptions } from '../../../../../workbench/test/browser/componentFixtures/chat/chatWidget.fixture.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../../../../../workbench/test/browser/componentFixtures/fixtureUtils.js';
import { activeSessionViewBackground } from '../../../../common/theme.js';
import { SessionsChatBackgroundRenderer, SessionsChatBackgroundReplica } from '../../../../services/chatBackground/browser/chatBackgroundRenderer.js';

import '../../../../browser/media/style.css';
import '../../../../browser/parts/media/sessionView.css';
import '../../browser/media/chatView.css';

const fixtureWidth = 800;
const fixtureHeight = 720;
const plainContentHorizontalPadding = 64;
const backgroundContentHorizontalPadding = 88;
const codiconsBackground = { kind: 'codicons' } as const;

function createChatBackgroundPart(container: HTMLElement, disposableStore: DisposableStore): HTMLElement {
	const part = dom.append(container, dom.$('.part.sessionspart'));
	part.style.position = 'relative';
	part.style.width = '100%';
	part.style.height = '100%';
	part.style.backgroundColor = asCssVariable(activeSessionViewBackground);
	const renderer = disposableStore.add(new SessionsChatBackgroundRenderer(part));
	renderer.setBackground(codiconsBackground);
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

const stickyAssistantResponse = [
	assistantResponse,
	'## Validation notes',
	'',
	'The sticky request must preserve the wallpaper coordinate system while this longer response scrolls beneath it. Transparent image pixels and the spaces between glyphs reveal the session base rather than response text.',
	'',
	'### Layout checks',
	'',
	'- Keep the full background canvas width.',
	'- Offset it by the source and sticky bounds.',
	'- Clip only at the sticky viewport.',
	'- Keep the request bubble opaque above the decorative layer.',
	'',
	'```ts',
	'const replicaBounds = {',
	'\tleft: source.left - sticky.left,',
	'\ttop: source.top - sticky.top,',
	'\twidth: source.width,',
	'\theight: source.height,',
	'};',
	'```',
	'',
	'## Final review',
	'',
	'Switch between image, Codicons, and no background without rebuilding the sticky row or changing its keyboard and pointer behavior.',
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

async function renderStickyBackgroundContinuity(context: ComponentFixtureContext): Promise<void> {
	let stickyScrollDomNode: HTMLElement | undefined;
	let scrollToStickyRequest: (() => void) | undefined;
	await renderChatView(context, true, {
		height: 560,
		listHeight: 360,
		inputVisible: false,
		stickyScroll: true,
		messages: [{
			user: 'Implement sticky background continuity so this long request remains readable while the response scrolls beneath it, without restarting or independently repeating the configured Sessions wallpaper.',
			assistant: [{ kind: 'markdown', text: stickyAssistantResponse }],
		}],
		onRendered: ({ listWidget }) => {
			stickyScrollDomNode = listWidget.stickyScrollDomNode;
			scrollToStickyRequest = () => {
				const maximumScrollTop = listWidget.scrollHeight - listWidget.renderHeight;
				if (maximumScrollTop <= 0) {
					throw new Error('Sticky background fixture content does not overflow');
				}
				listWidget.scrollTop = Math.min(160, maximumScrollTop);
			};
		},
	});

	if (!stickyScrollDomNode || !scrollToStickyRequest) {
		throw new Error('Sticky background fixture did not initialize sticky scroll');
	}
	const source = context.container.querySelector<HTMLElement>('.part.sessionspart > .sessions-chat-background');
	if (!source) {
		throw new Error('Sticky background fixture did not render the source canvas');
	}
	const replica = context.disposableStore.add(new SessionsChatBackgroundReplica(source, stickyScrollDomNode));
	replica.setBackground(codiconsBackground);
	replica.layout();

	const targetWindow = dom.getWindow(context.container);
	const nextFrame = () => new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	await nextFrame();
	scrollToStickyRequest();
	await nextFrame();
	await nextFrame();

	if (!stickyScrollDomNode.querySelector('.monaco-tree-sticky-row.request')) {
		throw new Error('Sticky background fixture did not activate the real sticky request row');
	}
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
				requestSource: 'agentMerge',
				assistant: [{ kind: 'markdown', text: 'Fixed the failing test.' }],
			},
		],
	});
	if (!context.container.querySelector('.chat-agent-merge')) {
		throw new Error('Expected the Agent Merge request to render as a card');
	}
}

async function renderRequestLinkKeyboardFocus(context: ComponentFixtureContext): Promise<void> {
	await renderChatView(context, false, {
		height: 320,
		listHeight: 220,
		inputVisible: false,
		messages: [{
			user: 'Review [microsoft/vscode#334596](https://github.com/microsoft/vscode/issues/334596) before continuing.',
			assistant: [{ kind: 'markdown', text: 'The request link should have one clear keyboard focus indicator.' }],
		}],
	});

	const focusTarget = context.container.querySelector<HTMLAnchorElement>('.interactive-request .chat-markdown-part.rendered-markdown a[data-href]:not(.chat-rich-link)');
	if (!focusTarget) {
		throw new Error('Expected a plain request link');
	}
	focusTarget.focus();
	if (!focusTarget.matches(':focus-visible')) {
		throw new Error('Expected the request link to receive keyboard-visible focus');
	}
}

async function renderRequestAttachmentBackground(context: ComponentFixtureContext): Promise<void> {
	const attachment: IChatRequestVariableEntry = {
		kind: 'generic',
		id: 'fixture-feedback',
		name: 'This does not guarantee an opaque background.',
		value: 'This does not guarantee an opaque background.',
		icon: Codicon.comment,
	};
	await renderChatView(context, true, {
		height: 320,
		listHeight: 300,
		inputVisible: false,
		messages: [{
			user: '/act-on-feedback',
			variables: [attachment],
			assistant: [{ kind: 'markdown', text: 'Attachment treatment updated.' }],
		}],
	});
}

async function renderCheckpointControlsBackground(context: ComponentFixtureContext): Promise<void> {
	await renderChatView(context, true, {
		height: 360,
		listHeight: 340,
		inputVisible: false,
		checkpointsEnabled: true,
		menuItems: [
			{
				menuId: MenuId.ChatMessageCheckpoint,
				item: {
					command: {
						id: RestoreCheckpointActionId,
						title: 'Restore Checkpoint',
						tooltip: 'Restores workspace and chat to this point',
					},
					group: 'navigation',
					order: 2,
				},
			},
			{
				menuId: MenuId.ChatMessageCheckpoint,
				item: {
					command: {
						id: ForkConversationActionId,
						title: 'Fork Conversation',
						tooltip: 'Fork conversation from this point',
						icon: Codicon.repoForked,
					},
					group: 'navigation',
					order: 3,
				},
			},
		],
		messages: [{
			user: 'Continue from this checkpoint.',
			assistant: [{ kind: 'markdown', text: '2 files changed: +34 -1' }],
		}],
	});
	const checkpoint = context.container.querySelector<HTMLElement>('.checkpoint-container');
	if (!checkpoint) {
		throw new Error('Expected checkpoint controls');
	}
	checkpoint.classList.add('group-hovered');
}

export default defineThemedFixtureGroup({ path: 'sessions/chat/view/' }, {
	CheckpointControlsBackground: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['Restore Checkpoint and fork controls each have their own compact opaque surface over the Codicons wallpaper between faded separator lines, with no opaque rectangle behind their toolbar or spacing. Direct hover changes only the hovered control surface.'],
		render: renderCheckpointControlsBackground,
	}),
	RequestAttachmentBackground: defineComponentFixture({
		labels: { kind: 'screenshot', blocksCi: true },
		expectedVisualDescriptions: ['A comment attachment pill and its /act-on-feedback request sit on opaque tinted surfaces above a short assistant reply on the Codicons wallpaper; the wallpaper remains visible around the surfaces without showing through them.'],
		render: renderRequestAttachmentBackground,
	}),
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
	RequestLinkKeyboardFocus: defineComponentFixture({
		labels: { kind: 'screenshot' },
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['A plain Markdown link in the Agents chat user request has exactly one solid, unclipped keyboard focus indicator in the themed focus color.'],
		render: renderRequestLinkKeyboardFocus,
	}),
	StickyBackgroundContinuity: defineComponentFixture({
		labels: { kind: 'screenshot' },
		expectedVisualDescriptions: ['A real scrolled Agents chat keeps its long user request pinned above a continuous Codicons canvas. The sticky viewport shows the same glyph coordinates as the full transcript background, opaque session color fills the gaps between glyphs, and the request bubble remains opaque above the decorative replica.'],
		render: renderStickyBackgroundContinuity,
	}),
});
