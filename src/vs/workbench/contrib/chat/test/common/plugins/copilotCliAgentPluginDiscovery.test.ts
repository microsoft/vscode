/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { waitForState } from '../../../../../../base/common/observable.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { ContributionEnablementState, IEnablementModel } from '../../../common/enablement.js';
import { CopilotCliAgentPluginDiscovery } from '../../../common/plugins/agentPluginServiceImpl.js';

class TestCopilotCliAgentPluginDiscovery extends CopilotCliAgentPluginDiscovery {
	public discoverPluginSources() {
		return this._discoverPluginSources();
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
});
