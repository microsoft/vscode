/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun, waitForState } from '../../../../../../base/common/observable.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { FileChangesEvent, FileChangeType } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { ContributionEnablementState, IEnablementModel } from '../../../common/enablement.js';
import { CopilotCliAgentPluginDiscovery } from '../../../common/plugins/agentPluginServiceImpl.js';

interface ITestInstalledPlugin {
	readonly name: string;
	readonly marketplace: string;
	readonly uri?: URI;
	readonly version?: string;
	readonly installedAt?: string;
	readonly sourceSha?: string;
}

class TestCopilotCliAgentPluginDiscovery extends CopilotCliAgentPluginDiscovery {
	public discoveryCount = 0;

	public discoverPluginSources() {
		return this._discoverPluginSources();
	}

	protected override _discoverPluginSources() {
		this.discoveryCount++;
		return super._discoverPluginSources();
	}
}

suite('CopilotCliAgentPluginDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();
	const userHome = URI.from({ scheme: Schemas.inMemory, path: '/home/testuser' });
	const copilotHome = joinPath(userHome, '.copilot');
	const configFile = joinPath(copilotHome, 'config.json');
	const installedPluginsRoot = joinPath(copilotHome, 'installed-plugins');
	const marketplaceRoot = joinPath(installedPluginsRoot, 'copilot-plugins');
	const workspaceRoot = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
	const enablementModel: IEnablementModel = {
		readEnabled: () => ContributionEnablementState.EnabledProfile,
		readProfileEnabled: () => true,
		setEnabled: () => { },
		remove: () => { },
	};

	let fileService: FileService;

	setup(() => {
		fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
	});

	teardown(() => {
		sinon.restore();
	});

	function createDiscovery(): TestCopilotCliAgentPluginDiscovery {
		return store.add(new TestCopilotCliAgentPluginDiscovery(
			fileService,
			new class extends mock<IPathService>() {
				override userHome(options: { preferLocal: true }): URI;
				override userHome(options?: { preferLocal: boolean }): Promise<URI>;
				override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
					return options?.preferLocal ? userHome : Promise.resolve(userHome);
				}

				override fileURI(path: string): Promise<URI> {
					return Promise.resolve(URI.from({ scheme: Schemas.inMemory, path }));
				}
			},
			logService,
			new TestContextService(testWorkspace(workspaceRoot)),
		));
	}

	async function writePlugin(uri: URI, name: string): Promise<void> {
		await fileService.writeFile(joinPath(uri, 'plugin.json'), VSBuffer.fromString(JSON.stringify({ name })));
		await fileService.writeFile(joinPath(uri, 'skills', 'repro', 'SKILL.md'), VSBuffer.fromString([
			'---',
			'name: repro',
			'description: Reproduction skill.',
			'---',
			'',
			'Reproduction skill.',
		].join('\n')));
	}

	async function writeInstalledPlugins(plugins: readonly ITestInstalledPlugin[]): Promise<void> {
		const installedPlugins = plugins.map(plugin => ({
			name: plugin.name,
			marketplace: plugin.marketplace,
			...(plugin.uri ? { cache_path: plugin.uri.path } : {}),
			version: plugin.version ?? '1.0.0',
			installed_at: plugin.installedAt ?? '2026-09-21T00:00:00Z',
			enabled: true,
			...(plugin.sourceSha ? { source_sha: plugin.sourceSha } : {}),
		}));
		await fileService.writeFile(configFile, VSBuffer.fromString([
			'// Managed by Copilot CLI.',
			JSON.stringify({ installedPlugins }, undefined, 2),
		].join('\n')));
	}

	test('discovers only plugins committed to CLI state', async () => {
		const committedPlugin = joinPath(marketplaceRoot, 'spark');
		const uncommittedPlugin = joinPath(marketplaceRoot, 'transaction-directory');
		await writePlugin(committedPlugin, 'spark');
		await writePlugin(uncommittedPlugin, 'transaction-directory');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: committedPlugin }]);

		const sources = await createDiscovery().discoverPluginSources();

		assert.deepStrictEqual(sources.map(source => ({
			uri: source.uri.toString(),
			remove: source.remove,
		})), [{
			uri: committedPlugin.toString(),
			remove: undefined,
		}]);
	});

	test('refreshes after a committed atomic replacement without cache watchers', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pluginUri = joinPath(marketplaceRoot, 'spark');
		const stagingUri = joinPath(marketplaceRoot, 'transaction-directory');
		const backupUri = joinPath(marketplaceRoot, 'backup-directory');
		await writePlugin(pluginUri, 'spark-v1');
		await writePlugin(stagingUri, 'spark-v2');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: pluginUri, installedAt: 'v1' }]);
		await timeout(10);

		const watcherEvents = store.add(new Emitter<FileChangesEvent>());
		const watcherReady = new DeferredPromise<void>();
		const createWatcherSpy = sinon.stub(fileService, 'createWatcher').callsFake(() => {
			watcherReady.complete();
			return {
				onDidChange: watcherEvents.event,
				dispose: () => { },
			};
		});
		const watchSpy = sinon.spy(fileService, 'watch');
		const discovery = createDiscovery();
		discovery.start(enablementModel);

		const initialPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v1');
		assert.ok(initialPlugins);
		await watcherReady.p;

		await fileService.move(pluginUri, backupUri);
		await fileService.move(stagingUri, pluginUri);
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: pluginUri, installedAt: 'v2' }]);
		watcherEvents.fire(new FileChangesEvent([{ resource: configFile, type: FileChangeType.UPDATED }], false));

		const updatedPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v2');
		assert.ok(updatedPlugins);
		assert.deepStrictEqual({
			reusedPlugin: initialPlugins[0] === updatedPlugins[0],
			watchRequests: createWatcherSpy.getCalls().map(call => ({
				resource: call.args[0].toString(),
				recursive: call.args[1]?.recursive,
			})),
			uncorrelatedWatchCount: watchSpy.callCount,
		}, {
			reusedPlugin: false,
			watchRequests: [{
				resource: copilotHome.toString(),
				recursive: false,
			}],
			uncorrelatedWatchCount: 0,
		});
	}));

	test('ignores unrelated Copilot runtime writes and unchanged state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const initialPluginUri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(initialPluginUri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: initialPluginUri }]);
		await timeout(10);

		const watcherEvents = store.add(new Emitter<FileChangesEvent>());
		const watcherReady = new DeferredPromise<void>();
		sinon.stub(fileService, 'createWatcher').callsFake(() => {
			watcherReady.complete();
			return {
				onDidChange: watcherEvents.event,
				dispose: () => { },
			};
		});

		const discovery = createDiscovery();
		let publicationCount = 0;
		store.add(autorun(reader => {
			discovery.plugins.read(reader);
			publicationCount++;
		}));
		discovery.start(enablementModel);

		const initialPlugins = await waitForState(discovery.plugins, plugins => plugins?.length === 1);
		assert.ok(initialPlugins);
		await watcherReady.p;
		const initialDiscoveryCount = discovery.discoveryCount;
		const initialPublicationCount = publicationCount;

		await fileService.writeFile(joinPath(copilotHome, 'data.db'), VSBuffer.fromString('runtime churn'));
		watcherEvents.fire(new FileChangesEvent([{ resource: joinPath(copilotHome, 'data.db'), type: FileChangeType.UPDATED }], false));
		await timeout(500);
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: initialPluginUri }]);
		watcherEvents.fire(new FileChangesEvent([{ resource: configFile, type: FileChangeType.UPDATED }], false));
		await timeout(500);

		assert.deepStrictEqual({
			discoveryCount: discovery.discoveryCount,
			publicationCount,
			reusedPublishedArray: discovery.plugins.get() === initialPlugins,
		}, {
			discoveryCount: initialDiscoveryCount,
			publicationCount: initialPublicationCount,
			reusedPublishedArray: true,
		});

		const secondPluginUri = joinPath(marketplaceRoot, 'second');
		await writePlugin(secondPluginUri, 'second');
		await writeInstalledPlugins([
			{ name: 'spark', marketplace: 'copilot-plugins', uri: initialPluginUri },
			{ name: 'second', marketplace: 'copilot-plugins', uri: secondPluginUri },
		]);
		watcherEvents.fire(new FileChangesEvent([{ resource: configFile, type: FileChangeType.UPDATED }], false));
		const updatedPlugins = await waitForState(discovery.plugins, plugins => plugins?.length === 2);
		assert.ok(updatedPlugins);
		assert.deepStrictEqual(updatedPlugins.map(plugin => plugin.label), ['second', 'spark']);
	}));

	test('uses non-recursive ancestors until config exists and recovers after recreation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await fileService.createFolder(userHome);
		const watcherEvents = store.add(new Emitter<FileChangesEvent>());
		const watcherReady = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		let watcherCount = 0;
		const createWatcherSpy = sinon.stub(fileService, 'createWatcher').callsFake(() => {
			watcherReady[watcherCount++]?.complete();
			return {
				onDidChange: watcherEvents.event,
				dispose: () => { },
			};
		});
		const discovery = createDiscovery();
		discovery.start(enablementModel);

		await waitForState(discovery.plugins, plugins => plugins?.length === 0);
		await watcherReady[0].p;

		const pluginUri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(pluginUri, 'spark-v1');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: pluginUri, installedAt: 'v1' }]);
		watcherEvents.fire(new FileChangesEvent([{ resource: copilotHome, type: FileChangeType.ADDED }], false));
		const installedPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v1');
		assert.ok(installedPlugins);
		await watcherReady[1].p;

		await fileService.del(configFile);
		watcherEvents.fire(new FileChangesEvent([{ resource: configFile, type: FileChangeType.DELETED }], false));
		await waitForState(discovery.plugins, plugins => plugins?.length === 0);

		await writePlugin(pluginUri, 'spark-v2');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: pluginUri, installedAt: 'v2' }]);
		watcherEvents.fire(new FileChangesEvent([{ resource: configFile, type: FileChangeType.ADDED }], false));
		const reinstalledPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v2');
		assert.ok(reinstalledPlugins);

		assert.deepStrictEqual({
			watchers: createWatcherSpy.getCalls().map(call => ({
				resource: call.args[0].toString(),
				recursive: call.args[1]?.recursive,
			})),
			labels: [installedPlugins[0].label, reinstalledPlugins[0].label],
		}, {
			watchers: [
				{ resource: userHome.toString(), recursive: false },
				{ resource: copilotHome.toString(), recursive: false },
			],
			labels: ['spark-v1', 'spark-v2'],
		});
	}));

	test('retains the last good inventory while config is malformed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pluginUri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(pluginUri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: pluginUri }]);
		await timeout(10);

		const watcherEvents = store.add(new Emitter<FileChangesEvent>());
		const watcherReady = new DeferredPromise<void>();
		sinon.stub(fileService, 'createWatcher').callsFake(() => {
			watcherReady.complete();
			return {
				onDidChange: watcherEvents.event,
				dispose: () => { },
			};
		});
		const discovery = createDiscovery();
		discovery.start(enablementModel);
		const initialPlugins = await waitForState(discovery.plugins, plugins => plugins?.length === 1);
		assert.ok(initialPlugins);
		await watcherReady.p;

		await fileService.writeFile(configFile, VSBuffer.fromString('{ invalid'));
		watcherEvents.fire(new FileChangesEvent([{ resource: configFile, type: FileChangeType.UPDATED }], false));
		await timeout(500);

		assert.strictEqual(discovery.plugins.get(), initialPlugins);
	}));

	test('rejects cache paths outside the CLI installed root', async () => {
		const externalPlugin = joinPath(userHome, 'external-plugin');
		await writePlugin(externalPlugin, 'external');
		await writeInstalledPlugins([{ name: 'external', marketplace: 'copilot-plugins', uri: externalPlugin }]);

		const sources = await createDiscovery().discoverPluginSources();

		assert.deepStrictEqual(sources, []);
	});

	test('supports the runtime legacy cache-path fallback', async () => {
		const legacyPlugin = joinPath(installedPluginsRoot, 'spark@copilot-plugins');
		await writePlugin(legacyPlugin, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins' }]);

		const sources = await createDiscovery().discoverPluginSources();

		assert.deepStrictEqual(sources.map(source => source.uri.toString()), [legacyPlugin.toString()]);
	});

	test('supports legacy snake-case state and marketplace cache layout', async () => {
		const legacyPlugin = joinPath(marketplaceRoot, 'spark');
		await writePlugin(legacyPlugin, 'spark');
		await fileService.writeFile(configFile, VSBuffer.fromString(JSON.stringify({
			installed_plugins: [{
				name: 'spark',
				marketplace: 'copilot-plugins',
				version: '1.0.0',
				installed_at: '2026-01-19T00:00:00Z',
				enabled: true,
			}],
		})));

		const sources = await createDiscovery().discoverPluginSources();

		assert.deepStrictEqual(sources.map(source => source.uri.toString()), [legacyPlugin.toString()]);
	});
});
