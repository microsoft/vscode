/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $, append } from '../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IObservable, constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionWorkspace } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionsTitleBarWidget } from '../../../../../sessions/contrib/sessions/browser/sessionsTitleBarWidget.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// ============================================================================
// Mock helpers
// ============================================================================

function createMockActiveSession(title: string, workspaceLabel: string | undefined, isCreated = true): IActiveSession {
	const workspace = workspaceLabel === undefined ? undefined : new class extends mock<ISessionWorkspace>() {
		override readonly label = workspaceLabel;
	}();
	return new class extends mock<IActiveSession>() {
		override readonly icon = Codicon.copilot;
		override readonly title: IObservable<string> = constObservable(title);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(workspace);
		override readonly isQuickChat: IObservable<boolean> = constObservable<boolean>(false);
		override readonly isCreated: IObservable<boolean> = constObservable(isCreated);
	}();
}

interface ITitleBarState {
	readonly activeSession: IActiveSession;
}

// ============================================================================
// Render helper
// ============================================================================

function renderTitleBar(ctx: ComponentFixtureContext, state: ITitleBarState): void {
	const { container, disposableStore } = ctx;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: (reg) => {
			registerWorkbenchServices(reg);
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(state.activeSession);
				override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = constObservable<readonly (IActiveSession | undefined)[]>([]);
			}());
		},
	});

	// The widget's identity styles are scoped under `.command-center`, so recreate
	// that ancestor. The command center sizes itself relative to the
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

	const widget = disposableStore.add(instantiationService.createInstance(SessionsTitleBarWidget, action, undefined));
	widget.render(widgetHost);
}

// ============================================================================
// Fixtures
// ============================================================================

export default defineThemedFixtureGroup({ path: 'sessions/' }, {

	SessionsTitleBar_ActiveSession: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Fix authentication redirect loop', 'vscode'),
		}),
	}),

	SessionsTitleBar_LongTitle: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('Investigate authentication redirect behavior across desktop and web clients', 'vscode'),
		}),
	}),

	SessionsTitleBar_NewSession: defineComponentFixture({
		render: (ctx) => renderTitleBar(ctx, {
			activeSession: createMockActiveSession('', undefined, false),
		}),
	}),
});
