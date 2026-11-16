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
import { isIMenuItem, MenuId, MenuItemAction, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpression } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFolderLocation, IResolvedFolderLocation, IWorkspaceFolderLocationService } from '../../../../../../../platform/workspace/common/folderLocations.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, WorkbenchState } from '../../../../../../../platform/workspace/common/workspace.js';
import { IAgentHostNewSessionFolderService } from '../../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostUntitledProvisionalSessionService } from '../../../../browser/agentSessions/agentHost/agentHostUntitledProvisionalSessionService.js';
import { AgentHostWorktreeFolderChoices, AgentHostWorktreeLocationsCache, IAgentHostWorktreeLocationsCache } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeFolderChoices.js';
import { OpenAgentHostFolderPickerAction } from '../../../../browser/agentSessions/agentHost/agentHostChatInputPicker.contribution.js';
import { AgentHostNewWorktreeToggle } from '../../../../browser/agentSessions/agentHost/agentHostNewWorktreeToggle.js';
import { IChatWidget } from '../../../../browser/chat.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
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
	async function createChoices(options: { readonly enabled: boolean; readonly at: URI; readonly isolation?: string; readonly state?: WorkbenchState; readonly listed?: readonly URI[]; readonly sessionsList?: boolean; readonly read?: boolean; readonly isolations?: readonly string[] | 'unresolved'; readonly resolveLocation?: (location: URI) => Promise<IResolvedFolderLocation | undefined> }) {
		const config = { values: { isolation: options.isolation ?? 'folder' } as Record<string, unknown>, isolations: options.isolations ?? ['folder', 'worktree'] };
		const changes: string[] = [];
		const listed = { locations: options.listed ?? [feature, other], reads: 0 };
		const onDidChangeSessions = store.add(new Emitter<void>());
		const onDidChangeProvisional = store.add(new Emitter<URI>());
		/** Changing the session's folder resets its configuration until it applies a change, as the provisional service does. */
		let configReset = false;
		let noWorkspace = false;
		/** The working directory of each configuration change, `none` without one. */
		const configDirectories: string[] = [];
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: options.enabled, 'chat.viewSessions.sessionsList.enabled': options.sessionsList ?? false }));
		instantiationService.stub(IWorkspaceContextService, upcastPartial<IWorkspaceContextService>({
			getWorkspace: () => upcastPartial<IWorkspace>({ uri: primary, folders: [upcastPartial<IWorkspaceFolder>({ uri: options.at })] }),
			getWorkbenchState: () => options.state ?? WorkbenchState.FOLDER,
		}));
		instantiationService.stub(IWorkspaceFolderLocationService, upcastPartial<IWorkspaceFolderLocationService>({
			onDidChangeProviders: Event.None,
			onDidChangeLocation: Event.None,
			canSetLocation: () => true,
			getLocations: async () => (listed.reads++, listed.locations).map(uri => upcastPartial<IFolderLocation>({ uri, label: uri.path.split('/').pop() })),
			getLocation: () => options.at.path === primary.path ? undefined : upcastPartial<IResolvedFolderLocation>({ uri: options.at, label: options.at.path.split('/').pop() }),
			// As git links them: only the worktrees of the window's folder resolve, not another repository or the folder itself
			resolveLocation: async (_primary: URI, location: URI) => options.resolveLocation ? options.resolveLocation(location) : location.path.startsWith('/work/vscode.worktrees/') || location.path.startsWith('/work/checkouts/') ? upcastPartial<IResolvedFolderLocation>({ uri: location }) : undefined,
		}));
		instantiationService.stub(IAgentHostNewSessionFolderService, upcastPartial<IAgentHostNewSessionFolderService>({
			getFolder: () => undefined,
			setFolder: (_resource: URI, folder: URI) => { changes.push(`folder ${folder.path}`); configReset = true; noWorkspace = false; },
			isNoWorkspace: () => noWorkspace,
			setNoWorkspace: () => { changes.push('no workspace'); configReset = true; noWorkspace = true; },
			setIsolationChosen: () => { },
		}));
		instantiationService.stub(IAgentHostUntitledProvisionalSessionService, upcastPartial<IAgentHostUntitledProvisionalSessionService>({
			onDidChange: onDidChangeProvisional.event,
			getResolvedConfig: () => configReset || config.isolations === 'unresolved' ? undefined : ({ schema: { type: 'object', properties: { isolation: { type: 'string', title: 'Isolation', enum: [...config.isolations] } } }, values: config.values }),
			getPreparedSessionConfig: () => undefined,
			applyConfigChange: async (_resource: URI, _provider: string, workingDirectory: URI | undefined, partial: Record<string, unknown>) => {
				changes.push(`isolation ${partial.isolation}`);
				configDirectories.push(workingDirectory?.path ?? 'none');
				config.values = { ...config.values, ...partial };
				configReset = false;
				onDidChangeProvisional.fire(session);
				return session;
			},
		}));
		instantiationService.stub(IAgentSessionsService, upcastPartial<IAgentSessionsService>({ model: upcastPartial<IAgentSessionsService['model']>({ onDidChangeSessions: onDidChangeSessions.event }) }));
		instantiationService.stub(IAgentHostWorktreeSessionSources, store.add(new AgentHostWorktreeSessionSources()));
		instantiationService.stub(IAgentHostWorktreeLocationsCache, store.add(instantiationService.createInstance(AgentHostWorktreeLocationsCache)));
		const choices = store.add(instantiationService.createInstance(AgentHostWorktreeFolderChoices, () => session));
		const actions = (selected: URI) => choices.getActions(upcastPartial<MenuItemAction>({}), selected, () => { });
		// As the chip does as it shows: its first ask reads the worktrees
		if (options.read !== false) {
			actions(options.at);
		}
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		const items = (selected: URI) => actions(selected).map(action => `${action.category?.label ? `[${action.category.label}] ` : ''}${action.label}${action.description ? ` (${action.description})` : ''}${action.checked ? ' *' : ''}`);
		/** Resolves the session's configuration, as the host answers, with the `isolations` it supports. */
		const resolve = (isolations: readonly string[]) => {
			config.isolations = isolations;
			onDidChangeProvisional.fire(session);
		};
		return { choices, actions, items, changes, configDirectories, listed, onDidChangeSessions, instantiationService, resolve };
	}

	test('offers the folder and New Worktree, each with what it does, then under Worktrees the worktrees, with where the folder is now first', async () => {
		const atWorktree = await createChoices({ enabled: true, at: other });
		const atFolder = await createChoices({ enabled: true, at: primary });
		// A worktree that no session lists any more, such as one whose sessions are archived
		const atUnlisted = await createChoices({ enabled: true, at: other, listed: [feature] });

		assert.deepStrictEqual({ atWorktree: atWorktree.items(other), details: atFolder.actions(primary).map(action => action.detail ?? null), icons: atWorktree.actions(other).map(action => action.icon?.id), atUnlisted: atUnlisted.items(other), atFolder: atFolder.items(primary) }, {
			atWorktree: ['vscode', 'New Worktree', '[Worktrees] other (Current) *', '[Worktrees] feature'],
			// Below their names, what the folder and New Worktree do; the worktrees as they are
			details: ['Works in the folder already on this computer', 'Creates a separate copy for this session', null, null],
			icons: ['folder', 'worktree', 'worktree', 'worktree'],
			atUnlisted: ['vscode', 'New Worktree', '[Worktrees] other (Current) *', '[Worktrees] feature'],
			atFolder: ['vscode (Current) *', 'New Worktree', '[Worktrees] feature', '[Worktrees] other'],
		});
	});

	test('New Worktree has the session work in a new worktree, which the label shows, and picking a folder again works in it', async () => {
		const { choices, actions, items, changes } = await createChoices({ enabled: true, at: primary });
		const chip = (folder: URI) => { const { icon, label, description } = choices.getChip(folder); return { icon: icon.id, label, description }; };
		const folderChip = chip(primary);
		await actions(primary).find(action => action.label === 'New Worktree')!.run();
		const inNewWorktree = { items: items(primary), chip: chip(primary) };
		await actions(primary).find(action => action.label === 'feature')!.run();

		// By its icon and name, or New Worktree by that name; what it is, by name, for screen readers and on hover
		// An existing chat, whose started session works in a folder that the chip does not list: a worktree once git proves it
		// one; another repository, or the window's folder by another path, is a folder
		// A folder named like a worktree VS Code creates for the folder shows as one before it is read, as after a reload; one elsewhere once git proves it
		const unlisted = { worktree: URI.file('/work/vscode.worktrees/small-random-change-addition'), elsewhere: URI.file('/work/checkouts/fix'), otherRepository: URI.file('/work/another-repo'), primaryAlias: URI.file('/private/work/vscode') };
		const beforeRead = { worktree: chip(unlisted.worktree).icon, elsewhere: chip(unlisted.elsewhere).icon };
		chip(unlisted.otherRepository);
		chip(unlisted.primaryAlias);
		await new Promise<void>(resolve => setTimeout(resolve, 0));
		assert.deepStrictEqual({ inNewWorktree, changes, folderChip, worktreeChip: chip(feature), beforeRead, unlistedWorktreeChip: chip(unlisted.worktree), elsewhereChip: chip(unlisted.elsewhere), otherRepositoryChip: chip(unlisted.otherRepository), primaryAliasChip: chip(unlisted.primaryAlias) }, {
			inNewWorktree: { items: ['vscode (Current)', 'New Worktree *', '[Worktrees] feature', '[Worktrees] other'], chip: { icon: 'worktree', label: 'New Worktree', description: 'New worktree of vscode' } },
			changes: ['isolation worktree', 'folder /work/vscode.worktrees/feature', 'isolation folder'],
			folderChip: { icon: 'folder', label: 'vscode', description: 'Folder: vscode' },
			worktreeChip: { icon: 'worktree', label: 'feature', description: 'Worktree: feature' },
			beforeRead: { worktree: 'worktree', elsewhere: 'folder' },
			unlistedWorktreeChip: { icon: 'worktree', label: 'small-random-change-addition', description: 'Worktree: small-random-change-addition' },
			elsewhereChip: { icon: 'worktree', label: 'fix', description: 'Worktree: fix' },
			otherRepositoryChip: { icon: 'folder', label: 'another-repo', description: 'Folder: another-repo' },
			primaryAliasChip: { icon: 'folder', label: 'vscode', description: 'Folder: vscode' },
		});
	});

	test('never offers No Workspace, also while the Chat view lists sessions', async () => {
		const items = async (sessionsList: boolean) => (await createChoices({ enabled: true, at: primary, sessionsList })).items(primary);

		assert.deepStrictEqual({ withoutSessionsList: await items(false), withSessionsList: await items(true) }, {
			withoutSessionsList: ['vscode (Current) *', 'New Worktree', '[Worktrees] feature', '[Worktrees] other'],
			withSessionsList: ['vscode (Current) *', 'New Worktree', '[Worktrees] feature', '[Worktrees] other'],
		});
	});

	test('a folder it does not list, which a failed read does not prove a worktree, is read again as it reads the worktrees again, and shows as a worktree once proven', async () => {
		const unlisted = URI.file('/work/checkouts/fix');
		let reads = 0;
		let readable = false;
		const { choices } = await createChoices({
			enabled: true, at: primary, resolveLocation: async location => {
				reads++;
				// As the providers answer where git could not be read: not a location
				return readable ? upcastPartial<IResolvedFolderLocation>({ uri: location }) : undefined;
			},
		});
		const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
		const icon = () => choices.getChip(unlisted).icon.id;
		const failed = icon();
		await settle();
		// Read once, as it renders again
		const afterFailure = [icon(), icon()];
		readable = true;
		// Such as as a provider or the folder's location changes
		choices.refresh();
		const pending = icon();
		await settle();

		assert.deepStrictEqual({ failed, afterFailure, pending, proven: icon(), reads }, { failed: 'folder', afterFailure: ['folder', 'folder'], pending: 'folder', proven: 'worktree', reads: 2 });
	});

	test('a folder named like a worktree VS Code creates for the folder shows as one until it is read, then as what git proves it', async () => {
		const real = URI.file('/work/vscode.worktrees/real');
		const notWorktree = URI.file('/work/vscode.worktrees/not-a-worktree');
		// The window's folder by a link under the same layout: git does not prove it a worktree of the folder
		const primaryLink = URI.file('/work/vscode.worktrees/primary-link');
		const flaky = URI.file('/work/vscode.worktrees/flaky');
		let flakyReadable = false;
		const { choices } = await createChoices({
			enabled: true, at: primary, resolveLocation: async location => {
				const proven = location.path === real.path || (location.path === flaky.path && flakyReadable);
				return proven ? upcastPartial<IResolvedFolderLocation>({ uri: location }) : undefined;
			},
		});
		let changes = 0;
		store.add(choices.onDidChange(() => changes++));
		const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));
		const icons = () => [real, notWorktree, primaryLink, flaky].map(folder => choices.getChip(folder).icon.id);
		// Its name shows at once, before git answers
		const labels = [real, notWorktree, primaryLink, flaky].map(folder => choices.getChip(folder).label);
		const pending = icons();
		await settle();
		const settled = { icons: icons(), changes, description: choices.getChip(notWorktree).description };
		flakyReadable = true;
		choices.refresh();
		const pendingAgain = icons();
		await settle();

		assert.deepStrictEqual({ labels, pending, settled, pendingAgain, reread: icons() }, {
			labels: ['real', 'not-a-worktree', 'primary-link', 'flaky'],
			pending: ['worktree', 'worktree', 'worktree', 'worktree'],
			settled: { icons: ['worktree', 'folder', 'folder', 'folder'], changes: 3, description: 'Folder: not-a-worktree' },
			pendingAgain: ['worktree', 'worktree', 'worktree', 'worktree'],
			reread: ['worktree', 'folder', 'folder', 'worktree'],
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
			before: ['vscode (Current) *', 'New Worktree', '[Worktrees] feature'],
			after: ['vscode (Current) *', 'New Worktree', '[Worktrees] feature', '[Worktrees] other'],
		});
	}));

	test('offers New Worktree as a checkbox instead of the folder chip while the folder has no worktrees, and the chip once it has one', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const shownIn = async (options: { readonly sessionsList?: boolean }) => {
			const { listed, onDidChangeSessions, instantiationService, changes } = await createChoices({ enabled: true, at: primary, listed: [], sessionsList: options.sessionsList });
			// The chat input's context, where a local agent host's new chat in a window with a single local folder is
			const contextKeyService = store.add(new ContextKeyService(instantiationService.get(IConfigurationService)));
			contextKeyService.createKey(ChatContextKeys.enabled.key, true);
			contextKeyService.createKey(ChatContextKeys.chatIsAgentHostSession.key, true);
			contextKeyService.createKey(ChatContextKeys.chatSessionType.key, SessionType.AgentHostCopilot);
			contextKeyService.createKey('workbenchState', 'folder');
			contextKeyService.createKey('remoteName', '');
			const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatWidget['viewModel']>({ sessionResource: session }), onDidChangeViewModel: Event.None, scopedContextKeyService: contextKeyService });
			store.add(instantiationService.createInstance(AgentHostNewWorktreeToggle, widget));
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			const shown = () => MenuRegistry.getMenuItems(MenuId.ChatInputSecondary).filter(isIMenuItem)
				.filter(item => (item.command.id === OpenAgentHostFolderPickerAction.ID || item.command.id === 'workbench.action.chat.toggleAgentHostNewWorktree') && contextKeyService.contextMatchesRules(item.when))
				.map(item => `${typeof item.command.title === 'string' ? item.command.title : item.command.title.value}${item.command.id === OpenAgentHostFolderPickerAction.ID ? '' : contextKeyService.contextMatchesRules(item.command.toggled as ContextKeyExpression) ? ' [x]' : ' [ ]'}`);
			const toggle = () => instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.action.chat.toggleAgentHostNewWorktree')!.handler(accessor, { widget }));
			return { shown, toggle, changes, listed, onDidChangeSessions };
		};

		const list = await shownIn({});
		const withoutWorktrees = list.shown();
		await list.toggle();
		const checked = list.shown();
		await list.toggle();
		const unchecked = { shown: list.shown(), changes: [...list.changes] };
		list.listed.locations = [feature];
		list.onDidChangeSessions.fire();
		await new Promise<void>(resolve => setTimeout(resolve, 1000));
		const withWorktree = list.shown();
		// Also while the Chat view lists sessions
		const withSessionsList = (await shownIn({ sessionsList: true })).shown();

		assert.deepStrictEqual({ withoutWorktrees, checked, unchecked, withWorktree, withSessionsList }, {
			withoutWorktrees: ['New Worktree [ ]'],
			checked: ['New Worktree [x]'],
			unchecked: { shown: ['New Worktree [ ]'], changes: ['isolation worktree', 'isolation folder'] },
			withWorktree: ['Folder'],
			withSessionsList: ['New Worktree [ ]'],
		});
	}));

	test('shows the folder chip only where it offers more than the folder, neither it nor the checkbox where the session cannot work in a new worktree, and nothing until that is known', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const shownIn = async (options: { readonly sessionsList?: boolean; readonly isolations: readonly string[] | 'unresolved'; readonly listed?: readonly URI[] }) => {
			const { instantiationService, resolve } = await createChoices({ enabled: true, at: primary, listed: options.listed ?? [], sessionsList: options.sessionsList, isolations: options.isolations });
			const contextKeyService = store.add(new ContextKeyService(instantiationService.get(IConfigurationService)));
			contextKeyService.createKey(ChatContextKeys.enabled.key, true);
			contextKeyService.createKey(ChatContextKeys.chatIsAgentHostSession.key, true);
			contextKeyService.createKey(ChatContextKeys.chatSessionType.key, SessionType.AgentHostCopilot);
			contextKeyService.createKey('workbenchState', 'folder');
			contextKeyService.createKey('remoteName', '');
			const widget = upcastPartial<IChatWidget>({ viewModel: upcastPartial<IChatWidget['viewModel']>({ sessionResource: session }), onDidChangeViewModel: Event.None, scopedContextKeyService: contextKeyService });
			store.add(instantiationService.createInstance(AgentHostNewWorktreeToggle, widget));
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			const shown = () => MenuRegistry.getMenuItems(MenuId.ChatInputSecondary).filter(isIMenuItem)
				.filter(item => (item.command.id === OpenAgentHostFolderPickerAction.ID || item.command.id === 'workbench.action.chat.toggleAgentHostNewWorktree') && contextKeyService.contextMatchesRules(item.when))
				.map(item => typeof item.command.title === 'string' ? item.command.title : item.command.title.value);
			return { shown, resolve };
		};

		const unresolved = await shownIn({ isolations: 'unresolved' });
		const whileUnresolved = unresolved.shown();
		unresolved.resolve(['folder', 'worktree']);
		const onceResolved = unresolved.shown();

		assert.deepStrictEqual({
			noWorktreeSupport: (await shownIn({ isolations: ['folder'] })).shown(),
			whileUnresolved,
			onceResolved,
			worktreeSupport: (await shownIn({ isolations: ['folder', 'worktree'] })).shown(),
			// The Sessions list makes no choice of its own
			sessionsList: (await shownIn({ isolations: ['folder'], sessionsList: true })).shown(),
			// A worktree to pick makes it a choice, also without support for new ones
			noWorktreeSupportWithWorktree: (await shownIn({ isolations: ['folder'], listed: [feature] })).shown(),
		}, {
			noWorktreeSupport: [],
			whileUnresolved: [],
			onceResolved: ['New Worktree'],
			worktreeSupport: ['New Worktree'],
			sessionsList: [],
			noWorktreeSupportWithWorktree: ['Folder'],
		});
	}));

	test('reads the worktrees once for all chat inputs and once per change, with or without the Sessions list, and not to toggle', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const reads = async (options: { readonly sessionsList: boolean }) => {
			const { listed, onDidChangeSessions, instantiationService } = await createChoices({ enabled: true, at: primary, listed: [], sessionsList: options.sessionsList, read: false });
			const widgets = [0, 1, 2].map(() => upcastPartial<IChatWidget>({
				viewModel: upcastPartial<IChatWidget['viewModel']>({ sessionResource: session }),
				onDidChangeViewModel: Event.None,
				scopedContextKeyService: store.add(new ContextKeyService(instantiationService.get(IConfigurationService))),
			}));
			for (const widget of widgets) {
				store.add(instantiationService.createInstance(AgentHostNewWorktreeToggle, widget));
			}
			await new Promise<void>(resolve => setTimeout(resolve, 0));
			const shown = listed.reads;
			onDidChangeSessions.fire();
			onDidChangeSessions.fire();
			await new Promise<void>(resolve => setTimeout(resolve, 1000));
			const changed = listed.reads;
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.action.chat.toggleAgentHostNewWorktree')!.handler(accessor, { widget: widgets[0] }));
			return { shown, changed, toggled: listed.reads };
		};

		assert.deepStrictEqual({ oldList: await reads({ sessionsList: false }), sessionsList: await reads({ sessionsList: true }) }, {
			oldList: { shown: 1, changed: 2, toggled: 2 },
			sessionsList: { shown: 1, changed: 2, toggled: 2 },
		});
	}));
});
