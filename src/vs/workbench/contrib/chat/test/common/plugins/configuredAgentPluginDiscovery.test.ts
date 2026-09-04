/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { IPath, posix, win32 } from '../../../../../../base/common/path.js';
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

	function createFileUri(path: string, targetPath: IPath): URI {
		if (targetPath === win32) {
			path = path.replace(/\\/g, '/');
		}

		let authority = '';
		if (path.startsWith('//')) {
			const authorityEnd = path.indexOf('/', 2);
			authority = authorityEnd === -1 ? path.substring(2) : path.substring(2, authorityEnd);
			path = authorityEnd === -1 ? '/' : path.substring(authorityEnd);
		}

		return URI.from({ scheme: Schemas.file, authority, path });
	}

	function createDiscovery(configuration: {
		workspaceUri: URI;
		userHome: URI;
		pluginLocations?: Record<string, boolean>;
		enabledPlugins?: Record<string, boolean>;
		targetPath?: IPath;
	}): TestConfiguredAgentPluginDiscovery {
		const targetPath = configuration.targetPath ?? posix;
		return store.add(new TestConfiguredAgentPluginDiscovery(
			new TestConfigurationService({
				[ChatConfiguration.PluginLocations]: configuration.pluginLocations ?? {},
				[ChatConfiguration.EnabledPlugins]: configuration.enabledPlugins ?? {},
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
			new TestContextService(testWorkspace(configuration.workspaceUri)),
			new class extends mock<IPathService>() {
				override get path(): Promise<IPath> {
					return Promise.resolve(targetPath);
				}

				override userHome(options: { preferLocal: true }): URI;
				override userHome(options?: { preferLocal: boolean }): Promise<URI>;
				override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
					return options?.preferLocal ? configuration.userHome : Promise.resolve(configuration.userHome);
				}

				override fileURI(path: string): Promise<URI> {
					return Promise.resolve(createFileUri(path, targetPath));
				}
			},
			new NullLogService(),
		));
	}

	test('preserves remote authority for absolute and tilde plugin locations', async () => {
		const remoteUserHome = URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user' });
		const discovery = createDiscovery({
			workspaceUri: URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace' }),
			userHome: remoteUserHome,
			pluginLocations: {
				'/opt/plugins/my-plugin': true,
				'~/plugins/my-plugin': true,
				'~shared/plugin': true,
			},
		});

		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[
				URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/opt/plugins/my-plugin' }),
				URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user/plugins/my-plugin' }),
				URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace/~shared/plugin' }),
			],
		);
	});

	test('uses Windows target path semantics for remote plugin locations', async () => {
		const remoteUserHome = URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/Users/user' });
		const discovery = createDiscovery({
			workspaceUri: URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/workspace' }),
			userHome: remoteUserHome,
			pluginLocations: {
				'C:\\plugins\\my-plugin': true,
				'~': true,
				'~\\plugins\\my-plugin': true,
				'~shared\\plugin': true,
			},
			targetPath: win32,
		});

		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[
				URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/plugins/my-plugin' }),
				URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/Users/user' }),
				URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/Users/user/plugins/my-plugin' }),
				URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/workspace/~shared/plugin' }),
			],
		);
	});

	test('preserves UNC shares for remote Windows plugin locations', async () => {
		const discovery = createDiscovery({
			workspaceUri: URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/workspace' }),
			userHome: URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '/C:/Users/user' }),
			pluginLocations: { '\\\\server\\share\\plugin': true },
			targetPath: win32,
		});
		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: '//server/share/plugin' })],
		);
	});

	test('preserves UNC authority for local absolute plugin locations', async () => {
		const discovery = createDiscovery({
			workspaceUri: URI.file('C:\\workspace'),
			userHome: URI.file('C:\\Users\\user'),
			pluginLocations: { '\\\\server\\share\\plugin': true },
			targetPath: win32,
		});

		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[URI.from({ scheme: Schemas.file, authority: 'server', path: '/share/plugin' })],
		);
	});

	test('resolves local absolute and workspace-relative plugin locations', async () => {
		const discovery = createDiscovery({
			workspaceUri: URI.file('/workspace'),
			userHome: URI.file('/home/user'),
			pluginLocations: {
				'/opt/plugins/my-plugin': true,
				'relative/plugin': true,
			},
		});

		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[
				URI.file('/opt/plugins/my-plugin'),
				URI.file('/workspace/relative/plugin'),
			],
		);
	});

	test('resolves enterprise plugin IDs relative to a remote user home', async () => {
		const remoteUserHome = URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user' });
		const discovery = createDiscovery({
			workspaceUri: URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace' }),
			userHome: remoteUserHome,
			enabledPlugins: { 'plugin@marketplace': true },
		});

		assert.deepStrictEqual(
			(await discovery.discoverPluginSources()).map(source => source.uri),
			[URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user/.copilot/installed-plugins/marketplace/plugin' })],
		);
	});
});
