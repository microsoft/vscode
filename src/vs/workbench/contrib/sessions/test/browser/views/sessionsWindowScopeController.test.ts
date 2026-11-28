/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { extUriIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { WorkbenchMode, WorkbenchState } from '../../../../../../platform/workspace/common/workspace.js';
import { IAgentsModeService } from '../../../../../services/agentsMode/common/agentsMode.js';
import { IChatEntitlementService, IChatSentiment } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchWorkspaceContextService } from '../../../../../services/workspaces/common/workbenchWorkspaceContextService.js';
import { ChatContextKeys } from '../../../../chat/common/actions/chatContextKeys.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../../common/chatConstants.js';
import { getInboxWorkspaceOptions, SessionsListFilters } from '../../../browser/views/sessionsListFilters.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';
import { SessionsWindowScopeController } from '../../../browser/views/sessionsWindowScopeController.js';

suite('SessionsWindowScopeController', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	type WindowKind = 'agents' | 'empty' | 'folder' | 'multiRoot';

	/** A window of `kind`, whose own folders are `windowFolders`, which turns into the Agents mode while it is in Agents mode. */
	function createScope({ chatEnabled = true, hidden = false, kind = 'agents' as WindowKind, enabled = true, windowFolders = [] as URI[], restoredInMode = false } = {}) {
		const folder = URI.file('/work/repo');
		// Like the workbench workspace, each mode keeps its own scope
		const scopes = new Map<WorkbenchMode, URI | undefined>([[WorkbenchMode.Editor, folder], [WorkbenchMode.Agents, folder]]);
		const scopeWrites: string[] = [];
		const state = kind === 'folder' ? WorkbenchState.FOLDER : kind === 'multiRoot' ? WorkbenchState.WORKSPACE : WorkbenchState.EMPTY;
		const agentsMode = { isActive: restoredInMode, onDidChange: store.add(new Emitter<boolean>()) };
		const onDidChangeWorkbenchMode = store.add(new Emitter<WorkbenchMode>());
		const setAgentsMode = (active: boolean) => {
			agentsMode.isActive = active;
			onDidChangeWorkbenchMode.fire(active ? WorkbenchMode.Agents : WorkbenchMode.Editor);
			agentsMode.onDidChange.fire(active);
		};
		const workspace = new class extends mock<IWorkbenchWorkspaceContextService>() {
			override onDidChangeWorkspaceFolders = Event.None;
			override onDidChangeWorkbenchState = Event.None;
			override onDidChangeWorkbenchMode = onDidChangeWorkbenchMode.event;
			override getWorkbenchMode() { return kind === 'agents' || agentsMode.isActive ? WorkbenchMode.Agents : WorkbenchMode.Editor; }
			override getWorkbenchState() { return state; }
			override getWorkspace() { return { id: 'repo', uri: folder, folders: [] }; }
			override getWorkbenchScope() { return scopes.get(this.getWorkbenchMode()); }
			override setWorkbenchScope(value: URI | undefined) { scopeWrites.push(`${this.getWorkbenchMode()}:${value?.path}`); scopes.set(this.getWorkbenchMode(), value); }
			override resetWorkbenchScope() { scopeWrites.push(`${this.getWorkbenchMode()}:reset`); scopes.set(this.getWorkbenchMode(), folder); }
		}();
		const configuration = new TestConfigurationService({ [SESSIONS_LIST_WORKSPACES_FILTER_SETTING]: enabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const identity = upcastPartial<IUriIdentityService>({ extUri: extUriIgnorePathCase });
		const contextKeyService = new MockContextKeyService();
		contextKeyService.createKey(ChatContextKeys.enabled.key, chatEnabled);
		const sentiment = observableValue<IChatSentiment>('sentiment', { hidden });
		const controller = store.add(new SessionsWindowScopeController(workspace, configuration, identity, contextKeyService, upcastPartial<IChatEntitlementService>({ sentimentObs: sentiment }),
			upcastPartial<IAgentsModeService>({ windowFolders, get isActive() { return agentsMode.isActive; }, onDidChange: agentsMode.onDidChange.event })));
		const storage = store.add(new InMemoryStorageService());
		const filters = () => store.add(new SessionsListFilters(storage, store.add(new NullLogService()), configuration, identity));
		const setEnabled = async (value: boolean) => {
			const key = SESSIONS_LIST_WORKSPACES_FILTER_SETTING;
			await configuration.setUserConfiguration(key, value);
			configuration.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: section => section === key, affectedKeys: new Set([key]), change: { keys: [key], overrides: [] }, source: ConfigurationTarget.USER });
		};
		return { controller, workspace, configuration, filters, sentiment, setAgentsMode, setEnabled, scopeWrites };
	}

	test('the window scope follows the bar pick and is released when the setting turns off or the controller is disposed', async () => {
		const { controller, workspace, filters, setEnabled } = createScope();
		const bar = filters();
		controller.setScopeBarFilters(bar);
		const scopes = [workspace.getWorkbenchScope()?.toString()];
		bar.setInboxWorkspace({ environment: 'local', resource: 'file:///other', label: 'other' });
		scopes.push(workspace.getWorkbenchScope()?.toString());
		await setEnabled(false);
		scopes.push(workspace.getWorkbenchScope()?.toString());
		await setEnabled(true);
		scopes.push(workspace.getWorkbenchScope()?.toString());
		controller.dispose();
		scopes.push(workspace.getWorkbenchScope()?.toString());
		assert.deepStrictEqual(scopes, [undefined, 'file:///other', 'file:///work/repo', 'file:///other', 'file:///work/repo']);
	});

	test('only the Agents window and empty editor windows show the bar and let it scope the window', () => {
		const pick = { environment: 'local', resource: 'file:///other', label: 'other' };
		const result: Record<string, { isScopeBarWindow: boolean; barShown: boolean; scope: string | undefined }> = {};
		for (const kind of ['agents', 'empty', 'folder', 'multiRoot'] as const) {
			const { controller, workspace, filters } = createScope({ kind });
			const bar = filters();
			bar.setInboxWorkspace(pick);
			controller.setScopeBarFilters(bar);
			result[kind] = { isScopeBarWindow: controller.isScopeBarWindow.get(), barShown: controller.barShown.get(), scope: workspace.getWorkbenchScope()?.toString() };
		}
		assert.deepStrictEqual(result, {
			agents: { isScopeBarWindow: true, barShown: true, scope: 'file:///other' },
			empty: { isScopeBarWindow: true, barShown: true, scope: 'file:///other' },
			folder: { isScopeBarWindow: false, barShown: false, scope: 'file:///work/repo' },
			multiRoot: { isScopeBarWindow: false, barShown: false, scope: 'file:///work/repo' },
		});
	});

	test('the bar scopes the window only while AI features are neither disabled nor hidden', () => {
		const pick = { environment: 'local', resource: 'file:///other', label: 'other' };
		const disabled = createScope({ chatEnabled: false });
		const disabledFilters = disabled.filters();
		disabledFilters.setInboxWorkspace(pick);
		disabled.controller.setScopeBarFilters(disabledFilters);
		const hidden = createScope({ hidden: true });
		const hiddenFilters = hidden.filters();
		hiddenFilters.setInboxWorkspace(pick);
		hidden.controller.setScopeBarFilters(hiddenFilters);
		const whileHidden = hidden.workspace.getWorkbenchScope()?.toString();
		hidden.sentiment.set({ hidden: false }, undefined);
		assert.deepStrictEqual({
			disabled: disabled.workspace.getWorkbenchScope()?.toString(),
			whileHidden,
			shown: hidden.workspace.getWorkbenchScope()?.toString(),
		}, { disabled: 'file:///work/repo', whileHidden: 'file:///work/repo', shown: 'file:///other' });
	});

	test('disposing does not clear a window scope another component set later', () => {
		const { controller, workspace, filters } = createScope();
		controller.setScopeBarFilters(filters());
		workspace.setWorkbenchScope(URI.file('/another-owner'));
		controller.dispose();
		assert.strictEqual(workspace.getWorkbenchScope()?.toString(), 'file:///another-owner');
	});

	test('a pick equal to the default scope is set explicitly after another component reset the scope', () => {
		const { controller, workspace, filters, scopeWrites } = createScope();
		const bar = filters();
		bar.setInboxWorkspace({ environment: 'local', resource: 'file:///other', label: 'other' });
		controller.setScopeBarFilters(bar);
		workspace.resetWorkbenchScope();
		scopeWrites.splice(0);
		bar.setInboxWorkspace({ environment: 'local', resource: 'file:///work/repo', label: 'repo' });
		assert.deepStrictEqual(scopeWrites, [`${WorkbenchMode.Agents}:/work/repo`]);
	});

	test('a window with folders in Agents mode is scoped to its pick also without the bar, which then fixes the pick', () => {
		const run = (enabled: boolean, windowFolders: URI[]) => {
			const { controller, workspace, filters, setAgentsMode } = createScope({ kind: windowFolders.length ? 'folder' : 'empty', enabled, windowFolders });
			const bar = filters();
			bar.setInboxWorkspace({ environment: 'local', resource: 'file:///work/app', label: 'app' });
			controller.setScopeBarFilters(bar);
			const state = () => ({
				scopes: controller.scopesWindow.get(), bar: controller.barShown.get(), fixed: controller.scopePickFixed.get(),
				scope: workspace.getWorkbenchScope()?.path, offered: controller.windowWorkspaces.get().map(folder => folder.label),
			});
			const before = state();
			setAgentsMode(true);
			const entered = state();
			setAgentsMode(false);
			return { before, entered, left: state() };
		};
		const notScoped = { scopes: false, bar: false, fixed: false, scope: '/work/repo', offered: [] };
		assert.deepStrictEqual({
			settingOff: run(false, [URI.file('/work/app')]),
			settingOn: run(true, [URI.file('/work/app')]),
			emptySettingOff: run(false, []),
		}, {
			// Scoped to the pick in the mode, which the hidden bar can't change, and back to the window's own scope on leaving
			settingOff: { before: notScoped, entered: { scopes: true, bar: false, fixed: true, scope: '/work/app', offered: ['app'] }, left: notScoped },
			// The bar shows in the mode, so the user can pick another workspace
			settingOn: { before: notScoped, entered: { scopes: true, bar: true, fixed: false, scope: '/work/app', offered: ['app'] }, left: notScoped },
			// An empty window is scoped in the mode only with the setting on
			emptySettingOff: { before: notScoped, entered: notScoped, left: notScoped },
		});
	});

	test('the pick applies again to the mode an empty window switches to, so leaving does not keep an older pick', () => {
		const { controller, workspace, filters, setAgentsMode } = createScope({ kind: 'empty' });
		const bar = filters();
		bar.setInboxWorkspace({ environment: 'local', resource: 'file:///work/first', label: 'first' });
		controller.setScopeBarFilters(bar);
		const before = workspace.getWorkbenchScope()?.path;
		setAgentsMode(true);
		// Entering starts the bar of an empty window on all sessions
		const entered = workspace.getWorkbenchScope()?.path;
		bar.setInboxWorkspace({ environment: 'local', resource: 'file:///work/second', label: 'second' });
		setAgentsMode(false);
		assert.deepStrictEqual({ before, entered, left: workspace.getWorkbenchScope()?.path }, { before: '/work/first', entered: undefined, left: '/work/second' });
	});

	test('a window with folders leaving Agents mode does not touch its editor scope', () => {
		const { controller, filters, setAgentsMode, scopeWrites } = createScope({ kind: 'folder', enabled: false, windowFolders: [URI.file('/work/app')] });
		controller.setScopeBarFilters(filters());
		setAgentsMode(true);
		const entered = scopeWrites.splice(0);
		setAgentsMode(false);
		assert.deepStrictEqual({ entered, left: scopeWrites }, { entered: [`${WorkbenchMode.Agents}:/work/app`], left: [] });
	});

	test('starts the bar of a window entering or restoring in Agents mode on its first folder, or an empty window on all sessions with the setting on', async () => {
		const run = async ({ enabled, windowFolders, restoredInMode = false, turnSettingOff = false }: { enabled: boolean; windowFolders: URI[]; restoredInMode?: boolean; turnSettingOff?: boolean }) => {
			const { controller, filters, setAgentsMode, setEnabled } = createScope({ kind: windowFolders.length ? 'folder' : 'empty', enabled, windowFolders, restoredInMode });
			const bar = filters();
			bar.setInboxWorkspace({ environment: 'local', resource: 'file:///work/other', label: 'other' });
			const picked = () => {
				const workspace = bar.inboxScope.workspace;
				return workspace === undefined ? 'all' : workspace === 'none' ? 'none' : workspace.label;
			};
			controller.setScopeBarFilters(bar);
			const restored = picked();
			if (turnSettingOff) {
				await setEnabled(false);
				return { restored, settingOff: picked() };
			}
			setAgentsMode(true);
			const entered = picked();
			setAgentsMode(false);
			return { restored, entered, left: picked() };
		};
		const folder = (name: string) => URI.file(`/work/${name}`);
		assert.deepStrictEqual({
			folder: await run({ enabled: true, windowFolders: [folder('repo')] }),
			multiRoot: await run({ enabled: true, windowFolders: [folder('first'), folder('second')] }),
			empty: await run({ enabled: true, windowFolders: [] }),
			settingOff: await run({ enabled: false, windowFolders: [folder('repo')] }),
			emptySettingOff: await run({ enabled: false, windowFolders: [] }),
			restoredSettingOff: await run({ enabled: false, windowFolders: [folder('repo')], restoredInMode: true }),
			restoredSettingOn: await run({ enabled: true, windowFolders: [folder('repo')], restoredInMode: true, turnSettingOff: true }),
		}, {
			// Leaving keeps the pick, as a pick of the user's would be
			folder: { restored: 'other', entered: 'repo', left: 'repo' },
			multiRoot: { restored: 'other', entered: 'first', left: 'first' },
			empty: { restored: 'other', entered: 'all', left: 'all' },
			settingOff: { restored: 'other', entered: 'repo', left: 'repo' },
			emptySettingOff: { restored: 'other', entered: 'other', left: 'other' },
			// Without the bar nothing could have widened the pick, so it starts on the folder again
			restoredSettingOff: { restored: 'repo', entered: 'repo', left: 'repo' },
			// With the bar the user's pick stays, until the setting turns off and fixes the pick on the folder again
			restoredSettingOn: { restored: 'other', settingOff: 'repo' },
		});
	});

	test('the bar offers the window\'s own folders while the pick scopes the window, also before they have sessions', () => {
		const { controller, filters, setAgentsMode } = createScope({ kind: 'folder', enabled: false, windowFolders: [URI.file('/home/user/projects/repo'), URI.file('/home/user/projects/APP')] });
		const bar = filters();
		const sessionOptions = getInboxWorkspaceOptions(['app', 'other'].map(workspace => buildTestSession({ id: workspace, title: workspace, workspace }).session), extUriIgnorePathCase);
		const offered = (environment?: string) => bar.withWindowWorkspaces(sessionOptions, controller.windowWorkspaces.get(), environment).map(workspace => workspace.label);
		const outside = offered();
		setAgentsMode(true);
		assert.deepStrictEqual({ outside, inMode: offered(), otherEnvironment: offered('remote') }, {
			outside: ['app', 'other'],
			// `…/APP` is the `app` sessions' folder where paths ignore case, so it is not offered twice
			inMode: ['app', 'other', 'repo'],
			otherEnvironment: ['app', 'other'],
		});
	});
});
