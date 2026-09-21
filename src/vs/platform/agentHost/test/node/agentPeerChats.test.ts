/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { decodeProviderData, encodeProviderData } from '../../node/agentPeerChats.js';

suite('agentPeerChats', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps host-owned fork metadata out of provider data', () => {
		const providerData = JSON.stringify({
			sdkSessionId: 'sdk-session',
			inheritedTurnId: 'inherited-turn',
		});

		assert.deepStrictEqual(decodeProviderData(providerData), {
			sdkSessionId: 'sdk-session',
		});
	});

	test('round-trips the selected agent through provider data', () => {
		const providerData = encodeProviderData({
			sdkSessionId: 'sdk-session',
			agent: { uri: 'agent://workspace/reviewer' },
		});

		assert.deepStrictEqual(decodeProviderData(providerData)?.agent, {
			uri: 'agent://workspace/reviewer',
		});
	});

	test('does not restore inherited turn ids from provider data', () => {
		const providerData = encodeProviderData({
			sdkSessionId: 'sdk-session',
		});

		assert.deepStrictEqual(decodeProviderData(providerData), { sdkSessionId: 'sdk-session' });
	});

	test('prototype Team metadata does not change an exact ordinary backing', () => {
		assert.deepStrictEqual(decodeProviderData(JSON.stringify({
			sdkSessionId: 'saved-worker', model: { id: 'worker-model' },
			persistentTeam: { kind: 'member', member: { ref: { sdkSessionId: 'saved-worker' } } },
		})), { sdkSessionId: 'saved-worker', model: { id: 'worker-model' } });
	});

	test('only an explicit Start Over marker permits an empty resume', () => {
		assert.deepStrictEqual([
			decodeProviderData(encodeProviderData({ sdkSessionId: 'sdk-session', allowEmptyResume: true })),
			decodeProviderData(JSON.stringify({ sdkSessionId: 'sdk-session', allowEmptyResume: 'true' })),
		], [{ sdkSessionId: 'sdk-session', allowEmptyResume: true }, { sdkSessionId: 'sdk-session' }]);
	});
});
