/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { SessionHeader } from '../../../../contrib/sessions/browser/parts/sessionHeader.js';
import { ISessionsListModelService } from '../../../../contrib/sessions/browser/sessionsListModelService.js';
import { IChat, ISessionCapabilities, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../contrib/sessions/common/sessionsManagement.js';
import { ITestSessionWithChat, testPaneContentOf } from '../../../../contrib/sessions/test/browser/sessionHostTestUtils.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

import '../../../../contrib/sessions/browser/parts/media/chatCompositeBar.css';
import { ISessionHost } from '../../../../services/sessions/browser/sessionHost.js';

interface IMockSessionOptions {
	readonly title: string;
	readonly status?: SessionStatus;
	readonly isArchived?: boolean;
	readonly supportsRename?: boolean;
}

function createMockSession(options: IMockSessionOptions): ITestSessionWithChat {
	const capabilities: ISessionCapabilities = {
		supportsMultipleChats: false,
		supportsRename: options.supportsRename ?? true,
	};
	const chat = new class extends mock<IChat>() {
		override readonly resource = URI.parse(`vscode-chat://chat/${Math.random().toString(36).slice(2)}`);
		override readonly title: IObservable<string> = constObservable(options.title);
		override readonly status: IObservable<SessionStatus> = constObservable(options.status ?? SessionStatus.Completed);
		override readonly isRead: IObservable<boolean> = constObservable(true);
		override readonly capabilities = constObservable({ canRename: options.supportsRename ?? true, canArchive: false, canDelete: false });
	}();

	return new class extends mock<ITestSessionWithChat>() {
		override readonly sessionId = `local:${options.title}`;
		override readonly resource = URI.parse(`vscode-session://session/${Math.random().toString(36).slice(2)}`);
		override readonly capabilities = constObservable(capabilities);
		override readonly title: IObservable<string> = constObservable(options.title);
		override readonly status: IObservable<SessionStatus> = constObservable(options.status ?? SessionStatus.Completed);
		override readonly isArchived: IObservable<boolean> = constObservable(options.isArchived ?? false);
		override readonly isRead: IObservable<boolean> = constObservable(true);
		override readonly isCreated: IObservable<boolean> = constObservable(true);
		override readonly mainChat: IObservable<IChat> = constObservable(chat);
		override readonly activeChat: IObservable<IChat> = constObservable(chat);
		override readonly icon = Codicon.account;
	}();
}

function createMockListModelService(): ISessionsListModelService {
	return new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;

		override getStatusIcon(status: SessionStatus, _isRead: boolean, isArchived: boolean, completedStateIcon?: ThemeIcon): ThemeIcon {
			switch (status) {
				case SessionStatus.InProgress:
					return { ...Codicon.sessionInProgress, color: themeColorFromId('textLink.foreground') };
				case SessionStatus.NeedsInput:
					return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
				case SessionStatus.Error:
					return { ...Codicon.error, color: themeColorFromId('errorForeground') };
				default:
					if (isArchived) {
						return { ...Codicon.passFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
					}
					return completedStateIcon ?? { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
			}
		}
	}();
}

function renderHeader(ctx: ComponentFixtureContext, session: ITestSessionWithChat, withBackground = false): void {
	const { container, disposableStore } = ctx;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			reg.defineInstance(ISessionHost, upcastPartial<ISessionHost>({ commandContext: { sessionHostId: 'fixture-pane' } }));
			registerWorkbenchServices(reg);
			reg.defineInstance(ISessionsListModelService, createMockListModelService());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = Event.None;
				override async renameChat() { }
			}());
		},
	});

	container.style.width = '420px';
	container.style.setProperty('--session-view-background', 'var(--vscode-agentsPanel-background, var(--vscode-sideBar-background))');
	container.style.setProperty('--session-view-foreground', 'var(--vscode-agentsPanel-foreground, var(--vscode-sideBar-foreground))');
	container.style.backgroundColor = 'var(--session-view-background)';

	let headerHost = container;
	if (withBackground) {
		container.classList.add('agent-sessions-workbench');
		const sessionsPart = document.createElement('div');
		sessionsPart.classList.add('part', 'sessionspart', 'sessions-chat-surface', 'has-chat-background');
		sessionsPart.style.backgroundImage = 'linear-gradient(135deg, var(--vscode-editor-background), var(--vscode-textLink-foreground))';
		container.appendChild(sessionsPart);
		headerHost = sessionsPart;
	}

	const header = disposableStore.add(instantiationService.createInstance(SessionHeader));
	header.setSession(testPaneContentOf(session, () => { }));
	headerHost.appendChild(header.element);
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	SessionHeader_Default: defineComponentFixture({
		render: ctx => renderHeader(ctx, createMockSession({ title: 'Fix login bug' })),
	}),
	SessionHeader_Background: defineComponentFixture({
		render: ctx => renderHeader(ctx, createMockSession({ title: 'Fix login bug' }), true),
	}),
	SessionHeader_InProgress: defineComponentFixture({
		render: ctx => renderHeader(ctx, createMockSession({
			title: 'Investigate flaky test',
			status: SessionStatus.InProgress,
		})),
	}),
	SessionHeader_NeedsInput: defineComponentFixture({
		render: ctx => renderHeader(ctx, createMockSession({
			title: 'Update documentation',
			status: SessionStatus.NeedsInput,
		})),
	}),
	SessionHeader_LongTitle: defineComponentFixture({
		render: ctx => renderHeader(ctx, createMockSession({
			title: 'Investigate and fix the flaky integration test in the notebook editor viewport rendering pipeline',
		})),
	}),
});
