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
import { IChat, ISession, SessionStatus } from '../../../workbench/services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../workbench/contrib/sessions/browser/sessionsProvidersService.js';
import { getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType } from '../../../platform/agentHost/common/remoteAgentHostService.js';
import { Codicon } from '../../../base/common/codicons.js';
import { agentHostAuthority, agentHostLabelFormatter, toAgentHostUri } from '../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostSessionsProvider } from '../../../workbench/contrib/sessions/common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../../workbench/contrib/sessions/common/sessionsProvider.js';
import { LabelService } from '../../../workbench/services/label/common/labelService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { splitRecentLabel } from '../../../base/common/labels.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAgentHostConnectionsService } from '../../../platform/agentHost/common/agentHostConnectionsService.js';
import { remoteAgentHostSessionTypeId } from '../../../platform/agentHost/common/agentHostSessionType.js';
import { INotificationService } from '../../../platform/notification/common/notification.js';
import { IRemoteAgentHostLocationPreferenceService, RemoteAgentHostLocationPreference } from '../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { PathStyle } from '../../../platform/agentHost/common/state/protocol/common/commands.js';
import { ISSHAgentHostConnection, ISSHRemoteAgentHostService } from '../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ITunnelAgentHostService, TunnelGatewayServerType } from '../../../platform/agentHost/common/tunnelAgentHost.js';

suite('VS Code Actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let labelService: LabelService;
	let notifications: string[];

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		labelService = disposables.add(instantiationService.createInstance(LabelService));
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() { }());
		instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({ resolveSessionResourceIdentity: () => undefined }));
		instantiationService.stub(IRemoteAgentHostLocationPreferenceService, upcastPartial<IRemoteAgentHostLocationPreferenceService>({ getPreference: () => undefined }));
		instantiationService.stub(ISSHRemoteAgentHostService, upcastPartial<ISSHRemoteAgentHostService>({ connections: [] }));
		instantiationService.stub(ITunnelAgentHostService, upcastPartial<ITunnelAgentHostService>({ getSelectedServerType: () => undefined }));
		notifications = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ info: message => { notifications.push(String(message)); } }));
	});

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

		// Created per the provider's status: a draft carries no flag that says it is one.
		assert.deepStrictEqual({
			provisional: getChatSessionToOpenInEditor(provisional)?.toString(),
			provisionalChat: getChatSessionToOpenInEditor(provisional, provisional.mainChat.get())?.toString(),
			materialized: getChatSessionToOpenInEditor(materialized)?.toString(),
			materializedChat: getChatSessionToOpenInEditor(materialized, materialized.mainChat.get())?.toString(),
			missing: getChatSessionToOpenInEditor(undefined),
		}, {
			provisional: undefined,
			provisionalChat: undefined,
			materialized: 'test:/materialized',
			materializedChat: 'test:/materialized/chat',
			missing: undefined,
		});
	});

	test('opens every active chat workspace folder in one editor window', async () => {
		const calls: { folders?: { uri: string; label: string | undefined }[]; forceNewWindow?: boolean; chatSessionToOpen?: string }[] = [];
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
				calls.push({
					folders: Array.isArray(toOpen) ? toOpen.filter(isFolderToOpen).map(openable => ({ uri: openable.folderUri.toString(), label: openable.label })) : undefined,
					forceNewWindow: options?.forceNewWindow,
					chatSessionToOpen: options?.chatSessionToOpen?.toString(),
				});
			}
		}();
		const session = createSession('multi-folder', true, [URI.file('/repo-b'), URI.file('/repo-c')]);

		instantiationService.stub(INativeHostService, nativeHostService);
		await instantiationService.invokeFunction(openSessionInVSCode, session);

		assert.deepStrictEqual(calls, [{
			folders: [{ uri: 'file:///repo-b', label: undefined }, { uri: 'file:///repo-c', label: undefined }],
			forceNewWindow: true,
			chatSessionToOpen: 'test:/multi-folder',
		}]);
	});

	test('opens an empty local editor window without a remote session workspace', async () => {
		const calls: (IOpenEmptyWindowOptions | IWindowOpenable[] | undefined)[] = [];
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]): Promise<void> {
				calls.push(toOpen);
			}
		}();

		instantiationService.stub(INativeHostService, nativeHostService);
		await instantiationService.invokeFunction(openSessionInVSCode, undefined);
		await instantiationService.invokeFunction(openSessionInVSCode, createSession('no-workspace', true));
		await instantiationService.invokeFunction(openSessionInVSCode, createSession('empty-workspace', true, []));

		assert.deepStrictEqual(calls, [undefined, undefined, undefined]);
	});

	for (const [connection, remoteAuthority] of [
		[{ type: RemoteAgentHostEntryType.SSH, address: 'test:host', hostName: 'host', sshConfigHost: 'my-ssh-host' }, 'ssh-remote+my-ssh-host'],
		[{ type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'host', clusterId: 'region' }, 'tunnel+host.region'],
		[{ type: RemoteAgentHostEntryType.WSL, address: 'test:host', distro: 'Ubuntu' }, 'wsl+Ubuntu'],
		[{ type: RemoteAgentHostEntryType.CloudSandbox, address: 'test:host', environmentId: 'environment' }, undefined],
		[{ type: RemoteAgentHostEntryType.WebSocket, address: 'test:host' }, undefined],
	] satisfies [IRemoteAgentHostEntry['connection'], string | undefined][]) {
		test(`opens an empty ${remoteAuthority ? 'remote' : 'local'} editor for a folderless ${connection.type} chat`, async () => {
			const calls: { toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]; options?: IOpenWindowOptions }[] = [];
			const provider: ISessionsProvider = upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-test', remoteAddress: 'test:host' });
			instantiationService.stub(ISessionsProvidersService, { getProvider: <T extends ISessionsProvider>() => provider as T });
			instantiationService.stub(IRemoteAgentHostService, { getEntryByAddress: () => ({ name: 'Remote host', connection }) });
			instantiationService.stub(INativeHostService, new class extends mock<INativeHostService>() {
				override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
					calls.push({ toOpen, options });
				}
			}());

			await instantiationService.invokeFunction(openSessionInVSCode, createSession('no-workspace', true));
			await instantiationService.invokeFunction(openSessionInVSCode, createSession('empty-workspace', true, []));
			await instantiationService.invokeFunction(
				openSessionInVSCode,
				createSession('parent', true, [toAgentHostUri(URI.file('/remote/project'), agentHostAuthority('test:host'))]),
				createSession('nested', true).mainChat.get(),
			);

			const toOpen = remoteAuthority ? { remoteAuthority } : undefined;
			assert.deepStrictEqual(calls, [
				{ toOpen, options: undefined },
				{ toOpen, options: undefined },
				{ toOpen, options: undefined },
			]);
		});
	}

	test('opens the clicked nested chat and its workspace instead of the active chat', async () => {
		const calls: { folders: string[]; chat: string | undefined }[] = [];
		const session = createSession('parent', true, [URI.file('/active')]);
		const folder = URI.file('/nested');
		const chat = upcastPartial<IChat>({
			resource: URI.parse('test:/nested-chat'),
			workspace: constObservable({
				...session.mainChat.get().workspace.get()!,
				folders: [{ root: folder, workingDirectory: folder, name: 'nested', description: undefined }],
			}),
		});
		instantiationService.stub(INativeHostService, new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
				calls.push({
					folders: Array.isArray(toOpen) ? toOpen.filter(isFolderToOpen).map(folder => folder.folderUri.toString()) : [],
					chat: options?.chatSessionToOpen?.toString(),
				});
			}
		}());

		await instantiationService.invokeFunction(openSessionInVSCode, session, chat);

		assert.deepStrictEqual(calls, [{ folders: ['file:///nested'], chat: 'test:/nested-chat' }]);
	});

	for (const folders of [
		[toAgentHostUri(URI.file('C:\\Users\\test\\project'), agentHostAuthority('cloudsandbox:environment'))],
		[URI.file('/local/project'), toAgentHostUri(URI.file('/remote/project'), agentHostAuthority('ws:host'))],
	]) {
		test(`opens only an empty new Editor for unsupported remote folders (${folders.length} folders)`, async () => {
			const calls: { toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]; options?: IOpenWindowOptions }[] = [];
			const session = createSession('unsupported', true, folders);
			const provider: ISessionsProvider = upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-test', remoteAddress: 'cloudsandbox:environment' });
			instantiationService.stub(INativeHostService, new class extends mock<INativeHostService>() {
				override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
					calls.push({ toOpen, options });
				}
			}());
			instantiationService.stub(ISessionsProvidersService, { getProvider: <T extends ISessionsProvider>() => provider as T });
			instantiationService.stub(IRemoteAgentHostService, {
				getEntryByAddress: () => ({
					name: 'Windows dev box',
					connection: { type: RemoteAgentHostEntryType.CloudSandbox, address: 'cloudsandbox:environment', environmentId: 'environment', environmentKind: 'user-local' },
				}),
			});
			await instantiationService.invokeFunction(openSessionInVSCode, session);
			assert.deepStrictEqual({
				calls,
				session: session.resource.toString(),
				folders: session.mainChat.get().workspace.get()?.folders.map(folder => folder.workingDirectory.toString()),
			}, {
				calls: [{ toOpen: { remoteAuthority: null }, options: undefined }],
				session: 'test:/unsupported',
				folders: folders.map(folder => folder.toString()),
			});
		});
	}

	for (const [connection, selectedServerType, preference] of [
		[{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host', sshConfigHost: 'host' }, 'standalone', undefined],
		[{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host', sshConfigHost: 'host' }, 'editor', undefined],
		[{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host', sshConfigHost: 'host' }, 'editor', 'editor'],
		[{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host', sshConfigHost: 'host' }, 'editor', 'dedicated'],
		[{ type: RemoteAgentHostEntryType.SSH, address: 'ssh:host', hostName: 'host', sshConfigHost: 'host' }, undefined, undefined],
		[{ type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'host', clusterId: 'region' }, 'standalone', undefined],
		[{ type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'host', clusterId: 'region' }, 'editor', undefined],
		[{ type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' }, undefined, undefined],
		[{ type: RemoteAgentHostEntryType.DevContainer, address: 'devcontainer:host', hostPath: '/source/project' }, undefined, undefined],
	] satisfies [IRemoteAgentHostEntry['connection'], TunnelGatewayServerType | undefined, RemoteAgentHostLocationPreference | undefined][]) {
		test(`preserves supported ${connection.type} workspace and hands off chats from shared hosts (${selectedServerType ?? 'unspecified'}, ${preference ?? 'no preference'})`, async () => {
			const calls: { folders?: { uri: URI; label: string | undefined }[]; options?: IOpenWindowOptions }[] = [];
			const entry: IRemoteAgentHostEntry = { name: 'Remote host', connection };
			const address = getEntryAddress(entry);
			const folder = toAgentHostUri(URI.file('/remote/project'), agentHostAuthority(address));
			const provider: ISessionsProvider = upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-test', remoteAddress: address });
			const formatter = agentHostLabelFormatter(folder.authority, PathStyle.Posix);
			disposables.add(labelService.registerFormatter({
				...formatter,
				formatting: { ...formatter.formatting, workspaceSuffix: entry.name },
			}));
			instantiationService.stub(INativeHostService, new class extends mock<INativeHostService>() {
				override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[], options?: IOpenWindowOptions): Promise<void> {
					calls.push({ folders: Array.isArray(toOpen) ? toOpen.filter(isFolderToOpen).map(openable => ({ uri: openable.folderUri, label: openable.label })) : undefined, options });
				}
			}());
			instantiationService.stub(ISessionsProvidersService, { getProvider: <T extends ISessionsProvider>() => provider as T });
			instantiationService.stub(IRemoteAgentHostService, { getEntryByAddress: () => entry });
			instantiationService.stub(IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
				resolveSessionResourceIdentity: resource => ({ connectionAuthority: folder.authority, backendSession: resource.with({ scheme: 'copilotcli', fragment: '' }) }),
			}));
			instantiationService.stub(IRemoteAgentHostLocationPreferenceService, upcastPartial<IRemoteAgentHostLocationPreferenceService>({ getPreference: key => key === address ? preference : undefined }));
			instantiationService.stub(ISSHRemoteAgentHostService, upcastPartial<ISSHRemoteAgentHostService>({
				connections: [
					upcastPartial<ISSHAgentHostConnection>({ localAddress: 'ssh:another-host', serverType: 'editor' }),
					upcastPartial<ISSHAgentHostConnection>({ localAddress: address, serverType: selectedServerType }),
				],
			}));
			instantiationService.stub(ITunnelAgentHostService, upcastPartial<ITunnelAgentHostService>({ getSelectedServerType: () => selectedServerType }));
			const resource = URI.from({ scheme: remoteAgentHostSessionTypeId(folder.authority, 'copilotcli'), path: '/remote', fragment: 'chat' });
			await instantiationService.invokeFunction(openSessionInVSCode, createSession('remote', true, [folder], resource));
			const sharesAgentHost = selectedServerType !== 'editor' || preference === 'editor';
			assert.deepStrictEqual({
				folders: calls[0].folders?.map(folder => ({ scheme: folder.uri.scheme, path: folder.uri.path, label: folder.label, title: folder.label && splitRecentLabel(folder.label).name })),
				options: calls[0].options,
				notifications,
			}, {
				folders: [{ scheme: 'vscode-remote', path: '/remote/project', label: '/remote/project [Remote host]', title: 'project [Remote host]' }],
				options: { forceNewWindow: true, chatSessionToOpen: sharesAgentHost ? URI.from({ scheme: 'agent-host-copilotcli', path: '/remote', fragment: 'chat' }) : undefined },
				notifications: sharesAgentHost ? [] : ['The session\'s folder was opened in a new editor window, but the session can\'t be opened there. This window is connected to a different agent host on the remote machine than the one its editor windows use.'],
			});
		});
	}

	test('preserves Windows remote labels for every folder opened through a tunnel', async () => {
		const calls: { uri: URI; label: string | undefined; title: string | undefined }[][] = [];
		const authority = agentHostAuthority('test:host');
		const folders = ['/c:/remote/project', '/d:/other/repository'].map(path => toAgentHostUri(URI.from({ scheme: 'file', path }), authority));
		const formatter = agentHostLabelFormatter(authority, PathStyle.Windows);
		disposables.add(labelService.registerFormatter({
			...formatter,
			formatting: { ...formatter.formatting, workspaceSuffix: 'Windows dev box' },
		}));
		const provider: ISessionsProvider = upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-test', remoteAddress: 'test:host' });
		instantiationService.stub(INativeHostService, new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]): Promise<void> {
				calls.push(Array.isArray(toOpen) ? toOpen.filter(isFolderToOpen).map(openable => ({
					uri: openable.folderUri,
					label: openable.label,
					title: openable.label && splitRecentLabel(openable.label).name,
				})) : []);
			}
		}());
		instantiationService.stub(ISessionsProvidersService, { getProvider: <T extends ISessionsProvider>() => provider as T });
		instantiationService.stub(IRemoteAgentHostService, {
			getEntryByAddress: () => ({ name: 'Windows dev box', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'host', clusterId: 'region', label: 'my-tunnel' } }),
		});
		await instantiationService.invokeFunction(openSessionInVSCode, createSession('remote', true, folders));

		assert.deepStrictEqual(calls, [[{
			uri: URI.from({ scheme: 'vscode-remote', authority: 'tunnel+my-tunnel', path: '/c:/remote/project' }),
			label: 'C:\\remote\\project [Windows dev box]',
			title: 'project [Windows dev box]',
		}, {
			uri: URI.from({ scheme: 'vscode-remote', authority: 'tunnel+my-tunnel', path: '/d:/other/repository' }),
			label: 'D:\\other\\repository [Windows dev box]',
			title: 'repository [Windows dev box]',
		}]]);
	});

	test('propagates a failure to open the fallback Editor window', async () => {
		const error = new Error('Editor window could not be opened');
		instantiationService.stub(INativeHostService, new class extends mock<INativeHostService>() {
			override async openWindow(): Promise<void> { throw error; }
		}());
		instantiationService.stub(ISessionsProvidersService, { getProvider: () => undefined });
		await assert.rejects(instantiationService.invokeFunction(
			openSessionInVSCode,
			createSession('unsupported', true, [toAgentHostUri(URI.file('/remote/project'), agentHostAuthority('ws:host'))]),
		), error);
	});

	test('does not replace an unexpected supported handoff failure with an empty window', async () => {
		const calls: string[] = [];
		const error = new Error('Remote resolver failed');
		instantiationService.stub(INativeHostService, new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]): Promise<void> {
				calls.push(Array.isArray(toOpen) ? 'workspace' : 'empty');
				throw error;
			}
		}());
		await assert.rejects(instantiationService.invokeFunction(
			openSessionInVSCode,
			createSession('supported', true, [URI.file('/local/project')]),
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

/** A provider's session: created per its status, with no pane state; `folders` are its main chat's workspace. */
function createSession(id: string, isCreated: boolean, folders?: URI[], resource = URI.from({ scheme: 'test', path: `/${id}` })): ISession {
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
	const mainChat = new class extends mock<IChat>() {
		override readonly resource = URI.from({ scheme: 'test', path: `/${id}/chat` });
		override readonly workspace = workspace;
	}();
	return new class extends mock<ISession>() {
		override readonly resource = resource;
		override readonly providerId = 'test';
		override readonly status = constObservable(isCreated ? SessionStatus.Completed : SessionStatus.Untitled);
		override readonly mainChat = constObservable(mainChat);
	}();
}
