/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { getSessionsUnattendedRestartBlocker } from '../../browser/sessionsUnattendedRestart.js';

suite('getSessionsUnattendedRestartBlocker', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function session(environment: string, status: SessionStatus): ISession {
		return upcastPartial<ISession>({ environment, status: observableValue('status', status) });
	}

	test('blocks on sessions that a restart would interrupt', () => {
		assert.deepStrictEqual({
			none: getSessionsUnattendedRestartBlocker([], []),
			notWorking: getSessionsUnattendedRestartBlocker([], [session('local', SessionStatus.Untitled), session('local', SessionStatus.Completed), session('local', SessionStatus.Error)]),
			working: getSessionsUnattendedRestartBlocker([], [session('local', SessionStatus.InProgress)]),
			waitingForInput: getSessionsUnattendedRestartBlocker([], [session('remote-host', SessionStatus.NeedsInput)]),
			workingInCloud: getSessionsUnattendedRestartBlocker([], [session('cloud', SessionStatus.InProgress)]),
			starting: getSessionsUnattendedRestartBlocker([session('cloud', SessionStatus.Untitled)], []),
		}, {
			none: undefined,
			notWorking: undefined,
			working: 'agents.sessionInProgress',
			waitingForInput: 'agents.sessionInProgress',
			workingInCloud: undefined,
			starting: 'agents.requestInProgress',
		});
	});
});
