/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../../base/common/async.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IChat, ISession } from '../../../../../services/sessions/common/session.js';
import { waitForAgentsViewSession } from '../../../browser/agentsView/agentsViewProviders.js';
import { ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';

suite('waitForAgentsViewSession', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('finds a peer chat that its listed session publishes later, without a change of the sessions', () => runWithFakedTimers({}, async () => {
		const built = buildTestSession({ id: 'parent', title: 'Parent', chats: [{ id: 'peer', title: 'Peer' }] });
		const peer = built.chats.get('peer')!.chat;
		const chats = observableValue<readonly IChat[]>('chats', [built.mainChat.chat]);
		const parent: ISession = { ...built.session, chats };
		const sessionsManagementService = upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			getSessions: () => [parent],
		});
		const find = () => parent.chats.get().find(chat => isEqual(chat.resource, peer.resource));

		const found = waitForAgentsViewSession(sessionsManagementService, find);
		await timeout(1000);
		chats.set([built.mainChat.chat, peer], undefined);

		assert.strictEqual(await found, peer);
	}));
});
