/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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

	public resolvePluginPath(path: string, userHome: URI): URI[] {
		return this._resolvePluginPath(path, userHome);
	}
}

suite('ConfiguredAgentPluginDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createDiscovery(workspaceUri: URI): TestConfiguredAgentPluginDiscovery {
		return store.add(new TestConfiguredAgentPluginDiscovery(
			new class extends mock<IConfigurationService>() { },
			new class extends mock<IFileService>() { },
			new class extends mock<IPluginMarketplaceService>() { },
			new TestContextService(testWorkspace(workspaceUri)),
			new class extends mock<IPathService>() { },
			new NullLogService(),
		));
	}

	test('preserves remote authority for absolute and tilde plugin locations', () => {
		const remoteUserHome = URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user' });
		const discovery = createDiscovery(URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace' }));

		assert.deepStrictEqual(
			[
				...discovery.resolvePluginPath('/opt/plugins/my-plugin', remoteUserHome),
				...discovery.resolvePluginPath('~/plugins/my-plugin', remoteUserHome),
				...discovery.resolvePluginPath('~shared/plugin', remoteUserHome),
			],
			[
				URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/opt/plugins/my-plugin' }),
				URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/home/user/plugins/my-plugin' }),
				URI.from({ scheme: 'vscode-remote', authority: 'wsl+ubuntu', path: '/workspace/~shared/plugin' }),
			],
		);
	});
});
