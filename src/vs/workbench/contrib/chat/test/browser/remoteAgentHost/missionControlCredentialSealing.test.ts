/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { IMissionControlCredentialSealingRequest } from '../../../../../../platform/agentHost/common/agentService.js';
import { createRootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { sealMissionControlMcpCredential } from '../../../browser/remoteAgentHost/missionControlCredentialSealing.js';

suite('Mission Control MCP recipient trust', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const key = { key_id: 'key', use: 'mcp-auth-token', algorithm: 'x25519-sealedbox', public_key: 'public' };
	const root = () => ({ ...createRootState(), _meta: { 'copilot.encryptionKeys': [{ keyId: key.key_id, use: key.use, algorithm: key.algorithm, publicKey: key.public_key }] } });
	const request = { resource: 'https://mcp.example.test', token: 'sensitive-test-token', scopes: ['read'] };

	test('requires the same HTTPS descriptor and live host key before disclosing to local sealing', async () => {
		const calls: IMissionControlCredentialSealingRequest[] = [];
		const seal = async (value: IMissionControlCredentialSealingRequest) => { calls.push(value); return 'copilot-sealed.v1.test.box'; };
		await assert.rejects(sealMissionControlMcpCredential(request, undefined, root(), undefined, seal), /authenticated MCP/);
		await assert.rejects(sealMissionControlMcpCredential(request, [{ ...key, public_key: 'substituted' }], root(), undefined, seal), /does not match/);
		assert.strictEqual(calls.length, 0);
		const result = await sealMissionControlMcpCredential(request, [key], root(), { 'copilot.authChallenge': { challenge: 'a'.repeat(32), required: false } }, seal);
		assert.deepStrictEqual(result, { ...request, token: 'copilot-sealed.v1.test.box' });
		assert.deepStrictEqual(calls, [{ resource: request.resource, token: request.token, key, challenge: 'a'.repeat(32) }]);
	});
});
