/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { getClientArea } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { SessionsPart } from '../../../workbench/contrib/sessions/browser/parts/sessionsPart.js';
import { MobileSessionsPart } from './mobile/mobileSessionsPart.js';
import { SessionView } from '../../../workbench/contrib/sessions/browser/parts/sessionView.js';
import { ISession } from '../../../workbench/contrib/sessions/common/session.js';
import { IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ISessionGridSlot, ISessionsPartService, IToggleMaximizeSessionEvent, SessionGridRequest } from '../../../workbench/contrib/sessions/browser/sessionsPartService.js';
import { Direction } from '../../../base/browser/ui/grid/grid.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';
import { createMainWindowInstantiationService, ISessionHost } from '../../../workbench/contrib/sessions/browser/sessionHost.js';
import { ISessionGridPane } from '../../../workbench/contrib/sessions/browser/sessionGridPane.js';

/**
 * Owns the lifecycle of the {@link SessionsPart}. Selects the mobile vs. desktop
 * variant from the layout service's viewport class at construction time. Registered
 * as an eager singleton so the part registers itself with the workbench layout service
 * before the workbench starts laying out parts.
 *
 * The part is a passive renderer: the {@link ISessionsService} drives the
 * grid via {@link updatePanes}/{@link focusPane} and listens to
 * {@link onDidFocusPane}. The part observes neither the model nor the view.
 */
export class SessionsParts extends Disposable implements ISessionsPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _mainPart: SessionsPart;

	private readonly _onDidToggleMaximizeSession = this._register(new Emitter<IToggleMaximizeSessionEvent>());
	readonly onDidToggleMaximizeSession: Event<IToggleMaximizeSessionEvent> = this._onDidToggleMaximizeSession.event;

	get onDidFocusPane(): Event<string> {
		return this._mainPart.onDidFocusPane;
	}

	get shownChatCount() {
		return this._mainPart.shownChatCount;
	}

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
	) {
		super();

		const isPhoneLayout = layoutService.initialViewportClass
			? layoutService.initialViewportClass === 'phone'
			: getClientArea(mainWindow.document.body).width < 640;

		const mainWindowInstantiationService = this._register(createMainWindowInstantiationService(instantiationService));
		this._mainPart = this._register(mainWindowInstantiationService.createInstance(isPhoneLayout ? MobileSessionsPart : SessionsPart));
	}

	updatePanes(panes: readonly ISessionGridPane[], activePane: ISessionGridPane | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest): void {
		this._mainPart.updatePanes(panes, activePane, slots, request);
	}


	getGridLayout() { return this._mainPart.getGridLayout(); }
	getPaneAtPosition(index: number) { return this._mainPart.getPaneAtPosition(index); }
	getNeighborPane(pane: ISessionGridPane, direction: Direction) { return this._mainPart.getNeighborPane(pane, direction); }
	getViewOfPane(pane: ISessionGridPane) { return this._mainPart.getViewOfPane(pane); }
	getSessionPlacement(sessionId: string) { return this._mainPart.getSessionPlacement(sessionId); }
	resizeSession(sessionId: string | undefined, direction: Direction, amount: number): void { this._mainPart.resizeSession(sessionId, direction, amount); }
	resizePane(pane: ISessionGridPane, direction: Direction, amount: number): void { this._mainPart.resizePane(pane, direction, amount); }
	get onDidInteractWithGrid(): Event<void> { return this._mainPart.onDidInteractWithGrid; }

	setContentVisible(visible: boolean): void {
		this._mainPart.setContentVisible(visible);
	}

	toggleMaximizePane(pane: ISessionGridPane): void {
		const maximized = this._mainPart.toggleMaximizePane(pane);
		const session = pane.session.get();
		if (maximized !== undefined && session) {
			this._onDidToggleMaximizeSession.fire({ session, maximized });
		}
	}

	focusNewSessionSlot(): void {
		this._mainPart.focusNewSessionSlot();
	}

	focusPane(pane: ISessionGridPane): void {
		this._mainPart.focusPane(pane.id);
	}

	getSessionView(session: string | ISession | undefined): SessionView | undefined {
		const sessionId = typeof session === 'object' ? session.sessionId : session;
		return this._mainPart.getSessionView(sessionId);
	}

	getFocusedSessionView(): SessionView | undefined {
		return this._mainPart.getFocusedSessionView();
	}

	focusViewOfHost(host: ISessionHost): void {
		this._mainPart.focusViewOfHost(host);
	}

	getActiveSessionView(): SessionView | undefined {
		return this._mainPart.getActiveSessionView();
	}

	getSessionViewOfHost(host: ISessionHost): SessionView | undefined {
		return this._mainPart.getSessionViewOfHost(host);
	}

	getPaneIdOfHost(host: ISessionHost): string | undefined {
		return this._mainPart.getPaneIdOfHost(host);
	}

	getProgressIndicator(): IProgressIndicator {
		return this._mainPart.getProgressIndicator();
	}
}

registerSingleton(ISessionsPartService, SessionsParts, InstantiationType.Eager);
