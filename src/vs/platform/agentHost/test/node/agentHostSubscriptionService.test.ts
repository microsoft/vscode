/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildCanvasUri } from '../../common/canvasUri.js';
import { buildChatUri } from '../../common/state/sessionState.js';
import { AgentHostSubscriptionService } from '../../node/agentHostSubscriptionService.js';

suite('AgentHostSubscriptionService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('records a registered chat owner for its subscribed chat and canvases without iterating unrelated subscriptions', () => {
		const subscriptions = new AgentHostSubscriptionService();
		const owner = 'copilot:/owner';
		const chat = buildChatUri('copilot:/encoded', 'peer');
		const canvas = buildCanvasUri(URI.parse(chat), 'canvas');
		for (let index = 0; index < 50; index++) {
			subscriptions.addSubscriber(URI.parse(buildChatUri('copilot:/unrelated', `chat-${index}`)), 'client');
		}
		subscriptions.addSubscriber(URI.parse(chat), 'client');
		subscriptions.addSubscriber(canvas, 'client');
		const iterations = sinon.spy(ResourceMap.prototype, 'keys');

		subscriptions.recordChatOwner(chat, owner);
		subscriptions.recordChatOwner(buildChatUri('copilot:/unsubscribed', 'chat'), 'copilot:/other');
		const afterRecord = {
			iterations: iterations.callCount,
			chat: subscriptions.resolveSubscribedSession(URI.parse(chat))?.toString(),
			canvas: subscriptions.resolveSubscribedSession(canvas)?.toString(),
		};
		subscriptions.removeSubscriber(URI.parse(chat), 'client');
		const afterChatRemoved = subscriptions.resolveSubscribedSession(canvas)?.toString();
		subscriptions.removeSubscriber(canvas, 'client');
		subscriptions.addSubscriber(canvas, 'client');

		assert.deepStrictEqual({
			afterRecord,
			afterChatRemoved,
			afterLastRemoved: subscriptions.resolveSubscribedSession(canvas)?.toString(),
			iterations: iterations.callCount,
		}, {
			afterRecord: { iterations: 0, chat: owner, canvas: owner },
			afterChatRemoved: owner,
			// The owner is forgotten once the chat's last subscribed resource leaves.
			afterLastRemoved: undefined,
			iterations: 0,
		});
	});
});
