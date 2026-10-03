/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from '../../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from '../../../../common/agent.js';
import type { IAgentHostManagedSettingsDiagnostics } from '../../../../common/agentService.js';
import { PROTOCOL_VERSION } from '../../../../common/state/protocol/version/registry.js';
import { ROOT_STATE_URI } from '../../../../common/state/sessionState.js';
import { AgentHostE2EServerLease, removeTempDirs, resolveGitHubToken } from '../harness/agentHostE2ETestHarness.js';
import { COPILOT_CONFIG } from './copilotTestConfiguration.js';

suite('Agent Host E2E — Copilot managed-settings diagnostics', function () {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('fetched server policy appears in sessionless diagnostics and channel layers', async function () {
		this.timeout(60_000);
		const directory = await mkdtemp(join(tmpdir(), 'copilot-policy-diagnostics-'));
		const lease = new AgentHostE2EServerLease(COPILOT_CONFIG, {
			env: {
				COPILOT_CACHE_HOME: join(directory, 'cache'),
				COPILOT_MANAGED_SETTINGS_CACHE: '0',
			},
		});
		try {
			const { client, server } = await lease.acquire(this.test!.title, 'none');
			assert.ok(server.capiReplay);
			const policy = { permissions: { disableBypassPermissionsMode: 'disable' } };
			server.capiReplay.setManagedSettings(policy);
			await client.call('initialize', {
				channel: ROOT_STATE_URI,
				protocolVersions: [PROTOCOL_VERSION],
				clientId: 'server-policy-diagnostics',
			});
			await client.call('authenticate', {
				channel: ROOT_STATE_URI,
				resource: GITHUB_COPILOT_PROTECTED_RESOURCE.resource,
				token: resolveGitHubToken(),
			});
			const previousRequests = server.capiReplay.managedSettingsRequestCount;
			const diagnostics = await client.call<readonly IAgentHostManagedSettingsDiagnostics[]>('getManagedSettingsDiagnostics');
			const provider = diagnostics.find(entry => entry.provider === COPILOT_CONFIG.provider);
			assert.ok(provider);
			assert.strictEqual(provider.error, undefined);
			const snapshot = provider.snapshot;
			assert.ok(snapshot);
			assert.ok(snapshot.account);
			assert.strictEqual(snapshot.serverManaged, true);
			assert.ok(snapshot.source === 'server' || snapshot.source === 'mixed');
			assert.ok(snapshot.managedKeys.includes('permissions'));
			assert.strictEqual(snapshot.bypassPermissionsDisabled, true);
			assert.ok(snapshot.settings && typeof snapshot.settings === 'object');
			assert.deepStrictEqual(Object.entries(snapshot.settings).find(([key]) => key === 'permissions')?.[1], policy.permissions);
			assert.deepStrictEqual(snapshot.layers?.find(layer => layer.source === 'server')?.settings, policy);
			assert.deepStrictEqual(snapshot.diagnostics, []);
			assert.ok(server.capiReplay.managedSettingsRequestCount > previousRequests, 'The diagnostic must fetch server policy, not just report an injected client setting');
			assert.deepStrictEqual(server.capiReplay.observedModelRequestBodies, []);
		} finally {
			try {
				await lease.release([], this.test?.state === 'failed');
			} finally {
				try {
					await lease.dispose();
				} finally {
					await removeTempDirs([directory]);
				}
			}
		}
	});
});
