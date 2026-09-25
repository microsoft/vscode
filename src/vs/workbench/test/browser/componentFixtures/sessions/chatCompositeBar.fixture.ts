/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { $ } from '../../../../../base/browser/dom.js';
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
import { Menus } from '../../../../../sessions/browser/menus.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

import '../../../../contrib/modernUI/browser/media/tabs.css';
import '../../../../contrib/modernUI/browser/connectedEditorTabs.js';
// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';

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

function renderBar(ctx: ComponentFixtureContext, chats: readonly IChat[], activeChat: IChat, options: { startEditing?: boolean; connected?: boolean; compact?: boolean; active?: boolean; width?: number } = {}): void {
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
	container.classList.add('agent-sessions-workbench', 'modern-ui-tabs');
	container.classList.toggle('modern-ui-connected-editor-tabs', options.connected !== false);
	const sessionView = $('.session-view.modern-ui-editor-tab-group');
	sessionView.classList.toggle('modern-ui-editor-tab-group-active', options.active !== false);
	applySessionViewThemeColors(sessionView, ctx.theme, options.active !== false);
	sessionView.style.backgroundColor = 'var(--session-view-background)';
	container.appendChild(sessionView);

	const session = createMockSession(chats, activeChat);
	const bar = disposableStore.add(instantiationService.createInstance(ChatCompositeBar, undefined));
	sessionView.appendChild(bar.element);
	bar.setGroup(createMockDelegate(session, chats, activeChat));
	const content = $('.chat-group-view-content.modern-ui-editor-tab-content');
	content.style.height = '96px';
	sessionView.appendChild(content);

	if (options.startEditing) {
		// Reveal the inline rename input on the active (non-main) tab by
		// simulating the double-click that users perform to rename a chat.
		const tabs = bar.element.querySelectorAll<HTMLElement>('.chat-composite-bar-tab');
		tabs[tabs.length - 1]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
	}
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

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
