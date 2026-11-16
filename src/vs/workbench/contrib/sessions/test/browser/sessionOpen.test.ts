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
		let lookups = 0;
		const sessionChanged = disposables.add(new Emitter<readonly ISessionChange[]>());
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			onDidChangeSession: sessionChanged.event,
			getSession: resource => { lookups++; return known.find(session => isEqual(session.resource, resource)); },
		});
		const sessionsProvidersService = upcastPartial<ISessionsProvidersService>({ onDidChangeProviders: Event.None });
		return { known, sessionChanged, sessionsManagementService, sessionsProvidersService, lookups: () => lookups };
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

	test('looks the session up only as it changes itself, not as another session changes', () => runWithFakedTimers({}, async () => {
		const { known, sessionChanged, sessionsManagementService, sessionsProvidersService, lookups } = create();
		const waited = buildTestSession({ id: 'waited', title: 'Waited' }).session;
		const other = buildTestSession({ id: 'other', title: 'Other' }).session;
		const cts = disposables.add(new CancellationTokenSource());

		const found = waitForSession(sessionsManagementService, sessionsProvidersService, waited.resource, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		const beforeChanges = lookups();
		sessionChanged.fire([{ session: other, kind: 'changed' }]);
		const afterOtherChanged = lookups() - beforeChanges;
		known.push(waited);
		sessionChanged.fire([{ session: other, kind: 'changed' }, { session: waited, kind: 'added' }]);

		assert.deepStrictEqual({ afterOtherChanged, found: await found }, { afterOtherChanged: 0, found: waited });
	}));

	test('looks the session up again as a provider asks to read every session again, such as as its sessions\' visibility changes', () => runWithFakedTimers({}, async () => {
		const { known, sessionChanged, sessionsManagementService, sessionsProvidersService } = create();
		const hidden = buildTestSession({ id: 'hidden', title: 'Hidden' }).session;
		const cts = disposables.add(new CancellationTokenSource());

		const start = Date.now();
		const found = waitForSession(sessionsManagementService, sessionsProvidersService, hidden.resource, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		await timeout(10);
		known.push(hidden);
		sessionChanged.fire([]);

		assert.deepStrictEqual({ found: await found, beforeTimeout: Date.now() - start < SESSION_OPEN_WAIT_TIMEOUT, listening: sessionChanged.hasListeners() }, { found: hidden, beforeTimeout: true, listening: false });
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
