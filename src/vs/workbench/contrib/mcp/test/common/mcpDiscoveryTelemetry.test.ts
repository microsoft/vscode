/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { constObservable, waitForState } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { McpResourceScannerService } from '../../../../../platform/mcp/common/mcpResourceScannerService.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IMcpConfigurationTelemetrySnapshot, IMcpDiscoveryTelemetrySnapshot } from '../../common/discovery/mcpDiscovery.js';
import { ExtensionMcpDiscovery, getExtensionDiscoveryHost } from '../../common/discovery/extensionMcpDiscovery.js';
import { McpDiscoveryTelemetry, mcpCandidate, reconcileMcpStrictPluginOnly } from '../../common/discovery/mcpDiscoveryTelemetry.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { McpCollectionDefinition, McpCollectionSortOrder, McpDiscoveryFormat, McpDiscoveryHost, McpDiscoveryScope, McpDiscoverySource, McpInstallProvenance, McpServerTrust } from '../../common/mcpTypes.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { readonly name: string; readonly data: unknown }[] = [];

	override publicLog2(eventName?: string, data?: unknown): void {
		if (eventName) {
			this.events.push({ name: eventName, data });
		}
	}
}

class LayeredConfigurationService extends TestConfigurationService {
	constructor(private readonly values: Readonly<Record<string, IConfigurationValue<unknown>>>) {
		super();
	}

	override inspect<T>(key: string): IConfigurationValue<T> {
		return (this.values[key] ?? {}) as IConfigurationValue<T>;
	}
}

class DelayedMcpProvider extends InMemoryFileSystemProvider {
	readonly secondReadBarrier = new DeferredPromise<void>();

	override async readFile(resource: URI): Promise<Uint8Array> {
		const result = await super.readFile(resource);
		if (resource.path.includes('/second/')) {
			await this.secondReadBarrier.p;
		}
		return result;
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
		const configurations: IMcpConfigurationTelemetrySnapshot[] = [
			{ source: McpDiscoverySource.VSCodeUserConfig, format: McpDiscoveryFormat.VSCodeServers, scope: McpDiscoveryScope.Profile, host: McpDiscoveryHost.Local, configurationPresent: 1, configuredEntryCount: 1, parseErrorCount: 0, unreadableCount: 0 },
			{ source: McpDiscoverySource.WorkspaceDotMcp, format: McpDiscoveryFormat.ClaudeMcpServers, scope: McpDiscoveryScope.WorkspaceFolder, host: McpDiscoveryHost.Local, configurationPresent: 1, configuredEntryCount: 0, parseErrorCount: 1, unreadableCount: 0 },
			{ source: McpDiscoverySource.ClaudeDesktop, format: McpDiscoveryFormat.ClaudeMcpServers, scope: McpDiscoveryScope.Profile, host: McpDiscoveryHost.Remote, configurationPresent: 1, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 1 },
		];
		const snapshot: IMcpDiscoveryTelemetrySnapshot = {
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
			configurations,
		};
		const telemetryService = new TestTelemetryService();
		const reporter = new McpDiscoveryTelemetry(telemetryService, new TestConfigurationService(), store.add(new TestStorageService()));
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

	test('emits one zero row and privacy-safe explicit gate counts', () => {
		const telemetryService = new TestTelemetryService();
		const configurationService = new TestConfigurationService({
			'chat.mcp.access': 'none',
			'chat.mcp.discovery.enabled': { 'claude-desktop': true, windsurf: false },
			'chat.mcp.allowedServers': ['private-server'],
			'chat.mcp.gallery.enabled': false,
		});
		const storageService = store.add(new TestStorageService());
		storageService.store('mcp.enablement', JSON.stringify([['private-server', false]]), StorageScope.PROFILE, StorageTarget.MACHINE);
		const reporter = new McpDiscoveryTelemetry(telemetryService, configurationService, storageService);
		reporter.logDiscovery([{ candidates: [mcpCandidate(McpDiscoverySource.VSCodeUserConfig, McpDiscoveryFormat.VSCodeServers, McpDiscoveryScope.Profile, McpDiscoveryHost.Local, 'loaded')], configurations: [] }]);
		reporter.logDiscovery([]);
		reporter.logDiscovery([]);
		reporter.logConfiguration();
		reporter.logConfiguration();

		assert.deepStrictEqual(telemetryService.events.reduce<Record<string, number>>((counts, event) => {
			counts[event.name] = (counts[event.name] ?? 0) + 1;
			return counts;
		}, {}), {
			'mcp/serversFound': 3,
			'mcp/configurationFound': 1,
			'mcp/discoveryConfigured': 5,
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

	test('uses registered configuration layers and caps the absent default snapshot', () => {
		const telemetryService = new TestTelemetryService();
		const reporter = new McpDiscoveryTelemetry(telemetryService, new LayeredConfigurationService({
			'chat.mcp.access': { userValue: 'all', workspaceValue: 'none', policyValue: 'registry' },
			'chat.mcp.allowedServers': { applicationValue: ['application'], policyValue: ['policy'] },
			'chat.mcp.deniedServers': { applicationValue: ['application'], policyValue: ['policy'] },
			'chat.mcp.allowManagedServersOnly': { applicationValue: true, policyValue: false },
			'chat.customizations.strictPluginOnlyCustomization': { applicationValue: { mcp: true }, policyValue: { mcp: false } },
			'chat.mcp.gallery.enabled': { userValue: true, workspaceValue: false, policyValue: true },
		}), store.add(new TestStorageService()));

		reporter.logConfiguration();

		const rows = telemetryService.events
			.filter(event => event.name === 'mcp/discoveryConfigured')
			.map(event => event.data as Record<string, unknown>);
		assert.deepStrictEqual({
			access: rows.filter(row => row.entryPoint === 'access').map(row => row.scope),
			allowed: rows.filter(row => row.entryPoint === 'allowedServers').map(row => row.scope),
			denied: rows.filter(row => row.entryPoint === 'deniedServers').map(row => row.scope),
			managed: rows.filter(row => row.entryPoint === 'managedServersOnly').map(row => row.scope),
			strict: rows.filter(row => row.entryPoint === 'strictPluginOnly').map(row => row.scope),
			gallery: rows.filter(row => row.entryPoint === 'galleryEnabled').map(row => row.scope),
		}, {
			access: ['policy', 'user', 'workspace'],
			allowed: ['application', 'policy'],
			denied: ['application', 'policy'],
			managed: ['application', 'policy'],
			strict: ['application', 'policy'],
			gallery: ['policy', 'user', 'workspace'],
		});

		const emptyTelemetry = new TestTelemetryService();
		const emptyReporter = new McpDiscoveryTelemetry(emptyTelemetry, new TestConfigurationService(), store.add(new TestStorageService()));
		emptyReporter.logConfiguration();
		emptyReporter.logConfiguration();
		assert.deepStrictEqual(emptyTelemetry.events.map(event => event.name), ['mcp/discoveryConfigured']);
	});

	test('emits configuration tombstones and an all-zero marker when the last source disappears', () => {
		const telemetryService = new TestTelemetryService();
		const reporter = new McpDiscoveryTelemetry(telemetryService, new TestConfigurationService(), store.add(new TestStorageService()));
		const configuration: IMcpConfigurationTelemetrySnapshot = {
			source: McpDiscoverySource.WorkspaceDotMcp,
			format: McpDiscoveryFormat.ClaudeMcpServers,
			scope: McpDiscoveryScope.WorkspaceFolder,
			host: McpDiscoveryHost.Local,
			configurationPresent: 1,
			configuredEntryCount: 1,
			parseErrorCount: 0,
			unreadableCount: 0,
		};

		reporter.logDiscovery([{ candidates: [], configurations: [configuration] }]);
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
		const snapshot: IMcpDiscoveryTelemetrySnapshot = {
			candidates: sources.map(source => mcpCandidate(
				source,
				source === McpDiscoverySource.Plugin ? McpDiscoveryFormat.PluginMap : source === McpDiscoverySource.Extension ? McpDiscoveryFormat.ExtensionProvider : McpDiscoveryFormat.ClaudeMcpServers,
				source === McpDiscoverySource.Plugin ? McpDiscoveryScope.Plugin : McpDiscoveryScope.Profile,
				McpDiscoveryHost.Local,
				'loaded',
			)),
			configurations: [],
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
			configurations: [],
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
			getExtensionDiscoveryHost(URI.file('/extension')),
			getExtensionDiscoveryHost(URI.from({ scheme: Schemas.vscodeRemote, authority: 'ssh-remote+host', path: '/extension' })),
			getExtensionDiscoveryHost(URI.from({ scheme: Schemas.extension, path: '/extension' })),
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
		const snapshot = await waitForState(discovery.telemetrySnapshot, value => value !== undefined);

		assert.deepStrictEqual({
			candidateHosts: snapshot?.candidates.map(candidate => candidate.host),
			configurationHosts: snapshot?.configurations.map(configuration => configuration.host),
		}, {
			candidateHosts: [McpDiscoveryHost.Remote],
			configurationHosts: [McpDiscoveryHost.Remote],
		});
	});

	test('reports missing, configured-empty, and malformed VS Code MCP files at the scanner boundary', async () => {
		const telemetryService = new TestTelemetryService();
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const scanner = store.add(new McpResourceScannerService(fileService, store.add(new UriIdentityService(fileService)), telemetryService));
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/mcp.json' });

		await scanner.scanMcpServers(resource, ConfigurationTarget.USER);
		await timeout(60);
		await scanner.scanMcpServers(resource, ConfigurationTarget.USER);
		await fileService.writeFile(resource, VSBuffer.fromString('{}'));
		await scanner.scanMcpServers(resource, ConfigurationTarget.USER);
		await timeout(60);
		await fileService.writeFile(resource, VSBuffer.fromString('{ invalid'));
		await assert.rejects(scanner.scanMcpServers(resource, ConfigurationTarget.USER));
		await timeout(60);

		const rows = telemetryService.events.filter(event => event.name === 'mcp/configurationFound').map(event => event.data);
		assert.deepStrictEqual(rows, [
			{ source: 'all', format: 'all', scope: 'all', host: 'all', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 0, parseErrorCount: 1, unreadableCount: 0 },
		]);
	});

	test('configuration aggregation follows the active profile instead of accumulating visited profiles', async () => {
		const telemetryService = new TestTelemetryService();
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const scanner = store.add(new McpResourceScannerService(fileService, store.add(new UriIdentityService(fileService)), telemetryService));
		const profileA = URI.from({ scheme: Schemas.inMemory, path: '/profile-a/mcp.json' });
		const profileB = URI.from({ scheme: Schemas.inMemory, path: '/profile-b/mcp.json' });
		await fileService.writeFile(profileA, VSBuffer.fromString(JSON.stringify({ servers: { a: { type: 'stdio', command: 'a' } } })));
		await fileService.writeFile(profileB, VSBuffer.fromString(JSON.stringify({ servers: { b: { type: 'stdio', command: 'b' }, c: { type: 'stdio', command: 'c' } } })));

		scanner.activateTelemetry(profileA);
		await scanner.scanMcpServers(profileA, ConfigurationTarget.USER);
		await timeout(60);
		scanner.activateTelemetry(profileB);
		await scanner.scanMcpServers(profileB, ConfigurationTarget.USER);
		await timeout(60);
		scanner.activateTelemetry(profileA);
		await timeout(60);

		assert.deepStrictEqual(telemetryService.events.filter(event => event.name === 'mcp/configurationFound').map(event => event.data), [
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 1, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 2, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 1, parseErrorCount: 0, unreadableCount: 0 },
		]);
	});

	test('configuration aggregation batches parallel workspace-folder initialization', async () => {
		const telemetryService = new TestTelemetryService();
		const fileService = store.add(new FileService(new NullLogService()));
		const provider = store.add(new DelayedMcpProvider());
		store.add(fileService.registerProvider(Schemas.inMemory, provider));
		const scanner = store.add(new McpResourceScannerService(fileService, store.add(new UriIdentityService(fileService)), telemetryService));
		const first = URI.from({ scheme: Schemas.inMemory, path: '/first/.vscode/mcp.json' });
		const second = URI.from({ scheme: Schemas.inMemory, path: '/second/.vscode/mcp.json' });
		await fileService.writeFile(first, VSBuffer.fromString(JSON.stringify({ servers: { first: { type: 'stdio', command: 'first' } } })));
		await fileService.writeFile(second, VSBuffer.fromString(JSON.stringify({ servers: { second: { type: 'stdio', command: 'second' } } })));

		scanner.activateTelemetry(first, ConfigurationTarget.WORKSPACE_FOLDER);
		scanner.activateTelemetry(second, ConfigurationTarget.WORKSPACE_FOLDER);
		const scans = Promise.all([
			scanner.scanMcpServers(first, ConfigurationTarget.WORKSPACE_FOLDER),
			scanner.scanMcpServers(second, ConfigurationTarget.WORKSPACE_FOLDER),
		]);
		await timeout(60);
		assert.strictEqual(telemetryService.events.length, 0);
		provider.secondReadBarrier.complete();
		await scans;
		await timeout(0);

		assert.deepStrictEqual(telemetryService.events.filter(event => event.name === 'mcp/configurationFound').map(event => event.data), [{
			source: 'vscodeWorkspaceFolderConfig',
			format: 'vscodeServers',
			scope: 'workspaceFolder',
			host: 'local',
			configurationPresent: 2,
			configuredEntryCount: 2,
			parseErrorCount: 0,
			unreadableCount: 0,
		}]);
	});

	test('platform configuration aggregation emits a tombstone and all-zero marker when cleared', async () => {
		const telemetryService = new TestTelemetryService();
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const scanner = store.add(new McpResourceScannerService(fileService, store.add(new UriIdentityService(fileService)), telemetryService));
		const resource = URI.from({ scheme: Schemas.inMemory, path: '/profile/mcp.json' });
		await fileService.writeFile(resource, VSBuffer.fromString(JSON.stringify({ servers: { server: { type: 'stdio', command: 'server' } } })));

		scanner.activateTelemetry(resource);
		await scanner.scanMcpServers(resource);
		scanner.clearTelemetry(resource);

		assert.deepStrictEqual(telemetryService.events.map(event => event.data), [
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 1, configuredEntryCount: 1, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'all', format: 'all', scope: 'all', host: 'all', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 },
			{ source: 'vscodeUserConfig', format: 'vscodeServers', scope: 'profile', host: 'local', configurationPresent: 0, configuredEntryCount: 0, parseErrorCount: 0, unreadableCount: 0 },
		]);
	});
});
