/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { $, getActiveElement } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { retry, timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isICommandActionToggleInfo } from '../../../../../platform/action/common/action.js';
import { getActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, isIMenuItem, isISubmenuItem, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { ChatExternalSessionsMode } from '../../../../../platform/chat/common/chatSettings.js';
import { ChatSessionArchiveActionWording, ChatSessionArchiveActionWordingSettingId } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKey, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ContextMenuHandler } from '../../../../../platform/contextview/browser/contextMenuHandler.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IInputOptions, IQuickInputService, IQuickPickItem } from '../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { findOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { Menus } from '../../../../../workbench/contrib/sessions/browser/menus.js';
import { IsPhoneLayoutContext, SessionIsArchivedContext, SessionItemIsMultiSelectionContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { ARCHIVE_SESSION_COMMAND_ID, SHOW_SESSION_APPLICATION_FILTERS_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { SESSIONS_LIST_INBOX_ENABLED_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { ISession, ISessionChangeset, ISessionChangesetOperation, ISessionEnvironment, SessionChangesetOperationScope, SessionChangesetOperationStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { ISessionAttentionService, IInboxSessionAttention, InboxNotificationPriority, InboxTab } from '../../../../../workbench/contrib/sessions/common/sessionAttentionService.js';
import { buildTestSession } from '../../../../../workbench/contrib/sessions/test/common/testSessionBuilder.js';
import { TestSessionsList } from '../../../../../workbench/contrib/sessions/test/browser/views/testSessionsList.js';
import { getSessionArchiveOnboardingTargetId, SessionItemCanMergePullRequestContext, SessionItemContextMenuId, SessionItemInboxStateContext, SessionsGrouping, SessionsList, SessionsSorting } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { getInboxPullRequestMergeOperation } from '../../../../../workbench/contrib/sessions/common/sessionInbox.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { SessionsListFilters } from '../../../../../workbench/contrib/sessions/browser/views/sessionsListFilters.js';
import { ISessionsListNotice, SessionsListNotification } from '../../../../../workbench/contrib/sessions/browser/views/sessionsListNotification.js';
import { IsWorkspaceGroupCappedContext, SessionsView, SessionsViewCompactContext, SessionsViewGroupingContext, SessionsViewSortingContext } from '../../../../../workbench/contrib/sessions/browser/views/sessionsView.js';
import { createListHarness, TestCommandService } from './sessionsListTestUtils.js';
import '../../browser/views/sessionsViewActions.js';

suite('Sessions - View Menu', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createMenu(
		sessions: readonly ISession[] = [],
		environments: readonly ISessionEnvironment[] = [],
		wording = ChatSessionArchiveActionWording.MarkAsDone,
	) {
		const configurationService = new class extends TestConfigurationService {
			override async updateValue(key: string, value: unknown): Promise<void> {
				await this.setUserConfiguration(key, value);
				this.onDidChangeConfigurationEmitter.fire({
					affectsConfiguration: section => section === key,
					affectedKeys: new Set([key]),
					change: { keys: [key], overrides: [] },
					source: ConfigurationTarget.USER,
				});
			}
		}({
			[ChatConfiguration.ShowExternalAgentSessions]: ChatExternalSessionsMode.Last7Days,
			[ChatSessionArchiveActionWordingSettingId]: wording,
		});
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		const sorting = SessionsViewSortingContext.bindTo(contextKeyService);
		const grouping = SessionsViewGroupingContext.bindTo(contextKeyService);
		const capped = IsWorkspaceGroupCappedContext.bindTo(contextKeyService);
		const compact = SessionsViewCompactContext.bindTo(contextKeyService);
		const filters = store.add(new SessionsListFilters(store.add(new InMemoryStorageService()), store.add(new NullLogService())));
		const sessionsChanged = store.add(new Emitter<void>());
		const providersChanged = store.add(new Emitter<void>());
		let excludeArchived = true;
		let workspaceGroupCapped = true;
		const sessionsControl = upcastPartial<SessionsList>({
			filters,
			isSessionListed: (session, reader) => !session.isAutomation?.read(reader),
			isExcludeArchived: () => excludeArchived,
			setExcludeArchived: excluded => { excludeArchived = excluded; },
			isWorkspaceGroupCapped: () => workspaceGroupCapped,
			setWorkspaceGroupCapped: value => { workspaceGroupCapped = value; },
			resetFilters: () => {
				const previous = { excludeArchived, workspaceGroupCapped, restoreFilters: filters.capture() };
				excludeArchived = true;
				workspaceGroupCapped = true;
				filters.reset();
				return () => {
					({ excludeArchived, workspaceGroupCapped } = previous);
					previous.restoreFilters();
				};
			},
		});
		const notices: ISessionsListNotice[] = [];
		const host = {
			scopedContextKeyService: contextKeyService,
			configurationService,
			workspaceGroupCappedContextKey: capped,
			filterContextKeys: new Map<string, { key: IContextKey<boolean>; read: () => boolean }>(),
			archivedFilterRegistration: store.add(new DisposableStore()),
			listNotification: upcastPartial<SessionsListNotification>({ show: notice => { notices.push(notice); } }),
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
			sessionsControl,
			registerSessionFilters: Reflect.get(SessionsView.prototype, 'registerSessionFilters') as (control: SessionsList) => void,
			registerArchivedFilter: Reflect.get(SessionsView.prototype, 'registerArchivedFilter') as (control: SessionsList) => void,
			registerResetFiltersAction: Reflect.get(SessionsView.prototype, 'registerResetFiltersAction') as () => void,
			resetFilters: SessionsView.prototype.resetFilters,
			syncFilterContextKeys: Reflect.get(SessionsView.prototype, 'syncFilterContextKeys') as (control: SessionsList) => void,
		};
		host.registerSessionFilters(sessionsControl);
		host.registerArchivedFilter(sessionsControl);
		host.registerResetFiltersAction();

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
			instantiationService.stub(IConfigurationService, configurationService);
			await instantiationService.invokeFunction(accessor => command.handler(accessor));
		};
		return {
			snapshot, sorting, grouping, capped, compact, contextKeyService, configurationService, filters, run, sessionsControl, notices,
			/** Chooses Show: All, as its action does. */
			showAll: () => {
				sessionsControl.setWorkspaceGroupCapped(false);
				capped.set(false);
			},
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

	test('keeps Open to the Side without Open in Grid in the session context menu', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionItemOpenIn);
		assert.deepStrictEqual({
			openToTheSide: items.filter(isIMenuItem).some(item => item.command.id === 'sessionsViewPane.openToTheSide'),
			openInGridSubmenu: items.filter(isISubmenuItem).some(item => item.submenu.id === 'SessionsGridOpen'),
			openInGridCommands: ['left', 'right', 'up', 'down'].filter(direction => CommandsRegistry.getCommand(`sessionsViewPane.openInGrid.${direction}`)),
		}, {
			openToTheSide: true,
			openInGridSubmenu: false,
			openInGridCommands: [],
		});
	});

	test('inbox mode is always offered with AI enabled regardless of the default setting', async () => {
		const { snapshot, configurationService, contextKeyService } = createMenu();
		IsSessionsWindowContext.bindTo(contextKeyService).set(true);
		const offered = () => snapshot(Menus.SessionsViewGrouping).some(item => item.title === 'Inbox Mode' && item.enabled);
		const initial = offered();
		await configurationService.updateValue(SESSIONS_LIST_INBOX_ENABLED_SETTING, true);
		const enabled = offered();
		ChatContextKeys.enabled.bindTo(contextKeyService).set(false);
		const hiddenAI = offered();
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		await configurationService.updateValue(SESSIONS_LIST_INBOX_ENABLED_SETTING, false);
		assert.deepStrictEqual({ initial, enabled, hiddenAI, disabled: offered() }, {
			initial: true, enabled: true, hiddenAI: false, disabled: true,
		});
	});

	test('inbox triage menu respects the mode, triage state, and disabled AI', () => {
		const { snapshot, grouping, contextKeyService } = createMenu();
		const state = SessionItemInboxStateContext.bindTo(contextKeyService);
		const actions = () => snapshot(SessionItemContextMenuId).filter(item => ['Clear from Inbox', 'Return to Inbox', 'Put on Hold', 'Snooze...', 'Archive Session'].includes(item.title)).map(item => item.title);
		const archiveFilter = () => snapshot(Menus.SessionsViewFilter).filter(item => ['Show Done', 'Show Archived'].includes(item.title)).map(item => item.title);
		const ordinary = actions();
		const ordinaryFilter = archiveFilter();
		grouping.set(SessionsGrouping.Inbox);
		const active = actions();
		state.set('done');
		const done = actions();
		state.set('hold');
		const held = actions();
		ChatContextKeys.enabled.bindTo(contextKeyService).set(false);
		assert.deepStrictEqual({ ordinary, ordinaryFilter, active, done, held, hidden: actions(), inboxFilter: archiveFilter() }, {
			ordinary: [], ordinaryFilter: ['Show Done'], active: ['Put on Hold', 'Snooze...', 'Clear from Inbox', 'Archive Session'], done: ['Return to Inbox', 'Put on Hold', 'Snooze...', 'Archive Session'],
			held: ['Return to Inbox', 'Snooze...', 'Clear from Inbox', 'Archive Session'], hidden: [], inboxFilter: ['Show Archived'],
		});
	});

	test('inbox rows have distinct clear and archive actions in the toolbar and context menu', () => {
		const { grouping, contextKeyService } = createMenu();
		SessionItemInboxStateContext.bindTo(contextKeyService);
		const actions = (menu: MenuId) => MenuRegistry.getMenuItems(menu)
			.filter(isIMenuItem)
			.filter(item => ['sessionsViewPane.inboxDone', ARCHIVE_SESSION_COMMAND_ID].includes(item.command.id) && contextKeyService.contextMatchesRules(item.when))
			.sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || (a.order ?? 0) - (b.order ?? 0))
			.map(item => [item.command.id, typeof item.command.title === 'string' ? item.command.title : item.command.title.value, item.command.icon]);
		const snapshot = () => ({ toolbar: actions(Menus.SessionItemToolbar), contextMenu: actions(SessionItemContextMenuId) });
		const ordinary = snapshot();
		grouping.set(SessionsGrouping.Inbox);
		const active = snapshot();
		SessionItemInboxStateContext.bindTo(contextKeyService).set('done');
		const dismissed = snapshot();
		const archivedContext = SessionIsArchivedContext.bindTo(contextKeyService);
		archivedContext.set(true);
		const archived = snapshot();
		archivedContext.set(false);
		ChatContextKeys.enabled.bindTo(contextKeyService).set(false);
		const dismissAction = ['sessionsViewPane.inboxDone', 'Clear from Inbox', Codicon.check];
		const archiveAction = [ARCHIVE_SESSION_COMMAND_ID, 'Archive Session', Codicon.archive];
		assert.deepStrictEqual({ ordinary, active, dismissed, archived, hidden: snapshot() }, {
			ordinary: { toolbar: [], contextMenu: [] },
			active: { toolbar: [archiveAction, dismissAction], contextMenu: [dismissAction, archiveAction] },
			dismissed: { toolbar: [archiveAction], contextMenu: [archiveAction] },
			archived: { toolbar: [], contextMenu: [] },
			hidden: { toolbar: [], contextMenu: [] },
		});
	});

	test('bulk inbox actions are undoable and never archive or mark sessions as read', async () => {
		const sessions = ['first', 'second', 'archived'].map(id => buildTestSession({ id, title: id, isArchived: id === 'archived', isRead: false }).session);
		const harness = createListHarness(store, sessions);
		const model = store.add(harness.instantiationService.createInstance(SessionsListModelService));
		harness.instantiationService.stub(ISessionsListModelService, model);
		const notices: ISessionsListNotice[] = [];
		harness.instantiationService.stub(IViewsService, upcastPartial<IViewsService>({}), 'getViewWithId', () =>
			upcastPartial<SessionsView>({ listNotification: upcastPartial<SessionsListNotification>({ show: notice => notices.push(notice) }) }));
		const run = (id: string) => CommandsRegistry.getCommand(id)!.handler(harness.instantiationService, sessions);
		const states = () => sessions.map(session => {
			assert.strictEqual(session.isRead.get(), false);
			return model.getInboxState(session)?.kind;
		});
		model.setInboxState([sessions[0]], 'untilActivity');
		await run('sessionsViewPane.inboxDone');
		const done = states();
		await notices[0].undo!();
		const undone = states();
		await run('sessionsViewPane.inboxResume');
		const resumed = states();
		await notices[1].undo!();
		const restored = states();
		await run('sessionsViewPane.inboxHold');
		const held = states();
		await notices[2].undo!();
		assert.deepStrictEqual({ done, undone, resumed, restored, held, holdUndone: states(), archived: sessions.map(session => session.isArchived.get()), countdowns: notices.map(notice => notice.showCountdown) }, {
			done: ['done', 'done', undefined], undone: ['untilActivity', undefined, undefined],
			resumed: [undefined, undefined, undefined], restored: ['untilActivity', undefined, undefined],
			held: ['hold', 'hold', undefined], holdUndone: ['untilActivity', undefined, undefined], archived: [false, false, true],
			countdowns: [false, true, true],
		});
	});

	test('single-session inbox hold, resume, and snooze avoid Undo banners but dismissal retains one', async () => {
		const session = buildTestSession({ id: 'session', title: 'Session' }).session;
		const harness = createListHarness(store, [session]);
		const model = store.add(harness.instantiationService.createInstance(SessionsListModelService));
		harness.instantiationService.stub(ISessionsListModelService, model);
		const notices: ISessionsListNotice[] = [];
		harness.instantiationService.stub(IViewsService, upcastPartial<IViewsService>({}), 'getViewWithId', () =>
			upcastPartial<SessionsView>({ listNotification: upcastPartial<SessionsListNotification>({ show: notice => notices.push(notice) }) }));
		harness.instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({}), 'pick', async (items: IQuickPickItem[]) => items[0]);
		const counts: number[] = [];
		for (const action of ['inboxHold', 'inboxResume', 'inboxSnooze', 'inboxDone']) {
			await CommandsRegistry.getCommand(`sessionsViewPane.${action}`)!.handler(harness.instantiationService, session);
			counts.push(notices.length);
		}
		assert.deepStrictEqual({ counts, archived: session.isArchived.get() }, { counts: [0, 0, 0, 1], archived: false });
	});

	test('inbox keeps the real archive toolbar target visible throughout onboarding', async () => {
		const sessions = ['first', 'second'].map(id => buildTestSession({ id, title: id }).session);
		const harness = createListHarness(store, sessions);
		harness.instantiationService.stub(ISessionsListModelService, store.add(harness.instantiationService.createInstance(SessionsListModelService)));
		const context = store.add(new ContextKeyService(harness.instantiationService.get(IConfigurationService)));
		ChatContextKeys.enabled.bindTo(context).set(true);
		SessionsViewGroupingContext.bindTo(context).set(SessionsGrouping.Inbox);
		harness.instantiationService.stub(IContextKeyService, context);
		harness.instantiationService.stub(IMenuService, store.add(harness.instantiationService.createInstance(MenuService)));
		const container = harness.createContainer();
		const list = store.add(harness.instantiationService.createInstance(TestSessionsList, container, {
			grouping: () => SessionsGrouping.Inbox, sorting: () => SessionsSorting.Created, onSessionOpen: () => { },
		}));
		list.layout(600, 400);
		const outside = container.appendChild($('button'));
		outside.focus();
		const firstId = getSessionArchiveOnboardingTargetId(sessions[0]);
		const secondId = getSessionArchiveOnboardingTargetId(sessions[1]);
		assert.strictEqual(findOnboardingTarget(mainWindow, firstId), undefined);
		const reveal = store.add(list.revealArchiveAction(sessions[0]));
		list.clearFocus();
		outside.focus();
		await retry(async () => assert.strictEqual(findOnboardingTarget(mainWindow, reveal.targetId)?.checkVisibility(), true), 10, 100);
		const during = {
			visible: findOnboardingTarget(mainWindow, firstId)?.checkVisibility(),
			unrelatedTarget: !!findOnboardingTarget(mainWindow, secondId),
		};
		list.update();
		await retry(async () => assert.strictEqual(findOnboardingTarget(mainWindow, firstId)?.checkVisibility(), true), 10, 100);
		reveal.dispose();
		await retry(async () => assert.strictEqual(findOnboardingTarget(mainWindow, firstId), undefined), 10, 100);
		assert.deepStrictEqual({ during, remainingClasses: container.querySelectorAll('.archive-onboarding').length }, {
			during: { visible: true, unrelatedTarget: false }, remainingClasses: 0,
		});
	});

	test('inbox merge uses only the available provider operation and rejects stale or multiple targets', async () => {
		const built = buildTestSession({ id: 'merge', title: 'Merge', workspace: 'Project', repository: 'owner/repo', pullRequest: { number: 1, title: 'PR' } });
		const operations = observableValue<readonly ISessionChangesetOperation[]>('operations', [{
			id: 'pr-merge', label: 'Merge', scopes: [SessionChangesetOperationScope.Changeset], status: SessionChangesetOperationStatus.Idle,
		}]);
		const calls: string[] = [];
		const changeset = upcastPartial<ISessionChangeset>({
			isEnabled: constObservable(true), operations,
			invokeOperation: async id => { calls.push(id); },
		});
		const session: ISession = { ...built.session, mainChat: constObservable({ ...built.mainChat.chat, changesets: constObservable([changeset]) }) };
		const harness = createListHarness(store, [session]);
		const model = store.add(harness.instantiationService.createInstance(SessionsListModelService));
		harness.instantiationService.stub(ISessionsListModelService, model);
		const attention = new Map<string, IInboxSessionAttention>([[session.sessionId, { tab: InboxTab.ReadyToMerge, priority: InboxNotificationPriority.Later, notificationIds: [], isHistoricalCompletion: false }]]);
		harness.instantiationService.stub(ISessionAttentionService, upcastPartial<ISessionAttentionService>({ sessionAttention: constObservable(attention) }));
		const run = async (target: ISession | ISession[] = session) => CommandsRegistry.getCommand('sessionsViewPane.inboxMergePullRequest')!.handler(harness.instantiationService, target);
		await run();
		await assert.rejects(run([session, session]), /no longer available/);
		model.setInboxState([session], 'hold');
		await assert.rejects(run(), /no longer available/);
		model.setInboxState([session], undefined);
		operations.set([{ ...operations.get()[0], status: SessionChangesetOperationStatus.Disabled }], undefined);
		await assert.rejects(run(), /no longer available/);
		assert.deepStrictEqual(calls, ['pr-merge']);
	});

	test('inbox merge menus are AI-gated and disable multi-selection', () => {
		const { grouping, contextKeyService } = createMenu();
		grouping.set(SessionsGrouping.Inbox);
		SessionItemCanMergePullRequestContext.bindTo(contextKeyService).set(true);
		const multiple = SessionItemIsMultiSelectionContext.bindTo(contextKeyService);
		const snapshot = () => [Menus.SessionItemToolbar, SessionItemContextMenuId].flatMap(id =>
			MenuRegistry.getMenuItems(id).filter(isIMenuItem)
				.filter(item => item.command.id === 'sessionsViewPane.inboxMergePullRequest' && contextKeyService.contextMatchesRules(item.when))
				.map(item => ({ group: item.group, enabled: contextKeyService.contextMatchesRules(item.command.precondition) })));
		const available = snapshot();
		multiple.set(true);
		const multi = snapshot();
		ChatContextKeys.enabled.bindTo(contextKeyService).set(false);
		assert.deepStrictEqual({ available, multi, hidden: snapshot() }, {
			available: [{ group: 'navigation', enabled: true }, { group: '1_state', enabled: true }],
			multi: [{ group: 'navigation', enabled: false }, { group: '1_state', enabled: false }], hidden: [],
		});
	});

	test('inbox merge rejects local, resource-only, disabled, running and ambiguous operations', () => {
		const built = buildTestSession({ id: 'merge', title: 'Merge', workspace: 'Project', repository: 'owner/repo', pullRequest: { number: 1, title: 'PR' } });
		const merge: ISessionChangesetOperation = { id: 'pr-merge', label: 'Merge', scopes: [SessionChangesetOperationScope.Changeset], status: SessionChangesetOperationStatus.Idle };
		const operations = observableValue<readonly ISessionChangesetOperation[]>('operations', []);
		const enabled = observableValue('enabled', true);
		const changeset = upcastPartial<ISessionChangeset>({ isEnabled: enabled, operations });
		const session: ISession = { ...built.session, mainChat: constObservable({ ...built.mainChat.chat, changesets: constObservable([changeset]) }) };
		const rejected = [
			[{ ...merge, id: 'merge' }],
			[{ ...merge, scopes: [SessionChangesetOperationScope.Resource] }],
			[{ ...merge, status: SessionChangesetOperationStatus.Disabled }],
			[{ ...merge, status: SessionChangesetOperationStatus.Running }],
			[merge, merge],
		].map(candidates => {
			operations.set(candidates, undefined);
			return getInboxPullRequestMergeOperation(session);
		});
		operations.set([merge], undefined);
		enabled.set(false, undefined);
		rejected.push(getInboxPullRequestMergeOperation(session));
		enabled.set(true, undefined);
		rejected.push(getInboxPullRequestMergeOperation({ ...session, workspace: constObservable(undefined) }));
		const workspace = session.workspace.get()!;
		const other = buildTestSession({ id: 'other', title: 'Other', workspace: 'Other', repository: 'owner/repo', pullRequest: { number: 2, title: 'Other PR' } }).session.workspace.get()!;
		rejected.push(getInboxPullRequestMergeOperation({
			...session, workspace: constObservable({ ...workspace, folders: [...workspace.folders, ...other.folders] }),
		}));
		assert.deepStrictEqual({ rejected, available: getInboxPullRequestMergeOperation(session) }, {
			rejected: Array(8).fill(undefined), available: { changeset, operation: merge },
		});
	});

	test('inbox merge toolbar follows actual selection and ignores unrelated selected rows', async () => {
		const built = buildTestSession({ id: 'merge', title: 'Merge', workspace: 'Project', repository: 'owner/repo', pullRequest: { number: 1, title: 'PR' } });
		const changeset = upcastPartial<ISessionChangeset>({
			isEnabled: constObservable(true),
			operations: constObservable([{ id: 'pr-merge', label: 'Merge', scopes: [SessionChangesetOperationScope.Changeset], status: SessionChangesetOperationStatus.Idle }]),
		});
		const session: ISession = { ...built.session, mainChat: constObservable({ ...built.mainChat.chat, changesets: constObservable([changeset]) }) };
		const others = ['first', 'second'].map(id => buildTestSession({ id, title: id }).session);
		const harness = createListHarness(store, [session, ...others]);
		harness.instantiationService.stub(ISessionsListModelService, store.add(harness.instantiationService.createInstance(SessionsListModelService)));
		const attention = new Map<string, IInboxSessionAttention>([[session.sessionId, { tab: InboxTab.ReadyToMerge, priority: InboxNotificationPriority.Later, notificationIds: [], isHistoricalCompletion: false }]]);
		harness.instantiationService.stub(ISessionAttentionService, upcastPartial<ISessionAttentionService>({
			sessionAttention: constObservable(attention), acquireSessionAttention: () => toDisposable(() => { }),
		}));
		const context = store.add(new ContextKeyService(harness.instantiationService.get(IConfigurationService)));
		ChatContextKeys.enabled.bindTo(context).set(true);
		SessionsViewGroupingContext.bindTo(context).set(SessionsGrouping.Inbox);
		harness.instantiationService.stub(IContextKeyService, context);
		harness.instantiationService.stub(IMenuService, store.add(harness.instantiationService.createInstance(MenuService)));
		const list = store.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(), {
			grouping: () => SessionsGrouping.Inbox, sorting: () => SessionsSorting.Created, onSessionOpen: () => { },
		}));
		list.layout(600, 400);
		list.reveal(session.resource);
		const button = () => list.getItemRow({ session: session.resource })!.querySelector<HTMLElement>('.session-title-toolbar [aria-label="Merge Pull Request"]')!;
		const select = async (sessions: readonly ISession[]) => {
			assert.ok(list.setSelectedItems(sessions.map(session => ({ session: session.resource }))));
			await timeout(100);
			return button().getAttribute('aria-disabled') === 'true';
		};
		const single = await select([session]);
		const multiple = await select([session, others[0]]);
		button().click();
		await timeout(0);
		const blockedCalls = harness.commandService.calls.filter(call => call.commandId === 'sessionsViewPane.inboxMergePullRequest');
		const unrelated = await select(others);
		const restored = await select([session]);
		button().click();
		await timeout(0);
		const calls = harness.commandService.calls.filter(call => call.commandId === 'sessionsViewPane.inboxMergePullRequest');
		assert.deepStrictEqual({ single, multiple, unrelated, restored, blockedCalls, calls }, {
			single: false, multiple: true, unrelated: false, restored: false, blockedCalls: [],
			calls: [{ commandId: 'sessionsViewPane.inboxMergePullRequest', args: [[session]] }],
		});
	});

	test('inbox snooze handles cancellation, timed presets, and validated custom dates', async () => {
		const session = buildTestSession({ id: 'first', title: 'First' }).session;
		const harness = createListHarness(store, [session]);
		const model = store.add(harness.instantiationService.createInstance(SessionsListModelService));
		harness.instantiationService.stub(ISessionsListModelService, model);
		harness.instantiationService.stub(IViewsService, upcastPartial<IViewsService>({}), 'getViewWithId', () => undefined);
		let choice: number | undefined;
		let input: string | undefined = undefined;
		const validation: (string | undefined | null)[] = [];
		harness.instantiationService.stub(IQuickInputService, upcastPartial<IQuickInputService>({}), 'pick', async (items: IQuickPickItem[]) => choice === undefined ? undefined : items[choice]);
		harness.instantiationService.stub(IQuickInputService, 'input', async (options: IInputOptions) => {
			for (const value of ['not a date', '2000-01-01 09:00', '2099-02-30 09:00', '2099-12-01 09:00']) {
				const result = await options.validateInput!(value);
				validation.push(typeof result === 'object' && result ? result.content : result);
			}
			return input;
		});
		const run = () => CommandsRegistry.getCommand('sessionsViewPane.inboxSnooze')!.handler(harness.instantiationService, session);
		await run();
		const cancelled = model.getInboxState(session);
		choice = 1;
		const now = new Date();
		await run();
		const timed = model.getInboxState(session);
		choice = 4;
		await run();
		const cancelledCustom = model.getInboxState(session);
		input = '2099-12-01 09:00';
		await run();
		assert.deepStrictEqual({ cancelled, timed, cancelledCustom, custom: model.getInboxState(session), validation: validation.map(Boolean), archived: session.isArchived.get() }, {
			cancelled: undefined,
			timed: { kind: 'snoozed', until: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9).getTime() },
			cancelledCustom: timed,
			custom: { kind: 'snoozed', until: new Date(2099, 11, 1, 9).getTime() },
			validation: [true, true, true, false, true, true, true, false], archived: false,
		});
	});

	test('application filter command opens the Sessions view before showing its filter menu', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const calls: string[] = [];
		instantiationService.stub(IViewsService, upcastPartial<IViewsService>({}), 'openView', async (id: string) => {
			calls.push(id);
			return upcastPartial<SessionsView>({ showApplicationFilters: () => calls.push('showApplicationFilters') });
		});
		await CommandsRegistry.getCommand(SHOW_SESSION_APPLICATION_FILTERS_COMMAND_ID)!.handler(instantiationService);

		assert.deepStrictEqual(calls, ['sessions.workbench.view.sessionsView', 'showApplicationFilters']);
	});

	test('opens the filter menu with Created In focused and returns focus to the list', () => {
		const { contextKeyService } = createMenu([buildTestSession({ id: 'external', title: 'External', application: 'copilot-cli' }).session]);
		const menuService = store.add(new MenuService(new TestCommandService(), new MockKeybindingService(), store.add(new InMemoryStorageService())));
		const container = mainWindow.document.body.appendChild($('div'));
		store.add(toDisposable(() => container.remove()));
		const contextViewService = upcastPartial<IContextViewService>({
			showContextView: delegate => {
				store.add(delegate.render(container));
				delegate.focus?.();
				return { close: () => delegate.onHide?.() };
			},
		});
		const handler = new ContextMenuHandler(contextViewService, NullTelemetryService, new TestNotificationService(), new MockKeybindingService());
		let shownMenu: IContextMenuDelegate | undefined;
		let shown = 0;
		let focused = 0;
		let hoverHidden = 0;
		const view = {
			sessionsHeaders: new Set(),
			sessionsControlContainer: container,
			scopedContextKeyService: contextKeyService,
			menuService,
			hoverService: { hideHover: () => hoverHidden++ },
			sessionsControl: { reportFilterMenuShown: () => shown++, focus: () => focused++ },
			contextMenuService: {
				showContextMenu: (delegate: IContextMenuDelegate) => {
					shownMenu = delegate;
					handler.showContextMenu(delegate);
				},
			},
			showApplicationFilters: SessionsView.prototype.showApplicationFilters,
		};
		view.showApplicationFilters();
		const focusedAction = getActiveElement()?.textContent;
		shownMenu?.onHide?.(true);

		assert.deepStrictEqual({ focusedAction, shown, focused, hoverHidden }, {
			focusedAction: 'Created In',
			shown: 1,
			focused: 1,
			hoverHidden: 1,
		});
	});

	test('exposes each category at the top level and keeps view actions separate from filters', () => {
		const { snapshot } = createMenu();
		assert.deepStrictEqual(snapshot(Menus.SessionsViewFilter), [
			{ title: 'Ordering', group: '1_presentation', submenu: Menus.SessionsViewOrdering.id },
			{ title: 'Grouping', group: '1_presentation', submenu: Menus.SessionsViewGrouping.id },
			{ title: 'Show', group: '1_presentation', submenu: Menus.SessionsViewShow.id },
			{ title: 'Environment', group: '2_filters', submenu: Menus.SessionsViewEnvironment.id },
			{ title: 'Created In', group: '2_filters', submenu: Menus.SessionsViewSource.id },
			{ title: 'Harness', group: '2_filters', submenu: Menus.SessionsViewHarness.id },
			{ title: 'Created Externally', group: '3_visibility', submenu: Menus.SessionsViewExternalFilter.id },
			{ title: 'Show Done', group: '3_visibility', checked: false },
			{ title: 'Reset Filters', group: '5_reset' },
		]);
	});

	test('places Compact View and Collapse All Groups before the management overflow group', () => {
		const { snapshot, contextKeyService } = createMenu();
		store.add(MenuRegistry.appendMenuItem(Menus.SidebarSessionsHeader, {
			command: { id: 'test.manage', title: 'Manage' },
			group: '2_manage',
		}));
		const menuService = store.add(new MenuService(new TestCommandService(), new MockKeybindingService(), store.add(new InMemoryStorageService())));
		const { primary, secondary } = getActionBarActions(
			menuService.getMenuActions(Menus.SidebarSessionsHeader, contextKeyService),
			group => group.startsWith('navigation'),
		);
		const viewActionIds = ['sessionsViewPane.toggleCompact', 'sessionsViewPane.collapseAllGroups'];
		assert.deepStrictEqual({
			group: snapshot(Menus.SidebarSessionsHeader).filter(item => item.group === '1_view'),
			primary: primary.filter(action => viewActionIds.includes(action.id)).map(action => action.id),
			secondary: secondary.filter(action => [...viewActionIds, 'test.manage'].includes(action.id)).map(action => action.id),
			filter: snapshot(Menus.SessionsViewFilter).filter(item => item.title === 'Compact View' || item.title === 'Collapse All Groups'),
		}, {
			group: [
				{ title: 'Compact View', group: '1_view', checked: false },
				{ title: 'Collapse All Groups', group: '1_view' },
			],
			primary: [],
			secondary: [...viewActionIds, 'test.manage'],
			filter: [],
		});
	});

	test('preserves the Compact View toggle and hides header view actions when AI is disabled', () => {
		const { snapshot, compact, contextKeyService } = createMenu();
		const viewActions = () => snapshot(Menus.SidebarSessionsHeader).filter(item => item.group === '1_view');
		compact.set(true);
		const checked = viewActions();
		IsPhoneLayoutContext.bindTo(contextKeyService).set(true);
		const phone = viewActions();
		ChatContextKeys.enabled.bindTo(contextKeyService).set(false);
		assert.deepStrictEqual({ checked, phone, disabled: viewActions() }, {
			checked: [
				{ title: 'Compact View', group: '1_view', checked: true },
				{ title: 'Collapse All Groups', group: '1_view' },
			],
			phone: [{ title: 'Collapse All Groups', group: '1_view' }],
			disabled: [],
		});
	});

	test('uses the filter icon for the Filter Sessions action', () => {
		const item = MenuRegistry.getMenuItems(Menus.SidebarSessionsHeader).filter(isISubmenuItem).find(item => item.submenu === Menus.SessionsViewFilter);
		assert.deepStrictEqual(item && { title: item.title, icon: item.icon }, {
			title: { value: 'Filter Sessions', original: 'Filter Sessions' },
			icon: Codicon.filter,
		});
	});

	test('Created Externally keeps its time choice independent from the opt-in External section', async () => {
		const { snapshot, run } = createMenu();
		const selected = () => ({
			title: snapshot(Menus.SessionsViewFilter).find(item => item.submenu === Menus.SessionsViewExternalFilter.id)?.title,
			checked: snapshot(Menus.SessionsViewExternalFilter).filter(item => item.checked).map(item => item.title),
		});
		const defaults = snapshot(Menus.SessionsViewExternalFilter);
		await run('sessionsViewPane.toggleExternalSessionsSection');
		const grouped = selected();
		await run(`agentSessions.filter.external.last30Days.${Menus.SessionsViewExternalFilter.id.toLowerCase()}`);
		const changedTime = selected();
		await run('sessionsViewPane.toggleExternalSessionsSection');

		assert.deepStrictEqual({ defaults, grouped, changedTime, ungrouped: selected() }, {
			defaults: [
				{ title: 'None', group: '1_modes', checked: false },
				{ title: 'Recent', group: '1_modes', checked: false },
				{ title: 'Last 24 Hours', group: '1_modes', checked: false },
				{ title: 'Last 7 Days', group: '1_modes', checked: true },
				{ title: 'Last 30 Days', group: '1_modes', checked: false },
				{ title: 'Show in External Section', group: '2_grouping', checked: false },
			],
			grouped: {
				title: 'Created Externally',
				checked: ['Last 7 Days', 'Show in External Section'],
			},
			changedTime: {
				title: 'Created Externally',
				checked: ['Last 30 Days', 'Show in External Section'],
			},
			ungrouped: { title: 'Created Externally', checked: ['Last 30 Days'] },
		});
	});

	test('keeps submenu titles unchanged while checked items track the selected choices', () => {
		const { snapshot, sorting, grouping, capped } = createMenu();
		sorting.set(SessionsSorting.Updated);
		capped.set(false);
		const workspaceTitles = snapshot(Menus.SessionsViewFilter).filter(item => item.group === '1_presentation').map(item => item.title);
		const show = snapshot(Menus.SessionsViewShow);
		grouping.set(SessionsGrouping.Repository);
		const repositoryTitles = snapshot(Menus.SessionsViewFilter).filter(item => item.group === '1_presentation').map(item => item.title);
		const repositoryShow = snapshot(Menus.SessionsViewShow);
		grouping.set(SessionsGrouping.Environment);
		const environmentTitles = snapshot(Menus.SessionsViewFilter).filter(item => item.group === '1_presentation').map(item => item.title);
		const environmentGrouping = snapshot(Menus.SessionsViewGrouping);
		const environmentShow = snapshot(Menus.SessionsViewShow);
		grouping.set(SessionsGrouping.Date);

		assert.deepStrictEqual({
			workspaceTitles,
			repositoryTitles,
			environmentTitles,
			environmentGrouping,
			environmentShow,
			timeTitles: snapshot(Menus.SessionsViewFilter).filter(item => item.group === '1_presentation').map(item => item.title),
			ordering: snapshot(Menus.SessionsViewOrdering),
			grouping: snapshot(Menus.SessionsViewGrouping),
			show,
			repositoryShow,
		}, {
			workspaceTitles: ['Ordering', 'Grouping', 'Show'],
			repositoryTitles: ['Ordering', 'Grouping', 'Show'],
			environmentTitles: ['Ordering', 'Grouping', 'Show'],
			environmentGrouping: [
				{ title: 'Time', group: '1_group', checked: false },
				{ title: 'Workspace', group: '1_group', checked: false },
				{ title: 'Repository', group: '1_group', checked: false },
				{ title: 'Environment', group: '1_group', checked: true },
				{ title: 'Inbox Mode', group: '1_group', checked: false, enabled: false },
			],
			environmentShow: [
				{ title: 'Recent', group: '1_show', checked: false },
				{ title: 'All', group: '1_show', checked: true },
			],
			timeTitles: ['Ordering', 'Grouping'],
			ordering: [
				{ title: 'Created', group: '1_sort', checked: false },
				{ title: 'Updated', group: '1_sort', checked: true },
			],
			grouping: [
				{ title: 'Time', group: '1_group', checked: true },
				{ title: 'Workspace', group: '1_group', checked: false },
				{ title: 'Repository', group: '1_group', checked: false },
				{ title: 'Environment', group: '1_group', checked: false },
				{ title: 'Inbox Mode', group: '1_group', checked: false, enabled: false },
			],
			show: [
				{ title: 'Recent', group: '1_show', checked: false },
				{ title: 'All', group: '1_show', checked: true },
			],
			repositoryShow: [
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
			buildTestSession({ id: 'local-claude', title: 'Claude', harness: 'claude', application: 'claude' }).session,
			buildTestSession({ id: 'local-codex', title: 'Codex', harness: 'codex', application: 'codex' }).session,
			buildTestSession({ id: 'local-cli', title: 'CLI', application: 'github/cli' }).session,
			buildTestSession({ id: 'local-third-party', title: 'Third Party', application: 'third-party' }).session,
			buildTestSession({ id: 'remote-a', title: 'Remote A', environment: 'remote-a' }).session,
			buildTestSession({ id: 'remote-a-cli', title: 'CLI', environment: 'remote-a', application: 'github/cli' }).session,
			buildTestSession({ id: 'remote-z-claude', title: 'Claude', environment: 'remote-z', application: 'claude' }).session,
			buildTestSession({ id: 'cloud-app', title: 'App', environment: 'cloud', application: 'github/autopilot' }).session,
			buildTestSession({ id: 'cloud-cli', title: 'CLI', environment: 'cloud', application: 'github/cli' }).session,
		];
		const { snapshot } = createMenu(sessions, [{ id: 'remote-z', label: 'Z Host' }, { id: 'remote-a', label: 'A Host' }]);
		assert.deepStrictEqual({
			environments: snapshot(Menus.SessionsViewEnvironment),
			sources: snapshot(Menus.SessionsViewSource),
			harnesses: snapshot(Menus.SessionsViewHarness),
		}, {
			environments: [
				{ title: 'This Computer', group: '2_environments', checked: true },
				{ title: 'Cloud', group: '2_environments', checked: true },
				{ title: 'A Host', group: '2_environments', checked: true },
				{ title: 'Z Host', group: '2_environments', checked: true },
			],
			sources: [
				{ title: 'Claude (This Computer)', group: '3_applications_000000', checked: false },
				{ title: 'Codex (This Computer)', group: '3_applications_000000', checked: false },
				{ title: 'Copilot CLI (This Computer)', group: '3_applications_000000', checked: false },
				{ title: 'Third-party (This Computer)', group: '3_applications_000000', checked: false },
				{ title: 'VS Code (This Computer)', group: '3_applications_000000', checked: true },
				{ title: 'Copilot App (Cloud)', group: '3_applications_000001', checked: true },
				{ title: 'Copilot CLI (Cloud)', group: '3_applications_000001', checked: true },
				{ title: 'Slack (Cloud)', group: '3_applications_000001', checked: false },
				{ title: 'VS Code (Cloud)', group: '3_applications_000001', checked: true },
				{ title: 'Copilot CLI (A Host)', group: '3_applications_000002', checked: false },
				{ title: 'VS Code (A Host)', group: '3_applications_000002', checked: true },
				{ title: 'Claude (Z Host)', group: '3_applications_000003', checked: false },
				{ title: 'VS Code (Z Host)', group: '3_applications_000003', checked: true },
			],
			harnesses: [
				{ title: 'Copilot', group: '1_harnesses', checked: true },
				{ title: 'Claude', group: '1_harnesses', checked: true },
				{ title: 'Codex', group: '1_harnesses', checked: true },
			],
		});
	});

	test('remote application opt-ins stay scoped to their host and Reset restores VS Code-only defaults', async () => {
		const sessions = [
			buildTestSession({ id: 'local-codex', title: 'Local Codex', application: 'codex' }).session,
			buildTestSession({ id: 'cloud-codex', title: 'Cloud Codex', environment: 'cloud', application: 'codex' }).session,
			buildTestSession({ id: 'first-vscode', title: 'First VS Code', environment: 'first-host' }).session,
			buildTestSession({ id: 'first-codex', title: 'First Codex', environment: 'first-host', application: 'codex' }).session,
			buildTestSession({ id: 'second-vscode', title: 'Second VS Code', environment: 'second-host' }).session,
			buildTestSession({ id: 'second-codex', title: 'Second Codex', environment: 'second-host', application: 'codex' }).session,
		];
		const { snapshot, filters, run } = createMenu(sessions, [{ id: 'first-host', label: 'First Host' }, { id: 'second-host', label: 'Second Host' }]);
		const state = () => ({
			visible: sessions.filter(session => filters.matches(session)).map(session => session.sessionId),
			sources: snapshot(Menus.SessionsViewSource).map(item => [item.title, item.checked]),
		});
		const defaults = state();
		const codexAction = MenuRegistry.getMenuItems(Menus.SessionsViewSource).filter(isIMenuItem).find(item => item.command.title === 'Codex (First Host)');
		assert.ok(codexAction);
		await run(codexAction.command.id);
		const optedIn = state();
		await run('sessionsViewPane.resetFilters');
		assert.deepStrictEqual({ defaults, optedIn, reset: state() }, {
			defaults: {
				visible: ['cloud-codex', 'first-vscode', 'second-vscode'],
				sources: [['Codex (This Computer)', false], ['VS Code (This Computer)', true], ['Codex (Cloud)', true], ['VS Code (Cloud)', true], ['Codex (First Host)', false], ['VS Code (First Host)', true], ['Codex (Second Host)', false], ['VS Code (Second Host)', true]],
			},
			optedIn: {
				visible: ['cloud-codex', 'first-vscode', 'first-codex', 'second-vscode'],
				sources: [['Codex (This Computer)', false], ['VS Code (This Computer)', true], ['Codex (Cloud)', true], ['VS Code (Cloud)', true], ['Codex (First Host)', true], ['VS Code (First Host)', true], ['Codex (Second Host)', false], ['VS Code (Second Host)', true]],
			},
			reset: defaults,
		});
	});

	test('VS Code toggles work before any sessions and Reset restores defaults and Show Recent', async () => {
		const local = buildTestSession({ id: 'local', title: 'Local' }).session;
		const cloud = buildTestSession({ id: 'cloud', title: 'Cloud', environment: 'cloud' }).session;
		const { snapshot, filters, capped, run, sessionsControl, setSessions, showAll } = createMenu();
		const localAction = MenuRegistry.getMenuItems(Menus.SessionsViewSource).filter(isIMenuItem)[0];
		await run(localAction.command.id);
		await run('sessionsViewPane.filterArchived');
		showAll();
		setSessions([local, cloud]);
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
				capped: capped.get(),
			},
		}, {
			selected: {
				local: false,
				cloud: true,
				archived: true,
				sources: [
					{ title: 'VS Code (This Computer)', group: '3_applications_000000', checked: false },
					{ title: 'VS Code (Cloud)', group: '3_applications_000001', checked: true },
				],
				environments: [
					{ title: 'This Computer', group: '2_environments', checked: true },
					{ title: 'Cloud', group: '2_environments', checked: true },
				],
			},
			reset: { local: true, cloud: true, archived: false, show: 'Show', capped: true },
		});
	});

	test('Reset Filters shows an undo notice that restores the previous filters and their checked menu items', async () => {
		const local = buildTestSession({ id: 'local', title: 'Local' }).session;
		const { snapshot, filters, capped, run, notices, showAll } = createMenu([local]);
		const localAction = MenuRegistry.getMenuItems(Menus.SessionsViewSource).filter(isIMenuItem).find(item => item.command.title === 'VS Code (This Computer)');
		assert.ok(localAction);
		await run(localAction.command.id);
		await run('sessionsViewPane.filterArchived');
		showAll();
		const state = () => ({
			local: filters.matches(local),
			localChecked: snapshot(Menus.SessionsViewSource).find(item => item.title === 'VS Code (This Computer)')?.checked,
			showDoneChecked: snapshot(Menus.SessionsViewFilter).find(item => item.title === 'Show Done')?.checked,
			showRecent: capped.get(),
		});
		const before = state();
		await run('sessionsViewPane.resetFilters');
		const reset = state();
		await notices[0].undo!();

		assert.deepStrictEqual({ before, reset, notices: notices.map(notice => notice.message), undone: state() }, {
			before: { local: false, localChecked: false, showDoneChecked: true, showRecent: false },
			reset: { local: true, localChecked: true, showDoneChecked: false, showRecent: true },
			notices: ['Filters reset'],
			undone: { local: false, localChecked: false, showDoneChecked: true, showRecent: false },
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
				title: 'Environment',
				sources: [
					{ title: 'VS Code (This Computer)', group: '3_applications_000000', checked: true },
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
			sources: [
				{ title: 'VS Code (This Computer)', group: '3_applications_000000', checked: false },
				{ title: 'VS Code (Cloud)', group: '3_applications_000001', checked: true },
			],
			environments: [
				{ title: 'This Computer', group: '2_environments', checked: true },
				{ title: 'Cloud', group: '2_environments', checked: true },
			],
		});
	});

	test('offers VS Code in an empty catalog and scopes its choices to included environments', () => {
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
		const localApplication = { title: 'VS Code (This Computer)', group: '3_applications_000000', checked: true };
		const cloudApplication = { title: 'VS Code (Cloud)', group: '3_applications_000001', checked: true };
		assert.deepStrictEqual({ empty, local, none, cloud }, {
			empty: { title: 'Environment', sources: [localApplication, cloudApplication] },
			local: { title: 'Environment', sources: [localApplication] },
			none: {
				title: 'Environment',
				sources: [{ title: 'Select an Environment First', group: '3_applications', enabled: false }],
			},
			cloud: { title: 'Environment', sources: [cloudApplication] },
		});
	});

	test('offers a VS Code toggle for a connected remote host before it has any sessions', async () => {
		const { snapshot, filters, run, setSessions } = createMenu([], [{ id: 'remote', label: 'Build Server' }]);
		const before = snapshot(Menus.SessionsViewSource);
		const vscodeAction = MenuRegistry.getMenuItems(Menus.SessionsViewSource).filter(isIMenuItem).find(item => item.command.title === 'VS Code (Build Server)');
		assert.ok(vscodeAction);
		await run(vscodeAction.command.id);
		const remote = buildTestSession({ id: 'remote-vscode', title: 'Remote VS Code', environment: 'remote' }).session;
		setSessions([remote]);
		assert.deepStrictEqual({ before, after: snapshot(Menus.SessionsViewSource), visible: filters.matches(remote) }, {
			before: [
				{ title: 'VS Code (This Computer)', group: '3_applications_000000', checked: true },
				{ title: 'VS Code (Cloud)', group: '3_applications_000001', checked: true },
				{ title: 'VS Code (Build Server)', group: '3_applications_000002', checked: true },
			],
			after: [
				{ title: 'VS Code (This Computer)', group: '3_applications_000000', checked: true },
				{ title: 'VS Code (Cloud)', group: '3_applications_000001', checked: true },
				{ title: 'VS Code (Build Server)', group: '3_applications_000002', checked: false },
			],
			visible: false,
		});
	});

	test('keeps the Environment title and cached creation choices through disconnect, rename, and catalog changes', () => {
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
			title: 'Environment',
			environments: [
				{ title: 'This Computer', group: '2_environments', checked: false },
				{ title: 'Cloud', group: '2_environments', checked: false },
			],
			sources: [{ title: 'VS Code (Renamed Server)', group: '3_applications_000002', checked: false }],
		};
		const expectedNone = {
			title: 'Environment',
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
			{ title: 'Created Externally', group: '3_visibility', submenu: Menus.SessionsViewExternalFilter.id },
			{ title: 'Show Archived', group: '3_visibility', checked: false },
		]);
	});
});
