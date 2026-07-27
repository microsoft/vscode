/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import type { SessionView } from '../../../browser/parts/sessionView.js';
import { IActiveSession } from '../common/sessionsManagement.js';
import { IProgressIndicator } from '../../../../platform/progress/common/progress.js';
import { Event } from '../../../../base/common/event.js';

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
	 * Reconciles the part's grid so it renders exactly the given visible
	 * sessions (and active session). Called by the view service whenever the
	 * visible sessions or active session change. The part is a passive renderer:
	 * it does not observe the model itself.
	 */
	updateVisibleSessions(visible: readonly (IActiveSession | undefined)[], active: IActiveSession | undefined): void;

	/**
	 * Fires with the session id of a grid slot that received keyboard focus. The
	 * view service listens to promote that session to the active session. Only
	 * fires for non-placeholder slots.
	 */
	readonly onDidFocusSession: Event<string>;

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

	/**
	 * Shows the automations management page in the active (or first) session slot.
	 */
	showAutomationsPage(): void;
}
