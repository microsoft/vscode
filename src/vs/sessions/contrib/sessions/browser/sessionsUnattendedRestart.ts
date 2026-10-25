/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { IUnattendedRestartService } from '../../../../workbench/services/lifecycle/common/unattendedRestart.js';
import { isActiveSessionStatus, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Returns why agent sessions block an unattended restart: a restart interrupts sessions that
 * are working or waiting for input, also when archived, except in the cloud where they keep running.
 */
export function getSessionsUnattendedRestartBlocker(inFlightNewSessionRequests: readonly ISession[], sessions: readonly ISession[]): string | undefined {
	if (inFlightNewSessionRequests.length > 0) {
		return 'agents.requestInProgress';
	}

	if (sessions.some(session => session.environment !== 'cloud' && isActiveSessionStatus(session.status.get()))) {
		return 'agents.sessionInProgress';
	}

	return undefined;
}

export class SessionsUnattendedRestartParticipant extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'sessions.contrib.unattendedRestartParticipant';

	constructor(
		@IUnattendedRestartService unattendedRestartService: IUnattendedRestartService,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
	) {
		super();

		this._register(unattendedRestartService.registerParticipant({
			check: () => getSessionsUnattendedRestartBlocker(sessionsManagementService.getInFlightNewSessionRequests(), sessionsManagementService.getSessions())
		}));
	}
}
