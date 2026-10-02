/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isICommandActionToggleInfo } from '../../../../../platform/action/common/action.js';
import { isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ChatExternalSessionsMode } from '../../../../../platform/chat/common/chatSettings.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { Menus } from '../../../../browser/menus.js';
import { ISession, ISessionEnvironment } from '../../../../services/sessions/common/session.js';
import { buildTestSession } from '../../../../services/sessions/test/common/testSessionBuilder.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../browser/views/sessionsList.js';
import { SessionsListFilters } from '../../browser/views/sessionsListFilters.js';
import { IsWorkspaceGroupCappedContext, SessionsView, SessionsViewGroupingContext, SessionsViewSortingContext } from '../../browser/views/sessionsView.js';
import '../../browser/views/sessionsViewActions.js';

suite('Sessions - View Menu', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createMenu(
		sessions: readonly ISession[] = [],
		environments: readonly ISessionEnvironment[] = [],
		wording = ChatSessionArchiveActionWording.MarkAsDone,
	) {
		const configurationService = new TestConfigurationService({
			[ChatConfiguration.ShowExternalAgentSessions]: ChatExternalSessionsMode.Recent,
			[ChatSessionArchiveActionWordingSettingId]: wording,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		const sorting = SessionsViewSortingContext.bindTo(contextKeyService);
		const grouping = SessionsViewGroupingContext.bindTo(contextKeyService);
		const capped = IsWorkspaceGroupCappedContext.bindTo(contextKeyService);
		const filters = store.add(new SessionsListFilters(store.add(new InMemoryStorageService()), store.add(new NullLogService())));
		const sessionsChanged = store.add(new Emitter<void>());
		const providersChanged = store.add(new Emitter<void>());
		let excludeArchived = true;
		const sessionsControl = upcastPartial<SessionsList>({
			filters,
			isExcludeArchived: () => excludeArchived,
			setExcludeArchived: excluded => { excludeArchived = excluded; },
			isWorkspaceGroupCapped: () => capped.get() ?? true,
			resetFilters: () => {
				excludeArchived = true;
				capped.set(true);
				filters.reset();
			},
		});
		const host = {
			scopedContextKeyService: contextKeyService,
			configurationService,
			workspaceGroupCappedContextKey: capped,
			filterContextKeys: new Map<string, { key: IContextKey<boolean>; getDefault: () => boolean }>(),
			archivedFilterRegistration: store.add(new DisposableStore()),
			sessionsManagementService: {
				onDidChangeSessions: sessionsChanged.event,
				onDidChangeSessionTypes: Event.None,
				getSessions: () => sessions,
			},
			sessionsProvidersService: {
				onDidChangeProviders: providersChanged.event,
				getProviders: () => environments.map(environment => ({ environment })),
			},
			_register: <T extends IDisposable>(disposable: T): T => store.add(disposable),
			registerSessionFilters: Reflect.get(SessionsView.prototype, 'registerSessionFilters') as (control: SessionsList) => void,
			registerArchivedFilter: Reflect.get(SessionsView.prototype, 'registerArchivedFilter') as (control: SessionsList) => void,
		};
		host.registerSessionFilters(sessionsControl);
		host.registerArchivedFilter(sessionsControl);

		const snapshot = (menu: MenuId) => MenuRegistry.getMenuItems(menu)
			.filter(item => contextKeyService.contextMatchesRules(item.when))
			.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0))
			.map(item => {
				const title = isIMenuItem(item) ? item.command.title : item.title;
				const toggled = isIMenuItem(item) ? item.command.toggled : undefined;
				const precondition = isIMenuItem(item) ? item.command.precondition : undefined;
				return {
					title: typeof title === 'string' ? title : title.value,
					group: item.group,
					...(isISubmenuItem(item) ? { submenu: item.submenu.id } : {}),
					...(toggled ? { checked: contextKeyService.contextMatchesRules(isICommandActionToggleInfo(toggled) ? toggled.condition : toggled) } : {}),
					...(precondition ? { enabled: contextKeyService.contextMatchesRules(precondition) } : {}),
				};
			});
		const run = async (id: string) => {
			const command = CommandsRegistry.getCommand(id);
			assert.ok(command);
			const instantiationService = store.add(new TestInstantiationService());
			await instantiationService.invokeFunction(accessor => command.handler(accessor));
		};
		return {
			snapshot, sorting, grouping, capped, filters, run, sessionsControl,
			setSessions: (value: readonly ISession[]) => {
				sessions = value;
				sessionsChanged.fire();
			},
			setEnvironments: (value: readonly ISessionEnvironment[]) => {
				environments = value;
				providersChanged.fire();
			},
		};
	}

	test('exposes each category at the top level and keeps view actions separate from filters', () => {
		const { snapshot } = createMenu();
		assert.deepStrictEqual(snapshot(Menus.SessionsViewFilter), [
			{ title: 'Ordering (Created)', group: '1_presentation', submenu: Menus.SessionsViewOrdering.id },
			{ title: 'Grouping (Workspace)', group: '1_presentation', submenu: Menus.SessionsViewGrouping.id },
			{ title: 'Show (Recent)', group: '1_presentation', submenu: Menus.SessionsViewShow.id },
			{ title: 'Environment', group: '2_filters', submenu: Menus.SessionsViewEnvironment.id },
			{ title: 'Created In', group: '2_filters', submenu: Menus.SessionsViewSource.id },
			{ title: 'Harness', group: '2_filters', submenu: Menus.SessionsViewHarness.id },
			{ title: 'External (Recent)', group: '3_visibility', submenu: Menus.SessionsViewExternalFilter.id },
			{ title: 'Show Done', group: '3_visibility', checked: false },
			{ title: 'Compact View', group: '4_view', checked: false },
			{ title: 'Collapse All Groups', group: '4_view' },
			{ title: 'Reset Filters', group: '5_reset' },
		]);
	});

	test('single-choice submenu titles and checked items track the selected choices', () => {
		const { snapshot, sorting, grouping, capped } = createMenu();
		sorting.set(SessionsSorting.Updated);
		capped.set(false);
		const workspaceTitles = snapshot(Menus.SessionsViewFilter).filter(item => item.group === '1_presentation').map(item => item.title);
		const show = snapshot(Menus.SessionsViewShow);
		grouping.set(SessionsGrouping.Date);

		assert.deepStrictEqual({
			workspaceTitles,
			timeTitles: snapshot(Menus.SessionsViewFilter).filter(item => item.group === '1_presentation').map(item => item.title),
			ordering: snapshot(Menus.SessionsViewOrdering),
			grouping: snapshot(Menus.SessionsViewGrouping),
			show,
		}, {
			workspaceTitles: ['Ordering (Updated)', 'Grouping (Workspace)', 'Show (All)'],
			timeTitles: ['Ordering (Updated)', 'Grouping (Time)'],
			ordering: [
				{ title: 'Created', group: '1_sort', checked: false },
				{ title: 'Updated', group: '1_sort', checked: true },
			],
			grouping: [
				{ title: 'Time', group: '1_group', checked: true },
				{ title: 'Workspace', group: '1_group', checked: false },
			],
			show: [
				{ title: 'Recent', group: '1_show', checked: false },
				{ title: 'All', group: '1_show', checked: true },
			],
		});
	});

	test('routes filters to their own submenus and separates sources by ordered environments', () => {
		const sessions = [
			buildTestSession({ id: 'remote-z', title: 'Remote Z', environment: 'remote-z' }).session,
			buildTestSession({ id: 'cloud-slack', title: 'Slack', environment: 'cloud', application: 'slack' }).session,
			buildTestSession({ id: 'local', title: 'Local' }).session,
			buildTestSession({ id: 'remote-a', title: 'Remote A', environment: 'remote-a' }).session,
			buildTestSession({ id: 'cloud-app', title: 'App', environment: 'cloud', application: 'github/autopilot' }).session,
		];
		const { snapshot } = createMenu(sessions, [{ id: 'remote-z', label: 'Z Host' }, { id: 'remote-a', label: 'A Host' }]);
		assert.deepStrictEqual({
			environments: snapshot(Menus.SessionsViewEnvironment),
			sources: snapshot(Menus.SessionsViewSource),
			harnesses: snapshot(Menus.SessionsViewHarness),
		}, {
			environments: [
				{ title: 'Local', group: '2_environments', checked: true },
				{ title: 'Cloud', group: '2_environments', checked: true },
				{ title: 'A Host', group: '2_environments', checked: true },
				{ title: 'Z Host', group: '2_environments', checked: true },
			],
			sources: [
				{ title: 'VS Code (Local)', group: '3_applications_000000', checked: true },
				{ title: 'Copilot App (Cloud)', group: '3_applications_000001', checked: true },
				{ title: 'Slack (Cloud)', group: '3_applications_000001', checked: false },
				{ title: 'VS Code (A Host)', group: '3_applications_000002', checked: true },
				{ title: 'VS Code (Z Host)', group: '3_applications_000003', checked: true },
			],
			harnesses: [
				{ title: 'Copilot', group: '1_harnesses', checked: true },
				{ title: 'Claude', group: '1_harnesses', checked: true },
				{ title: 'Codex', group: '1_harnesses', checked: true },
			],
		});
	});

	test('source toggles stay independent and Reset restores defaults and Show Recent', async () => {
		const local = buildTestSession({ id: 'local', title: 'Local' }).session;
		const cloud = buildTestSession({ id: 'cloud', title: 'Cloud', environment: 'cloud' }).session;
		const { snapshot, filters, capped, run, sessionsControl } = createMenu([local, cloud]);
		const localAction = MenuRegistry.getMenuItems(Menus.SessionsViewSource).filter(isIMenuItem)[0];
		await run(localAction.command.id);
		await run('sessionsViewPane.filterArchived');
		capped.set(false);
		const selected = {
			local: filters.matches(local),
			cloud: filters.matches(cloud),
			archived: !sessionsControl.isExcludeArchived(),
			sources: snapshot(Menus.SessionsViewSource),
			environments: snapshot(Menus.SessionsViewEnvironment),
		};
		await run('sessionsViewPane.resetFilters');
		assert.deepStrictEqual({
			selected,
			reset: {
				local: filters.matches(local),
				cloud: filters.matches(cloud),
				archived: !sessionsControl.isExcludeArchived(),
				show: snapshot(Menus.SessionsViewFilter).find(item => item.submenu === Menus.SessionsViewShow.id)?.title,
			},
		}, {
			selected: {
				local: false,
				cloud: true,
				archived: true,
				sources: [
					{ title: 'VS Code (Local)', group: '3_applications_000000', checked: false },
					{ title: 'VS Code (Cloud)', group: '3_applications_000001', checked: true },
				],
				environments: [
					{ title: 'Local', group: '2_environments', checked: true },
					{ title: 'Cloud', group: '2_environments', checked: true },
				],
			},
			reset: { local: true, cloud: true, archived: false, show: 'Show (Recent)' },
		});
	});

	test('scopes Created In to included environments without changing application selections', async () => {
		const sessions = [
			buildTestSession({ id: 'local', title: 'Local' }).session,
			buildTestSession({ id: 'cloud', title: 'Cloud', environment: 'cloud' }).session,
			buildTestSession({ id: 'slack', title: 'Slack', environment: 'cloud', application: 'slack' }).session,
			buildTestSession({ id: 'teams', title: 'Teams', environment: 'cloud', application: 'teams' }).session,
			buildTestSession({ id: 'remote', title: 'Remote', environment: 'remote' }).session,
		];
		const { snapshot, filters, run } = createMenu(sessions, [{ id: 'remote', label: 'Build Server' }]);
		filters.setExcluded({ kind: 'application', environment: 'cloud', id: 'vscode' }, true);
		filters.setExcluded({ kind: 'application', environment: 'cloud', id: 'slack' }, false);
		const before = snapshot(Menus.SessionsViewSource);
		const cloudAction = MenuRegistry.getMenuItems(Menus.SessionsViewEnvironment).filter(isIMenuItem)[1];
		await run(cloudAction.command.id);
		const excluded = {
			title: snapshot(Menus.SessionsViewFilter).find(item => item.submenu === Menus.SessionsViewEnvironment.id)?.title,
			sources: snapshot(Menus.SessionsViewSource),
			visible: sessions.filter(session => filters.matches(session)).map(session => session.sessionId),
		};
		await run(cloudAction.command.id);
		const restored = {
			title: snapshot(Menus.SessionsViewFilter).find(item => item.submenu === Menus.SessionsViewEnvironment.id)?.title,
			sources: snapshot(Menus.SessionsViewSource),
			visible: sessions.filter(session => filters.matches(session)).map(session => session.sessionId),
		};
		assert.deepStrictEqual({ excluded, restored }, {
			excluded: {
				title: 'Environment (2 Selected)',
				sources: [
					{ title: 'VS Code (Local)', group: '3_applications_000000', checked: true },
					{ title: 'VS Code (Build Server)', group: '3_applications_000002', checked: true },
				],
				visible: ['local', 'remote'],
			},
			restored: { title: 'Environment', sources: before, visible: ['local', 'slack', 'remote'] },
		});
	});

	test('keeps creation choices when application, harness, and archive filters exclude every session', () => {
		const session = buildTestSession({ id: 'archived', title: 'Archived', isArchived: true }).session;
		const { snapshot, filters, sessionsControl } = createMenu([session]);
		filters.setExcluded({ kind: 'harness', id: 'copilot' }, true);
		filters.setExcluded({ kind: 'application', environment: 'local', id: 'vscode' }, true);
		assert.deepStrictEqual({
			visible: filters.matches(session),
			excludeArchived: sessionsControl.isExcludeArchived(),
			sources: snapshot(Menus.SessionsViewSource),
			environments: snapshot(Menus.SessionsViewEnvironment),
		}, {
			visible: false,
			excludeArchived: true,
			sources: [{ title: 'VS Code (Local)', group: '3_applications_000000', checked: false }],
			environments: [
				{ title: 'Local', group: '2_environments', checked: true },
				{ title: 'Cloud', group: '2_environments', checked: true },
			],
		});
	});

	test('distinguishes an empty catalog from having no included environments', () => {
		const { snapshot, filters } = createMenu();
		const state = () => ({
			title: snapshot(Menus.SessionsViewFilter).find(item => item.submenu === Menus.SessionsViewEnvironment.id)?.title,
			sources: snapshot(Menus.SessionsViewSource),
		});
		const empty = state();
		filters.setExcluded({ kind: 'environment', id: 'cloud' }, true);
		const local = state();
		filters.setExcluded({ kind: 'environment', id: 'local' }, true);
		const none = state();
		filters.setExcluded({ kind: 'environment', id: 'cloud' }, false);
		const cloud = state();
		const noApplications = [{ title: 'No Applications Found', group: '3_applications', enabled: false }];
		assert.deepStrictEqual({ empty, local, none, cloud }, {
			empty: { title: 'Environment', sources: noApplications },
			local: { title: 'Environment (Local)', sources: noApplications },
			none: {
				title: 'Environment (None)',
				sources: [{ title: 'Select an Environment First', group: '3_applications', enabled: false }],
			},
			cloud: { title: 'Environment (Cloud)', sources: noApplications },
		});
	});

	test('summarizes included disconnected hosts and retains cached creation choices through rename and catalog changes', () => {
		const connected = observableValue('connected', true);
		const remote = buildTestSession({ id: 'remote', title: 'Remote', environment: 'remote' }).session;
		const { snapshot, filters, setSessions, setEnvironments } = createMenu([remote], [{ id: 'remote', label: 'Build Server', isConnected: connected }]);
		filters.setExcluded({ kind: 'environment', id: 'local' }, true);
		filters.setExcluded({ kind: 'environment', id: 'cloud' }, true);
		filters.setExcluded({ kind: 'application', environment: 'remote', id: 'vscode' }, true);
		connected.set(false, undefined);
		setEnvironments([{ id: 'remote', label: 'Renamed Server', isConnected: connected }]);
		const state = () => ({
			title: snapshot(Menus.SessionsViewFilter).find(item => item.submenu === Menus.SessionsViewEnvironment.id)?.title,
			environments: snapshot(Menus.SessionsViewEnvironment),
			sources: snapshot(Menus.SessionsViewSource),
		});
		const cached = state();
		setSessions([]);
		const absent = state();
		setSessions([remote]);
		const restored = state();
		filters.setExcluded({ kind: 'environment', id: 'remote' }, true);
		const excluded = state();
		filters.setExcluded({ kind: 'environment', id: 'remote' }, false);
		const includedAgain = state();
		const expectedCached = {
			title: 'Environment (Renamed Server)',
			environments: [
				{ title: 'Local', group: '2_environments', checked: false },
				{ title: 'Cloud', group: '2_environments', checked: false },
			],
			sources: [{ title: 'VS Code (Renamed Server)', group: '3_applications_000002', checked: false }],
		};
		const expectedNone = {
			title: 'Environment (None)',
			environments: expectedCached.environments,
			sources: [{ title: 'Select an Environment First', group: '3_applications', enabled: false }],
		};
		assert.deepStrictEqual({ cached, absent, restored, excluded, includedAgain }, {
			cached: expectedCached, absent: expectedNone, restored: expectedCached, excluded: expectedNone, includedAgain: expectedCached,
		});
	});

	test('uses Show Archived when the archive wording is configured', () => {
		const { snapshot } = createMenu([], [], ChatSessionArchiveActionWording.Archive);
		assert.deepStrictEqual(snapshot(Menus.SessionsViewFilter).filter(item => item.group === '3_visibility'), [
			{ title: 'External (Recent)', group: '3_visibility', submenu: Menus.SessionsViewExternalFilter.id },
			{ title: 'Show Archived', group: '3_visibility', checked: false },
		]);
	});
});
