/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { getClientArea } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { SessionsPart } from './sessionsPart.js';
import { MobileSessionsPart } from './mobile/mobileSessionsPart.js';
import { SessionView } from './sessionView.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { autorun } from '../../../base/common/observable.js';
import { IProgressIndicator } from '../../../platform/progress/common/progress.js';
import { Emitter, Event } from '../../../base/common/event.js';

export const ISessionsPartService = createDecorator<ISessionsPartService>('sessionsPartService');

/**
 * Payload for {@link ISessionsPartService.onDidToggleMaximizeSession}.
 */
export interface IToggleMaximizeSessionEvent {
	readonly session: IActiveSession;
	/** The session view's maximized state after the toggle. */
	readonly maximized: boolean;
}

export interface ISessionsPartService {
	readonly _serviceBrand: undefined;

	/**
	 * Wires the part to the {@link ISessionsManagementService} so that changes to
	 * the active session are reflected in the UI. Must be called after the part
	 * has been added to the DOM via {@link SessionsPart.create}.
	 */
	init(): void;

	/**
	 * Toggles the maximized state of the session view hosting the given session
	 * in the sessions part's grid.
	 */
	toggleMaximizeSession(session: IActiveSession | undefined): void;

	/**
	 * Fires after the maximized state of a session view was toggled via
	 * {@link toggleMaximizeSession}. Does not fire when the call was a no-op
	 * (e.g. the session was not visible or fewer than two views were present).
	 */
	readonly onDidToggleMaximizeSession: Event<IToggleMaximizeSessionEvent>;

	/**
	 * Moves keyboard focus into the chat input of the session view hosting the
	 * given session, or into the placeholder (new-session) view when `session`
	 * is `undefined`. No-op if no matching slot is currently mounted.
	 */
	focusSession(session: IActiveSession | undefined): void;

	/**
	 * Returns the {@link SessionView} hosting the given session id, or the
	 * placeholder (new-session) view when `sessionId` is `undefined`. Returns
	 * `undefined` if no matching slot is currently mounted in the grid.
	 */
	getSessionView(sessionId: string | undefined): SessionView | undefined;

	/**
	 * Returns the progress indicator for the sessions part, which drives the
	 * progress bar shown at the top of the part's content area.
	 */
	getProgressIndicator(): IProgressIndicator;
}

/**
 * Owns the lifecycle of the {@link SessionsPart}. Selects the mobile vs. desktop
 * variant based on viewport width at construction time. Registered as an eager
 * singleton so the part registers itself with the workbench layout service
 * before the workbench starts laying out parts.
 */
export class SessionsParts extends Disposable implements ISessionsPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _mainPart: SessionsPart;

	private readonly _onDidToggleMaximizeSession = this._register(new Emitter<IToggleMaximizeSessionEvent>());
	readonly onDidToggleMaximizeSession: Event<IToggleMaximizeSessionEvent> = this._onDidToggleMaximizeSession.event;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService
	) {
		super();

		const { width } = getClientArea(mainWindow.document.body);
		const isPhoneLayout = width < 640;

		this._mainPart = this._register(instantiationService.createInstance(isPhoneLayout ? MobileSessionsPart : SessionsPart));
	}

	init(): void {
		// Reflect changes to the visible-sessions model in the grid. Active session
		// is read from the same autorun so the part can mark the active slot in a
		// single reconciliation pass.
		this._register(autorun(reader => {
			const visible = this.sessionsManagementService.visibleSessions.read(reader);
			const active = this.sessionsManagementService.activeSession.read(reader);
			this._mainPart.updateVisibleSessions(visible, active);
		}));

		// When a session view in the grid receives focus, promote that session to
		// the active session. The id is guaranteed to correspond to a session in
		// the visibility model (the part only fires for non-placeholder slots).
		this._register(this._mainPart.onDidFocusSession(sessionId => {
			const session = this.sessionsManagementService.visibleSessions.get().find(s => s?.sessionId === sessionId);
			if (session) {
				this.sessionsManagementService.setActive(session);
			}
		}));
	}

	toggleMaximizeSession(session: IActiveSession | undefined): void {
		if (!session) {
			this._mainPart.toggleMaximizeSession(undefined);
			return;
		}
		const maximized = this._mainPart.toggleMaximizeSession(session.sessionId);
		if (maximized !== undefined) {
			this._onDidToggleMaximizeSession.fire({ session, maximized });
		}
	}

	focusSession(session: IActiveSession | undefined): void {
		this._mainPart.getSessionView(session?.sessionId)?.focus();
	}

	getSessionView(sessionId: string | undefined): SessionView | undefined {
		return this._mainPart.getSessionView(sessionId);
	}

	getProgressIndicator(): IProgressIndicator {
		return this._mainPart.getProgressIndicator();
	}
}

registerSingleton(ISessionsPartService, SessionsParts, InstantiationType.Eager);
