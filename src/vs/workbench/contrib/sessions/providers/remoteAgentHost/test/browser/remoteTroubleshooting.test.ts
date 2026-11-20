/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { RemoteAgentHostConnectionStatus } from '../../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { getRemoteTroubleshootingGuide } from '../../browser/remoteTroubleshooting.js';
import { ICustomizationRemote, IRemoteTroubleshootingInfo, RemoteKind } from '../../browser/remotesModel.js';

function remote(kind: RemoteKind, overrides: Partial<ICustomizationRemote> = {}): ICustomizationRemote {
	return { id: `${kind}:test`, kind, name: 'Test', detail: 'test.example.com', canRemove: false, availability: 'unknown', connectionStatus: RemoteAgentHostConnectionStatus.disconnected, ...overrides };
}

/** The first sentence of each guidance paragraph is enough to tell which explanation applies. */
function summarize(target: ICustomizationRemote, info: IRemoteTroubleshootingInfo = {}) {
	const guide = getRemoteTroubleshootingGuide(target, info, target.lastConnectionError);
	return {
		primary: guide.primary, actions: guide.actions, guidance: guide.guidance.map(text => text.split('. ')[0]),
		...(guide.command ? { command: guide.command.value } : {}),
		...(guide.facts.length ? { facts: Object.fromEntries(guide.facts.map(fact => [fact.label, fact.value])) } : {}),
	};
}

suite('getRemoteTroubleshootingGuide', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('the primary action follows the connection state', () => {
		const connected = remote('tunnel', { connectionStatus: RemoteAgentHostConnectionStatus.connected, availability: 'online' });
		assert.deepStrictEqual({
			disconnected: summarize(remote('tunnel')),
			failed: summarize(remote('tunnel', { lastConnectionError: 'Something unexpected' })),
			connecting: summarize(remote('tunnel', { connectionStatus: RemoteAgentHostConnectionStatus.connecting })),
			connected: summarize(connected),
			connectedNotInPicker: summarize({ ...connected, pickerUnavailableReason: 'Not selectable.' }),
			connectedOutdated: summarize({ ...connected, canUpdateServer: true }),
			connectedWithHost: summarize({ ...connected, kind: 'devContainer', connectsWithHost: true }),
			updateServer: summarize(remote('tunnel', { connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1'], ['2'], 'vendor/update') })),
			signIn: summarize(remote('tunnel', { requiresTunnelSignIn: true })),
		}, {
			disconnected: { primary: 'connect', actions: [], guidance: [] },
			failed: { primary: 'retry', actions: [], guidance: [] },
			connecting: { primary: undefined, actions: [], guidance: ['Connecting'] },
			connected: { primary: 'newSession', actions: ['disconnect'], guidance: [] },
			connectedNotInPicker: { primary: undefined, actions: ['disconnect'], guidance: [] },
			connectedOutdated: { primary: 'newSession', actions: ['disconnect', 'updateServer'], guidance: [] },
			connectedWithHost: { primary: 'newSession', actions: [], guidance: [] },
			updateServer: {
				primary: 'updateServer', actions: [], guidance: ['The server on this environment needs an update before you can connect'],
				facts: { 'Protocol versions': 'This computer supports 1. The server offers 2.' },
			},
			signIn: { primary: 'signIn', actions: [], guidance: ['Sign in with the GitHub or Microsoft account that shares this tunnel.'] },
		});
	});

	test('SSH failures are explained from their errors, with a command to test the connection', () => {
		const info: IRemoteTroubleshootingInfo = { ssh: { alias: 'build', hostName: 'build.example.com', user: 'dev', port: 22, identityFiles: ['~/.ssh/id_ed25519'], hasSavedHostKey: true } };
		const failure = (lastConnectionError: string, details = info) => {
			const { primary, actions, guidance, command } = summarize(remote('ssh', { lastConnectionError }), details);
			return { primary, actions, guidance, command };
		};
		assert.deepStrictEqual({
			facts: summarize(remote('ssh'), info).facts,
			authentication: failure('All configured authentication methods failed'),
			hostKey: failure('Host key verification failed'),
			hostKeyNotSaved: failure('Host key verification failed', { ssh: { hostName: 'build.example.com', user: 'dev', port: 2222, hasSavedHostKey: false } }),
			refused: failure('connect ECONNREFUSED 10.0.0.1:22'),
			dns: failure('getaddrinfo ENOTFOUND build.example.com'),
			network: failure('connect ETIMEDOUT 10.0.0.1:22'),
			proxy: failure('SSH jump process exited with code 255'),
			key: failure('Cannot parse privateKey: Encrypted private key detected, but no passphrase given'),
			remoteSetup: failure('Timed out waiting for the agent host to register'),
			unknown: failure('Something unexpected'),
			incompatible: summarize(remote('ssh', { connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1'], ['2']) }), info).guidance,
		}, {
			facts: { 'Resolved host': 'build.example.com', 'User': 'dev', 'Identity files': '~/.ssh/id_ed25519' },
			authentication: { primary: 'retry', actions: ['connectViaSSH', 'openSSHConfig'], guidance: ['The SSH server rejected the sign-in'], command: 'ssh -v build' },
			hostKey: { primary: 'retry', actions: ['forgetHostKey', 'openSSHConfig'], guidance: ['The remote computer\'s host key doesn\'t match the saved key'], command: 'ssh -v build' },
			hostKeyNotSaved: { primary: 'retry', actions: ['openSSHConfig'], guidance: ['The remote computer\'s host key doesn\'t match the saved key'], command: 'ssh -v dev@build.example.com -p 2222' },
			refused: { primary: 'retry', actions: ['openSSHConfig'], guidance: ['The remote computer refused the connection'], command: 'ssh -v build' },
			dns: { primary: 'retry', actions: ['openSSHConfig'], guidance: ['The host name couldn\'t be resolved'], command: 'ssh -v build' },
			network: { primary: 'retry', actions: ['openSSHConfig'], guidance: ['The remote computer couldn\'t be reached from this network'], command: 'ssh -v build' },
			proxy: { primary: 'retry', actions: ['openSSHConfig'], guidance: ['The ProxyJump or ProxyCommand configuration failed'], command: 'ssh -v build' },
			key: { primary: 'retry', actions: ['openSSHConfig'], guidance: ['The SSH key couldn\'t be used'], command: 'ssh -v build' },
			remoteSetup: { primary: 'retry', actions: ['openSSHConfig'], guidance: ['Signing in worked, but starting the agent host on the remote computer failed'], command: 'ssh -v build' },
			unknown: { primary: 'retry', actions: ['openSSHConfig'], guidance: ['Run the command below in a terminal to see where the connection fails.'], command: 'ssh -v build' },
			incompatible: ['The agent host on the remote computer doesn\'t support this version of VS Code'],
		});
	});

	test('WSL distributions are explained by their state', () => {
		const info: IRemoteTroubleshootingInfo = { canRestartDistribution: true };
		assert.deepStrictEqual({
			stopped: summarize(remote('wsl', { availability: 'offline', startsOnConnect: true }), info),
			notInstalled: summarize(remote('wsl', { availability: 'offline' }), info),
			download: summarize(remote('wsl', { availability: 'online', lastConnectionError: 'Failed to download the server: getaddrinfo ENOTFOUND update.code.visualstudio.com' }), info),
			failed: summarize(remote('wsl', { availability: 'online', lastConnectionError: 'The agent host exited' }), info),
			connected: summarize(remote('wsl', { availability: 'online', connectionStatus: RemoteAgentHostConnectionStatus.connected }), info),
		}, {
			stopped: { primary: 'connect', actions: [], guidance: ['This distribution isn\'t running'], facts: { 'Distribution state': 'Stopped' } },
			notInstalled: {
				primary: undefined, actions: [], guidance: ['This distribution isn\'t installed anymore'], command: 'wsl --list --verbose', facts: { 'Distribution state': 'Not installed' },
			},
			download: { primary: 'retry', actions: ['restartDistribution'], guidance: ['The server couldn\'t be downloaded inside the distribution'], facts: { 'Distribution state': 'Running' } },
			failed: { primary: 'retry', actions: ['restartDistribution'], guidance: ['Restart the distribution to stop its agent host, then connect again to start a new one.'], facts: { 'Distribution state': 'Running' } },
			connected: { primary: 'newSession', actions: ['disconnect', 'restartDistribution'], guidance: [], facts: { 'Distribution state': 'Running' } },
		});
	});

	test('Dev Tunnels are explained by discovery and sharing', () => {
		assert.deepStrictEqual({
			notFound: summarize(remote('tunnel', { canDelete: true, lastConnectionError: 'Tunnel not found' }), { tunnel: { authProvider: 'github', inLastDiscovery: false } }),
			notShared: summarize(remote('tunnel', { canDelete: true, availability: 'offline' }), { tunnel: { authProvider: 'microsoft', inLastDiscovery: true, hostConnectionCount: 0 } }),
			relay: summarize(remote('tunnel', { availability: 'online', lastConnectionError: 'tunnel relay connect timed out after 30000ms' }), { tunnel: { inLastDiscovery: true, hostConnectionCount: 1 } }),
			incompatible: summarize(remote('tunnel', { connectionStatus: RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1']) })).guidance,
		}, {
			notFound: {
				primary: 'retry', actions: ['refresh', 'deleteTunnel'], guidance: ['This tunnel wasn\'t found when tunnels were last listed'],
				facts: { 'Account': 'GitHub', 'Found in last discovery': 'No' },
			},
			notShared: {
				primary: undefined, actions: ['refresh', 'deleteTunnel'], guidance: ['No computer is sharing this tunnel right now'], command: 'code tunnel',
				facts: { 'Account': 'Microsoft', 'Found in last discovery': 'Yes', 'Computers sharing it': '0' },
			},
			relay: {
				primary: 'retry', actions: [], guidance: ['The tunnel relay didn\'t respond in time'],
				facts: { 'Found in last discovery': 'Yes', 'Computers sharing it': '1' },
			},
			incompatible: ['Update VS Code or the VS Code CLI on the computer that shares this tunnel, then retry.'],
		});
	});

	test('GitHub environments and extension remotes point to where they are managed', () => {
		const extension = remote('extension', { contributedBy: { extensionId: 'publisher.jobs', displayName: 'Job Runner' }, lastConnectionError: 'connect ECONNREFUSED' });
		assert.deepStrictEqual({
			offline: summarize(remote('environment', { canRemove: true, availability: 'offline', reportedSessionCount: 2 })),
			denied: summarize(remote('environment', { availability: 'online', lastConnectionError: 'The environment is shared by a different GitHub account.' })),
			extension: summarize(extension, { extension: { version: '1.4.2', issuesUrl: 'https://github.com/publisher/jobs/issues' } }),
			extensionWithoutIssues: summarize(extension, { extension: {} }).actions,
		}, {
			offline: {
				primary: undefined, actions: ['refresh', 'openEnvironmentSettings', 'removeEnvironment'], guidance: ['This environment is offline'], facts: { 'Reported sessions': '2' },
			},
			denied: { primary: 'retry', actions: ['refresh', 'openEnvironmentSettings'], guidance: ['GitHub didn\'t allow this connection'] },
			extension: {
				primary: 'retry', actions: ['showExtension', 'reportExtensionIssue'], guidance: ['The Job Runner extension provides this environment and manages its connection'],
				facts: { 'Provided by': 'Job Runner 1.4.2' },
			},
			extensionWithoutIssues: ['showExtension'],
		});
	});

	test('Dev Containers are explained by their host, Docker, and container state', () => {
		const onHost = remote('devContainer', { canDelete: true, connectsWithHost: true });
		const local = remote('devContainer', { canDelete: true });
		const connectedHost: IRemoteTroubleshootingInfo = { devContainer: { hostId: 'ssh:build', hostName: 'Build server', hostConnected: true, dockerAvailable: true }, canShowLog: true };
		assert.deepStrictEqual({
			hostDisconnected: summarize(onHost, { devContainer: { hostId: 'ssh:build', hostName: 'Build server', hostConnected: false }, canShowLog: true }),
			dockerUnavailable: summarize({ ...local, lastConnectionError: 'Docker is not available.' }, { devContainer: { hostName: 'This Computer', hostConnected: true, dockerAvailable: false }, canShowLog: true }),
			deleted: summarize({ ...onHost, lastConnectionError: 'Dev Container \'Project\' was deleted.' }, connectedHost),
			stoppedOnHost: summarize({ ...onHost, lastConnectionError: 'Dev Container for \'Project\' is stopped.' }, connectedHost).guidance,
			stoppedLocally: summarize({ ...local, lastConnectionError: 'Dev Container for \'Project\' is stopped.' }, connectedHost).guidance,
			lifecycle: summarize({ ...onHost, lastConnectionError: 'Dev Container lifecycle commands failed: exit 1' }, connectedHost).guidance,
		}, {
			hostDisconnected: {
				primary: 'connectHost', actions: ['showLog'], guidance: ['This Dev Container runs on Build server, which isn\'t connected'], facts: { 'Host': 'Build server' },
			},
			dockerUnavailable: {
				primary: 'retry', actions: ['showLog'], guidance: ['Docker isn\'t available on This Computer'], facts: { 'Host': 'This Computer', 'Docker': 'Not available' },
			},
			deleted: {
				primary: undefined, actions: ['showLog', 'deleteDevContainer'], guidance: ['The container was deleted outside VS Code'],
				facts: { 'Host': 'Build server', 'Docker': 'Available' },
			},
			stoppedOnHost: ['The container is stopped.'],
			stoppedLocally: ['The container is stopped'],
			lifecycle: ['The container\'s setup commands failed'],
		});
	});
});
