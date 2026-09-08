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
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChatWidget, IChatWidgetService } from '../../browser/chat.js';
import { ChatConfiguration, OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID } from '../../common/constants.js';
import { IChatViewModel } from '../../common/model/chatViewModel.js';
import { OpenChatSessionInAgentsWindowAction, OpenWorkspaceInAgentsWindowAction, OpenWorkspaceInAgentsWindowTitleBarAction } from '../../electron-browser/agentSessions/agentSessionsActions.js';

class TestCommandService extends mock<ICommandService>() {
	readonly calls: { readonly commandId: string; readonly args: readonly unknown[] }[] = [];

	override async executeCommand<T = unknown>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		this.calls.push({ commandId, args });
		return undefined;
	}
}

suite('OpenWorkspaceInAgentsWindowAction', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
