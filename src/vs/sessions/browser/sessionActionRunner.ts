/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ActionRunner, IAction } from '../../base/common/actions.js';
import { ISessionsService } from '../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../services/sessions/common/sessionsManagement.js';

/** Activates the originating session before running a session-scoped action. */
export class SessionActivatingActionRunner extends ActionRunner {

	constructor(
		private readonly _getSession: () => IActiveSession | undefined,
		private readonly _sessionsService: ISessionsService,
	) {
		super();
	}

	protected override async runAction(action: IAction, context?: unknown): Promise<void> {
		const session = this._getSession();
		if (session) {
			this._sessionsService.setActive(session);
		}
		await super.runAction(action, context);
	}
}
