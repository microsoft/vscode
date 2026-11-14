/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFolderLocation, IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostNewSessionFolderService } from '../../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostWorktreeFolderChoices } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeFolderChoices.js';
import { IAgentSessionsService } from '../../../../browser/agentSessions/agentSessionsService.js';
import { AgentHostWorktreeSessionSources, IAgentHostWorktreeSessionSources } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSessionSources.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';

suite('AgentHostWorktreeFolderChoices', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const primary = URI.file('/work/vscode');
	const feature = URI.file('/work/vscode.worktrees/feature');
	const other = URI.file('/work/vscode.worktrees/other');
	const session = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-1' });

	/** The choices in a window whose folder is at `at`, recording the folders and isolation it sets for the session. */
	async function createChoices(options: { readonly enabled: boolean; readonly at: URI; readonly isolation?: string; readonly state?: WorkbenchState; readonly listed?: readonly URI[] }) {
		const config = { values: { isolation: options.isolation ?? 'folder' } as Record<string, unknown> };
		const changes: string[] = [];
		const listed = { locations: options.listed ?? [feature, other] };
		const onDidChangeSessions = store.add(new Emitter<void>());
		/** Changing the session's folder resets its configuration until it applies a change, as the provisional service does. */
		let configReset = false;
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
			getLocations: async () => listed.locations.map(uri => upcastPartial<IFolderLocation>({ uri, label: uri.path.split('/').pop() })),
			getLocation: () => options.at.path === primary.path ? undefined : upcastPartial<IResolvedFolderLocation>({ uri: options.at, label: options.at.path.split('/').pop() }),
			// As git links them: only the worktrees of the window's folder resolve, not another repository or the folder itself
			resolveLocation: async (_primary: URI, location: URI) => location.path.startsWith('/work/vscode.worktrees/') ? upcastPartial<IResolvedFolderLocation>({ uri: location }) : undefined,
		}));
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({
			getFolder: () => undefined,
			setFolder: (_resource: URI, folder: URI) => { changes.push(`folder ${folder.path}`); configReset = true; },
		}));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({
			onDidChange: Event.None,
			getResolvedConfig: () => configReset ? undefined : ({ schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: ['folder', 'worktree'] } } }, values: config.values }),
			getPreparedSessionConfig: () => undefined,
			applyConfigChange: async (_resource: URI, _provider: string, _workingDirectory: URI | undefined, partial: Record<string, unknown>) => {
				changes.push(`isolation ${partial.isolation}`);
				config.values = { ...config.values, ...partial };
				configReset = false;
				return session;
			},
		}));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: onDidChangeSessions.event }) }));
		instantiationService.stub(IAgentHostWorktreeSessionSources, store.add(new AgentHostWorktreeSessionSources()));
		const choices = store.add(instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => session));
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		const actions = (selected: URI) => choices.getActions(upcastPartial<MenuItemAction>({}), selected, () => { });
		const items = (selected: URI) => actions(selected).map(action => `${action.category?.label ? `[${action.category.label}] ` : ''}${action.label}${action.description ? ` (${action.description})` : ''}${action.checked ? ' *' : ''}`);
		return { choices, actions, items, changes, listed, onDidChangeSessions };
	}

	test('offers New Worktree first, then the folder and its worktrees, each section with where the folder is now first', async () => {
		const atWorktree = await createChoices({ enabled: true, at: other });
		const atFolder = await createChoices({ enabled: true, at: primary });
		// A worktree that no session lists any more, such as one whose sessions are archived
		const atUnlisted = await createChoices({ enabled: true, at: other, listed: [feature] });

		assert.deepStrictEqual({ atWorktree: atWorktree.items(other), icons: atWorktree.actions(other).map(action => action.icon?.id), atUnlisted: atUnlisted.items(other), atFolder: atFolder.items(primary) }, {
			atWorktree: ['New Worktree', '[Folder] vscode', '[Worktrees] other (Current) *', '[Worktrees] feature'],
			icons: ['worktree', 'folder', 'worktree', 'worktree'],
			atUnlisted: ['New Worktree', '[Folder] vscode', '[Worktrees] other (Current) *', '[Worktrees] feature'],
			atFolder: ['New Worktree', '[Folder] vscode (Current) *', '[Worktrees] feature', '[Worktrees] other'],
		});
	});

	test('New Worktree has the session work in a new worktree, which the label shows, and picking a folder again works in it', async () => {
		const { choices, actions, items, changes } = await createChoices({ enabled: true, at: primary });
		const chip = (folder: URI) => { const { icon, label, description } = choices.getChip(folder); return { icon: icon.id, label: label ?? null, description }; };
		const folderChip = chip(primary);
		await actions(primary).find(action => action.label === 'New Worktree')!.run();
		const inNewWorktree = { items: items(primary), chip: chip(primary) };
		await actions(primary).find(action => action.label === 'feature')!.run();

		// By its icon only, but New Worktree by its name; what it is, by name, for screen readers and on hover
		// An existing chat, whose started session works in a folder that the chip does not list: a worktree once git proves it
		// one; another repository, or the window's folder by another path, is a folder
		const unlisted = { worktree: URI.file('/work/vscode.worktrees/small-random-change-addition'), otherRepository: URI.file('/work/another-repo'), primaryAlias: URI.file('/private/work/vscode') };
		const unlistedBeforeProven = chip(unlisted.worktree).icon;
		chip(unlisted.otherRepository);
		chip(unlisted.primaryAlias);
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual({ inNewWorktree, changes, folderChip, worktreeChip: chip(feature), unlistedBeforeProven, unlistedWorktreeChip: chip(unlisted.worktree), otherRepositoryChip: chip(unlisted.otherRepository), primaryAliasChip: chip(unlisted.primaryAlias) }, {
			inNewWorktree: { items: ['New Worktree *', '[Folder] vscode (Current)', '[Worktrees] feature', '[Worktrees] other'], chip: { icon: 'worktree', label: 'Worktree', description: 'New worktree of vscode' } },
			changes: ['isolation worktree', 'folder /work/vscode.worktrees/feature', 'isolation folder'],
			folderChip: { icon: 'folder', label: null, description: 'Folder: vscode' },
			worktreeChip: { icon: 'worktree', label: null, description: 'Worktree: feature' },
			unlistedBeforeProven: 'folder',
			unlistedWorktreeChip: { icon: 'worktree', label: null, description: 'Worktree: small-random-change-addition' },
			otherRepositoryChip: { icon: 'folder', label: null, description: 'Folder: another-repo' },
			primaryAliasChip: { icon: 'folder', label: null, description: 'Folder: vscode' },
		});
	});

	test('is active only with the setting on in a window with a single local folder', async () => {
		assert.deepStrictEqual({
			on: (await createChoices({ enabled: true, at: primary })).choices.isActive(),
			off: (await createChoices({ enabled: false, at: primary })).choices.isActive(),
			multiRoot: (await createChoices({ enabled: true, at: primary, state: WorkbenchState.WORKSPACE })).choices.isActive(),
		}, { on: true, off: false, multiRoot: false });
	});

	test('offers a worktree that a session comes to work in meanwhile, such as one in the background', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { items, listed, onDidChangeSessions } = await createChoices({ enabled: true, at: primary, listed: [feature] });
		const before = items(primary);
		listed.locations = [feature, other];
		onDidChangeSessions.fire();
		await new Promise<void>(resolve => setTimeout(resolve, 1000));

		assert.deepStrictEqual({ before, after: items(primary) }, {
			before: ['New Worktree', '[Folder] vscode (Current) *', '[Worktrees] feature'],
			after: ['New Worktree', '[Folder] vscode (Current) *', '[Worktrees] feature', '[Worktrees] other'],
		});
	}));
});
