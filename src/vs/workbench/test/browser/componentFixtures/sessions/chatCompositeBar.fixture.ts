/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize2 } from '../../../../../nls.js';
import { IMenu, IMenuService, MenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { DEFAULT_EDITOR_PART_OPTIONS } from '../../../../browser/parts/editor/editor.js';
import { IEditorPartOptions } from '../../../../common/editor.js';
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
import { Menus } from '../../../../../sessions/browser/menus.js';
// eslint-disable-next-line local/code-import-patterns
import { CLOSE_CHAT_COMMAND_ID } from '../../../../../sessions/common/sessionCommands.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';

const closeChatAction = {
	id: CLOSE_CHAT_COMMAND_ID,
	title: localize2('sessions.fixture.closeChat', "Close Chat"),
	icon: Codicon.close,
};

class ChatTabFixtureMenuService extends mock<IMenuService>() {

	constructor(
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super();
	}

	override createMenu(id: typeof Menus.SessionChatTab): IMenu {
		const actions = id === Menus.SessionChatTab
			? [new MenuItemAction(closeChatAction, undefined, undefined, undefined, undefined, this.contextKeyService, this.commandService)]
			: [];
		return {
			onDidChange: Event.None,
			dispose: () => { },
			getActions: () => actions.length ? [['navigation', actions]] : [],
		};
	}
}

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

function renderBar(ctx: ComponentFixtureContext, chats: readonly IChat[], activeChat: IChat, startEditing = false, sessionTitle = 'Session', partOptions: Partial<IEditorPartOptions> = {}, showTabAction = false, focusAction = false): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			if (showTabAction) {
				reg.define(IMenuService, ChatTabFixtureMenuService);
			}
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override async renameChat() { }
				override async deleteChat() { }
			}());
			// Tabs are drag sources that ask the owning provider for the referenced
			// chat's backend resource. These fixtures mock a provider-less session,
			// so no provider resolves and the drag offers no chat reference.
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override getProvider() { return undefined; }
			}());
			reg.defineInstance(IEditorGroupsService, new class extends mock<IEditorGroupsService>() {
				override readonly onDidChangeEditorPartOptions = Event.None;
				override readonly partOptions = { ...DEFAULT_EDITOR_PART_OPTIONS, ...partOptions };
			}());
		},
	});

	container.style.width = '360px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';
	container.classList.add('modern-ui-tabs');
	const groupContainer = document.createElement('div');
	groupContainer.classList.add('session-view', 'modern-ui-editor-tab-group', 'modern-ui-editor-tab-group-active');
	const chatGroupContainer = document.createElement('div');
	chatGroupContainer.classList.add('chat-groups-view', 'single-group');
	groupContainer.appendChild(chatGroupContainer);
	container.appendChild(groupContainer);

	const session = createMockSession(chats, activeChat, sessionTitle);
	const bar = disposableStore.add(instantiationService.createInstance(ChatCompositeBar, undefined));
	bar.setGroup(createMockDelegate(session, chats, activeChat));
	chatGroupContainer.appendChild(bar.element);

	if (focusAction) {
		ctx.focus(bar.element.querySelector<HTMLElement>('.chat-composite-bar-tab-actions .action-label')!);
	}

	if (startEditing) {
		// Reveal the inline rename input on the active (non-main) tab by
		// simulating the double-click that users perform to rename a chat.
		const tabs = bar.element.querySelectorAll<HTMLElement>('.chat-composite-bar-tab');
		tabs[tabs.length - 1]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
	}
}

function renderTabActionSettings(ctx: ComponentFixtureContext, tabActionLocation: IEditorPartOptions['tabActionLocation'], tabActionReserveSpace: boolean): void {
	const main = createMockChat({ title: 'Main chat' });
	const second = createMockChat({ title: 'Investigate notebook integration test' });
	renderBar(ctx, [main, second], second, false, 'Session', { tabActionLocation, tabActionReserveSpace }, true, !tabActionReserveSpace);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	TwoChats: defineComponentFixture({
		render: (ctx) => {
			const main = createMockChat({ title: 'Main chat' });
			const second = createMockChat({ title: 'Fix login bug' });
			renderBar(ctx, [main, second], second);
		},
	}),

	TabActionsRightReserved: defineComponentFixture({
		render: ctx => renderTabActionSettings(ctx, 'right', true),
		expectedVisualDescriptions: ['The close action appears on the right in a persistent reserved column.'],
	}),

	TabActionsRightOverlay: defineComponentFixture({
		render: ctx => renderTabActionSettings(ctx, 'right', false),
		expectedVisualDescriptions: ['The focused close action overlays the right edge without reserving label space.'],
	}),

	TabActionsLeftReserved: defineComponentFixture({
		render: ctx => renderTabActionSettings(ctx, 'left', true),
		expectedVisualDescriptions: ['The close action appears on the left in a persistent reserved column.'],
	}),

	TabActionsLeftOverlay: defineComponentFixture({
		render: ctx => renderTabActionSettings(ctx, 'left', false),
		expectedVisualDescriptions: ['The focused close action overlays the left edge without reserving label space.'],
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
			renderBar(ctx, [main, second], second, true);
		},
	}),

	WithDraftChat: defineComponentFixture({
		render: (ctx) => {
			// A committed main chat alongside an in-composer draft (untitled)
			// chat surfaces the tab strip. The draft is ordered last and its tab
			// close button deletes the draft outright.
			const main = createMockChat({ title: 'Investigate flaky test' });
			const draft = createMockChat({ title: 'New Chat', status: SessionStatus.Untitled });
			renderBar(ctx, [main, draft], draft, false, 'Session');
		},
	}),
});
