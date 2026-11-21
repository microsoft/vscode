/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { hash } from '../../../../base/common/hash.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getTelemetryChatId, getTelemetryChatSessionId } from '../../common/agentTelemetryCorrelation.js';
import { buildChatUri, buildDefaultChatUri } from '../../common/state/sessionState.js';

suite('AgentTelemetryCorrelation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('host hash and client diagnostic derive the same chat id', () => {
		const session = 'ahp-session:/s1';
		const opaque = 'ahp-chat:/11111111-1111-4111-8111-111111111111';
		const chats = [buildDefaultChatUri(session), buildChatUri(session, 'peer-1'), opaque];

		assert.deepStrictEqual(chats.map(chat => ({
			id: getTelemetryChatId(chat),
			hashed: getTelemetryChatSessionId(chat) === String(hash(getTelemetryChatId(chat))),
		})), [
			{ id: 'default', hashed: true },
			{ id: getTelemetryChatId(buildChatUri(session, 'peer-1')), hashed: true },
			{ id: '11111111-1111-4111-8111-111111111111', hashed: true },
		]);
	});
});
