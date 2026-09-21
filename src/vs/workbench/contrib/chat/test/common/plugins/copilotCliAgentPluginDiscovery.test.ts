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
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { FileChangesEvent, FileChangeType } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ContributionEnablementState, IEnablementModel } from '../../../common/enablement.js';
import { ConfiguredAgentPluginDiscovery, CopilotCliAgentPluginDiscovery } from '../../../common/plugins/agentPluginServiceImpl.js';
import { IPluginMarketplaceService } from '../../../common/plugins/pluginMarketplaceService.js';

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
	const installedPluginsRoot = joinPath(userHome, '.copilot', 'installed-plugins');
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
			},
			logService,
			new TestContextService(testWorkspace(workspaceRoot)),
			new class extends mock<IDialogService>() { },
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

	test('ignores hidden marketplace and plugin directories', async () => {
		const visiblePlugin = joinPath(marketplaceRoot, 'spark');
		await writePlugin(visiblePlugin, 'spark');
		await writePlugin(joinPath(marketplaceRoot, '.spark.tmp-123-0'), 'staging');
		await writePlugin(joinPath(installedPluginsRoot, '.marketplace.tmp-123-0', 'hidden'), 'hidden-marketplace');

		const sources = await createDiscovery().discoverPluginSources();

		assert.deepStrictEqual(sources.map(source => source.uri), [visiblePlugin]);
	});

	test('refreshes atomically replaced plugins without plugin-local watchers', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pluginUri = joinPath(marketplaceRoot, 'spark');
		const stagingUri = joinPath(marketplaceRoot, '.spark.tmp-123-0');
		const backupUri = joinPath(marketplaceRoot, '.spark.old-123-0');
		await writePlugin(pluginUri, 'spark-v1');
		await writePlugin(stagingUri, 'spark-v2');

		const createWatcherSpy = sinon.spy(fileService, 'createWatcher');
		const watchSpy = sinon.spy(fileService, 'watch');
		const discovery = createDiscovery();
		discovery.start(enablementModel);

		const initialPlugins = await waitForState(discovery.plugins, plugins => plugins?.length === 1);
		assert.ok(initialPlugins);
		const initialPlugin = initialPlugins[0];
		await waitForState(initialPlugin.skills, skills => skills.length === 1);

		await fileService.move(pluginUri, backupUri);
		await fileService.move(stagingUri, pluginUri);

		const updatedPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v2');
		assert.ok(updatedPlugins);
		await waitForState(updatedPlugins[0].skills, skills => skills.length === 1);

		assert.deepStrictEqual({
			initialLabel: initialPlugin.label,
			updatedLabel: updatedPlugins[0].label,
			reusedPlugin: initialPlugin === updatedPlugins[0],
			pluginWatcherCount: createWatcherSpy.callCount,
			discoveryWatchers: watchSpy.getCalls().map(call => ({
				resource: call.args[0].toString(),
				recursive: call.args[1]?.recursive,
			})),
		}, {
			initialLabel: 'spark-v1',
			updatedLabel: 'spark-v2',
			reusedPlugin: false,
			pluginWatcherCount: 0,
			discoveryWatchers: [{
				resource: installedPluginsRoot.toString(),
				recursive: true,
			}],
		});
	}));

	test('ignores unrelated Copilot runtime writes while refreshing real plugin changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const initialPluginUri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(initialPluginUri, 'spark');
		await timeout(10);

		const rootWatcherReady = new DeferredPromise<void>();
		const originalWatch = fileService.watch.bind(fileService);
		sinon.stub(fileService, 'watch').callsFake((resource, options) => {
			rootWatcherReady.complete();
			return originalWatch(resource, options);
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
		await rootWatcherReady.p;
		const initialDiscoveryCount = discovery.discoveryCount;
		const initialPublicationCount = publicationCount;

		await fileService.writeFile(joinPath(userHome, '.copilot', 'data.db'), VSBuffer.fromString('runtime churn'));
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

		await writePlugin(joinPath(marketplaceRoot, 'second'), 'second');
		const updatedPlugins = await waitForState(discovery.plugins, plugins => plugins?.length === 2);
		assert.ok(updatedPlugins);
		assert.deepStrictEqual({
			discoveryRefreshed: discovery.discoveryCount > initialDiscoveryCount,
			inventoryPublished: publicationCount > initialPublicationCount,
			labels: updatedPlugins.map(plugin => plugin.label),
		}, {
			discoveryRefreshed: true,
			inventoryPublished: true,
			labels: ['second', 'spark'],
		});
	}));

	test('uses non-recursive ancestors until the install root exists and recovers after root replacement', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		await fileService.createFolder(userHome);
		const ancestorEvents = store.add(new Emitter<FileChangesEvent>());
		const ancestorWatcherReady = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		const rootWatcherReady = [new DeferredPromise<void>(), new DeferredPromise<void>()];
		let ancestorWatcherCount = 0;
		let rootWatcherCount = 0;
		const createWatcherSpy = sinon.stub(fileService, 'createWatcher').callsFake(() => {
			ancestorWatcherReady[ancestorWatcherCount++]?.complete();
			return {
				onDidChange: ancestorEvents.event,
				dispose: () => { },
			};
		});
		const originalWatch = fileService.watch.bind(fileService);
		const watchSpy = sinon.stub(fileService, 'watch').callsFake((resource, options) => {
			rootWatcherReady[rootWatcherCount++]?.complete();
			return originalWatch(resource, options);
		});
		const discovery = createDiscovery();
		discovery.start(enablementModel);

		await waitForState(discovery.plugins, plugins => plugins?.length === 0);
		await ancestorWatcherReady[0].p;

		const pluginUri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(pluginUri, 'spark-v1');
		ancestorEvents.fire(new FileChangesEvent([{
			resource: joinPath(userHome, '.copilot'),
			type: FileChangeType.ADDED,
		}], false));
		const installedPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v1');
		assert.ok(installedPlugins);
		await rootWatcherReady[0].p;

		await fileService.del(installedPluginsRoot, { recursive: true });
		await waitForState(discovery.plugins, plugins => plugins?.length === 0);
		await ancestorWatcherReady[1].p;

		await writePlugin(pluginUri, 'spark-v2');
		ancestorEvents.fire(new FileChangesEvent([{
			resource: installedPluginsRoot,
			type: FileChangeType.ADDED,
		}], false));
		const reinstalledPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v2');
		assert.ok(reinstalledPlugins);
		await rootWatcherReady[1].p;

		const ancestorWatcherCalls = createWatcherSpy.getCalls().map(call => ({
			resource: call.args[0].toString(),
			recursive: call.args[1]?.recursive,
		}));
		const rootWatcherCalls = watchSpy.getCalls().map(call => ({
			resource: call.args[0].toString(),
			recursive: call.args[1]?.recursive,
		}));
		assert.deepStrictEqual({
			firstAncestorWatcher: ancestorWatcherCalls[0],
			lastRootWatcher: rootWatcherCalls.at(-1),
			hasRecursiveAncestor: ancestorWatcherCalls.some(call => call.recursive),
			labels: [installedPlugins[0].label, reinstalledPlugins[0].label],
		}, {
			firstAncestorWatcher: {
				resource: userHome.toString(),
				recursive: false,
			},
			lastRootWatcher: {
				resource: installedPluginsRoot.toString(),
				recursive: true,
			},
			hasRecursiveAncestor: false,
			labels: ['spark-v1', 'spark-v2'],
		});
	}));

	test('managed CLI plugins use the root watcher and remain atomically replaceable', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pluginUri = joinPath(marketplaceRoot, 'spark');
		const stagingUri = joinPath(marketplaceRoot, '.spark.tmp-123-0');
		const backupUri = joinPath(marketplaceRoot, '.spark.old-123-0');
		await writePlugin(pluginUri, 'spark-v1');
		await writePlugin(stagingUri, 'spark-v2');

		const createWatcherSpy = sinon.spy(fileService, 'createWatcher');
		const watchSpy = sinon.spy(fileService, 'watch');
		const discovery = store.add(new ConfiguredAgentPluginDiscovery(
			new TestConfigurationService({
				[ChatConfiguration.EnabledPlugins]: {
					'spark@copilot-plugins': true,
				},
			}),
			fileService,
			new class extends mock<IPluginMarketplaceService>() {
				override getMarketplacePluginMetadata() {
					return undefined;
				}
			},
			new TestContextService(testWorkspace(workspaceRoot)),
			new class extends mock<IPathService>() {
				override userHome(options: { preferLocal: true }): URI;
				override userHome(options?: { preferLocal: boolean }): Promise<URI>;
				override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
					return options?.preferLocal ? userHome : Promise.resolve(userHome);
				}
			},
			logService,
		));
		discovery.start(enablementModel);

		const initialPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v1');
		assert.ok(initialPlugins);
		await waitForState(initialPlugins[0].skills, skills => skills.length === 1);

		await fileService.move(pluginUri, backupUri);
		await fileService.move(stagingUri, pluginUri);

		const updatedPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v2');
		assert.ok(updatedPlugins);

		assert.deepStrictEqual({
			pluginWatcherCount: createWatcherSpy.callCount,
			rootWatchers: watchSpy.getCalls().map(call => ({
				resource: call.args[0].toString(),
				recursive: call.args[1]?.recursive,
			})),
			labels: [initialPlugins[0].label, updatedPlugins[0].label],
		}, {
			pluginWatcherCount: 0,
			rootWatchers: [{
				resource: installedPluginsRoot.toString(),
				recursive: true,
			}],
			labels: ['spark-v1', 'spark-v2'],
		});
	}));
});
