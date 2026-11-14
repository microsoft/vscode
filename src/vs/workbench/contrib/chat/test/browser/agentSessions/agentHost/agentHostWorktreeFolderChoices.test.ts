/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostNewSessionFolderService } from '../../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostWorktreeFolderChoices } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeFolderChoices.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';

suite('AgentHostWorktreeFolderChoices', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/vscode');
	const feature = URI.file('/work/vscode.worktrees/feature');
	const other = URI.file('/work/vscode.worktrees/other');
	const session = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-1' });

	/** The choices in a window whose folder is at `at`, recording the folders and isolation it sets for the session. */
	async function createChoices(options: { readonly enabled: boolean; readonly at: URI; readonly isolation?: string; readonly state?: WorkbenchState }) {
		const config = { values: { isolation: options.isolation ?? 'folder' } as Record<string, unknown> };
		const changes: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.enabled }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: primary, folders: [upcastPartial<IWorkspaceFolder>({ uri: options.at })] }),
			getWorkbenchState: () => options.state ?? WorkbenchState.FOLDER,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocation: Event.None,
			canSetLocation: () => true,
			getLocations: async () => [feature, other].map(uri => upcastPartial<IFolderLocation>({ uri, label: uri.path.split('/').pop() })),
		}));
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({
			getFolder: () => undefined,
			setFolder: (_resource: URI, folder: URI) => { changes.push(`folder ${folder.path}`); },
		}));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({
			onDidChange: Event.None,
			getResolvedConfig: () => ({ schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] } } }, values: config.values }),
			getPreparedSessionConfig: () => undefined,
			applyConfigChange: async (_resource: URI, _provider: string, _workingDirectory: URI | undefined, partial: Record<string, unknown>) => {
				changes.push(`isolation ${partial.isolation}`);
				config.values = { ...config.values, ...partial };
				return session;
			},
		}));
		const choices = store.add(instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => session));
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		const actions = (selected: URI) => choices.getActions(upcastPartial<MenuItemAction>({}), selected, () => { });
		const items = (selected: URI) => actions(selected).map(action => `${action.category?.label ? `[${action.category.label}] ` : ''}${action.label}${action.description ? ` (${action.description})` : ''}${action.checked ? ' *' : ''}`);
		return { choices, actions, items, changes };
	}

	test('offers New Worktree first, then the folder and its worktrees, each section with where the folder is now first', async () => {
		const atWorktree = await createChoices({ enabled: true, at: other });
		const atFolder = await createChoices({ enabled: true, at: primary });

		assert.deepStrictEqual({ atWorktree: atWorktree.items(other), atFolder: atFolder.items(primary) }, {
			atWorktree: ['New Worktree', '[Folder] vscode', '[Worktrees] other (Current) *', '[Worktrees] feature'],
			atFolder: ['New Worktree', '[Folder] vscode (Current) *', '[Worktrees] feature', '[Worktrees] other'],
		});
	});

	test('New Worktree has the session work in a new worktree, which the label shows, and picking a folder again works in it', async () => {
		const { choices, actions, items, changes } = await createChoices({ enabled: true, at: primary });
		await actions(primary).find(action => action.label === 'New Worktree')!.run();
		const inNewWorktree = { items: items(primary), label: choices.getLabel(primary) };
		await actions(primary).find(action => action.label === 'feature')!.run();

		assert.deepStrictEqual({ inNewWorktree, changes, label: choices.getLabel(feature) }, {
			inNewWorktree: { items: ['New Worktree *', '[Folder] vscode (Current)', '[Worktrees] feature', '[Worktrees] other'], label: 'vscode - New Worktree' },
			changes: ['isolation worktree', 'folder /work/vscode.worktrees/feature', 'isolation folder'],
			label: 'feature',
		});
	});

	test('is active only with the setting on in a window with a single local folder', async () => {
		assert.deepStrictEqual({
			on: (await createChoices({ enabled: true, at: primary })).choices.isActive(),
			off: (await createChoices({ enabled: false, at: primary })).choices.isActive(),
			multiRoot: (await createChoices({ enabled: true, at: primary, state: WorkbenchState.WORKSPACE })).choices.isActive(),
		}, { on: true, off: false, multiRoot: false });
	});
});
