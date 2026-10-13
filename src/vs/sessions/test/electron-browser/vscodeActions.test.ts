/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock, upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { INativeHostService } from '../../../platform/native/common/native.js';
import { IOpenedMainWindow, IOpenEmptyWindowOptions, IOpenWindowOptions, IWindowOpenable, isFolderToOpen } from '../../../platform/window/common/window.js';
import { constObservable } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { getChatSessionToOpenInEditor, openSessionInVSCode, returnToVSCodeEditor, shouldShowReturnToVSCodeEditor } from '../../electron-browser/actions/vscodeActions.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { IChat } from '../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../platform/agentHost/common/remoteAgentHostService.js';
import { Codicon } from '../../../base/common/codicons.js';
import { agentHostAuthority, toAgentHostUri } from '../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostSessionsProvider } from '../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../services/sessions/common/sessionsProvider.js';

suite('VS Code Actions', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('shows return action only when there is no other main window', () => {
		const currentWindow = createWindow(1);
		const otherWindow = createWindow(2);

		assert.deepStrictEqual({
			onlyAgentsWindow: shouldShowReturnToVSCodeEditor([currentWindow], currentWindow.id),
			agentsWindowNotListed: shouldShowReturnToVSCodeEditor([], currentWindow.id),
			otherWindowOpen: shouldShowReturnToVSCodeEditor([currentWindow, otherWindow], currentWindow.id),
			onlyOtherWindowListed: shouldShowReturnToVSCodeEditor([otherWindow], currentWindow.id),
		}, {
			onlyAgentsWindow: true,
			agentsWindowNotListed: true,
			otherWindowOpen: false,
			onlyOtherWindowListed: false,
		});
	});

	test('opens an editor window before closing the Agents window', async () => {
		const calls: string[] = [];
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async openWindow(): Promise<void> {
				calls.push('open');
			}
			override async closeWindow(options?: { targetWindowId?: number }): Promise<void> {
				calls.push(`close:${options?.targetWindowId}`);
			}
		}();

		await returnToVSCodeEditor(nativeHostService, 7);

		assert.deepStrictEqual(calls, ['open', 'close:7']);
	});

	test('only transfers materialized sessions to the editor window', () => {
		const provisional = createSession('provisional', false);
		const materialized = createSession('materialized', true);

		assert.deepStrictEqual({
			provisional: getChatSessionToOpenInEditor(provisional)?.toString(),
			materialized: getChatSessionToOpenInEditor(materialized)?.toString(),
			missing: getChatSessionToOpenInEditor(undefined),
		}, {
			provisional: undefined,
			materialized: 'test:/materialized',
			missing: undefined,
		});
	});

	test('opens every active chat workspace folder in one editor window', async () => {
		const calls: { folders?: string[]; forceNewWindow?: boolean; chatSessionToOpen?: string }[] = [];
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
				calls.push({
					folders: Array.isArray(toOpen) ? toOpen.filter(isFolderToOpen).map(openable => openable.folderUri.toString()) : undefined,
					forceNewWindow: options?.forceNewWindow,
					chatSessionToOpen: options?.chatSessionToOpen?.toString(),
				});
			}
		}();
		const session = createSession('multi-folder', true, [URI.file('/repo-b'), URI.file('/repo-c')]);

		await openSessionInVSCode(
			nativeHostService,
			session,
			new class extends mock<ISessionsProvidersService>() { }(),
			new class extends mock<IRemoteAgentHostService>() { }(),
		);

		assert.deepStrictEqual(calls, [{
			folders: ['file:///repo-b', 'file:///repo-c'],
			forceNewWindow: true,
			chatSessionToOpen: 'test:/multi-folder',
		}]);
	});

	test('opens an empty editor window when the active chat has no workspace', async () => {
		const calls: { empty: boolean }[] = [];
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]): Promise<void> {
				calls.push({ empty: !Array.isArray(toOpen) });
			}
		}();

		await openSessionInVSCode(
			nativeHostService,
			createSession('no-workspace', true),
			new class extends mock<ISessionsProvidersService>() { }(),
			new class extends mock<IRemoteAgentHostService>() { }(),
		);

		assert.deepStrictEqual(calls, [{ empty: true }]);
	});

	for (const folders of [
		[toAgentHostUri(URI.file('C:\\Users\\test\\project'), agentHostAuthority('cloudsandbox:environment'))],
		[URI.file('/local/project'), toAgentHostUri(URI.file('/remote/project'), agentHostAuthority('ws:host'))],
	]) {
		test(`opens only an empty new Editor for unsupported remote folders (${folders.length} folders)`, async () => {
			const calls: { toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]; options?: IOpenWindowOptions }[] = [];
			const session = createSession('unsupported', true, folders);
			const provider: ISessionsProvider = upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-test', remoteAddress: 'cloudsandbox:environment' });
			await openSessionInVSCode(
				new class extends mock<INativeHostService>() {
					override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
						calls.push({ toOpen, options });
					}
				}(),
				session,
				upcastPartial<ISessionsProvidersService>({ getProvider: <T extends ISessionsProvider>() => provider as T }),
				upcastPartial<IRemoteAgentHostService>({
					getEntryByAddress: () => ({
						name: 'Windows dev box',
						connection: { type: RemoteAgentHostEntryType.CloudSandbox, address: 'cloudsandbox:environment', environmentId: 'environment', environmentKind: 'user-local' },
					}),
				}),
			);
			assert.deepStrictEqual({
				calls,
				session: session.resource.toString(),
				folders: session.activeChat.get().workspace.get()?.folders.map(folder => folder.workingDirectory.toString()),
			}, {
				calls: [{ toOpen: { remoteAuthority: null }, options: undefined }],
				session: 'test:/unsupported',
				folders: folders.map(folder => folder.toString()),
			});
		});
	}

	for (const connection of [
		{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host' },
		{ type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'host', clusterId: 'region' },
		{ type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' },
		{ type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:host', hostPath: '/source/project' },
	] satisfies IRemoteAgentHostEntry['connection'][]) {
		test(`preserves supported ${connection.type} workspace and chat handoff`, async () => {
			const calls: { folders?: URI[]; options?: IOpenWindowOptions }[] = [];
			const folder = toAgentHostUri(URI.file('/remote/project'), agentHostAuthority('test:host'));
			const entry: IRemoteAgentHostEntry = { name: 'Remote host', connection };
			const provider: ISessionsProvider = upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-test', remoteAddress: 'test:host' });
			await openSessionInVSCode(
				new class extends mock<INativeHostService>() {
					override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
						calls.push({ folders: Array.isArray(toOpen) ? toOpen.filter(isFolderToOpen).map(openable => openable.folderUri) : undefined, options });
					}
				}(),
				createSession('remote', true, [folder]),
				upcastPartial<ISessionsProvidersService>({
					getProvider: <T extends ISessionsProvider>() => provider as T,
				}),
				upcastPartial<IRemoteAgentHostService>({ getEntryByAddress: () => entry }),
			);
			assert.deepStrictEqual({
				folders: calls[0].folders?.map(folder => ({ scheme: folder.scheme, path: folder.path })),
				options: calls[0].options,
			}, {
				folders: [{ scheme: 'vscode-remote', path: '/remote/project' }],
				options: { forceNewWindow: true, chatSessionToOpen: URI.from({ scheme: 'test', path: '/remote' }) },
			});
		});
	}

	test('propagates a failure to open the fallback Editor window', async () => {
		const error = new Error('Editor window could not be opened');
		await assert.rejects(openSessionInVSCode(
			new class extends mock<INativeHostService>() {
				override async openWindow(): Promise<void> { throw error; }
			}(),
			createSession('unsupported', true, [toAgentHostUri(URI.file('/remote/project'), agentHostAuthority('ws:host'))]),
			upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }),
			new class extends mock<IRemoteAgentHostService>() { }(),
		), error);
	});

	test('does not replace an unexpected supported handoff failure with an empty window', async () => {
		const calls: string[] = [];
		const error = new Error('Remote resolver failed');
		await assert.rejects(openSessionInVSCode(
			new class extends mock<INativeHostService>() {
				override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]): Promise<void> {
					calls.push(Array.isArray(toOpen) ? 'workspace' : 'empty');
					throw error;
				}
			}(),
			createSession('supported', true, [URI.file('/local/project')]),
			new class extends mock<ISessionsProvidersService>() { }(),
			new class extends mock<IRemoteAgentHostService>() { }(),
		), error);
		assert.deepStrictEqual(calls, ['workspace']);
	});
});

function createWindow(id: number): IOpenedMainWindow {
	return {
		id,
		title: `Window ${id}`,
		dirty: false,
	};
}

function createSession(id: string, isCreated: boolean, folders?: URI[]): IActiveSession {
	const workspace = constObservable(folders ? {
		uri: URI.from({ scheme: 'test', path: `/${id}/workspace` }),
		label: id,
		icon: Codicon.folder,
		folders: folders.map((folder, index) => ({
			root: folder,
			workingDirectory: folder,
			name: `Repository ${index + 1}`,
			description: undefined,
		})),
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	} : undefined);
	const activeChat = new class extends mock<IChat>() {
		override readonly workspace = workspace;
	}();
	return new class extends mock<IActiveSession>() {
		override readonly resource = URI.from({ scheme: 'test', path: `/${id}` });
		override readonly providerId = 'test';
		override readonly isCreated = constObservable(isCreated);
		override readonly activeChat = constObservable(activeChat);
	}();
}
