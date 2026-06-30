/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
// eslint-disable-next-line local/code-import-patterns
import { IChat, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsPartService } from '../../../../../sessions/services/sessions/browser/sessionsPartService.js';
// eslint-disable-next-line local/code-import-patterns
import { ChatCompositeBar } from '../../../../../sessions/browser/parts/chatCompositeBar.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';

// ============================================================================
// Mock helpers
// ============================================================================

interface IMockChatOptions {
	title: string;
	status?: SessionStatus;
	isRead?: boolean;
}

function createMockChat(options: IMockChatOptions): IChat {
	const resource = URI.parse(`vscode-session-chat://chat/${Math.random().toString(36).slice(2)}`);
	return new class extends mock<IChat>() {
		override readonly resource = resource;
		override readonly title: IObservable<string> = observableValue('title', options.title);
		override readonly status: IObservable<SessionStatus> = observableValue('status', options.status ?? SessionStatus.Completed);
		override readonly isRead: IObservable<boolean> = observableValue('isRead', options.isRead ?? true);
	}();
}

function createMockSession(chats: readonly IChat[], activeChat: IChat, sessionTitle = 'Session'): IActiveSession {
	return new class extends mock<IActiveSession>() {
		override readonly title: IObservable<string> = observableValue('title', sessionTitle);
		override readonly chats: IObservable<readonly IChat[]> = observableValue('chats', chats);
		override readonly openChats: IObservable<readonly IChat[]> = observableValue('openChats', chats);
		override readonly closedChats: IObservable<readonly IChat[]> = observableValue('closedChats', []);
		override readonly visibleChatTabs: IObservable<readonly IChat[]> = observableValue('visibleChatTabs', chats);
		override readonly mainChat: IObservable<IChat> = observableValue('mainChat', chats[0]);
		override readonly activeChat: IObservable<IChat> = observableValue('activeChat', activeChat);
		override readonly isCreated: IObservable<boolean> = observableValue('isCreated', true);
		override readonly isArchived: IObservable<boolean> = observableValue('isArchived', false);
	}();
}

// ============================================================================
// Render helper
// ============================================================================

function renderBar(ctx: ComponentFixtureContext, chats: readonly IChat[], activeChat: IChat, startEditing = false, sessionTitle = 'Session'): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override async renameChat() { }
				override async deleteChat() { }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override async openChat() { }
				override async openNewChatInSession() { }
				override async closeChat() { }
			}());
			reg.defineInstance(ISessionsPartService, new class extends mock<ISessionsPartService>() {
				override focusSession() { }
			}());
		},
	});

	container.style.width = '360px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const bar = disposableStore.add(instantiationService.createInstance(ChatCompositeBar));
	bar.setSession(createMockSession(chats, activeChat, sessionTitle));
	container.appendChild(bar.element);

	if (startEditing) {
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
