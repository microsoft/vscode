/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../../test/common/workbenchTestServices.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { ConfiguredAgentPluginDiscovery } from '../../../common/plugins/agentPluginServiceImpl.js';
import { IPluginMarketplaceService } from '../../../common/plugins/pluginMarketplaceService.js';

class TestConfiguredAgentPluginDiscovery extends ConfiguredAgentPluginDiscovery {

	public resolvePluginPath(path: string, userHome: URI): Promise<URI[]> {
		return this._resolvePluginPath(path, userHome);
	}

	public resolveEnterprisePluginId(id: string, userHome: URI): URI | undefined {
		return this._resolveEnterprisePluginId(id, userHome);
	}
}

suite('ConfiguredAgentPluginDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createDiscovery(workspaceUri: URI, fileURI: (path: string) => Promise<URI> = path => Promise.resolve(URI.file(path))): TestConfiguredAgentPluginDiscovery {
		return store.add(new TestConfiguredAgentPluginDiscovery(
			new class extends mock<IConfigurationService>() { },
			new class extends mock<IFileService>() { },
			new class extends mock<IPluginMarketplaceService>() { },
			new TestContextService(testWorkspace(workspaceUri)),
			new class extends mock<IPathService>() {
				override fileURI(path: string): Promise<URI> {
					return fileURI(path);
				}
			},
			new NullLogService(),
		));
	}

	test('preserves remote authority for absolute and tilde plugin locations', async () => {
		const remoteUserHome = URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user' });
		const discovery = createDiscovery(URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace' }));

		assert.deepStrictEqual(
			[
				...(await discovery.resolvePluginPath('/opt/plugins/my-plugin', remoteUserHome)),
				...(await discovery.resolvePluginPath('~/plugins/my-plugin', remoteUserHome)),
				...(await discovery.resolvePluginPath('~shared/plugin', remoteUserHome)),
			],
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
			path => Promise.resolve(URI.from({ scheme: Schemas.file, path: path.replace(/\\/g, '/') })),
		);

		assert.deepStrictEqual(
			await discovery.resolvePluginPath('C:\\plugins\\my-plugin', remoteUserHome),
			[URI.from({ scheme: 'vscode-remote', authority: 'ssh-remote+windows', path: 'C:/plugins/my-plugin' })],
		);
	});

	test('preserves UNC authority for local absolute plugin locations', async () => {
		const discovery = createDiscovery(
			URI.file('C:\\workspace'),
			() => Promise.resolve(URI.from({ scheme: Schemas.file, authority: 'server', path: '/share/plugin' })),
		);

		assert.deepStrictEqual(
			await discovery.resolvePluginPath('\\\\server\\share\\plugin', URI.file('C:\\Users\\user')),
			[URI.from({ scheme: Schemas.file, authority: 'server', path: '/share/plugin' })],
		);
	});

	test('resolves enterprise plugin IDs relative to a remote user home', () => {
		const discovery = createDiscovery(URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace' }));

		assert.deepStrictEqual(
			discovery.resolveEnterprisePluginId('plugin@marketplace', URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user' })),
			URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user/.copilot/installed-plugins/marketplace/plugin' }),
		);
	});
});
