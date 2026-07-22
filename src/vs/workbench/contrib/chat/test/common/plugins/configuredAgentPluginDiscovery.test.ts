/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService, IFileStat, IFileStatWithMetadata, IResolveFileOptions, IResolveMetadataFileOptions } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ConfiguredAgentPluginDiscovery } from '../../../common/plugins/agentPluginServiceImpl.js';
import { IPluginMarketplaceService } from '../../../common/plugins/pluginMarketplaceService.js';

class TestConfiguredAgentPluginDiscovery extends ConfiguredAgentPluginDiscovery {

	public discoverPluginSources() {
		return this._discoverPluginSources();
	}
}

suite('ConfiguredAgentPluginDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createDiscovery(
		workspaceUri: URI,
		userHome: URI,
		pluginLocations: Record<string, boolean> = {},
		enabledPlugins: Record<string, boolean> = {},
		fileURI: (path: string) => Promise<URI> = path => Promise.resolve(URI.file(path)),
	): TestConfiguredAgentPluginDiscovery {
		return store.add(new TestConfiguredAgentPluginDiscovery(
			new TestConfigurationService({
				[ChatConfiguration.PluginLocations]: pluginLocations,
				[ChatConfiguration.EnabledPlugins]: enabledPlugins,
			}),
			new class extends mock<IFileService>() {
				override resolve(resource: URI, options: IResolveMetadataFileOptions): Promise<IFileStatWithMetadata>;
				override resolve(resource: URI, options?: IResolveFileOptions): Promise<IFileStat>;
				override resolve(resource: URI, _options?: IResolveFileOptions): Promise<IFileStatWithMetadata> {
					return Promise.resolve({
						resource,
						name: '',
						size: 0,
						mtime: 0,
						ctime: 0,
						etag: '',
						readonly: false,
						locked: false,
						executable: false,
						isFile: false,
						isDirectory: true,
						isSymbolicLink: false,
						children: undefined,
					});
				}
			},
			new class extends mock<IPluginMarketplaceService>() {
				override getMarketplacePluginMetadata(): undefined {
					return undefined;
				}
			},
			new TestContextService(testWorkspace(workspaceUri)),
			new class extends mock<IPathService>() {
				override fileURI(path: string): Promise<URI> {
					return fileURI(path);
				}

				override userHome(options: { preferLocal: true }): URI;
				override userHome(options?: { preferLocal: boolean }): Promise<URI>;
				override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
					return options?.preferLocal ? userHome : Promise.resolve(userHome);
				}
			},
			new NullLogService(),
		));
	}

	test('preserves remote authority for absolute and tilde plugin locations', async () => {
		const remoteUserHome = URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user' });
		const discovery = createDiscovery(
			URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace' }),
			remoteUserHome,
			{
				'/opt/plugins/my-plugin': true,
				'~/plugins/my-plugin': true,
				'~shared/plugin': true,
			},
		);

		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[
				URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/opt/plugins/my-plugin' }),
				URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user/plugins/my-plugin' }),
				URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace/~shared/plugin' }),
			],
		);
	});

	test('normalizes absolute paths for the remote target environment', async () => {
		const remoteUserHome = URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/Users/user' });
		const discovery = createDiscovery(
			URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/workspace' }),
			remoteUserHome,
			{ 'C:\\plugins\\my-plugin': true },
			{},
			path => Promise.resolve(URI.from({ scheme: Schemas.file, path: path.replace(/\\/g, '/') })),
		);

		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/plugins/my-plugin' })],
		);
	});

	test('normalizes tilde paths for a remote Windows target with a file user home', async () => {
		let fileURIPath: string | undefined;
		const discovery = createDiscovery(
			URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/workspace' }),
			URI.from({ scheme: Schemas.file, path: '/C:/Users/user' }),
			{ '~\\plugins\\my-plugin': true },
			{},
			path => {
				fileURIPath = path;
				return Promise.resolve(URI.from({ scheme: Schemas.file, path: path.replace(/\\/g, '/') }));
			},
		);

		assert.deepStrictEqual(
			[
				(await discovery.discoverPluginSources()).map(source => source.uri),
				fileURIPath,
			],
			[
				[URI.from({ scheme: Schemas.file, path: '/C:/Users/user/plugins/my-plugin' })],
				'/C:/Users/user\\plugins\\my-plugin',
			],
		);
	});

	test('preserves UNC authority for local absolute plugin locations', async () => {
		const discovery = createDiscovery(
			URI.file('C:\\workspace'),
			URI.file('C:\\Users\\user'),
			{ '\\\\server\\share\\plugin': true },
			{},
			() => Promise.resolve(URI.from({ scheme: Schemas.file, authority: 'server', path: '/share/plugin' })),
		);

		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[URI.from({ scheme: Schemas.file, authority: 'server', path: '/share/plugin' })],
		);
	});

	test('resolves enterprise plugin IDs relative to a remote user home', async () => {
		const remoteUserHome = URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user' });
		const discovery = createDiscovery(
			URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace' }),
			remoteUserHome,
			{},
			{ 'plugin@marketplace': true },
		);

		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user/.copilot/installed-plugins/marketplace/plugin' })],
		);
	});
});
