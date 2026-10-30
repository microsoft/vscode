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
import { agentHostAuthority, agentHostLabelFormatter, toAgentHostUri } from '../../../platform/agentHost/common/agentHostUri.js';
import { IAgentHostSessionsProvider } from '../../common/agentHostSessionsProvider.js';
import { ISessionsProvider } from '../../services/sessions/common/sessionsProvider.js';
import { LabelService } from '../../../workbench/services/label/common/labelService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { OperatingSystem } from '../../../base/common/platform.js';
import { splitRecentLabel } from '../../../base/common/labels.js';
import { ILabelService } from '../../../platform/label/common/label.js';
import { TestInstantiationService } from '../../../platform/instantiation/test/common/instantiationServiceMock.js';

suite('VS Code Actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let labelService: LabelService;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, disposables);
		labelService = disposables.add(instantiationService.createInstance(LabelService));
		instantiationService.stub(ILabelService, labelService);
		instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() { }());
		instantiationService.stub(IRemoteAgentHostService, new class extends mock<IRemoteAgentHostService>() { }());
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

	test('opens an empty editor window when the active chat has no workspace', async () => {
		const calls: { empty: boolean }[] = [];
		const nativeHostService = new class extends mock<INativeHostService>() {
			override async openWindow(toOpen?: IOpenEmptyWindowOptions | IWindowOpenable[]): Promise<void> {
				calls.push({ empty: !Array.isArray(toOpen) });
			}
		}();

		instantiationService.stub(INativeHostService, nativeHostService);
		await instantiationService.invokeFunction(openSessionInVSCode, createSession('no-workspace', true));

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
			const calls: { folders?: { uri: URI; label: string | undefined }[]; options?: IOpenWindowOptions }[] = [];
			const folder = toAgentHostUri(URI.file('/remote/project'), agentHostAuthority('test:host'));
			const entry: IRemoteAgentHostEntry = { name: 'Remote host', connection };
			const provider: ISessionsProvider = upcastPartial<IAgentHostSessionsProvider>({ id: 'agenthost-test', remoteAddress: 'test:host' });
			const formatter = agentHostLabelFormatter(folder.authority, OperatingSystem.Linux);
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
			await instantiationService.invokeFunction(openSessionInVSCode, createSession('remote', true, [folder]));
			assert.deepStrictEqual({
				folders: calls[0].folders?.map(folder => ({ scheme: folder.uri.scheme, path: folder.uri.path, label: folder.label, title: folder.label && splitRecentLabel(folder.label).name })),
				options: calls[0].options,
			}, {
				folders: [{ scheme: 'vscode-remote', path: '/remote/project', label: '/remote/project [Remote host]', title: 'project [Remote host]' }],
				options: { forceNewWindow: true, chatSessionToOpen: URI.from({ scheme: 'test', path: '/remote' }) },
			});
		});
	}

	test('preserves Windows remote labels for every folder opened through a tunnel', async () => {
		const calls: { uri: URI; label: string | undefined; title: string | undefined }[][] = [];
		const authority = agentHostAuthority('test:host');
		const folders = ['/c:/remote/project', '/d:/other/repository'].map(path => toAgentHostUri(URI.from({ scheme: 'file', path }), authority));
		const formatter = agentHostLabelFormatter(authority, OperatingSystem.Windows);
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
