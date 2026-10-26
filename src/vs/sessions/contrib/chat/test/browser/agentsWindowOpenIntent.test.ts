/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../../common/devContainerAgentHostService.js';
import { getAgentsWindowWorkspaceArgumentKind, resolveAgentsWindowFolderIntent } from '../../browser/agentsWindowOpenIntent.js';

suite('Agents Window open intent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('classifies the original workspace argument without exposing resource identifiers', () => {
		assert.deepStrictEqual([
			undefined,
			URI.file('/private/project'),
			URI.parse('vscode-remote://dev-container+invalid/private/project'),
			URI.parse('vscode-remote://ssh-remote+private-host/private/project'),
			URI.parse('vscode-vfs://github/private/repository'),
		].map(getAgentsWindowWorkspaceArgumentKind), ['none', 'local', 'devContainer', 'remote', 'other']);
	});

	test('resolves local and Dev Container editor workspaces', () => {
		const configurationService = (enabled: boolean) => new TestConfigurationService({
			[DevContainerAgentHostEnabledSettingId]: enabled,
		});
		const localFolder = URI.file('/workspace');
		const hostFolder = URI.file('/host/workspace');
		const devContainerUri = (config: string, parentAuthority?: string) => URI.from({
			scheme: Schemas.vscodeRemote,
			authority: `dev-container+${encodeHex(VSBuffer.fromString(config))}${parentAuthority ? `@${parentAuthority}` : ''}`,
			path: '/workspaces/project',
		});
		const devContainerFolder = devContainerUri(hostFolder.fsPath);
		const resolve = (uri: URI | undefined, enabled: boolean) => {
			const result = resolveAgentsWindowFolderIntent(uri, configurationService(enabled));
			return {
				folderUri: result.folderUri?.toString(),
				preferDevContainer: result.preferDevContainer,
			};
		};

		assert.deepStrictEqual({
			local: resolve(localFolder, true),
			devContainerEnabled: resolve(devContainerFolder, true),
			devContainerDisabled: resolve(devContainerFolder, false),
			// Configurations carrying Docker settings or a configuration file are JSON, not a bare path.
			devContainerWithConfiguration: resolve(devContainerUri(JSON.stringify({ hostPath: hostFolder.fsPath, settings: { host: 'tcp://docker.example:2375' } })), true),
			// The host path of a container on an SSH or Tunnel host is not a local folder.
			devContainerOnRemoteHost: resolve(devContainerUri(hostFolder.fsPath, 'ssh-remote+host'), true),
			devContainerOnTunnelHost: resolve(devContainerUri(JSON.stringify({ hostPath: hostFolder.fsPath }), 'tunnel+name'), true),
			// Containers opened from a volume or a cloned repository have no host path.
			devContainerInVolume: resolve(devContainerUri(JSON.stringify({ volumeName: 'volume', folder: 'project' })), true),
			otherRemote: resolve(URI.parse('vscode-remote://ssh-remote+host/workspace'), true),
			invalidDevContainer: resolve(URI.parse('vscode-remote://dev-container+invalid/workspace'), true),
		}, {
			local: { folderUri: localFolder.toString(), preferDevContainer: false },
			devContainerEnabled: { folderUri: hostFolder.toString(), preferDevContainer: true },
			devContainerDisabled: { folderUri: hostFolder.toString(), preferDevContainer: false },
			devContainerWithConfiguration: { folderUri: hostFolder.toString(), preferDevContainer: true },
			devContainerOnRemoteHost: { folderUri: undefined, preferDevContainer: false },
			devContainerOnTunnelHost: { folderUri: undefined, preferDevContainer: false },
			devContainerInVolume: { folderUri: undefined, preferDevContainer: false },
			otherRemote: { folderUri: undefined, preferDevContainer: false },
			invalidDevContainer: { folderUri: undefined, preferDevContainer: false },
		});
	});
});
