/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IRemoteFileSystemProxyIPCServer, IRemoteFileSystemProxyWindowsService, RemoteFileSystemProxyMainHandler } from '../../electron-main/remoteFileSystemProxyMainHandler.js';

function createMockChannel(callImpl: (command: string, arg?: unknown) => Promise<unknown> = async () => 'ok'): IChannel {
	return {
		call: callImpl as IChannel['call'],
		listen: (() => Event.None) as IChannel['listen'],
	};
}

suite('RemoteFileSystemProxyMainHandler', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('throws when no window matches the URI authority', async () => {
		const windowsService: IRemoteFileSystemProxyWindowsService = {
			getWindows: () => [
				{ id: 1 },
				{ id: 2, remoteAuthority: 'ssh-remote+myhost' },
				{ id: 3, remoteAuthority: 'wsl+ubuntu' },
			],
		};

		const mockServer: IRemoteFileSystemProxyIPCServer = {
			getChannel: () => createMockChannel(),
		};

		const handler = disposables.add(new RemoteFileSystemProxyMainHandler(windowsService, mockServer));

		await assert.rejects(
			() => handler.call(undefined, 'stat', [URI.parse('vscode-remote://unknown-host/test')]),
			/No window found with remote authority/
		);
	});

	test('throws for non-vscode-remote URIs', async () => {
		const windowsService: IRemoteFileSystemProxyWindowsService = {
			getWindows: () => [
				{ id: 1, remoteAuthority: 'ssh-remote+myhost' },
			],
		};

		const mockServer: IRemoteFileSystemProxyIPCServer = {
			getChannel: () => createMockChannel(),
		};

		const handler = disposables.add(new RemoteFileSystemProxyMainHandler(windowsService, mockServer));

		await assert.rejects(
			() => handler.call(undefined, 'stat', [URI.parse('file:///local/path')]),
			/Unsupported scheme/
		);
	});

	test('routes call to correct window based on URI authority', async () => {
		let calledWindowCtx: string | undefined;

		const windowsService: IRemoteFileSystemProxyWindowsService = {
			getWindows: () => [
				{ id: 1 },
				{ id: 2, remoteAuthority: 'ssh-remote+myhost' },
			],
		};

		const mockServer: IRemoteFileSystemProxyIPCServer = {
			getChannel: (_name: string, filter: (client: { ctx: string }) => boolean) => {
				const connections = [
					{ ctx: 'window:1' },
					{ ctx: 'window:2' },
				];
				calledWindowCtx = connections.find(filter)?.ctx;
				return createMockChannel();
			},
		};

		const handler = disposables.add(new RemoteFileSystemProxyMainHandler(windowsService, mockServer));

		await handler.call(undefined, 'stat', [URI.parse('vscode-remote://ssh-remote+myhost/some/path')]);

		assert.strictEqual(calledWindowCtx, 'window:2');
	});
});
