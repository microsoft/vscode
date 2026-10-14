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

	test('only cloud sandbox connections opt out of workspace trust', () => {
		const service = new class extends mock<ICloudSandboxAgentHostService>() { }();
		assert.deepStrictEqual({
			sandbox: createCloudSandboxConnectionCustomization(cloudSandboxAddress('env-1'), service)?.requiresWorkspaceTrust,
			ssh: createCloudSandboxConnectionCustomization('ssh:host', service),
			websocket: createCloudSandboxConnectionCustomization('localhost:8080', service),
		}, {
			sandbox: false,
			ssh: undefined,
			websocket: undefined,
		});
	});

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
		assert.ok(customization?.authenticate && customization.renewAuthentication);
		return { authenticate: customization.authenticate, renewAuthentication: customization.renewAuthentication, requests };
	}

	test('renews a protected resource without a user authentication token', async () => {
		const fixture = createFixture();
		const result = await fixture.renewAuthentication({
			resource: 'https://api.github.com',
			scopes_supported: ['repo', 'read:user'],
		});
		assert.deepStrictEqual({ result, requests: fixture.requests }, {
			result: { resource: 'https://api.github.com', scopes: ['repo', 'read:user'], token: 'copilot-sealed.v1.key.fresh' },
			requests: ['refresh:env-1'],
		});
	});

	test('user-local MCP renewal stays on the trusted workbench sealing path', async () => {
		const requests: string[] = [];
		const service = new class extends mock<ICloudSandboxAgentHostService>() { }();
		const customization = createCloudSandboxConnectionCustomization(cloudSandboxAddress('env-1'), service, true, async request => {
			requests.push(request.resource);
			return { ...request, token: 'copilot-sealed.v1.mcp.fresh' };
		});
		assert.ok(customization?.authenticate);
		const request = { resource: 'https://mcp.example.test', scopes: ['mcp'], token: 'test-mcp-token' };
		const result = await customization.authenticate(request, AuthRequiredReason.Expired);
		assert.deepStrictEqual({ result, requests, renewal: customization.renewAuthentication }, {
			result: { ...request, token: 'copilot-sealed.v1.mcp.fresh' },
			requests: ['https://mcp.example.test'],
			renewal: undefined,
		});
	});

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
		await assert.rejects(fixture.renewAuthentication({ resource: 'https://api.github.com' }), failure);
		assert.deepStrictEqual(fixture.requests, ['refresh:env-1', 'refresh:env-1']);
	});

	for (const token of [undefined, 'plaintext']) {
		test(`rejects an unusable renewed credential: ${token}`, async () => {
			const fixture = createFixture(async () => token);
			await assert.rejects(fixture.authenticate({ resource: 'https://api.github.com', token: 'plaintext' }, AuthRequiredReason.Expired), /No sealed GitHub token/);
			await assert.rejects(fixture.renewAuthentication({ resource: 'https://api.github.com' }), /No sealed GitHub token/);
			assert.deepStrictEqual(fixture.requests, ['refresh:env-1', 'refresh:env-1']);
		});
	}

	test('validates the challenged resource before renewing even a sealed credential', async () => {
		const fixture = createFixture();
		for (const resource of ['https://example.com', 'https://github.com.example.com', 'not a URL']) {
			await assert.rejects(fixture.authenticate({ resource, token: 'copilot-sealed.v1.key.challenged' }, AuthRequiredReason.Expired), /non-GitHub resource/);
			await assert.rejects(fixture.renewAuthentication({ resource }), /non-GitHub resource/);
		}
		assert.deepStrictEqual(fixture.requests, []);
	});
});
