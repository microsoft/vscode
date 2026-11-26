/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AllowedMcpServersService } from '../../../../../platform/mcp/common/allowedMcpServersService.js';
import { IAllowedMcpServersService, mcpAccessConfig, mcpAllowedServersConfig, McpAccessValue } from '../../../../../platform/mcp/common/mcpManagement.js';
import { COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG } from '../../../../../platform/policy/common/copilotManagedSettings.js';
import { McpDiscovery } from '../../browser/mcpDiscovery.js';
import { IMcpDiscovery, mcpDiscoveryRegistry } from '../../common/discovery/mcpDiscovery.js';

suite('Workbench - MCP - Discovery Policy', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('managed allowlist presence replaces registry discovery restrictions and responds to policy removal', async () => {
		const policy: Record<string, unknown> = {};
		const configurationService = new class extends TestConfigurationService {
			override inspect<T>(key: string): IConfigurationValue<T> {
				return { ...super.inspect<T>(key), policyValue: policy[key] as T | undefined };
			}
		}({ [mcpAccessConfig]: McpAccessValue.Registry });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const active = new Set<string>();
		class TestDiscovery extends Disposable implements IMcpDiscovery {
			constructor(readonly fromGallery: boolean) {
				super();
			}
			start(): void {
				const name = this.fromGallery ? 'gallery' : 'other';
				active.add(name);
				this._register(toDisposable(() => active.delete(name)));
			}
		}
		const descriptors = sinon.stub(mcpDiscoveryRegistry, 'getAll').returns([
			new SyncDescriptor(TestDiscovery, [true]), new SyncDescriptor(TestDiscovery, [false])
		]);
		store.add(toDisposable(() => descriptors.restore()));
		const allowedMcpServersService = store.add(new AllowedMcpServersService(configurationService));
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IConfigurationService, configurationService],
			[IAllowedMcpServersService, allowedMcpServersService],
		)));
		store.add(instantiationService.createInstance(McpDiscovery));
		const snapshots = [[...active]];
		const update = async (key: string, value: unknown, managed: boolean) => {
			policy[key] = managed ? value : undefined;
			await configurationService.setUserConfiguration(key, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				source: ConfigurationTarget.DEFAULT,
				affectedKeys: new Set([key]),
				change: { keys: [key], overrides: [] },
				affectsConfiguration: candidate => candidate === key,
			});
			snapshots.push([...active]);
		};
		await update(mcpAllowedServersConfig, [{ serverName: 'user-only' }], false);
		await update(mcpAllowedServersConfig, [{ serverName: 'managed' }], true);
		await update(mcpAllowedServersConfig, [], true);
		await update(mcpAllowedServersConfig, undefined, true);
		await update(COPILOT_ALLOW_MANAGED_MCP_SERVERS_ONLY_CONFIG, true, true);
		await update(mcpAccessConfig, McpAccessValue.None, true);
		assert.deepStrictEqual(snapshots, [
			['gallery'], ['gallery'], ['gallery', 'other'], ['gallery', 'other'],
			['gallery'], ['gallery', 'other'], [],
		]);
	});
});
