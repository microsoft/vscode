/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Emitter } from '../../../../base/common/event.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { buildCanvasUri } from '../../common/canvasUri.js';
import { buildSessionChangesetUri, buildTurnChangesetUri } from '../../common/changesetUri.js';
import { buildChatUri } from '../../common/state/sessionState.js';
import { IAgentHostChatOwnershipService, type IChatRegistration } from '../../node/agentHostChatOwnershipService.js';
import { AgentHostSubscriptionService } from '../../node/agentHostSubscriptionService.js';

suite('AgentHostSubscriptionService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	test('records a registered chat owner for its subscribed chat and canvases without iterating unrelated subscriptions', () => {
		const registrations = disposables.add(new Emitter<IChatRegistration>());
		const subscriptions = disposables.add(new AgentHostSubscriptionService(new class extends mock<IAgentHostChatOwnershipService>() {
			override readonly onDidRegisterChat = registrations.event;
		}()));
		const owner = 'copilot:/owner';
		const chat = buildChatUri('copilot:/encoded', 'peer');
		const canvas = buildCanvasUri(URI.parse(chat), 'canvas');
		for (let index = 0; index < 50; index++) {
			subscriptions.addSubscriber(URI.parse(buildChatUri('copilot:/unrelated', `chat-${index}`)), 'client');
		}
		subscriptions.addSubscriber(URI.parse(chat), 'client');
		subscriptions.addSubscriber(canvas, 'client');
		const iterations = sinon.spy(ResourceMap.prototype, 'keys');

		registrations.fire({ chat, session: owner, storageResource: chat });
		const unsubscribed = buildChatUri('copilot:/unsubscribed', 'chat');
		registrations.fire({ chat: unsubscribed, session: 'copilot:/other', storageResource: unsubscribed });
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

	test('counts a chat-owned changeset subscription for its chat owner whether subscribed before or after the chat registers', () => {
		const registrations = disposables.add(new Emitter<IChatRegistration>());
		const subscriptions = disposables.add(new AgentHostSubscriptionService(new class extends mock<IAgentHostChatOwnershipService>() {
			override readonly onDidRegisterChat = registrations.event;
		}()));
		const owner = URI.parse('copilot:/owner');
		const earlyChat = buildChatUri('copilot:/encoded', 'early');
		const lateChat = buildChatUri('copilot:/encoded', 'late');
		const earlyChangeset = URI.parse(buildSessionChangesetUri(earlyChat));
		const lateChangeset = URI.parse(buildTurnChangesetUri(lateChat, 'turn-1'));

		subscriptions.addSubscriber(earlyChangeset, 'client');
		const beforeRegistration = subscriptions.hasSessionSubscribers(owner);
		registrations.fire({ chat: earlyChat, session: owner.toString(), storageResource: earlyChat });
		const afterEarlyRegistration = subscriptions.hasSessionSubscribers(owner);
		subscriptions.removeSubscriber(earlyChangeset, 'client');
		const afterEarlyRemoved = subscriptions.hasSessionSubscribers(owner);

		subscriptions.addSubscriber(lateChangeset, 'client');
		subscriptions.setSubscriptionOwner(lateChangeset, owner.toString());

		assert.deepStrictEqual({
			beforeRegistration,
			afterEarlyRegistration,
			afterEarlyRemoved,
			late: subscriptions.resolveSubscribedSession(lateChangeset)?.toString(),
			afterLateSubscribed: subscriptions.hasSessionSubscribers(owner),
		}, {
			beforeRegistration: false,
			afterEarlyRegistration: true,
			afterEarlyRemoved: false,
			late: owner.toString(),
			afterLateSubscribed: true,
		});
	});
});
