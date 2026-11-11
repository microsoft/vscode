/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { getClientArea } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { SessionsPart } from '../../../workbench/browser/parts/sessions/sessionsPart.js';
import { SessionsGridContent } from '../../../workbench/contrib/sessions/browser/parts/sessionsGridContent.js';
import { MobileSessionsPart } from './mobile/mobileSessionsPart.js';
import { SessionView } from '../../../workbench/contrib/sessions/browser/parts/sessionView.js';
import { assertReturnsDefined } from '../../../base/common/types.js';
import { ISession } from '../../../workbench/services/sessions/common/session.js';
import { IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { ISessionGridSlot, ISessionsPartService, IToggleMaximizeSessionEvent, SessionGridRequest } from '../../../workbench/services/sessions/browser/sessionsPartService.js';
import { Direction } from '../../../base/browser/ui/grid/grid.js';
import { IAgentWorkbenchLayoutService } from '../workbench.js';
import { createMainWindowInstantiationService, ISessionHost } from '../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionGridPane } from '../../../workbench/services/sessions/browser/sessionGridPane.js';

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
	/** The session grid the main part shows. */
	private readonly _mainContent: SessionsGridContent;

	private readonly _onDidToggleMaximizeSession = this._register(new Emitter<IToggleMaximizeSessionEvent>());
	readonly onDidToggleMaximizeSession: Event<IToggleMaximizeSessionEvent> = this._onDidToggleMaximizeSession.event;

	get onDidFocusPane(): Event<string> {
		return this._mainContent.onDidFocusPane;
	}

	get shownChatCount() {
		return this._mainContent.shownChatCount;
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
		this._mainPart = this._register(mainWindowInstantiationService.createInstance(isPhoneLayout ? MobileSessionsPart : SessionsPart, SessionsGridContent.ID));
		this._mainContent = assertReturnsDefined(this._mainPart.getContent(SessionsGridContent));
	}

	updatePanes(panes: readonly ISessionGridPane[], activePane: ISessionGridPane | undefined, slots?: readonly ISessionGridSlot[], request?: SessionGridRequest): void {
		this._mainContent.updatePanes(panes, activePane, slots, request);
	}


	getGridLayout() { return this._mainContent.getGridLayout(); }
	getPaneAtPosition(index: number) { return this._mainContent.getPaneAtPosition(index); }
	getNeighborPane(pane: ISessionGridPane, direction: Direction) { return this._mainContent.getNeighborPane(pane, direction); }
	getViewOfPane(pane: ISessionGridPane) { return this._mainContent.getViewOfPane(pane); }
	getSessionPlacement(sessionId: string) { return this._mainContent.getSessionPlacement(sessionId); }
	resizeSession(sessionId: string | undefined, direction: Direction, amount: number): void { this._mainContent.resizeSession(sessionId, direction, amount); }
	resizePane(pane: ISessionGridPane, direction: Direction, amount: number): void { this._mainContent.resizePane(pane, direction, amount); }
	get onDidInteractWithGrid(): Event<void> { return this._mainContent.onDidInteractWithGrid; }

	setContentVisible(visible: boolean): void {
		this._mainPart.setContentVisible(visible);
	}

	toggleMaximizePane(pane: ISessionGridPane): void {
		const maximized = this._mainContent.toggleMaximizePane(pane);
		const session = pane.session.get();
		if (maximized !== undefined && session) {
			this._onDidToggleMaximizeSession.fire({ session, maximized });
		}
	}

	focusNewSessionSlot(): void {
		this._mainContent.focusNewSessionSlot();
	}

	focusPane(pane: ISessionGridPane): void {
		this._mainContent.focusPane(pane.id);
	}

	getSessionView(session: string | ISession | undefined): SessionView | undefined {
		const sessionId = typeof session === 'object' ? session.sessionId : session;
		return this._mainContent.getSessionView(sessionId);
	}

	getFocusedSessionView(): SessionView | undefined {
		return this._mainContent.getFocusedSessionView();
	}

	focusViewOfHost(host: ISessionHost): void {
		this._mainContent.focusViewOfHost(host);
	}

	getActiveSessionView(): SessionView | undefined {
		return this._mainContent.getActiveSessionView();
	}

	getSessionViewOfHost(host: ISessionHost): SessionView | undefined {
		return this._mainContent.getSessionViewOfHost(host);
	}

	getPaneIdOfHost(host: ISessionHost): string | undefined {
		return this._mainContent.getPaneIdOfHost(host);
	}

	getProgressIndicator(): IProgressIndicator {
		return this._mainPart.getProgressIndicator();
	}
}

registerSingleton(ISessionsPartService, SessionsParts, InstantiationType.Eager);
