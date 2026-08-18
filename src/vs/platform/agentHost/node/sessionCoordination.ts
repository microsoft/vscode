/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type ISessionOrchestration, SessionStatus } from '../common/state/sessionState.js';

export interface ISessionCoordinationTransition {
	readonly orchestration?: ISessionOrchestration;
	readonly notify: boolean;
}

export function transitionSessionCoordination(status: SessionStatus, orchestration: ISessionOrchestration): ISessionCoordinationTransition {
	if (!orchestration.notifyOnIdle) {
		return { notify: false };
	}

	const inProgress = (status & SessionStatus.InProgress) === SessionStatus.InProgress
		&& (status & SessionStatus.Error) !== SessionStatus.Error;
	if (inProgress) {
		if (!orchestration.notificationArmed && !(orchestration.notifyOnIdle === 'once' && orchestration.notificationSent)) {
			return { orchestration: { ...orchestration, notificationArmed: true }, notify: false };
		}
		return { notify: false };
	}

	const completed = (status & SessionStatus.Idle) === SessionStatus.Idle
		|| (status & SessionStatus.Error) === SessionStatus.Error;
	if (!completed || !orchestration.notificationArmed || (orchestration.notifyOnIdle === 'once' && orchestration.notificationSent)) {
		return { notify: false };
	}

	return {
		orchestration: {
			...orchestration,
			notificationArmed: false,
			notificationSent: true,
		},
		notify: true,
	};
}
