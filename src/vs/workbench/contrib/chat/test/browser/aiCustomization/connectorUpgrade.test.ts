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
import { IWorkbenchLocalMcpServer } from '../../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { findConnectorUpgradeTarget, getConnectorMcpServerNames, getMatchingInstalledMcpPlugins, getMatchingInstalledMcpServers, upgradeMcpSourcesToConnector } from '../../../common/connectorUpgrade.js';
import { IAgentPlugin, IAgentPluginMcpServerDefinition } from '../../../common/plugins/agentPluginService.js';
import { IWorkbenchMcpServer, McpServerInstallState } from '../../../../mcp/common/mcpTypes.js';

function createServer(name: string, installState = McpServerInstallState.Installed, isLocal = true): IWorkbenchMcpServer {
	return new class extends mock<IWorkbenchMcpServer>() {
		override readonly id = name;
		override readonly name = name;
		override readonly installState = installState;
		override readonly local = isLocal ? new class extends mock<IWorkbenchLocalMcpServer>() { }() : undefined;
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
				{ kind: 'mcpServer', server: first },
				{ kind: 'mcpServer', server: second },
			],
			async source => {
				assert.strictEqual(source.kind, 'mcpServer');
				operations.push(`remove:${source.server.name}`);
				if (source.server === first) {
					throw new Error('first removal failed');
				}
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
				[{ kind: 'mcpServer', server }],
				async source => { operations.push(`remove:${source.kind}`); }
			),
			/connection failed/
		);
		assert.deepStrictEqual(operations, ['connect']);
	});
});
