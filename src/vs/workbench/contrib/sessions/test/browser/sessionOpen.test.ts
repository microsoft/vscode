/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { SESSION_OPEN_WAIT_TIMEOUT, waitForSession, waitForSessionChat } from '../../browser/sessionOpen.js';
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

suite('waitForSessionChat', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function sessionWithChats(resource: string) {
		const mainChat = upcastPartial<IChat>({ resource: URI.parse(resource) });
		const chats = observableValue<readonly IChat[]>('chats', [mainChat]);
		const session = upcastPartial<ISession>({ resource: URI.parse(resource), mainChat: constObservable(mainChat), chats });
		return { session, chats };
	}

	function create(known: readonly ISession[]) {
		let lookups = 0;
		const sessionChanged = disposables.add(new Emitter<readonly ISessionChange[]>());
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSession: sessionChanged.event,
			getSession: resource => known.find(session => isEqual(session.resource, resource)),
			getSessionForChatResource: resource => {
				lookups++;
				for (const session of known) {
					const chat = session.chats.get().find(candidate => isEqual(candidate.resource, resource));
					if (chat) {
						return { session, chat };
					}
				}
				return undefined;
			},
		});
		return { sessionChanged, sessionsManagementService, lookups: () => lookups };
	}

	test('finds a peer chat that its session lists after the session is known, without a change of the session, and follows only that session', () => runWithFakedTimers({}, async () => {
		const a = sessionWithChats('agent-host-copilot:/a');
		const b = sessionWithChats('agent-host-copilot:/b');
		const { sessionChanged, sessionsManagementService, lookups } = create([a.session, b.session]);
		const peer = upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/a#peer') });
		const cts = disposables.add(new CancellationTokenSource());

		const found = waitForSessionChat(sessionsManagementService, peer.resource, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		await timeout(10);
		a.chats.set([a.session.mainChat.get(), peer], undefined);
		const result = await found;

		assert.deepStrictEqual({ session: result?.session === a.session, chat: result?.chat === peer, lookups: lookups(), listening: sessionChanged.hasListeners() }, { session: true, chat: true, lookups: 1, listening: false });
	}));

	test('finds a chat of a session as the session changes, also one its provider lists later, without looking every session up', () => runWithFakedTimers({}, async () => {
		const added = sessionWithChats('agent-host-copilot:/added');
		const { sessionChanged, sessionsManagementService, lookups } = create([]);
		const subagent = upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/subagent') });
		const cts = disposables.add(new CancellationTokenSource());

		const found = waitForSessionChat(sessionsManagementService, subagent.resource, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		sessionChanged.fire([{ session: added.session, kind: 'added' }]);
		await timeout(10);
		added.chats.set([added.session.mainChat.get(), subagent], undefined);
		const result = await found;

		assert.deepStrictEqual({ session: result?.session === added.session, lookups: lookups(), listening: sessionChanged.hasListeners() }, { session: true, lookups: 1, listening: false });
	}));

	test('looks the chat up again as a provider asks to read every session again, such as as its sessions\' visibility changes', () => runWithFakedTimers({}, async () => {
		const hidden = sessionWithChats('agent-host-copilot:/hidden');
		const known: ISession[] = [];
		const { sessionChanged, sessionsManagementService } = create(known);
		const cts = disposables.add(new CancellationTokenSource());

		const start = Date.now();
		const found = waitForSessionChat(sessionsManagementService, hidden.session.mainChat.get().resource, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		await timeout(10);
		known.push(hidden.session);
		sessionChanged.fire([]);
		const result = await found;

		assert.deepStrictEqual({ session: result?.session === hidden.session, beforeTimeout: Date.now() - start < SESSION_OPEN_WAIT_TIMEOUT, listening: sessionChanged.hasListeners() }, { session: true, beforeTimeout: true, listening: false });
	}));

	test('finds a chat by a former resource of its session, as the session that has it is added, as the canonical main chat or the chat of its fragment', () => runWithFakedTimers({}, async () => {
		const former = URI.parse('cloud-task:/former');
		const canonical = sessionWithChats('agent-host-copilot:/canonical');
		const peer = upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/canonical#peer') });
		canonical.chats.set([canonical.session.mainChat.get(), peer], undefined);
		const session: ISession = { ...canonical.session, previousIdentities: [{ sessionId: 'former', resource: former }] };
		const { sessionChanged, sessionsManagementService } = create([]);
		const cts = disposables.add(new CancellationTokenSource());

		const start = Date.now();
		const main = waitForSessionChat(sessionsManagementService, former, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		const ofFragment = waitForSessionChat(sessionsManagementService, former.with({ fragment: 'peer' }), cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		await timeout(10);
		sessionChanged.fire([{ session, kind: 'added' }]);
		const [mainResult, fragmentResult] = await Promise.all([main, ofFragment]);

		assert.deepStrictEqual({
			main: mainResult?.session === session && mainResult.chat === canonical.session.mainChat.get(),
			ofFragment: fragmentResult?.session === session && fragmentResult.chat === peer,
			beforeTimeout: Date.now() - start < SESSION_OPEN_WAIT_TIMEOUT,
			listening: sessionChanged.hasListeners(),
		}, { main: true, ofFragment: true, beforeTimeout: true, listening: false });
	}));

	test('finds a chat by a former resource that a session it follows gains later, as only the session\'s change reports it, not its chats', () => runWithFakedTimers({}, async () => {
		const former = URI.parse('cloud-task:/former');
		const canonical = sessionWithChats('agent-host-copilot:/canonical');
		// Its former resources come with its metadata, which no observable of it reports
		const metadata: { previousIdentities?: ISession['previousIdentities'] } = {};
		const session: ISession = Object.create(canonical.session, { previousIdentities: { get: () => metadata.previousIdentities } });
		const { sessionChanged, sessionsManagementService } = create([]);
		const cts = disposables.add(new CancellationTokenSource());

		const start = Date.now();
		const found = waitForSessionChat(sessionsManagementService, former, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		sessionChanged.fire([{ session, kind: 'added' }]);
		await timeout(10);
		metadata.previousIdentities = [{ sessionId: 'former', resource: former }];
		sessionChanged.fire([{ session, kind: 'changed' }]);
		const result = await found;

		assert.deepStrictEqual({ main: result?.session === session && result.chat === canonical.session.mainChat.get(), beforeTimeout: Date.now() - start < SESSION_OPEN_WAIT_TIMEOUT, listening: sessionChanged.hasListeners() }, { main: true, beforeTimeout: true, listening: false });
	}));

	test('follows the session of a peer chat once a provider asks to read every session again, so that the peer it lists later, without a change of the session, is found', () => runWithFakedTimers({}, async () => {
		const parent = sessionWithChats('agent-host-copilot:/parent');
		const peer = upcastPartial<IChat>({ resource: URI.parse('agent-host-copilot:/parent#peer') });
		const known: ISession[] = [];
		const { sessionChanged, sessionsManagementService } = create(known);
		const cts = disposables.add(new CancellationTokenSource());

		const start = Date.now();
		const found = waitForSessionChat(sessionsManagementService, peer.resource, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		await timeout(10);
		known.push(parent.session);
		sessionChanged.fire([]);
		await timeout(10);
		parent.chats.set([parent.session.mainChat.get(), peer], undefined);
		const result = await found;

		assert.deepStrictEqual({ chat: result?.chat === peer, beforeTimeout: Date.now() - start < SESSION_OPEN_WAIT_TIMEOUT, listening: sessionChanged.hasListeners() }, { chat: true, beforeTimeout: true, listening: false });
	}));

	test('ends at once, with no chat, as it is cancelled, such as as its host is deactivated, and once the timeout passes', () => runWithFakedTimers({}, async () => {
		const { sessionChanged, sessionsManagementService } = create([]);
		const unknown = URI.parse('agent-host-copilot:/unknown');
		const cts = disposables.add(new CancellationTokenSource());

		const start = Date.now();
		const cancelled = waitForSessionChat(sessionsManagementService, unknown, cts.token, SESSION_OPEN_WAIT_TIMEOUT);
		await timeout(10);
		cts.cancel();
		const cancelledResult = { found: await cancelled, early: Date.now() - start < SESSION_OPEN_WAIT_TIMEOUT };
		const timedOut = await waitForSessionChat(sessionsManagementService, unknown, disposables.add(new CancellationTokenSource()).token, SESSION_OPEN_WAIT_TIMEOUT);

		assert.deepStrictEqual({ cancelled: cancelledResult, timedOut, listening: sessionChanged.hasListeners() }, { cancelled: { found: undefined, early: true }, timedOut: undefined, listening: false });
	}));
});
