/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { extUriIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, WorkbenchMode } from '../../../../../../platform/workspace/common/workspace.js';
import { IEditableWorkspaceContextService } from '../../../../../services/configuration/common/configuration.js';
import { getInboxWorkspaceFilter, getInboxWorkspaceOptions, SessionsListFilters } from '../../../browser/views/sessionsListFilters.js';
import { AgenticModeSessionsScopeContribution, SessionsWorkbenchScopeService } from '../../../browser/views/sessionsWorkbenchScope.js';
import { IAgenticModeService } from '../../../../../services/agenticMode/common/agenticMode.js';
import { SESSIONS_LIST_WORKSPACES_FILTER_SETTING } from '../../../common/sessionConfig.js';
import { buildTestSession } from '../../common/testSessionBuilder.js';

suite('SessionsWorkbenchScopeService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/** An Agents window with the setting `enabled`, recording each scope it is set to. */
	function createService(enabled: boolean, windowFolders: URI[] = [], agenticMode?: { isActive: boolean; onDidChange: Emitter<boolean> }) {
		const scopes: (string | undefined)[] = [];
		const onDidChangeWorkbenchMode = store.add(new Emitter<WorkbenchMode>());
		const workspace = upcastPartial<IWorkspaceContextService & Pick<IEditableWorkspaceContextService, 'setWorkbenchScope'>>({
			onDidChangeWorkbenchMode: onDidChangeWorkbenchMode.event,
			getWorkbenchMode: () => WorkbenchMode.Agents,
			setWorkbenchScope: (value: URI | undefined) => { scopes.push(value?.path); },
		});
		const configurationService = new TestConfigurationService({ [SESSIONS_LIST_WORKSPACES_FILTER_SETTING]: enabled });
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const setEnabled = async (value: boolean) => {
			await configurationService.setUserConfiguration(SESSIONS_LIST_WORKSPACES_FILTER_SETTING, value);
			configurationService.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: section => section === SESSIONS_LIST_WORKSPACES_FILTER_SETTING,
				affectedKeys: new Set([SESSIONS_LIST_WORKSPACES_FILTER_SETTING]),
				change: { keys: [SESSIONS_LIST_WORKSPACES_FILTER_SETTING], overrides: [] },
				source: ConfigurationTarget.USER,
			});
		};
		const agenticModeService = upcastPartial<IAgenticModeService>({
			windowFolders,
			get isActive() { return agenticMode?.isActive ?? false; },
			onDidChange: agenticMode?.onDidChange.event ?? Event.None,
		});
		return { service: new SessionsWorkbenchScopeService(workspace, configurationService, agenticModeService), scopes, setEnabled };
	}

	/** The filters of a list, on storage of its own so that its pick is its own. */
	function createFilters(workspace?: string | 'none'): SessionsListFilters {
		const filters = store.add(new SessionsListFilters(store.add(new InMemoryStorageService()), new NullLogService(), new TestConfigurationService(), upcastPartial<IUriIdentityService>({ extUri: extUriIgnorePathCase })));
		if (workspace) {
			filters.setInboxWorkspace(workspace === 'none' ? 'none' : getInboxWorkspaceFilter(buildTestSession({ id: workspace, title: workspace, workspace }).session));
		}
		return filters;
	}

	test('scopes the window to the bar registered or changed last, falls back to the remaining bar, and to no workspace once none is left', () => {
		const { service, scopes } = createService(true);
		const first = createFilters('first');
		const second = createFilters('second');

		const firstBar = service.registerScopeBar(first);
		const secondBar = service.registerScopeBar(second);
		first.setInboxWorkspace('none');
		first.setInboxWorkspace(getInboxWorkspaceFilter(buildTestSession({ id: 'first', title: 'first', workspace: 'first' }).session));
		firstBar.dispose();
		secondBar.dispose();
		service.dispose();

		assert.deepStrictEqual(scopes.map(scope => scope?.split('/').at(-1)), [
			// The first bar, the second registered later, No Workspace picked in the first, its workspace again,
			// the remaining second bar once the first closes, no workspace once no bar is left; not again on dispose
			'first', 'second', undefined, 'first', 'second', undefined,
		]);
	});

	test('scopes the window only while its setting is on, and back to no workspace as it turns off or the service is disposed', async () => {
		const { service, scopes, setEnabled } = createService(false);
		const bar = service.registerScopeBar(createFilters('app'));
		const neverOn = [...scopes];
		await setEnabled(true);
		await setEnabled(false);
		await setEnabled(true);
		service.dispose();
		bar.dispose();

		assert.deepStrictEqual({ neverOn, scopes: scopes.map(scope => scope?.split('/').at(-1)) }, {
			neverOn: [],
			// On, off, on again, disposed while on
			scopes: ['app', undefined, 'app', undefined],
		});
	});

	test('offers the window\'s own folders in the scope bar only while it scopes the window, also before they have sessions', async () => {
		const { service, setEnabled } = createService(false, [URI.file('/home/user/projects/repo'), URI.file('/home/user/projects/APP')]);
		const filters = createFilters();
		const sessionOptions = getInboxWorkspaceOptions(['app', 'other'].map(workspace => buildTestSession({ id: workspace, title: workspace, workspace }).session), extUriIgnorePathCase);
		const offered = (environment?: string) => filters.withWindowWorkspaces(sessionOptions, service.windowWorkspaces.get(), environment).map(workspace => workspace.label);
		const off = offered();
		await setEnabled(true);
		const on = offered();
		const otherEnvironment = offered('remote');
		service.dispose();

		assert.deepStrictEqual({ off, on, otherEnvironment }, {
			off: ['app', 'other'],
			// `…/APP` is the `app` sessions' folder where paths ignore case, so it is not offered twice
			on: ['app', 'other', 'repo'],
			otherEnvironment: ['app', 'other'],
		});
	});

	test('scopes a window with a folder in Agentic Mode to the pick also without the bar, which the setting alone shows', () => {
		const run = (enabled: boolean, windowFolders: URI[]) => {
			const agenticMode = { isActive: false, onDidChange: store.add(new Emitter<boolean>()) };
			const { service, scopes } = createService(enabled, windowFolders, agenticMode);
			const state = () => ({ scoped: service.enabled.get(), bar: service.showsScopeBar.get() });
			const before = state();
			// The view registers the list's pick while the service scopes the window, whether the bar shows or not
			const bar = service.enabled.get() ? service.registerScopeBar(createFilters('repo')) : undefined;
			agenticMode.isActive = true;
			agenticMode.onDidChange.fire(true);
			const entered = state();
			const registered = entered.scoped && !bar ? service.registerScopeBar(createFilters('repo')) : undefined;
			const enteredScopes = scopes.map(scope => scope?.split('/').at(-1));
			agenticMode.isActive = false;
			agenticMode.onDidChange.fire(false);
			const left = state();
			const leftScopes = scopes.map(scope => scope?.split('/').at(-1));
			registered?.dispose();
			bar?.dispose();
			service.dispose();
			return { before, entered, enteredScopes, left, leftScopes };
		};
		const folder = URI.file('/work/repo');

		assert.deepStrictEqual({
			settingOff: run(false, [folder]),
			settingOn: run(true, [folder]),
			emptySettingOff: run(false, []),
		}, {
			// Scoped and filtered in the mode without the bar, and back to the window's own scope on leaving
			settingOff: {
				before: { scoped: false, bar: false }, entered: { scoped: true, bar: false }, enteredScopes: ['repo'],
				left: { scoped: false, bar: false }, leftScopes: ['repo', undefined],
			},
			// The same start, with the bar to pick another workspace; this window is the Agents mode throughout
			settingOn: {
				before: { scoped: true, bar: true }, entered: { scoped: true, bar: true }, enteredScopes: ['repo'],
				left: { scoped: true, bar: true }, leftScopes: ['repo'],
			},
			// An empty window is not scoped without the setting
			emptySettingOff: {
				before: { scoped: false, bar: false }, entered: { scoped: false, bar: false }, enteredScopes: [],
				left: { scoped: false, bar: false }, leftScopes: [],
			},
		});
	});

	test('starts a window entering or restoring in Agentic Mode on its first folder, with or without the setting, or an empty window on all sessions with it', () => {
		const run = (enabled: boolean, windowFolders: URI[], stored?: string, restoredInMode = false) => {
			const onDidChange = store.add(new Emitter<boolean>());
			const storageService = store.add(new InMemoryStorageService());
			const logService = new NullLogService();
			if (stored) {
				SessionsListFilters.storeInboxWorkspace(storageService, logService, getInboxWorkspaceFilter(buildTestSession({ id: stored, title: stored, workspace: stored }).session));
			}
			const picks = () => {
				const filters = new SessionsListFilters(storageService, logService, new TestConfigurationService(), upcastPartial<IUriIdentityService>({ extUri: extUriIgnorePathCase }));
				const workspace = filters.inboxScope.workspace;
				filters.dispose();
				return workspace === undefined ? 'all' : workspace === 'none' ? 'none' : workspace.label;
			};
			const agenticModeService = upcastPartial<IAgenticModeService>({ onDidChange: onDidChange.event, windowFolders, isActive: restoredInMode });
			store.add(new AgenticModeSessionsScopeContribution(agenticModeService, new TestConfigurationService({ [SESSIONS_LIST_WORKSPACES_FILTER_SETTING]: enabled }), storageService, logService));
			const restored = picks();
			onDidChange.fire(true);
			const entered = picks();
			onDidChange.fire(false);
			return { restored, entered, left: picks() };
		};
		const folder = (name: string) => URI.file(`/work/${name}`);

		assert.deepStrictEqual({
			folder: run(true, [folder('repo')], 'other'),
			multiRoot: run(true, [folder('first'), folder('second')]),
			empty: run(true, [], 'other'),
			settingOff: run(false, [folder('repo')], 'other'),
			emptySettingOff: run(false, [], 'other'),
			restoredSettingOff: run(false, [folder('repo')], 'other', true),
			restoredSettingOn: run(true, [folder('repo')], 'other', true),
		}, {
			// Leaving keeps the pick, as a pick of the user's would be
			folder: { restored: 'other', entered: 'repo', left: 'repo' },
			multiRoot: { restored: 'all', entered: 'first', left: 'first' },
			empty: { restored: 'other', entered: 'all', left: 'all' },
			settingOff: { restored: 'other', entered: 'repo', left: 'repo' },
			emptySettingOff: { restored: 'other', entered: 'other', left: 'other' },
			// Without the bar nothing could have widened the pick, so it starts on the folder again; with it, the user's pick stays
			restoredSettingOff: { restored: 'repo', entered: 'repo', left: 'repo' },
			restoredSettingOn: { restored: 'other', entered: 'repo', left: 'repo' },
		});
	});
});
