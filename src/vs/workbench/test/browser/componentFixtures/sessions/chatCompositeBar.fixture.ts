/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { $, getWindow } from '../../../../../base/browser/dom.js';
import { assert } from '../../../../../base/common/assert.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IMenu, IMenuService, MenuId, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../../../browser/parts/editor/editor.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ChatInteractivity, ChatOriginKind, IChat, ISessionCapabilities, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsProvidersService } from '../../../../../sessions/services/sessions/browser/sessionsProvidersService.js';
// eslint-disable-next-line local/code-import-patterns
import { ChatCompositeBar, IChatCompositeBarDelegate } from '../../../../../sessions/browser/parts/chatCompositeBar.js';
// eslint-disable-next-line local/code-import-patterns
import { applySessionViewThemeColors } from '../../../../../sessions/browser/parts/sessionBarStyles.js';
// eslint-disable-next-line local/code-import-patterns
import { applyAgentsPartCardStyles } from '../../../../../sessions/browser/parts/agentsPartCard.js';
// eslint-disable-next-line local/code-import-patterns
import { Menus } from '../../../../../sessions/browser/menus.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';
import { IChatWidgetFixtureHandle, renderChatWidget } from '../chat/chatWidget.fixture.js';

import '../../../../contrib/modernUI/browser/media/tabs.css';
import '../../../../contrib/modernUI/browser/connectedEditorTabs.js';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/media/workbench.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/sessionsPart.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatGroupsView.css';

// ============================================================================
// Mock helpers
// ============================================================================

interface IMockChatOptions {
	title: string;
	status?: SessionStatus;
	isRead?: boolean;
	interactivity?: ChatInteractivity;
}

function createMockChat(options: IMockChatOptions): IChat {
	const resource = URI.parse(`vscode-session-chat://chat/${Math.random().toString(36).slice(2)}`);
	return new class extends mock<IChat>() {
		override readonly resource = resource;
		override readonly title: IObservable<string> = observableValue('title', options.title);
		override readonly status: IObservable<SessionStatus> = observableValue('status', options.status ?? SessionStatus.Completed);
		override readonly isRead: IObservable<boolean> = observableValue('isRead', options.isRead ?? true);
		override readonly interactivity: IObservable<ChatInteractivity> = observableValue('interactivity', options.interactivity ?? ChatInteractivity.Full);
	}();
}

function createMockSession(chats: readonly IChat[], activeChat: IChat, sessionTitle = 'Session'): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly sessionId = 'mock:session';
		override readonly title: IObservable<string> = observableValue('title', sessionTitle);
		override readonly openChats: IObservable<readonly IChat[]> = observableValue('openChats', chats);
		override readonly closedChats: IObservable<readonly IChat[]> = observableValue('closedChats', []);
		override readonly visibleChatTabs: IObservable<readonly IChat[]> = observableValue('visibleChatTabs', chats);
		override readonly shouldShowChatTabs: IObservable<boolean> = derived(reader => {
			const tabChats = this.visibleChatTabs.read(reader).filter(c => c.origin?.kind !== ChatOriginKind.Tool);
			return tabChats.length > 1 || (tabChats.length === 1 && tabChats[0].title.read(reader) !== this.title.read(reader));
		});
		override readonly mainChat: IObservable<IChat> = observableValue('mainChat', chats[0]);
		override readonly activeChat: IObservable<IChat> = observableValue('activeChat', activeChat);
		override readonly capabilities: IObservable<ISessionCapabilities> = observableValue('capabilities', { supportsMultipleChats: true });
		override readonly isCreated: IObservable<boolean> = observableValue('isCreated', true);
		override readonly isArchived: IObservable<boolean> = observableValue('isArchived', false);
	}();
}

function createMockDelegate(session: IActiveSession, chats: readonly IChat[], activeChat: IChat): IChatCompositeBarDelegate {
	return {
		session,
		chats: observableValue('chats', chats),
		activeChatResource: observableValue('activeChatResource', activeChat.resource.toString()),
		mainChatResource: observableValue('mainChatResource', chats[0].resource.toString()),
		visible: session.shouldShowChatTabs,
		showSessionActions: session.shouldShowChatTabs,
		openChat: () => { },
	};
}

// ============================================================================
// Render helper
// ============================================================================

function renderBar(ctx: ComponentFixtureContext, chats: readonly IChat[], activeChat: IChat, options: { startEditing?: boolean; connected?: boolean; compact?: boolean; active?: boolean; width?: number } = {}): HTMLElement {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IMenuService, new class extends mock<IMenuService>() {
				override createMenu(id: MenuId): IMenu {
					return {
						onDidChange: Event.None,
						dispose: () => { },
						getActions: menuOptions => id === Menus.SessionChatTab ? [['navigation', [
							instantiationService.createInstance(MenuItemAction, { id: 'sessions.fixture.closeChat', title: 'Close Chat', icon: Codicon.closeSmall }, undefined, menuOptions, undefined, undefined),
						]]] : [],
					};
				}
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override async renameChat() { }
				override async deleteChat() { return true; }
			}());
			// Tabs are drag sources that ask the owning provider for the referenced
			// chat's backend resource. These fixtures mock a provider-less session,
			// so no provider resolves and the drag offers no chat reference.
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override getProvider() { return undefined; }
			}());
			reg.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
				override readonly onDidChangeEditorPartOptions = Event.None;
				override readonly partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS, tabHeight: options.compact ? 'compact' as const : 'default' as const };
			}());
		},
	});

	container.style.width = `${options.width ?? 360}px`;
	container.classList.add('agent-sessions-workbench', 'modern-ui-tabs', 'noeditorpane');
	container.classList.toggle('modern-ui-connected-editor-tabs', options.connected !== false);
	const card = $('.part.sessionspart.agents-part-card');
	applyAgentsPartCardStyles(card, ctx.theme);
	container.appendChild(card);
	const cardContent = $('.content');
	card.appendChild(cardContent);
	const sessionView = $('.session-view.tabs-replace-header.modern-ui-editor-tab-group');
	sessionView.classList.toggle('modern-ui-editor-tab-group-active', options.active !== false);
	sessionView.classList.toggle('is-active', options.active !== false);
	applySessionViewThemeColors(sessionView, ctx.theme, options.active !== false);
	sessionView.style.backgroundColor = 'var(--session-view-background)';
	cardContent.appendChild(sessionView);
	const sessionContent = $('.session-view-content');
	sessionView.appendChild(sessionContent);
	const groups = $('.chat-groups-view.single-group');
	const group = $('.chat-group-view');
	const barContainer = $('.chat-group-view-bar');
	sessionContent.appendChild(groups);
	groups.appendChild(group);
	group.appendChild(barContainer);

	const session = createMockSession(chats, activeChat);
	const bar = disposableStore.add(instantiationService.createInstance(ChatCompositeBar, undefined));
	barContainer.appendChild(bar.element);
	bar.setGroup(createMockDelegate(session, chats, activeChat));
	const content = $('.chat-group-view-content.modern-ui-editor-tab-content');
	content.style.height = '96px';
	group.appendChild(content);

	if (options.startEditing) {
		// Reveal the inline rename input on the active (non-main) tab by
		// simulating the double-click that users perform to rename a chat.
		const tabs = bar.element.querySelectorAll<HTMLElement>('.chat-composite-bar-tab');
		tabs[tabs.length - 1]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
	}
	return content;
}

async function renderStickyMessageFrame(ctx: ComponentFixtureContext, width: number): Promise<void> {
	const chat = createMockChat({ title: 'Review panel edges' });
	const content = renderBar(ctx, [chat], chat, { width });
	const chatView = $('.chat-view');
	content.style.height = '320px';
	content.appendChild(chatView);
	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget({ ...ctx, container: chatView }, {
		width: content.clientWidth,
		height: 320,
		listHeight: 320,
		useAuxiliaryBarWrapper: false,
		inputVisible: false,
		stickyScroll: true,
		messages: [{
			user: 'Keep the sticky message inside the panel frame.',
			assistant: [{ kind: 'markdown', text: Array.from({ length: 16 }, () => 'The panel outline should stay continuous on both sides while this response scrolls beneath the pinned request.').join('\n\n') }],
		}],
		onRendered: widget => handle = widget,
	});
	// The fixture helper adds a workbench stacking context that is absent from production chat views.
	chatView.classList.remove('monaco-workbench');
	assert(handle !== undefined, 'Expected the chat widget to render');
	const { listWidget } = handle;
	const targetWindow = getWindow(content);
	for (let attempt = 0; attempt < 60; attempt++) {
		listWidget.scrollTop = 160;
		await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
		if (listWidget.scrollTop === 160 && listWidget.stickyScrollDomNode?.querySelector('.monaco-tree-sticky-row.request')) {
			return;
		}
	}
	throw new Error('Expected the request to stick above the scrolled response');
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	StickyMessageFrame: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The user message is pinned above a scrolled response beneath the connected chat tab. The panel frame remains continuous along both sides of the sticky message, with no gaps or overlap.'],
		render: ctx => renderStickyMessageFrame(ctx, 800),
	}),
	StickyMessageFrameNarrow: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['A narrow chat panel shows a wrapped sticky user message above the scrolled response. The connected panel outline stays visible on both sides of the pinned message.'],
		render: ctx => renderStickyMessageFrame(ctx, 360),
	}),
	FirstChatActive: defineComponentFixture({
		additionalThemes: ['visualStudioDark', 'darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The first selected tab and the chat card share one continuous outline, with no clipped corner or dangling left edge.'],
		render: ctx => {
			const main = createMockChat({ title: 'Extend README documentation' });
			const second = createMockChat({ title: 'Add README examples' });
			renderBar(ctx, [main, second], main);
		},
	}),

	TwoChats: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		expectedVisualDescriptions: ['The selected chat tab joins the session surface with curved shoulders and no lower border. Its close action remains visible.'],
		render: (ctx) => {
			const main = createMockChat({ title: 'Main chat' });
			const second = createMockChat({ title: 'Fix login bug' });
			renderBar(ctx, [main, second], second);
		},
	}),

	MixedStatuses: defineComponentFixture({
		render: (ctx) => {
			const main = createMockChat({ title: 'Main chat' });
			const working = createMockChat({ title: 'Refactor auth', status: SessionStatus.InProgress });
			const needsInput = createMockChat({ title: 'Add tests', status: SessionStatus.NeedsInput });
			const unread = createMockChat({ title: 'Update docs', status: SessionStatus.Completed, isRead: false });
			renderBar(ctx, [main, working, needsInput, unread], main);
		},
	}),

	LongTitles: defineComponentFixture({
		render: (ctx) => {
			const main = createMockChat({ title: 'Main chat' });
			const long = createMockChat({ title: 'Investigate flaky integration test in the notebook editor viewport' });
			renderBar(ctx, [main, long], long);
		},
	}),

	Renaming: defineComponentFixture({
		render: (ctx) => {
			const main = createMockChat({ title: 'Main chat' });
			const second = createMockChat({ title: 'Fix login bug' });
			renderBar(ctx, [main, second], second, { startEditing: true });
		},
	}),

	WithDraftChat: defineComponentFixture({
		render: (ctx) => {
			// A committed main chat alongside an in-composer draft (untitled)
			// chat surfaces the tab strip. The draft is ordered last and its tab
			// close button deletes the draft outright.
			const main = createMockChat({ title: 'Investigate flaky test' });
			const draft = createMockChat({ title: 'New Chat', status: SessionStatus.Untitled });
			renderBar(ctx, [main, draft], draft);
		},
	}),

	CompactTabs: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => {
			const main = createMockChat({ title: 'Main chat' });
			const second = createMockChat({ title: 'Fix login bug' });
			renderBar(ctx, [main, second], second, { compact: true });
		},
	}),

	InactiveSession: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => {
			const main = createMockChat({ title: 'Main chat' });
			const second = createMockChat({ title: 'Fix login bug' });
			renderBar(ctx, [main, second], second, { active: false });
		},
	}),

	OverflowingTabs: defineComponentFixture({
		deferPaint: true,
		render: ctx => {
			const chats = Array.from({ length: 5 }, (_, index) => createMockChat({ title: `Investigate issue ${index + 1}` }));
			renderBar(ctx, chats, chats[4], { width: 280 });
		},
	}),

	PillTabs: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: ctx => {
			const main = createMockChat({ title: 'Main chat' });
			const second = createMockChat({ title: 'Fix login bug' });
			renderBar(ctx, [main, second], second, { connected: false });
		},
	}),
});
