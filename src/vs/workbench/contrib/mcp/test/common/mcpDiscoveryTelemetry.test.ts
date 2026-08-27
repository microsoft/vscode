/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { constObservable, waitForState } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { McpDiscoveryFormat, McpDiscoveryHost, McpDiscoveryScope, McpDiscoverySource, McpInstallProvenance } from '../../../../../platform/mcp/common/mcpDiscoveryMetadata.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { ExtensionHostKind } from '../../../../services/extensions/common/extensionHostKind.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMcpConfigurationOutcome, IMcpDiscoverySnapshot, mcpCandidate } from '../../common/discovery/mcpDiscovery.js';
import { ExtensionMcpDiscovery, getExtensionDiscoveryHost } from '../../common/discovery/extensionMcpDiscovery.js';
import { McpDiscoveryTelemetry, reconcileMcpStrictPluginOnly } from '../../common/discovery/mcpDiscoveryTelemetry.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpCollectionDefinition, McpCollectionSortOrder, McpServerTrust } from '../../common/mcpTypes.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

interface IServersFoundRow {
	readonly source: string;
	readonly format: string;
	readonly scope: string;
	readonly host: string;
	readonly installProvenance: string;
	readonly candidateCount: number;
	readonly loadedCount: number;
	readonly disabledCount: number;
	readonly blockedCount: number;
	readonly parseErrorCount: number;
	readonly unreadableCount: number;
	readonly unresolvedCount: number;
	readonly otherRejectedCount: number;
}

function isServersFoundRow(value: unknown): value is IServersFoundRow {
	return typeof value === 'object' && value !== null && Object.hasOwn(value, 'source') && Object.hasOwn(value, 'candidateCount');
}

suite('McpDiscoveryTelemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('covers every local source, format, host, provenance, and outcome with deduplication', () => {
		const configurationOutcomes: IMcpConfigurationOutcome[] = [
			{ source: McpDiscoverySource.VSCodeUserConfig, format: McpDiscoveryFormat.VSCodeServers, scope: McpDiscoveryScope.Profile, host: McpDiscoveryHost.Local, configurationPresent: 1, configuredEntryCount: 1, parseErrorCount: 0, unreadableCount: 0 },
			{ source: McpDiscoverySource.WorkspaceDotMcp, format: McpDiscoveryFormat.ClaudeMcpServers, scope: McpDiscoveryScope.WorkspaceFolder, host: McpDiscoveryHost.Local, configurationPresent: 1, configuredEntryCount: 0, parseErrorCount: 1, unreadableCount: 0 },
			{ source: McpDiscoverySource.ClaudeDesktop, format: McpDiscoveryFormat.ClaudeMcpServers, scope: McpDiscoveryScope.Profile, host: McpDiscoveryHost.Remote, configurationPresent: 1, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 1 },
		];
		const snapshot: IMcpDiscoverySnapshot = {
			candidates: [
				mcpCandidate(McpDiscoverySource.VSCodeUserConfig, McpDiscoveryFormat.VSCodeServers, McpDiscoveryScope.Profile, McpDiscoveryHost.Local, 'loaded', McpInstallProvenance.Gallery),
				mcpCandidate(McpDiscoverySource.VSCodeRemoteUserConfig, McpDiscoveryFormat.VSCodeServers, McpDiscoveryScope.Profile, McpDiscoveryHost.Remote, 'disabled', McpInstallProvenance.Local),
				mcpCandidate(McpDiscoverySource.VSCodeWorkspaceConfig, McpDiscoveryFormat.VSCodeServers, McpDiscoveryScope.Workspace, McpDiscoveryHost.Local, 'blocked', McpInstallProvenance.Local),
				mcpCandidate(McpDiscoverySource.VSCodeWorkspaceFolderConfig, McpDiscoveryFormat.VSCodeServers, McpDiscoveryScope.WorkspaceFolder, McpDiscoveryHost.Remote, 'loaded', McpInstallProvenance.Local),
				mcpCandidate(McpDiscoverySource.VSCodeWorkspaceFolderConfig, McpDiscoveryFormat.VSCodeServers, McpDiscoveryScope.WorkspaceFolder, McpDiscoveryHost.Remote, 'rejected', McpInstallProvenance.Local),
				mcpCandidate(McpDiscoverySource.WorkspaceDotMcp, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.WorkspaceFolder, McpDiscoveryHost.Local, 'parseError'),
				mcpCandidate(McpDiscoverySource.ClaudeDesktop, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.Profile, McpDiscoveryHost.Remote, 'unreadable'),
				mcpCandidate(McpDiscoverySource.CursorGlobal, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.Profile, McpDiscoveryHost.Local, 'loaded'),
				mcpCandidate(McpDiscoverySource.CursorWorkspace, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.WorkspaceFolder, McpDiscoveryHost.Remote, 'loaded'),
				mcpCandidate(McpDiscoverySource.Windsurf, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.Profile, McpDiscoveryHost.Local, 'loaded'),
				mcpCandidate(McpDiscoverySource.Extension, McpDiscoveryFormat.ExtensionProvider, McpDiscoveryScope.Extension, McpDiscoveryHost.Remote, 'unresolved'),
				mcpCandidate(McpDiscoverySource.Plugin, McpDiscoveryFormat.PluginMap, McpDiscoveryScope.Plugin, McpDiscoveryHost.Local, 'loaded'),
			],
			configurationOutcomes,
		};
		const telemetryService = new TestTelemetryService();
		const reporter = new McpDiscoveryTelemetry(telemetryService);
		reporter.logDiscovery([snapshot]);
		reporter.logDiscovery([snapshot]);

		const rows = telemetryService.events.filter(event => event.name === 'mcp/serversFound').map(event => event.data).filter(isServersFoundRow);
		assert.deepStrictEqual({
			rows: rows.map(row => [
				row.source,
				row.format,
				row.scope,
				row.host,
				row.installProvenance,
				row.candidateCount,
				row.loadedCount,
				row.disabledCount,
				row.blockedCount,
				row.parseErrorCount,
				row.unreadableCount,
				row.unresolvedCount,
				row.otherRejectedCount,
			]),
			configurationEventCount: telemetryService.events.filter(event => event.name === 'mcp/configurationFound').length,
		}, {
			rows: [
				['claudeDesktop', 'claudeMcpServers', 'profile', 'remote', 'notApplicable', 1, 0, 0, 0, 0, 1, 0, 0],
				['cursorGlobal', 'claudeMcpServers', 'profile', 'local', 'notApplicable', 1, 1, 0, 0, 0, 0, 0, 0],
				['cursorWorkspace', 'claudeMcpServers', 'workspaceFolder', 'remote', 'notApplicable', 1, 1, 0, 0, 0, 0, 0, 0],
				['extension', 'extensionProvider', 'extension', 'remote', 'notApplicable', 1, 0, 0, 0, 0, 0, 1, 0],
				['plugin', 'pluginMap', 'plugin', 'local', 'notApplicable', 1, 1, 0, 0, 0, 0, 0, 0],
				['vscodeRemoteUserConfig', 'vscodeServers', 'profile', 'remote', 'local', 1, 0, 1, 0, 0, 0, 0, 0],
				['vscodeUserConfig', 'vscodeServers', 'profile', 'local', 'gallery', 1, 1, 0, 0, 0, 0, 0, 0],
				['vscodeWorkspaceConfig', 'vscodeServers', 'workspace', 'local', 'local', 1, 0, 0, 1, 0, 0, 0, 0],
				['vscodeWorkspaceFolderConfig', 'vscodeServers', 'workspaceFolder', 'remote', 'local', 2, 1, 0, 0, 0, 0, 0, 1],
				['windsurf', 'claudeMcpServers', 'profile', 'local', 'notApplicable', 1, 1, 0, 0, 0, 0, 0, 0],
				['workspaceDotMcp', 'claudeMcpServers', 'workspaceFolder', 'local', 'notApplicable', 1, 0, 0, 0, 1, 0, 0, 0],
			],
			configurationEventCount: 3,
		});
	});

	test('emits one zero row with deduplication', () => {
		const telemetryService = new TestTelemetryService();
		const reporter = new McpDiscoveryTelemetry(telemetryService);
		reporter.logDiscovery([{ candidates: [mcpCandidate(McpDiscoverySource.VSCodeUserConfig, McpDiscoveryFormat.VSCodeServers, McpDiscoveryScope.Profile, McpDiscoveryHost.Local, 'loaded')], configurationOutcomes: [] }]);
		reporter.logDiscovery([]);
		reporter.logDiscovery([]);

		assert.deepStrictEqual(telemetryService.events.reduce<Record<string, number>>((counts, event) => {
			counts[event.name] = (counts[event.name] ?? 0) + 1;
			return counts;
		}, {}), {
			'mcp/serversFound': 3,
			'mcp/configurationFound': 1,
		});
		const zeroDiscovery = telemetryService.events.map(event => event.data).filter(isServersFoundRow).find(event => event.source === 'all');
		assert.deepStrictEqual(zeroDiscovery, {
			source: 'all',
			format: 'all',
			scope: 'all',
			host: 'all',
			installProvenance: 'all',
			candidateCount: 0,
			loadedCount: 0,
			disabledCount: 0,
			blockedCount: 0,
			parseErrorCount: 0,
			unreadableCount: 0,
			unresolvedCount: 0,
			otherRejectedCount: 0,
		});
	});

	test('emits configuration tombstones and an all-zero marker when the last source disappears', () => {
		const telemetryService = new TestTelemetryService();
		const reporter = new McpDiscoveryTelemetry(telemetryService);
		const configuration: IMcpConfigurationOutcome = {
			source: McpDiscoverySource.WorkspaceDotMcp,
			format: McpDiscoveryFormat.ClaudeMcpServers,
			scope: McpDiscoveryScope.WorkspaceFolder,
			host: McpDiscoveryHost.Local,
			configurationPresent: 1,
			configuredEntryCount: 1,
			parseErrorCount: 0,
			unreadableCount: 0,
		};

		reporter.logDiscovery([{ candidates: [], configurationOutcomes: [configuration] }]);
		reporter.logDiscovery([]);

		assert.deepStrictEqual(telemetryService.events.filter(event => event.name === 'mcp/configurationFound').map(event => event.data), [
			configuration,
			{ source: 'all', format: 'all', scope: 'all', host: 'all', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 },
			{ ...configuration, configurationPresent: 0, configuredEntryCount: 0 },
		]);
	});

	test('strict plugin-only reconciliation blocks loaded candidates from every non-plugin source and responds to toggles', () => {
		const sources = [
			McpDiscoverySource.VSCodeUserConfig,
			McpDiscoverySource.VSCodeRemoteUserConfig,
			McpDiscoverySource.VSCodeWorkspaceConfig,
			McpDiscoverySource.VSCodeWorkspaceFolderConfig,
			McpDiscoverySource.WorkspaceDotMcp,
			McpDiscoverySource.ClaudeDesktop,
			McpDiscoverySource.CursorGlobal,
			McpDiscoverySource.CursorWorkspace,
			McpDiscoverySource.Windsurf,
			McpDiscoverySource.Extension,
			McpDiscoverySource.Plugin,
		];
		const snapshot: IMcpDiscoverySnapshot = {
			candidates: sources.map(source => mcpCandidate(
				source,
				source === McpDiscoverySource.Plugin ? McpDiscoveryFormat.PluginMap : source === McpDiscoverySource.Extension ? McpDiscoveryFormat.ExtensionProvider : McpDiscoveryFormat.ClaudeMcpServers,
				source === McpDiscoverySource.Plugin ? McpDiscoveryScope.Plugin : McpDiscoveryScope.Profile,
				McpDiscoveryHost.Local,
				'loaded',
			)),
			configurationOutcomes: [],
		};
		const enabled = reconcileMcpStrictPluginOnly([snapshot], false);
		const blocked = reconcileMcpStrictPluginOnly([snapshot], true);
		const mixed = reconcileMcpStrictPluginOnly([{
			candidates: [
				mcpCandidate(McpDiscoverySource.Extension, McpDiscoveryFormat.ExtensionProvider, McpDiscoveryScope.Extension, McpDiscoveryHost.Local, 'disabled'),
				mcpCandidate(McpDiscoverySource.Extension, McpDiscoveryFormat.ExtensionProvider, McpDiscoveryScope.Extension, McpDiscoveryHost.Local, 'unresolved'),
				mcpCandidate(McpDiscoverySource.CursorGlobal, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.Profile, McpDiscoveryHost.Local, 'parseError'),
				mcpCandidate(McpDiscoverySource.CursorGlobal, McpDiscoveryFormat.ClaudeMcpServers, McpDiscoveryScope.Profile, McpDiscoveryHost.Local, 'unreadable'),
			],
			configurationOutcomes: [],
		}], true);

		assert.deepStrictEqual({
			enabled: enabled[0].candidates.map(candidate => [candidate.source, candidate.outcome]),
			blocked: blocked[0].candidates.map(candidate => [candidate.source, candidate.outcome]),
			mixed: mixed[0].candidates.map(candidate => candidate.outcome),
		}, {
			enabled: sources.map(source => [source, 'loaded']),
			blocked: sources.map(source => [source, source === McpDiscoverySource.Plugin ? 'loaded' : 'blocked']),
			mixed: ['blocked', 'blocked', 'parseError', 'unreadable'],
		});
	});

	test('attributes unresolved extension declarations to local, remote, or unknown hosts', () => {
		assert.deepStrictEqual([
			getExtensionDiscoveryHost(ExtensionHostKind.LocalProcess),
			getExtensionDiscoveryHost(ExtensionHostKind.Remote),
			getExtensionDiscoveryHost(undefined),
		], [
			McpDiscoveryHost.Local,
			McpDiscoveryHost.Remote,
			McpDiscoveryHost.Unknown,
		]);
	});

	test('uses typed host metadata for a registered remote lazy extension contribution', async () => {
		const collection: McpCollectionDefinition = {
			id: 'remote-extension',
			label: 'Remote Extension',
			remoteAuthority: null,
			scope: StorageScope.WORKSPACE,
			configTarget: ConfigurationTarget.USER,
			order: McpCollectionSortOrder.Extension,
			trustBehavior: McpServerTrust.Kind.Trusted,
			serverDefinitions: constObservable([]),
			lazy: { isCached: false, load: async () => { } },
			discovery: {
				source: McpDiscoverySource.Extension,
				format: McpDiscoveryFormat.ExtensionProvider,
				scope: McpDiscoveryScope.Extension,
				host: McpDiscoveryHost.Remote,
			},
		};
		const discovery = store.add(new ExtensionMcpDiscovery(
			upcastPartial<IMcpRegistry>({ collections: constObservable([collection]), delegates: constObservable([]) }),
			store.add(new TestStorageService()),
			upcastPartial<IExtensionService>({ whenInstalledExtensionsRegistered: async () => true }),
			new MockContextKeyService(),
		));

		discovery.start();
		const snapshot = await waitForState(discovery.discoverySnapshot, value => value !== undefined);

		assert.deepStrictEqual({
			candidateHosts: snapshot?.candidates.map(candidate => candidate.host),
			configurationHosts: snapshot?.configurationOutcomes.map(configuration => configuration.host),
		}, {
			candidateHosts: [McpDiscoveryHost.Remote],
			configurationHosts: [McpDiscoveryHost.Remote],
		});
	});

});
