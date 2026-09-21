/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { OperatingSystem, OS } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { DevContainerCloseConnectionNotification, DevContainerConnectExtensionMethod, DevContainerDisconnectExtensionMethod, DevContainerIsDockerAvailableExtensionMethod, DevContainerOutputNotification, DevContainerRelayCloseNotification, DevContainerRelayMessageNotification, DevContainerRelaySendExtensionMethod } from '../../common/agentHostExtensionProtocol.js';
import type { IDevContainerAgentHostConnectResult } from '../../common/devContainerAgentHost.js';
import { AhpErrorCodes, JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { DevContainerAgentHostProtocol, normalizeDevContainerWorkspaceFolder } from '../../node/devContainerAgentHostProtocol.js';
import { MockDevContainerService } from '../common/mockDevContainerService.js';

suite('DevContainerAgentHostProtocol', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const config = { connectionId: 'client-connection', workspaceFolder: '/repo', name: 'Project' };

	function setup(requestTrust: (workspace: string) => Promise<boolean> = async () => true) {
		const service = store.add(new MockDevContainerService());
		const notifications: { method: string; params: object }[] = [];
		const protocol = store.add(new DevContainerAgentHostProtocol(requestTrust, (method, params) => notifications.push({ method, params }), service, new NullLogService()));
		return { service, notifications, protocol };
	}

	test('normalizes URI paths using the remote OS rather than the renderer OS', () => {
		const paths = ['/home/user/repo', '/c:/repo', '/C:/repo with spaces', '//server/share/repo', 'C:\\repo', '/repo\\literal-backslash'];
		assert.deepStrictEqual({
			linux: paths.map(path => normalizeDevContainerWorkspaceFolder(path, OperatingSystem.Linux)),
			mac: paths.map(path => normalizeDevContainerWorkspaceFolder(path, OperatingSystem.Macintosh)),
			windows: paths.map(path => normalizeDevContainerWorkspaceFolder(path, OperatingSystem.Windows)),
		}, {
			linux: paths,
			mac: paths,
			windows: ['\\home\\user\\repo', 'c:\\repo', 'C:\\repo with spaces', '\\\\server\\share\\repo', 'C:\\repo', '\\repo\\literal-backslash'],
		});
	});

	test('checks trust and launches with the same normalized host path', async () => {
		const workspaces: string[] = [];
		const { service, protocol } = setup(async workspace => { workspaces.push(workspace); return true; });
		const workspaceFolder = '/C:/repo with spaces';
		await protocol.handleRequest(DevContainerConnectExtensionMethod, { ...config, workspaceFolder });
		const expected = OS === OperatingSystem.Windows ? 'C:\\repo with spaces' : workspaceFolder;
		assert.deepStrictEqual({ trusted: workspaces, launched: service.connects[0].workspaceFolder }, { trusted: [expected], launched: expected });
	});

	test('isolates IDs and notifications between transports', async () => {
		const { service, notifications, protocol } = setup();
		const otherNotifications: object[] = [];
		const other = store.add(new DevContainerAgentHostProtocol(async () => true, (method, params) => otherNotifications.push({ method, params }), service, new NullLogService()));
		await protocol.handleRequest(DevContainerConnectExtensionMethod, config);
		await other.handleRequest(DevContainerConnectExtensionMethod, config);
		const first = service.connects[0].connectionId;
		const second = service.connects[1].connectionId;
		assert.ok(first !== second && first !== config.connectionId);
		await assert.rejects(other.handleRequest(DevContainerRelaySendExtensionMethod, { connectionId: first, data: 'attack' })!, { code: AhpErrorCodes.NotFound });
		service.relayMessage.fire({ connectionId: first, data: 'frame' });
		service.output.fire({ connectionId: first, data: 'output' });
		service.relayClose.fire(first);
		service.closeConnection.fire(first);
		assert.deepStrictEqual({ notifications, otherNotifications }, {
			notifications: [
				{ method: DevContainerRelayMessageNotification, params: { connectionId: config.connectionId, data: 'frame' } },
				{ method: DevContainerOutputNotification, params: { connectionId: config.connectionId, data: 'output' } },
				{ method: DevContainerRelayCloseNotification, params: { connectionId: config.connectionId } },
				{ method: DevContainerCloseConnectionNotification, params: { connectionId: config.connectionId } },
			],
			otherNotifications: [],
		});
	});

	test('requires trust before starting lifecycle commands', async () => {
		const trusted = new DeferredPromise<boolean>();
		const workspaces: string[] = [];
		const { service, protocol } = setup(workspace => { workspaces.push(workspace); return trusted.p; });
		const connect = protocol.handleRequest(DevContainerConnectExtensionMethod, config)!;
		assert.deepStrictEqual({ workspaces, connects: service.connects }, { workspaces: [normalizeDevContainerWorkspaceFolder(config.workspaceFolder, OS)], connects: [] });
		await trusted.complete(false);
		await assert.rejects(connect, { code: AhpErrorCodes.PermissionDenied });
		assert.deepStrictEqual(service.connects, []);
	});

	test('disconnect while trust is pending never launches a container', async () => {
		const trusted = new DeferredPromise<boolean>();
		const { service, protocol } = setup(() => trusted.p);
		const connect = protocol.handleRequest(DevContainerConnectExtensionMethod, config)!;
		protocol.dispose();
		await trusted.complete(true);
		await assert.rejects(connect, CancellationError);
		assert.deepStrictEqual(service.connects, []);
	});

	test('disconnect cancels pending launches and disposes late relays', async () => {
		const { service, protocol, notifications } = setup();
		const result = new DeferredPromise<IDevContainerAgentHostConnectResult>();
		service.connectResult = result.p;
		const connect = protocol.handleRequest(DevContainerConnectExtensionMethod, config)!;
		await Promise.resolve();
		const connectionId = service.connects[0].connectionId;
		protocol.dispose();
		service.output.fire({ connectionId, data: 'late output' });
		await result.complete({ ...config, connectionId, address: 'devcontainer:test', remoteWorkspaceFolder: '/workspaces/project' });
		await assert.rejects(connect, CancellationError);
		assert.deepStrictEqual({ disconnects: service.disconnects, notifications }, { disconnects: [connectionId, connectionId], notifications: [] });
	});

	test('relays and disconnects only owned connections', async () => {
		const { service, protocol } = setup();
		assert.strictEqual(await protocol.handleRequest(DevContainerIsDockerAvailableExtensionMethod, undefined), true);
		await protocol.handleRequest(DevContainerConnectExtensionMethod, config);
		const connectionId = service.connects[0].connectionId;
		await protocol.handleRequest(DevContainerRelaySendExtensionMethod, { connectionId: config.connectionId, data: 'frame' });
		await protocol.handleRequest(DevContainerDisconnectExtensionMethod, { connectionId: config.connectionId });
		await assert.rejects(protocol.handleRequest(DevContainerRelaySendExtensionMethod, { connectionId: config.connectionId, data: 'late' })!, { code: AhpErrorCodes.NotFound });
		assert.deepStrictEqual({ sent: service.sent, disconnects: service.disconnects }, { sent: [{ connectionId, data: 'frame' }], disconnects: [connectionId] });
	});

	test('validates all extension request parameters', async () => {
		const { service, protocol } = setup();
		const inputs: readonly [string, unknown][] = [
			[DevContainerIsDockerAvailableExtensionMethod, {}],
			[DevContainerConnectExtensionMethod, null],
			[DevContainerConnectExtensionMethod, { ...config, connectionId: '' }],
			[DevContainerConnectExtensionMethod, { ...config, workspaceFolder: 'relative' }],
			[DevContainerConnectExtensionMethod, { ...config, workspaceFolder: '/repo\0' }],
			[DevContainerConnectExtensionMethod, { ...config, name: 1 }],
			[DevContainerDisconnectExtensionMethod, { connectionId: 1 }],
			[DevContainerRelaySendExtensionMethod, { connectionId: config.connectionId, data: {} }],
		];
		for (const [method, params] of inputs) {
			await assert.rejects(protocol.handleRequest(method, params)!, error => error instanceof ProtocolError && error.code === JsonRpcErrorCodes.InvalidParams);
		}
		assert.deepStrictEqual(service.connects, []);
	});

	test('rejects duplicate pending IDs and releases failed launches', async () => {
		const trust = new DeferredPromise<boolean>();
		const { protocol } = setup(() => trust.p);
		const connect = protocol.handleRequest(DevContainerConnectExtensionMethod, config)!;
		await assert.rejects(protocol.handleRequest(DevContainerConnectExtensionMethod, config)!, { code: JsonRpcErrorCodes.InvalidParams });
		await trust.complete(false);
		await assert.rejects(connect, { code: AhpErrorCodes.PermissionDenied });
		await assert.rejects(protocol.handleRequest(DevContainerConnectExtensionMethod, config)!, { code: AhpErrorCodes.PermissionDenied });
	});
});
