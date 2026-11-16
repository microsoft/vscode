/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SESSION_OPEN_WAIT_TIMEOUT, waitForSession } from '../../browser/sessionOpen.js';
import { ISessionsProvidersService } from '../../browser/sessionsProvidersService.js';
import { ISessionChange, ISessionsManagementService } from '../../common/sessionsManagement.js';
import { buildTestSession } from '../common/testSessionBuilder.js';

suite('waitForSession', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function create() {
		const known: ISession[] = [];
		const sessionChanged = disposables.add(new Emitter<readonly ISessionChange[]>());
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			onDidChangeSession: sessionChanged.event,
			getSession: resource => known.find(session => isEqual(session.resource, resource)),
		});
		const sessionsProvidersService = upcastPartial<ISessionsProvidersService>({ onDidChangeProviders: Event.None });
		return { known, sessionChanged, sessionsManagementService, sessionsProvidersService };
	}

	test('finds a session that its provider does not list, such as of another folder, as soon as the provider knows it', () => runWithFakedTimers({}, async () => {
		const { known, sessionChanged, sessionsManagementService, sessionsProvidersService } = create();
		const elsewhere = buildTestSession({ id: 'elsewhere', title: 'Elsewhere' }).session;
		const cts = disposables.add(new CancellationTokenSource());

		const start = Date.now();
		const found = waitForSession(sessionsManagementService, sessionsProvidersService, elsewhere.resource, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		await timeout(10);
		known.push(elsewhere);
		// Not listed: only the change of the sessions the providers know reports it
		sessionChanged.fire([{ session: elsewhere, kind: 'added' }]);

		assert.deepStrictEqual({ found: await found, beforeTimeout: Date.now() - start < SESSION_OPEN_WAIT_TIMEOUT, listening: sessionChanged.hasListeners() }, { found: elsewhere, beforeTimeout: true, listening: false });
	}));

	test('ends at once, with no session, as it is cancelled, such as by a later open, and once the timeout passes', () => runWithFakedTimers({}, async () => {
		const { sessionChanged, sessionsManagementService, sessionsProvidersService } = create();
		const unknown = buildTestSession({ id: 'unknown', title: 'Unknown' }).session;
		const cts = disposables.add(new CancellationTokenSource());

		const start = Date.now();
		const cancelled = waitForSession(sessionsManagementService, sessionsProvidersService, unknown.resource, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		await timeout(10);
		cts.cancel();
		const cancelledResult = { found: await cancelled, early: Date.now() - start < SESSION_OPEN_WAIT_TIMEOUT };
		const timedOut = await waitForSession(sessionsManagementService, sessionsProvidersService, unknown.resource, disposables.add(new CancellationTokenSource()).token, SESSION_OPEN_WAIT_TIMEOUT);

		assert.deepStrictEqual({ cancelled: cancelledResult, timedOut, listening: sessionChanged.hasListeners() }, { cancelled: { found: undefined, early: true }, timedOut: undefined, listening: false });
	}));
});
