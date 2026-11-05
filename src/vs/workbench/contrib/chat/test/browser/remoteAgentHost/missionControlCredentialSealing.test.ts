/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IMissionControlCredentialSealingRequest } from '../../../../../../platform/agentHost/common/agentService.js';
import { verifyMissionControlRecipient } from '../../../browser/remoteAgentHost/missionControlCredentialSealing.js';

suite('Mission Control recipient trust', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const key = { key_id: 'key', use: 'mcp-auth-token', algorithm: 'x25519-sealedbox', public_key: 'public' };
	const request: IMissionControlCredentialSealingRequest = { resource: 'https://mcp.example.test', token: 'sensitive-test-token', key: { ...key, use: 'mcp-auth-token' } };

	test('requires every recipient field to match the independently authenticated descriptor', () => {
		for (const keys of [undefined, [], [{ ...key, public_key: 'substituted' }], [{ ...key, key_id: 'other' }], [{ ...key, use: 'auth-token' }], [{ ...key, algorithm: 'unknown' }]]) {
			assert.throws(() => verifyMissionControlRecipient(request, keys), /does not match/);
		}
		assert.doesNotThrow(() => verifyMissionControlRecipient(request, [key]));
	});
});
