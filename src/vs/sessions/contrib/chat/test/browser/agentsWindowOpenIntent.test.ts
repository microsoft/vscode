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
import { RemoteAgentHostConnection, RemoteAgentHostEntryType } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { resolveRemoteAgentHostEntryAuthority } from '../../../../../workbench/contrib/sessions/browser/openInVSCodeUtils.js';
import { DevContainerAgentHostEnabledSettingId } from '../../../../../workbench/contrib/sessions/common/devContainerAgentHostService.js';
import { getAgentsWindowWorkspaceArgumentKind, getAgentsWindowWorkspaceArgumentRemoteKind, resolveAgentsWindowFolderIntent } from '../../browser/agentsWindowOpenIntent.js';

suite('Agents Window open intent', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const devContainerUri = (config: string, parentAuthority?: string) => URI.from({
		scheme: Schemas.vscodeRemote,
		authority: `dev-container+${encodeHex(VSBuffer.fromString(config))}${parentAuthority ? `@${parentAuthority}` : ''}`,
		path: '/workspaces/project',
	});

	test('classifies the original workspace argument without exposing resource identifiers', () => {
		assert.deepStrictEqual([
			undefined,
			URI.file('/private/project'),
			URI.parse('vscode-remote://dev-container+invalid/private/project'),
			URI.parse('vscode-remote://ssh-remote+private-host/private/project'),
			URI.parse('vscode-vfs://github/private/repository'),
		].map(getAgentsWindowWorkspaceArgumentKind), ['none', 'local', 'devContainer', 'remote', 'other']);
	});

	test('classifies the remote hosting the workspace argument without exposing its authority', () => {
		assert.deepStrictEqual([
			undefined,
			URI.file('/private/project'),
			URI.parse('vscode-vfs://github/private/repository'),
			devContainerUri('/private/project'),
			devContainerUri('/private/project', 'ssh-remote+private-host'),
			devContainerUri('/private/project', 'tunnel+private-tunnel'),
			devContainerUri('\\\\wsl.localhost\\Ubuntu\\private\\project'),
			devContainerUri('\\\\wsl\\Ubuntu\\private\\project'),
			URI.parse('vscode-remote://ssh-remote+private-host/private/project'),
			URI.parse('vscode-remote://wsl+Ubuntu/private/project'),
			URI.parse('vscode-remote://tunnel+private-tunnel/private/project'),
			URI.parse('vscode-remote://codespaces+private-codespace/workspaces/project'),
			URI.parse('vscode-remote://attached-container+0123/private/project'),
			URI.parse('vscode-remote://k8s-container+private/private/project'),
		].map(getAgentsWindowWorkspaceArgumentRemoteKind), ['none', 'none', 'none', 'none', 'ssh', 'tunnel', 'wsl', 'wsl', 'ssh', 'wsl', 'tunnel', 'codespaces', 'attachedContainer', 'other']);
	});

	test('resolves local, Dev Container and remote editor workspaces', () => {
		const configurationService = (enabled: boolean) => new TestConfigurationService({
			[DevContainerAgentHostEnabledSettingId]: enabled,
		});
		const localFolder = URI.file('/workspace');
		const hostFolder = URI.file('/host/workspace');
		const devContainerFolder = devContainerUri(hostFolder.fsPath);
		const resolve = (uri: URI | undefined, enabled: boolean) => {
			const result = resolveAgentsWindowFolderIntent(uri, configurationService(enabled));
			return {
				folderUri: result.folderUri?.toString(),
				preferDevContainer: result.preferDevContainer,
				remote: result.remote,
			};
		};

		assert.deepStrictEqual({
			local: resolve(localFolder, true),
			devContainerEnabled: resolve(devContainerFolder, true),
			devContainerDisabled: resolve(devContainerFolder, false),
			// Configurations carrying Docker settings or a configuration file are JSON, not a bare path.
			devContainerWithConfiguration: resolve(devContainerUri(JSON.stringify({ hostPath: hostFolder.fsPath, settings: { host: 'tcp://docker.example:2375' } })), true),
			// The host path of a container on an SSH or Tunnel host is a folder on that host.
			devContainerOnRemoteHost: resolve(devContainerUri('/home/me/project', 'ssh-remote+host'), true),
			devContainerOnRemoteHostDisabled: resolve(devContainerUri('/home/me/project', 'ssh-remote+host'), false),
			devContainerOnTunnelHost: resolve(devContainerUri(JSON.stringify({ hostPath: 'C:\\Users\\me\\project' }), 'tunnel+name'), true),
			// Dev Containers identifies WSL sources by UNC path rather than a parent authority.
			devContainerInWSL: resolve(devContainerUri('\\\\wsl.localhost\\Ubuntu-24.04\\home\\me\\My Project'), true),
			devContainerInLegacyWSLPath: resolve(devContainerUri(JSON.stringify({ hostPath: '\\\\wsl$\\Debian' })), true),
			// Containers opened from a volume or a cloned repository have no host path.
			devContainerInVolume: resolve(devContainerUri(JSON.stringify({ volumeName: 'volume', folder: 'project' })), true),
			devContainerInVolumeOnRemoteHost: resolve(devContainerUri(JSON.stringify({ volumeName: 'volume', folder: 'project' }), 'ssh-remote+host'), true),
			ssh: resolve(URI.parse('vscode-remote://ssh-remote+host/workspace'), true),
			wsl: resolve(URI.parse('vscode-remote://wsl+Ubuntu-24.04/home/me/project'), true),
			// Remote - WSL names a WSL on another machine with `@`.
			wslOnTunnelHost: resolve(URI.parse('vscode-remote://wsl+ubuntu@tunnel+surface/home/me/project'), true),
			tunnel: resolve(URI.parse('vscode-remote://tunnel+name/c:/remote/project'), true),
			codespaces: resolve(URI.parse('vscode-remote://codespaces+name/workspaces/project'), true),
			attachedContainer: resolve(URI.parse('vscode-remote://attached-container+0123/app'), true),
			invalidDevContainer: resolve(URI.parse('vscode-remote://dev-container+invalid/workspace'), true),
			virtual: resolve(URI.parse('vscode-vfs://github/microsoft/vscode'), true),
		}, {
			local: { folderUri: localFolder.toString(), preferDevContainer: false, remote: undefined },
			devContainerEnabled: { folderUri: hostFolder.toString(), preferDevContainer: true, remote: undefined },
			devContainerDisabled: { folderUri: hostFolder.toString(), preferDevContainer: false, remote: undefined },
			devContainerWithConfiguration: { folderUri: hostFolder.toString(), preferDevContainer: true, remote: undefined },
			devContainerOnRemoteHost: { folderUri: undefined, preferDevContainer: true, remote: { kind: 'ssh', folder: { remoteAuthority: 'ssh-remote+host', path: '/home/me/project' } } },
			devContainerOnRemoteHostDisabled: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'ssh', folder: { remoteAuthority: 'ssh-remote+host', path: '/home/me/project' } } },
			devContainerOnTunnelHost: { folderUri: undefined, preferDevContainer: true, remote: { kind: 'tunnel', folder: { remoteAuthority: 'tunnel+name', path: '/C:/Users/me/project' } } },
			devContainerInWSL: { folderUri: undefined, preferDevContainer: true, remote: { kind: 'wsl', folder: { remoteAuthority: 'wsl+Ubuntu-24.04', path: '/home/me/My Project' } } },
			devContainerInLegacyWSLPath: { folderUri: undefined, preferDevContainer: true, remote: { kind: 'wsl', folder: { remoteAuthority: 'wsl+Debian', path: '/' } } },
			devContainerInVolume: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'none', folder: undefined } },
			devContainerInVolumeOnRemoteHost: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'ssh', folder: undefined } },
			ssh: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'ssh', folder: { remoteAuthority: 'ssh-remote+host', path: '/workspace' } } },
			wsl: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'wsl', folder: { remoteAuthority: 'wsl+Ubuntu-24.04', path: '/home/me/project' } } },
			wslOnTunnelHost: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'wsl', folder: undefined } },
			tunnel: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'tunnel', folder: { remoteAuthority: 'tunnel+name', path: '/c:/remote/project' } } },
			codespaces: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'codespaces', folder: undefined } },
			attachedContainer: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'attachedContainer', folder: undefined } },
			invalidDevContainer: { folderUri: undefined, preferDevContainer: false, remote: { kind: 'none', folder: undefined } },
			virtual: { folderUri: undefined, preferDevContainer: false, remote: undefined },
		});
	});

	test('maps editor windows opened from the Agents Window back to the same host', () => {
		const configurationService = new TestConfigurationService({ [DevContainerAgentHostEnabledSettingId]: true });
		const roundTrip = (connection: RemoteAgentHostConnection, path: string) => {
			const remoteAuthority = resolveRemoteAgentHostEntryAuthority({ name: 'host', connection });
			const result = resolveAgentsWindowFolderIntent(URI.from({ scheme: Schemas.vscodeRemote, authority: remoteAuthority, path }), configurationService);
			return { folder: result.remote?.folder, preferDevContainer: result.preferDevContainer };
		};
		assert.deepStrictEqual({
			ssh: roundTrip({ type: RemoteAgentHostEntryType.SSH, address: 'ssh:myhost', sshConfigHost: 'myhost', hostName: 'myhost.example.com' }, '/home/me/project'),
			tunnel: roundTrip({ type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'id', clusterId: 'usw2', label: 'my-tunnel' }, '/home/me/project'),
			wsl: roundTrip({ type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' }, '/home/me/project'),
			devContainerOnSSH: roundTrip({ type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:ssh', hostPath: '/home/me/project', hostAuthority: 'ssh-remote+myhost' }, '/workspaces/project'),
			devContainerInWSL: roundTrip({ type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:wsl', hostPath: '/home/me/My Project', hostAuthority: 'wsl+Ubuntu' }, '/workspaces/project'),
		}, {
			ssh: { folder: { remoteAuthority: 'ssh-remote+myhost', path: '/home/me/project' }, preferDevContainer: false },
			tunnel: { folder: { remoteAuthority: 'tunnel+my-tunnel', path: '/home/me/project' }, preferDevContainer: false },
			wsl: { folder: { remoteAuthority: 'wsl+Ubuntu', path: '/home/me/project' }, preferDevContainer: false },
			devContainerOnSSH: { folder: { remoteAuthority: 'ssh-remote+myhost', path: '/home/me/project' }, preferDevContainer: true },
			devContainerInWSL: { folder: { remoteAuthority: 'wsl+Ubuntu', path: '/home/me/My Project' }, preferDevContainer: true },
		});
	});
});
