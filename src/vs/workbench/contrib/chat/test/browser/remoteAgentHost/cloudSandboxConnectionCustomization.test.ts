/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { cloudSandboxAddress, ICloudSandboxAgentHostService } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { AuthRequiredReason } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { createCloudSandboxConnectionCustomization } from '../../../browser/remoteAgentHost/cloudSandboxConnectionCustomization.js';

suite('CloudSandboxConnectionCustomization authentication', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(refresh: () => Promise<string | undefined> = async () => 'copilot-sealed.v1.key.fresh') {
		const requests: string[] = [];
		const service = new class extends mock<ICloudSandboxAgentHostService>() {
			override getSealedGitHubToken(environmentId: string): string {
				requests.push(`cached:${environmentId}`);
				return 'copilot-sealed.v1.key.cached';
			}
			override refreshSealedGitHubToken(environmentId: string): Promise<string | undefined> {
				requests.push(`refresh:${environmentId}`);
				return refresh();
			}
		}();
		const customization = createCloudSandboxConnectionCustomization(cloudSandboxAddress('env-1'), service);
		assert.ok(customization?.authenticate);
		return { authenticate: customization.authenticate, requests };
	}

	for (const token of ['plaintext', 'copilot-sealed.v1.key.challenged']) {
		test(`renews an expired challenge instead of forwarding ${token}`, async () => {
			const fixture = createFixture();
			const request = { resource: 'https://api.github.com', scopes: ['repo'], token };
			const result = await fixture.authenticate(request, AuthRequiredReason.Expired);
			assert.deepStrictEqual({ result, requests: fixture.requests }, {
				result: { ...request, token: 'copilot-sealed.v1.key.fresh' },
				requests: ['refresh:env-1'],
			});
		});
	}

	test('ordinary authentication retains the cached-token fast path', async () => {
		const fixture = createFixture();
		const request = { resource: 'https://api.github.com', scopes: ['repo'], token: 'plaintext' };
		const result = await fixture.authenticate(request, AuthRequiredReason.Required);
		assert.deepStrictEqual({ result, requests: fixture.requests }, {
			result: { ...request, token: 'copilot-sealed.v1.key.cached' },
			requests: ['cached:env-1'],
		});
	});

	test('ordinary sealed authentication does not request credentials', async () => {
		const fixture = createFixture();
		const request = { resource: 'https://api.github.com', token: 'copilot-sealed.v1.key.current' };
		const result = await fixture.authenticate(request);
		assert.deepStrictEqual({ result, requests: fixture.requests }, { result: request, requests: [] });
	});

	test('does not fall back to the challenged token after renewal fails', async () => {
		const failure = new Error('refresh unavailable');
		const fixture = createFixture(async () => { throw failure; });
		await assert.rejects(fixture.authenticate({ resource: 'https://api.github.com', token: 'plaintext' }, AuthRequiredReason.Expired), failure);
		assert.deepStrictEqual(fixture.requests, ['refresh:env-1']);
	});

	for (const token of [undefined, 'plaintext']) {
		test(`rejects an unusable renewed credential: ${token}`, async () => {
			const fixture = createFixture(async () => token);
			await assert.rejects(fixture.authenticate({ resource: 'https://api.github.com', token: 'plaintext' }, AuthRequiredReason.Expired), /No sealed GitHub token/);
			assert.deepStrictEqual(fixture.requests, ['refresh:env-1']);
		});
	}

	test('validates the challenged resource before renewing even a sealed credential', async () => {
		const fixture = createFixture();
		for (const resource of ['https://example.com', 'https://github.com.example.com', 'not a URL']) {
			await assert.rejects(fixture.authenticate({ resource, token: 'copilot-sealed.v1.key.challenged' }, AuthRequiredReason.Expired), /non-GitHub resource/);
		}
		assert.deepStrictEqual(fixture.requests, []);
	});
});
