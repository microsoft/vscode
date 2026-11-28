/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { IMcpServerConfiguration, McpServerType } from '../../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IWorkbenchLocalMcpServer, LocalMcpServerScope } from '../../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { createConnectorUpgradeSource, findConnectorUpgradeTarget, getConnectorMcpServerNames, getMatchingInstalledMcpPlugins, getMatchingInstalledMcpServers, getCurrentConnectorUpgradeServer, upgradeMcpSourcesToConnector } from '../../../common/connectorUpgrade.js';
import { IAgentPlugin, IAgentPluginMcpServerDefinition } from '../../../common/plugins/agentPluginService.js';
import { IWorkbenchMcpServer, McpServerInstallState } from '../../../../mcp/common/mcpTypes.js';

function createServer(name: string, installState = McpServerInstallState.Installed, isLocal = true, config: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: name }): IWorkbenchMcpServer {
	const local = new class extends mock<IWorkbenchLocalMcpServer>() {
		override readonly id = name;
		override readonly scope = LocalMcpServerScope.User;
		override readonly mcpResource = URI.file('/user/mcp.json');
		override readonly name = name;
		override readonly config = config;
	}();
	return new class extends mock<IWorkbenchMcpServer>() {
		override readonly id = name;
		override readonly name = name;
		override readonly installState = installState;
		override readonly local = isLocal ? local : undefined;
	}();
}

function createPlugin(label: string, mcpServerNames: readonly string[]): IAgentPlugin {
	return new class extends mock<IAgentPlugin>() {
		override readonly uri = URI.file(`/plugins/${label}`);
		override readonly format = PluginFormat.Copilot;
		override readonly label = label;
		override readonly mcpServerDefinitions = constObservable(mcpServerNames.map(name => new class extends mock<IAgentPluginMcpServerDefinition>() {
			override readonly name = name;
		}()));
	}();
}

suite('ConnectorUpgrade', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('derives equivalent MCP names from connector identity and configured aliases', () => {
		assert.deepStrictEqual([
			getConnectorMcpServerNames('workiq-mail', 'WorkIQ'),
			getConnectorMcpServerNames('azure-data-explorer', 'Azure Data Explorer', ['kusto', 'KUSTO']),
		], [
			['workiq-mail', 'WorkIQ'],
			['kusto', 'azure-data-explorer', 'Azure Data Explorer'],
		]);
	});

	test('matches every installed local MCP server case-insensitively', () => {
		const matching = [
			createServer('slack'),
			createServer('Slack'),
			createServer('other'),
			createServer('slack', McpServerInstallState.Uninstalled),
			createServer('slack', McpServerInstallState.Installed, false),
		];

		assert.deepStrictEqual(
			getMatchingInstalledMcpServers(matching, ['SLACK']).map(server => server.id),
			['slack', 'Slack']
		);
	});

	test('matches each plugin with an equivalent MCP definition once case-insensitively', () => {
		const matching = getMatchingInstalledMcpPlugins([
			createPlugin('Slack Plugin', ['Slack', 'slack']),
			createPlugin('Other Plugin', ['other']),
		], ['SLACK']);

		assert.deepStrictEqual(matching.map(plugin => plugin.label), ['Slack Plugin']);
	});

	test('resolves a connector by exact internal name before display name', () => {
		const connectors = [
			{ name: 'slack-connector', displayName: 'Slack' },
			{ name: 'slack', displayName: 'Different Connector' },
		];

		assert.deepStrictEqual([
			findConnectorUpgradeTarget(connectors, 'slack', 'Slack'),
			findConnectorUpgradeTarget(connectors, 'recommendation-slack', 'Slack'),
		], [
			connectors[1],
			connectors[0],
		]);
	});

	test('connects the connector before attempting every MCP removal', async () => {
		const first = createServer('first');
		const second = createServer('second');
		const operations: string[] = [];

		const result = await upgradeMcpSourcesToConnector(
			async () => { operations.push('connect'); },
			[
				createConnectorUpgradeSource(first),
				createConnectorUpgradeSource(second),
			],
			async source => {
				assert.strictEqual(source.kind, 'mcpServer');
				operations.push(`remove:${source.server.name}`);
				if (source.server === first) {
					throw new Error('first removal failed');
				}
				return true;
			}
		);

		assert.deepStrictEqual({
			operations,
			failedRemovals: result.removalErrors.map(({ source, error }) => ({
				name: source.server.name,
				message: error instanceof Error ? error.message : String(error),
			})),
		}, {
			operations: ['connect', 'remove:first', 'remove:second'],
			failedRemovals: [{ name: 'first', message: 'first removal failed' }],
		});
	});

	test('preserves MCP servers when connecting the connector fails', async () => {
		const operations: string[] = [];
		const server = createServer('slack');

		await assert.rejects(
			upgradeMcpSourcesToConnector(
				async () => {
					operations.push('connect');
					throw new Error('connection failed');
				},
				[createConnectorUpgradeSource(server)],
				async source => {
					operations.push(`remove:${source.kind}`);
					return true;
				}
			),
			/connection failed/
		);
		assert.deepStrictEqual(operations, ['connect']);
	});

	test('revalidates unchanged MCP sources and preserves changed or missing sources', () => {
		const server = createServer('slack');
		const source = createConnectorUpgradeSource(server);
		assert.strictEqual(source.kind, 'mcpServer');
		const unchanged = createServer('slack');
		const changed = createServer('slack');
		if (!changed.local) {
			throw new Error('Expected a local MCP server.');
		}
		const originalLocal = changed.local;
		const changedLocal = new class extends mock<IWorkbenchLocalMcpServer>() {
			override readonly id = originalLocal.id;
			override readonly scope = originalLocal.scope;
			override readonly mcpResource = originalLocal.mcpResource;
			override readonly name = originalLocal.name;
			override readonly config: IMcpServerConfiguration = { type: McpServerType.LOCAL, command: 'changed' };
		}();
		const changedServer = new class extends mock<IWorkbenchMcpServer>() {
			override readonly local = changedLocal;
		}();

		assert.deepStrictEqual([
			getCurrentConnectorUpgradeServer(source, [unchanged])?.name,
			getCurrentConnectorUpgradeServer(source, [changedServer]),
			getCurrentConnectorUpgradeServer(source, []),
		], ['slack', undefined, undefined]);
	});

	test('captures an immutable MCP configuration snapshot', () => {
		const args = ['--original'];
		const server = createServer('slack', McpServerInstallState.Installed, true, { type: McpServerType.LOCAL, command: 'slack', args });
		const source = createConnectorUpgradeSource(server);
		assert.strictEqual(source.kind, 'mcpServer');

		args[0] = '--changed';

		assert.deepStrictEqual(source.local.config, { type: McpServerType.LOCAL, command: 'slack', args: ['--original'] });
		assert.strictEqual(getCurrentConnectorUpgradeServer(source, [server]), undefined);
	});

	test('reports MCP sources preserved after revalidation', async () => {
		const server = createServer('slack');
		const result = await upgradeMcpSourcesToConnector(
			async () => { },
			[createConnectorUpgradeSource(server)],
			async () => false,
		);

		assert.deepStrictEqual({
			removalErrors: result.removalErrors,
			preservedSources: result.preservedSources.map(source => source.server.name),
		}, {
			removalErrors: [],
			preservedSources: ['slack'],
		});
	});
});
