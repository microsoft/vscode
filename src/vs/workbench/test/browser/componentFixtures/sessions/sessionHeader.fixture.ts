/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionHeader } from '../../../../../sessions/browser/parts/sessionHeader.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsListModelService } from '../../../../../sessions/services/sessions/browser/sessionsListModelService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionCapabilities, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/browser/parts/media/chatCompositeBar.css';

interface IMockSessionOptions {
	readonly title: string;
	readonly status?: SessionStatus;
	readonly isArchived?: boolean;
	readonly supportsRename?: boolean;
}

function createMockSession(options: IMockSessionOptions): IActiveSession {
	const capabilities: ISessionCapabilities = {
		supportsMultipleChats: false,
		supportsRename: options.supportsRename ?? true,
	};

	return new class extends mock<IActiveSession>() {
		override readonly sessionId = `local:${options.title}`;
		override readonly resource = URI.parse(`vscode-session://session/${Math.random().toString(36).slice(2)}`);
		override readonly capabilities = constObservable(capabilities);
		override readonly title: IObservable<string> = constObservable(options.title);
		override readonly status: IObservable<SessionStatus> = constObservable(options.status ?? SessionStatus.Completed);
		override readonly isArchived: IObservable<boolean> = constObservable(options.isArchived ?? false);
		override readonly isRead: IObservable<boolean> = constObservable(true);
		override readonly isCreated: IObservable<boolean> = constObservable(true);
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

function renderHeader(ctx: ComponentFixtureContext, session: IActiveSession): void {
	const { container, disposableStore } = ctx;
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(ISessionsListModelService, createMockListModelService());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = Event.None;
				override async renameSession() { }
			}());
		},
	});

	container.style.width = '420px';
	container.style.setProperty('--session-view-background', 'var(--vscode-agentsPanel-background, var(--vscode-sideBar-background))');
	container.style.setProperty('--session-view-foreground', 'var(--vscode-agentsPanel-foreground, var(--vscode-sideBar-foreground))');
	container.style.backgroundColor = 'var(--session-view-background)';

	const header = disposableStore.add(instantiationService.createInstance(SessionHeader));
	header.setSession(session);
	container.appendChild(header.element);
}

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	SessionHeader_Default: defineComponentFixture({
		render: ctx => renderHeader(ctx, createMockSession({ title: 'Fix login bug' })),
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
