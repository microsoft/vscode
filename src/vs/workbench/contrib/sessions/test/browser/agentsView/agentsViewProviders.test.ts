/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { AGENTS_VIEW_SESSION_WAIT_TIMEOUT, waitForAgentsViewSession } from '../../../browser/agentsView/agentsViewProviders.js';
import { ISessionChange, ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';

suite('waitForAgentsViewSession', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('finds a peer chat that its listed session publishes later, without a change of the sessions', () => runWithFakedTimers({}, async () => {
		const built = buildTestSession({ id: 'parent', title: 'Parent', chats: [{ id: 'peer', title: 'Peer' }] });
		const peer = built.chats.get('peer')!.chat;
		const chats = observableValue<readonly IChat[]>('chats', [built.mainChat.chat]);
		const parent: ISession = { ...built.session, chats };
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSession: Event.None,
			getSessions: () => [parent],
			getSession: () => undefined,
		});
		const find = () => parent.chats.get().find(chat => isEqual(chat.resource, peer.resource));

		const found = waitForAgentsViewSession(sessionsManagementService, peer.resource, find);
		await timeout(1000);
		chats.set([built.mainChat.chat, peer], undefined);

		assert.strictEqual(await found, peer);
	}));

	test('finds a peer chat that a session outside the listing scope, known before the wait, publishes without a change of the sessions', () => runWithFakedTimers({}, async () => {
		const built = buildTestSession({ id: 'parent', title: 'Parent' });
		const peerResource = built.session.resource.with({ fragment: 'peer' });
		const peer: IChat = { ...built.mainChat.chat, resource: peerResource };
		const chats = observableValue<readonly IChat[]>('chats', [built.mainChat.chat]);
		const parent: ISession = { ...built.session, chats, capabilities: constObservable({ ...built.session.capabilities.get(), supportsMultipleChats: true }) };
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			// Not listed, and no change of it is reported: only its lookup finds it
			onDidChangeSession: Event.None,
			getSessions: () => [],
			getSession: resource => isEqual(resource, parent.resource) ? parent : undefined,
		});
		const find = () => parent.chats.get().find(chat => isEqual(chat.resource, peerResource));

		const start = Date.now();
		const found = waitForAgentsViewSession(sessionsManagementService, peerResource, find);
		await timeout(1000);
		chats.set([built.mainChat.chat, peer], undefined);

		assert.deepStrictEqual({ found: await found, beforeTimeout: Date.now() - start < AGENTS_VIEW_SESSION_WAIT_TIMEOUT }, { found: peer, beforeTimeout: true });
	}));

	test('finds a session that its provider does not list, such as of another folder, as soon as the provider knows it', () => runWithFakedTimers({}, async () => {
		const elsewhere = buildTestSession({ id: 'elsewhere', title: 'Elsewhere' }).session;
		const allSessions: ISession[] = [];
		const sessionChanged = new Emitter<readonly ISessionChange[]>();
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSession: sessionChanged.event,
			getSessions: () => [],
			getSession: () => undefined,
		});

		const start = Date.now();
		const found = waitForAgentsViewSession(sessionsManagementService, elsewhere.resource, () => allSessions.find(session => isEqual(session.resource, elsewhere.resource)));
		await timeout(10);
		allSessions.push(elsewhere);
		sessionChanged.fire([{ session: elsewhere, kind: 'added' }]);

		assert.deepStrictEqual({ found: await found, beforeTimeout: Date.now() - start < AGENTS_VIEW_SESSION_WAIT_TIMEOUT }, { found: elsewhere, beforeTimeout: true });
		sessionChanged.dispose();
	}));
});
