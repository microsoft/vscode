/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { getClientArea } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { SessionsPart } from './sessionsPart.js';
import { MobileSessionsPart } from './mobile/mobileSessionsPart.js';
import { SessionView } from './sessionView.js';
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { autorun, observableValue } from '../../../base/common/observable.js';
import { disposableTimeout } from '../../../base/common/async.js';
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
	 * the visible and active sessions are reflected in the UI (including moving
	 * focus into the active session when it changes). Must be called after the
	 * part has been added to the DOM via {@link SessionsPart.create}.
	 */
	init(): void;

	/**
	 * Marks the start of the on-startup session restore. While restoring, the
	 * part suppresses the empty new-session view so it does not flash before the
	 * persisted sessions are laid out. The workbench brackets its call to
	 * {@link ISessionsManagementService.restoreVisibleSessions} with this and
	 * {@link endSessionRestore}. A safety timeout ensures the new-session view is
	 * never suppressed indefinitely if a persisted session never resurfaces.
	 */
	beginSessionRestore(): void;

	/**
	 * Marks the end of the on-startup session restore (see
	 * {@link beginSessionRestore}), allowing the empty new-session view to show.
	 */
	endSessionRestore(): void;

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

	/**
	 * `true` while the on-startup restore is in progress. View-owned UI state
	 * used to suppress the empty new-session view until the restored sessions
	 * are laid out (see {@link beginSessionRestore}).
	 */
	private readonly _restoring = observableValue<boolean>(this, false);

	/** Safety net so the new-session view is never suppressed indefinitely. */
	private readonly _restoreSuppressTimeout = this._register(new MutableDisposable<IDisposable>());

	/**
	 * Session id (or `undefined` for the new-session slot) that focus was last
	 * moved into in response to an active-session change. Tracks the active id
	 * so unrelated visibility updates don't re-focus and steal focus.
	 */
	private _focusedActiveSessionId: string | undefined;

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
			const restoring = this._restoring.read(reader);
			this._mainPart.updateVisibleSessions(visible, active, restoring);

			// Move keyboard focus into the active session whenever it changes
			// (e.g. after opening, switching to, or restoring a session) so the
			// user can start typing immediately. This is done after the grid has
			// reconciled above so the target slot exists. The focus is guarded so
			// a session the user is already interacting with is never re-focused
			// (which would steal focus from the clicked element), and the id check
			// ensures unrelated visibility updates do not move focus.
			const activeId = active?.sessionId;
			if (activeId !== this._focusedActiveSessionId) {
				this._focusedActiveSessionId = activeId;
				this._mainPart.focusSessionIfNotFocused(activeId);
			}
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

	beginSessionRestore(): void {
		this._restoring.set(true, undefined);
		// Never suppress the new-session view forever if a persisted session
		// never resurfaces (e.g. it was deleted while the window was closed).
		this._restoreSuppressTimeout.value = disposableTimeout(() => this._restoring.set(false, undefined), 5000);
	}

	endSessionRestore(): void {
		this._restoreSuppressTimeout.clear();
		this._restoring.set(false, undefined);
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
		this._mainPart.focusSession(session?.sessionId);
	}

	getSessionView(sessionId: string | undefined): SessionView | undefined {
		return this._mainPart.getSessionView(sessionId);
	}

	getProgressIndicator(): IProgressIndicator {
		return this._mainPart.getProgressIndicator();
	}
}

registerSingleton(ISessionsPartService, SessionsParts, InstantiationType.Eager);
