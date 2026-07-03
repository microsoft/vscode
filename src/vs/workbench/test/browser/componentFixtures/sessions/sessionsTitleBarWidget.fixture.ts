/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { IObservable, constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
// eslint-disable-next-line local/code-import-patterns
import { ISession, ISessionWorkspace } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsProvidersService } from '../../../../../sessions/services/sessions/browser/sessionsProvidersService.js';
// eslint-disable-next-line local/code-import-patterns
import { IBlockedSessionsService } from '../../../../../sessions/contrib/blockedSessions/browser/blockedSessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionActionFeedback } from '../../../../../sessions/contrib/sessions/browser/sessionActionFeedback.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionsTitleBarWidget } from '../../../../../sessions/contrib/sessions/browser/sessionsTitleBarWidget.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockActiveSession(title: string, workspaceLabel: string): IActiveSession {
	const workspace = new class extends mock<ISessionWorkspace>() {
		override readonly label = workspaceLabel;
	}();
	return new class extends mock<IActiveSession>() {
		override readonly icon = Codicon.copilot;
		override readonly title: IObservable<string> = constObservable(title);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(workspace);
		override readonly isQuickChat: IObservable<boolean> = constObservable<boolean>(false);
	}();
}

interface ITitleBarState {
	/** The active session shown in the default pill (falls back to "New Session"). */
	activeSession?: IActiveSession;
	/** Number of blocked sessions (drives the orange "N sessions require input"). */
	blockedCount?: number;
	/** Whether the primary side bar is visible (requires-input only shows when hidden). */
	sidebarVisible?: boolean;
	/** Number of recently approved sessions (drives the green "Approved N sessions"). */
	approvedCount?: number;
}

// ============================================================================
// Render helper
// ============================================================================

function renderTitleBar(ctx: ComponentFixtureContext, state: ITitleBarState): void {
	const { container, disposableStore } = ctx;

	// Only the count is read for the requires-input state, so a shared filler is fine.
	const blockedFiller = new class extends mock<ISession>() { }();
	const blocked: readonly ISession[] = Array.from({ length: state.blockedCount ?? 0 }, () => blockedFiller);
	const sidebarVisible = state.sidebarVisible ?? true;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(state.activeSession);
				override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = constObservable<readonly (IActiveSession | undefined)[]>([]);
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = Event.None;
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
			}());
			reg.defineInstance(IBlockedSessionsService, new class extends mock<IBlockedSessionsService>() {
				override readonly blockedSessions: IObservable<readonly ISession[]> = constObservable(blocked);
			}());
			reg.defineInstance(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
				override readonly onDidChangePartVisibility = Event.None;
				override isVisible(part: Parts): boolean {
					return part === Parts.SIDEBAR_PART ? sidebarVisible : true;
				}
			}());
		},
	});

	// The widget's pill styles are scoped under `.command-center`, so recreate
	// that ancestor. The command center box sizes itself relative to the
	// viewport, so give the host a representative width.
	container.classList.add('agent-sessions-workbench');
	container.style.width = '460px';
	const commandCenter = append(container, $('.command-center'));
	const widgetHost = append(commandCenter, $('div'));

	const action = new class extends mock<SubmenuItemAction>() {
		override readonly id = 'workbench.agentSessions.titlebar';
		override readonly label = 'Agent Sessions';
		override readonly tooltip = '';
		override readonly enabled = true;
		override async run() { }
	}();

	const sessionActionFeedback = new class extends mock<SessionActionFeedback>() {
		override readonly approvedCount: IObservable<number> = constObservable<number>(state.approvedCount ?? 0);
		override notifyApproved(): void { }
	}();

	const widget = disposableStore.add(instantiationService.createInstance(SessionsTitleBarWidget, action, undefined, sessionActionFeedback));
	widget.render(widgetHost);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	// Default: shows the active session pill (icon + title + workspace).
	SessionsTitleBar_ActiveSession: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
		}),
	}),

	// Requires-input: orange state when the side bar is hidden and sessions are blocked.
	SessionsTitleBar_RequiresInput: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			blockedCount: 3,
			sidebarVisible: false,
		}),
	}),

	// Approved (one): transient green confirmation after approving a session action.
	SessionsTitleBar_ApprovedOne: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			approvedCount: 1,
		}),
	}),

	// Approved (many): green confirmation after approving several sessions in a row.
	// Takes precedence over the orange requires-input state while visible.
	SessionsTitleBar_ApprovedMany: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
			blockedCount: 3,
			sidebarVisible: false,
			approvedCount: 3,
		}),
	}),
});
