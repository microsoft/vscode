/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { FileChangesEvent, FileChangeType } from '../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { ContributionEnablementState, IEnablementModel } from '../../../common/enablement.js';
import { IAgentPluginRepositoryService } from '../../../common/plugins/agentPluginRepositoryService.js';
import { MarketplaceAgentPluginDiscovery } from '../../../common/plugins/agentPluginServiceImpl.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IMarketplaceInstalledPlugin, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';

suite('MarketplaceAgentPluginDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();
	const pluginUri = URI.from({ scheme: Schemas.inMemory, path: '/agent-plugins/demo' });
	const repositoryUri = URI.from({ scheme: Schemas.inMemory, path: '/agent-plugins/repository' });
	const workspaceUri = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
	const marketplaceReference = parseMarketplaceReference('owner/catalog')!;
	const installedPlugin: IMarketplaceInstalledPlugin = {
		pluginUri,
		plugin: {
			name: 'demo',
			description: '',
			version: '1.0.0',
			source: 'plugins/demo',
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/demo' },
			marketplace: marketplaceReference.displayLabel,
			marketplaceReference,
			marketplaceType: MarketplaceType.Copilot,
		},
	};
	const enablementModel: IEnablementModel = {
		readEnabled: () => ContributionEnablementState.EnabledProfile,
		readProfileEnabled: () => true,
		setEnabled: () => { },
		remove: () => { },
	};

	teardown(() => {
		sinon.restore();
	});

	test('removes a discovered plugin when its exact target directory is deleted', async () => {
		const fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		await fileService.writeFile(joinPath(pluginUri, 'plugin.json'), VSBuffer.fromString(JSON.stringify({ name: 'demo' })));
		const watcherEvents = store.add(new Emitter<FileChangesEvent>());
		sinon.stub(fileService, 'createWatcher').callsFake(() => ({
			onDidChange: watcherEvents.event,
			dispose: () => { },
		}));
		const installedPlugins = observableValue<readonly IMarketplaceInstalledPlugin[]>('installedPlugins', [installedPlugin]);
		const discovery = store.add(new MarketplaceAgentPluginDiscovery(
			new class extends mock<IPluginMarketplaceService>() {
				override readonly installedPlugins = installedPlugins;
			}(),
			new class extends mock<IPluginInstallService>() { }(),
			new class extends mock<IAgentPluginRepositoryService>() {
				override getRepositoryUri(): URI {
					return repositoryUri;
				}
			}(),
			fileService,
			new class extends mock<IPathService>() {
				override userHome(options: { preferLocal: true }): URI;
				override userHome(options?: { preferLocal: boolean }): Promise<URI>;
				override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
					const userHome = URI.from({ scheme: Schemas.inMemory, path: '/home' });
					return options?.preferLocal ? userHome : Promise.resolve(userHome);
				}
			}(),
			logService,
			new TestContextService(testWorkspace(workspaceUri)),
		));
		discovery.start(enablementModel);
		const discovered = await waitForState(discovery.plugins, plugins => plugins?.length === 1);
		assert.ok(discovered);

		await fileService.del(pluginUri, { recursive: true });
		watcherEvents.fire(new FileChangesEvent([{ resource: pluginUri, type: FileChangeType.DELETED }], false));
		await waitForState(discovery.plugins, plugins => plugins?.length === 0);

		assert.deepStrictEqual({
			discovered: discovery.plugins.get()?.length,
			durableEntries: installedPlugins.get().length,
		}, {
			discovered: 0,
			durableEntries: 1,
		});
	});
});
