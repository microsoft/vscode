/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { encodeHex, VSBuffer } from '../../../../../base/common/buffer.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INativeHostService, IOpenAgentsWindowOptions } from '../../../../../platform/native/common/native.js';
import { AgentsWindowOpenSource } from '../../../../../platform/window/common/window.js';
import { IWorkspaceContextService, WorkspaceFolder } from '../../../../../platform/workspace/common/workspace.js';
import { extUri } from '../../../../../base/common/resources.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../common/constants.js';
import { IChatViewModel } from '../../common/model/chatViewModel.js';
import { OpenAgentsWindowAction, OpenChatSessionInAgentsWindowAction, OpenWorkspaceInAgentsWindowAction, OpenWorkspaceInAgentsWindowTitleBarAction } from '../../electron-browser/agentSessions/agentSessionsActions.js';

class TestCommandService extends mock<ICommandService>() {
	readonly calls: { readonly commandId: string; readonly args: readonly unknown[] }[] = [];

	override async executeCommand<T = unknown>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		this.calls.push({ commandId, args });
		return undefined;
	}
}

suite('OpenWorkspaceInAgentsWindowAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const activeFile of ['/second/file.ts', undefined]) {
		test(`explicit Open in Agents prefers the active root with a first-root fallback (${activeFile ?? 'no editor'})`, async () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			const folders = ['/first', '/second'].map((path, index) => new WorkspaceFolder({ uri: URI.file(path), name: path, index }));
			const calls: IOpenAgentsWindowOptions[] = [];
			instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
				getWorkspace: () => ({ id: 'multi-root', folders }),
				getWorkspaceFolder: uri => folders.find(folder => extUri.isEqualOrParent(uri, folder.uri)) ?? null,
			}));
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
				activeEditor: activeFile ? upcastPartial<EditorInput>({ resource: URI.file(activeFile) }) : undefined,
			}));
			instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({
				openAgentsWindow: async options => { calls.push(options ?? {}); },
			}));
			await instantiationService.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowAction().run(accessor));
			assert.deepStrictEqual(calls.map(call => ({ folder: URI.revive(call.folderUri)?.path, isDefault: call.folderUriIsDefault })), [{
				folder: activeFile ? '/second' : '/first', isDefault: undefined,
			}]);
		});
	}

	test('opens the Agents Window with the local folder and Dev Container preference', async () => {
		const store = disposables.add(new DisposableStore());
		const instantiationService = store.add(new TestInstantiationService());
		let workspaceFolderUri = URI.file('/workspace');
		const calls: IOpenAgentsWindowOptions[] = [];
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => ({
				id: 'workspace',
				folders: [{
					uri: workspaceFolderUri,
					name: 'workspace',
					index: 0,
					toResource: relativePath => URI.joinPath(workspaceFolderUri, relativePath),
				}],
			}),
		}));
		instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({
			openAgentsWindow: async options => { calls.push(options ?? {}); },
		}));

		await instantiationService.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowAction().run(accessor, {
			source: AgentsWindowOpenSource.TitleBar,
		}));
		const hostFolderUri = URI.file('/host/workspace');
		workspaceFolderUri = URI.from({
			scheme: Schemas.vscodeRemote,
			authority: `dev-container+${encodeHex(VSBuffer.fromString(hostFolderUri.fsPath))}`,
			path: '/workspaces/project',
		});
		await instantiationService.invokeFunction(accessor => new OpenWorkspaceInAgentsWindowAction().run(accessor, {
			source: AgentsWindowOpenSource.ChatTitleBar,
		}));

		assert.deepStrictEqual(calls.map(call => ({
			folderUri: URI.revive(call.folderUri)?.toString(),
			source: call.source,
		})), [{
			folderUri: URI.file('/workspace').toString(),
			source: AgentsWindowOpenSource.TitleBar,
		}, {
			folderUri: workspaceFolderUri.toString(),
			source: AgentsWindowOpenSource.ChatTitleBar,
		}]);
	});
});

suite('OpenAgentsWindowAction workspace defaults', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const scenario of [
		{ name: 'single folder', folders: ['/one'], activeFile: undefined, expected: '/one' },
		{ name: 'active file in a multi-root workspace', folders: ['/one', '/two'], activeFile: '/two/file.ts', expected: '/two' },
		{ name: 'no active file in a multi-root workspace', folders: ['/one', '/two'], activeFile: undefined, expected: undefined },
		{ name: 'active file outside the workspace', folders: ['/one', '/two'], activeFile: '/elsewhere/file.ts', expected: undefined },
		{ name: 'empty editor window', folders: [], activeFile: '/elsewhere/file.ts', expected: undefined },
	]) {
		test(`infers ${scenario.name} without turning it into an explicit selection`, async () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			const folders = scenario.folders.map((path, index) => new WorkspaceFolder({ uri: URI.file(path), name: path, index }));
			const calls: IOpenAgentsWindowOptions[] = [];
			instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
				getWorkspace: () => ({ id: 'workspace', folders }),
				getWorkspaceFolder: resource => folders.find(folder => extUri.isEqualOrParent(resource, folder.uri)) ?? null,
			}));
			instantiationService.stub(IEditorService, upcastPartial<IEditorService>({
				activeEditor: scenario.activeFile ? upcastPartial<EditorInput>({ resource: URI.file(scenario.activeFile) }) : undefined,
			}));
			instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({
				openAgentsWindow: async options => { calls.push(options ?? {}); },
			}));

			await instantiationService.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, { source: AgentsWindowOpenSource.KeyboardShortcut }));
			assert.deepStrictEqual(calls.map(call => ({
				folder: URI.revive(call.folderUri)?.path,
				isDefault: call.folderUriIsDefault,
				source: call.source,
			})), [{ folder: scenario.expected, isDefault: scenario.expected ? true : undefined, source: AgentsWindowOpenSource.KeyboardShortcut }]);
		});
	}

	test('preserves explicit folder and existing-session arguments without consulting editor context', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const calls: IOpenAgentsWindowOptions[] = [];
		instantiationService.stub(INativeHostService, upcastPartial<INativeHostService>({ openAgentsWindow: async options => { calls.push(options ?? {}); } }));
		const explicit = { folderUri: URI.file('/explicit') };
		const existing = { sessionResource: URI.parse('agent-host-copilot:/session') };
		await instantiationService.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, explicit));
		await instantiationService.invokeFunction(accessor => new OpenAgentsWindowAction().run(accessor, existing));
		assert.deepStrictEqual(calls, [
			{ ...explicit, source: AgentsWindowOpenSource.CommandPalette },
			{ ...existing, source: AgentsWindowOpenSource.CommandPalette },
		]);
	});
});

suite('OpenWorkspaceInAgentsWindowTitleBarAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function run(sessionResource: URI | undefined, revealCurrentSession = true) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const commandService = new TestCommandService();
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.OpenInAgentsWindowRevealCurrentSession]: revealCurrentSession,
		});
		instantiationService.stub(ICommandService, commandService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IChatWidgetService, upcastPartial<IChatWidgetService>({
			lastFocusedWidget: sessionResource ? upcastPartial<IChatWidget>({
				viewModel: upcastPartial<IChatViewModel>({ sessionResource }),
			}) : undefined,
		}));

		const action = new OpenWorkspaceInAgentsWindowTitleBarAction();
		await instantiationService.invokeFunction(accessor => action.run(accessor));
		return commandService.calls;
	}

	test('reveals a persisted local Agent Host session and otherwise opens a workspace draft', async () => {
		const localSession = URI.from({ scheme: 'agent-host-claude', path: '/session' });

		assert.deepStrictEqual({
			localSession: await run(localSession),
			disabled: await run(localSession, false),
			untitledLocalSession: await run(URI.from({ scheme: 'agent-host-claude', path: '/untitled-session' })),
			remoteSession: await run(URI.from({ scheme: 'remote-host-claude', path: '/session' })),
			regularSession: await run(URI.from({ scheme: 'vscode-chat-session', path: '/session' })),
			noSession: await run(undefined),
		}, {
			localSession: [{
				commandId: OpenChatSessionInAgentsWindowAction.ID,
				args: [{ agentsWindowOpenSource: AgentsWindowOpenSource.TitleBar }, localSession],
			}],
			disabled: [{
				commandId: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
				args: [{ source: AgentsWindowOpenSource.TitleBar }],
			}],
			untitledLocalSession: [{
				commandId: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
				args: [{ source: AgentsWindowOpenSource.TitleBar }],
			}],
			remoteSession: [{
				commandId: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
				args: [{ source: AgentsWindowOpenSource.TitleBar }],
			}],
			regularSession: [{
				commandId: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
				args: [{ source: AgentsWindowOpenSource.TitleBar }],
			}],
			noSession: [{
				commandId: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
				args: [{ source: AgentsWindowOpenSource.TitleBar }],
			}],
		});
	});
});
