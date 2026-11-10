/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { ContributionEnablementState } from '../../../chat/common/enablement.js';
import { IAgentPlugin, IAgentPluginMcpServerDefinition, IAgentPluginService } from '../../../chat/common/plugins/agentPluginService.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { PluginMcpDiscovery } from '../../common/discovery/pluginMcpDiscovery.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpCollectionDefinition } from '../../common/mcpTypes.js';

suite('PluginMcpDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPlugin(uri: URI, label: string, serverName: string, command: string): IAgentPlugin {
		const definition = new class extends mock<IAgentPluginMcpServerDefinition>() {
			override readonly name = serverName;
			override readonly uri = URI.joinPath(uri, '.mcp.json');
			override readonly configuration = {
				type: McpServerType.LOCAL as const,
				command,
			};
		};
		return new class extends mock<IAgentPlugin>() {
			override readonly uri = uri;
			override readonly format = PluginFormat.Copilot;
			override readonly label = label;
			override readonly enablement = observableValue(this, ContributionEnablementState.EnabledProfile);
			override readonly mcpServerDefinitions = observableValue<readonly IAgentPluginMcpServerDefinition[]>(this, [definition]);
		};
	}

	test('rebinds a collection when a plugin is rebuilt at the same URI', () => {
		const uri = URI.file('/plugins/rebuilt');
		const firstPlugin = createPlugin(uri, 'First', 'first-server', 'first-command');
		const secondPlugin = createPlugin(uri, 'Second', 'second-server', 'second-command');
		const plugins = observableValue<readonly IAgentPlugin[]>('plugins', [firstPlugin]);
		const registrations: McpCollectionDefinition[] = [];
		let disposalCount = 0;
		const registry = new class extends mock<IMcpRegistry>() {
			override registerCollection(collection: McpCollectionDefinition) {
				registrations.push(collection);
				return toDisposable(() => disposalCount++);
			}
		};
		const discovery = store.add(new PluginMcpDiscovery({
			_serviceBrand: undefined,
			plugins,
			enablementModel: new class extends mock<IAgentPluginService['enablementModel']>() { },
		}, registry));
		discovery.start();

		plugins.set([secondPlugin], undefined);

		assert.deepStrictEqual({
			registrationLabels: registrations.map(collection => collection.label),
			currentServers: registrations.at(-1)?.serverDefinitions.get().map(server => server.label),
			disposalCount,
		}, {
			registrationLabels: ['First (Agent Plugin)', 'Second (Agent Plugin)'],
			currentServers: ['second-server'],
			disposalCount: 1,
		});
	});
});
