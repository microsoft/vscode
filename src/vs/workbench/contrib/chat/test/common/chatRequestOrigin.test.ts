/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ChatRequestOriginKind, ChatRequestOriginService, reviveChatRequestOrigin, serializeChatRequestOrigin } from '../../common/chatRequestOrigin.js';

suite('ChatRequestOrigin', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const origin = {
		kind: ChatRequestOriginKind.Delegation,
		sourceSessionResource: URI.parse('agent-host-codex:/source-thread'),
	};

	test('serializes and revives source session resources', () => {
		const scopedDelegation = {
			kind: ChatRequestOriginKind.Delegation,
			sourceSessionResource: URI.parse('agent-host-session://copilot/source?turn=turn-1'),
			delegationScope: 'session' as const,
		};
		assert.deepStrictEqual([
			reviveChatRequestOrigin(serializeChatRequestOrigin(origin)),
			reviveChatRequestOrigin(serializeChatRequestOrigin(scopedDelegation)),
		], [origin, scopedDelegation]);
	});

	test('opens with the first provider that handles the origin', async () => {
		const service = store.add(new ChatRequestOriginService());
		const calls: string[] = [];
		store.add(service.registerOpener({
			open: async () => {
				calls.push('first');
				return false;
			},
		}));
		store.add(service.registerOpener({
			open: async () => {
				calls.push('second');
				return true;
			},
		}));
		store.add(service.registerOpener({
			open: async () => {
				calls.push('third');
				return true;
			},
		}));

		assert.deepStrictEqual({
			opened: await service.open(origin),
			calls,
		}, {
			opened: true,
			calls: ['first', 'second'],
		});
	});
});
