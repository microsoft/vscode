/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getPendingSteeringMessages } from '../../common/agentSessionMessage.js';
import { MessageKind, PendingMessageKind, type PendingMessage } from '../../common/state/sessionState.js';

suite('AgentSessionMessage', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const message = (id: string, kind?: PendingMessageKind): PendingMessage => ({
		id,
		kind,
		message: { text: id, origin: { kind: MessageKind.User } },
	});

	test('deduplicates the legacy mirror without changing steering order', () => {
		const first = message('first', PendingMessageKind.Steering);
		const second = message('second', PendingMessageKind.Steering);
		const legacy = message('legacy');
		const queued = message('queued');
		const queuedMessages = [queued, first, second];
		assert.deepStrictEqual([
			getPendingSteeringMessages({ queuedMessages }),
			getPendingSteeringMessages({ steeringMessage: second, queuedMessages }),
			getPendingSteeringMessages({ steeringMessage: first, queuedMessages }),
			getPendingSteeringMessages({ steeringMessage: legacy, queuedMessages }),
			getPendingSteeringMessages({ steeringMessage: legacy }),
		], [
			[first, second],
			[first, second],
			[first, second],
			[legacy, first, second],
			[legacy],
		]);
	});

	test('the mixed list owns a mirrored entry content and kind', () => {
		const legacy = message('same');
		const steering = { ...legacy, kind: PendingMessageKind.Steering, message: { ...legacy.message, text: 'Updated' } };
		const queued = { ...steering, kind: PendingMessageKind.Queued };
		assert.deepStrictEqual([
			getPendingSteeringMessages({ steeringMessage: legacy, queuedMessages: [steering] }),
			getPendingSteeringMessages({ steeringMessage: legacy, queuedMessages: [queued] }),
			getPendingSteeringMessages({ steeringMessage: legacy, queuedMessages: [message('same')] }),
		], [
			[steering],
			[],
			[],
		]);
	});
});
