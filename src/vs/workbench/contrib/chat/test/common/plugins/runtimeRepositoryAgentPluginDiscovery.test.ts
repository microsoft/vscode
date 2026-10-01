/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { RuntimeRepositoryAgentPluginDiscovery } from '../../../common/plugins/agentPluginServiceImpl.js';
import { RuntimeRepositoryPluginService } from '../../../common/plugins/runtimeRepositoryPluginService.js';
import type { IEnablementModel } from '../../../common/enablement.js';

class TestRuntimeRepositoryAgentPluginDiscovery extends RuntimeRepositoryAgentPluginDiscovery {
	discoverPluginSources() {
		return this._discoverPluginSources();
	}
}

suite('RuntimeRepositoryAgentPluginDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();

	test('projects runtime source identity and scoped enablement', async () => {
		const fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		const pluginPath = '/plugins/repository-plugin';
		await fileService.writeFile(
			URI.from({ scheme: Schemas.inMemory, path: `${pluginPath}/plugin.json` }),
			VSBuffer.fromString(JSON.stringify({ name: 'repository-plugin' })),
		);
		const runtimeService = store.add(new RuntimeRepositoryPluginService(new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		}()));
		runtimeService.setSnapshot(URI.from({ scheme: Schemas.inMemory, path: '/workspace' }), {
			fingerprint: 'test',
			plugins: [{
				plugin: {
					name: 'repository-plugin',
					marketplace: 'repository-market',
					enabled: false,
					installed_at: '2026-09-30T00:00:00Z',
					cache_path: pluginPath,
				},
				enabled: true,
			}],
			warnings: [],
		});
		const discovery = store.add(new TestRuntimeRepositoryAgentPluginDiscovery(
			fileService,
			new class extends mock<IPathService>() {
				override userHome(options: { preferLocal: true }): URI;
				override userHome(options?: { preferLocal: boolean }): Promise<URI>;
				override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
					const home = URI.from({ scheme: Schemas.inMemory, path: '/home' });
					return options?.preferLocal ? home : Promise.resolve(home);
				}
				override fileURI(path: string): Promise<URI> { return Promise.resolve(URI.from({ scheme: Schemas.inMemory, path })); }
			},
			logService,
			new TestContextService(testWorkspace(URI.from({ scheme: Schemas.inMemory, path: '/workspace' }))),
			runtimeService,
		));

		const sources = await discovery.discoverPluginSources();

		assert.deepStrictEqual(sources.map(source => ({
			uri: source.uri.toString(),
			identity: source.externalIdentity,
			profileEnabled: source.profileEnabled,
			workspaceEnabled: source.workspaceEnabled,
			watchPluginContents: source.watchPluginContents,
		})), [{
			uri: 'inmemory:/plugins/repository-plugin',
			identity: { name: 'repository-plugin', marketplace: 'repository-market' },
			profileEnabled: false,
			workspaceEnabled: true,
			watchPluginContents: false,
		}]);

		discovery.start(new class extends mock<IEnablementModel>() { }());
		await runtimeService.whenDiscoverySettled();
		assert.deepStrictEqual(discovery.plugins.get()?.map(plugin => plugin.externalIdentity), [{
			name: 'repository-plugin',
			marketplace: 'repository-market',
		}]);
	});
});
