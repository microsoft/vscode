/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionRunner, IAction } from '../../../../base/common/actions.js';
import { ISessionsService } from './sessionsService.js';
import { ISession } from '../common/session.js';
import { IActiveSession } from '../common/sessionsManagement.js';

/** Activates the originating session before running a session-scoped action. */
export class SessionActivatingActionRunner extends ActionRunner {

	constructor(
		private readonly _getSession: () => ISession | undefined,
		private readonly _sessionsService: ISessionsService,
	) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		const session = this._getSession();
		if (session) {
			activateSessionPane(this._sessionsService, session);
		}
		await super.runAction(action, context);
	}
}

/**
 * Makes the pane of the grid that shows `session` the active pane: the pane of the grid's view of it, else the first pane
 * that shows the session. No-op when no pane of the grid shows it, or when another surface, such as a chat window, shows
 * the chat of its pane.
 */
export function activateSessionPane(sessionsService: ISessionsService, session: ISession): void {
	// Transitional: the grid's and the chat windows' views of a session, until views take their pane.
	if (isActiveSession(session)) {
		sessionsService.setActive(session);
		return;
	}
	const pane = sessionsService.panes.get().find(candidate => candidate.session.get() === session);
	if (pane) {
		sessionsService.activatePane(pane);
	}
}

function isActiveSession(session: ISession): session is IActiveSession {
	return 'activeChat' in session;
}
