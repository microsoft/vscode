/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
// eslint-disable-next-line local/code-import-patterns
import { IChat, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { ChatCompositeBar, IChatCompositeBarDelegate } from '../../../../../sessions/browser/parts/chatCompositeBar.js';
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

function createMockDelegate(chats: readonly IChat[], activeChat: IChat, sessionTitle = 'Session'): IChatCompositeBarDelegate {
	return {
		sessionId: 'mock:session',
		chats: observableValue('chats', chats),
		activeChatResource: observableValue('activeChatResource', activeChat.resource.toString()),
		mainChatResource: observableValue('mainChatResource', chats[0].resource.toString()),
		visible: derived(reader => {
			if (chats.length > 1) {
				return true;
			}
			const title = chats[0].title.read(reader);
			return !!title && title !== sessionTitle;
		}),
		openChat: () => { },
		closeChat: () => { },
		deleteChat: () => { },
		renameChat: () => { },
	};
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
		},
	});

	container.style.width = '360px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background)';

	const bar = disposableStore.add(instantiationService.createInstance(ChatCompositeBar));
	bar.setGroup(createMockDelegate(chats, activeChat, sessionTitle));
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

	SingleDivergedTitle: defineComponentFixture({
		render: (ctx) => {
			// A session with a single (default) chat whose title differs from the
			// session title keeps the tab strip visible so both independent titles
			// stay discoverable.
			const main = createMockChat({ title: 'Investigate flaky test' });
			renderBar(ctx, [main], main, false, 'Session');
		},
	}),
});
