/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { Action, ActionRunner } from '../../../../../base/common/actions.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionViewItemFactory, NullActionViewItemService } from '../../../../../platform/actions/browser/actionViewItemService.js';
import { isIMenuItem, MenuId, MenuItemAction, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { AGENT_HOST_SYNC_CHANGESET_OPERATION_ID } from '../../../../../platform/agentHost/common/agentHostChangesetOperationService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { Context, ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IsSessionsWindowContext } from '../../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionIdContext } from '../../../../common/contextkeys.js';
import { ISessionContext, SessionContext } from '../../../../services/sessions/browser/sessionContext.js';
import { ISessionsPartService } from '../../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangeset, ISessionChangesetOperation, ISessionFolder, ISessionGitRepository, ISessionWorkspace, SessionChangesetOperationScope, SessionChangesetOperationStatus, UNCOMMITTED_CHANGES_CHANGESET_ID } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { SessionSyncChangesActionViewItem, SessionSyncChangesContribution } from '../../browser/sessionSyncChanges.js';
import '../../../../../base/browser/ui/actionbar/actionbar.css';
import '../../../../../workbench/browser/media/style.css';
import '../../../chat/browser/media/chatWidget.css';

suite('Session Sync Changes', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const commandId = 'workbench.action.sessions.syncChanges';

	function createWorkspace(incomingChanges?: number, outgoingChanges?: number, upstreamBranchName = 'origin/main'): ISessionWorkspace {
		return upcastPartial<ISessionWorkspace>({
			folders: [upcastPartial<ISessionFolder>({
				gitRepository: upcastPartial<ISessionGitRepository>({ incomingChanges, outgoingChanges, upstreamBranchName }),
			})],
		});
	}

	function createSession(id: string) {
		const operation: ISessionChangesetOperation = {
			id: AGENT_HOST_SYNC_CHANGESET_OPERATION_ID,
			label: 'Sync Changes 2',
			description: 'Synchronize the repository',
			icon: Codicon.sync,
			scopes: [SessionChangesetOperationScope.Changeset],
			status: SessionChangesetOperationStatus.Idle,
		};
		const operations = observableValue<readonly ISessionChangesetOperation[]>('operations', [operation]);
		const enabled = observableValue('enabled', true);
		const invocations: Parameters<ISessionChangeset['invokeOperation']>[] = [];
		const changeset = upcastPartial<ISessionChangeset>({
			id: UNCOMMITTED_CHANGES_CHANGESET_ID,
			isEnabled: enabled,
			operations,
			invokeOperation: async (...args) => {
				invocations.push(args);
			},
		});
		const changesets = observableValue<readonly ISessionChangeset[] | undefined>('changesets', [changeset]);
		const workspace = observableValue<ISessionWorkspace | undefined>('workspace', createWorkspace(0, 2));
		const session = upcastPartial<IActiveSession>({
			sessionId: id,
			resource: URI.parse(`test-session:/${id}`),
			changesets,
			workspace,
		});
		return { session, operation, operations, enabled, changeset, changesets, invocations, workspace };
	}

	function setup(sessions: readonly IActiveSession[]) {
		const visibleSessions = observableValue<readonly (IActiveSession | undefined)[]>('visibleSessions', sessions);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', sessions[0]);
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly visibleSessions = visibleSessions;
			override readonly activeSession = activeSession;
		}();
		let factory: IActionViewItemFactory | undefined;
		const actionViewItemService = new class extends NullActionViewItemService {
			override register(_menu: MenuId, _id: string | MenuId, provider: IActionViewItemFactory) {
				factory = provider;
				return toDisposable(() => { factory = undefined; });
			}
		}();
		const contribution = store.add(new SessionSyncChangesContribution(sessionsService, actionViewItemService));
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsService, sessionsService);
		const invoke = async (...args: unknown[]) => instantiationService.invokeFunction(CommandsRegistry.getCommand(commandId)!.handler, ...args);
		return {
			contribution, visibleSessions, activeSession, invoke,
			getFactory: () => {
				assert.ok(factory);
				return factory;
			},
		};
	}

	function getEntries() {
		return MenuRegistry.getMenuItems(Menus.NewSessionRepositoryConfig).filter(isIMenuItem).filter(item => item.command.id === commandId);
	}

	function getVisibleEntries(session: IActiveSession, aiEnabled = true) {
		const context = new Context(1, null);
		context.setValue(SessionIdContext.key, session.sessionId);
		context.setValue(IsSessionsWindowContext.key, true);
		context.setValue(ChatContextKeys.enabled.key, aiEnabled);
		return getEntries().filter(item => item.when?.evaluate(context));
	}

	test('contributes a separate repository toolbar action scoped to each supported session', () => {
		const first = createSession('first');
		const second = createSession('second');
		second.operations.set([], undefined);
		setup([first.session, second.session]);

		assert.deepStrictEqual({
			first: getVisibleEntries(first.session).map(item => ({ id: item.command.id, group: item.group, order: item.order })),
			second: getVisibleEntries(second.session).length,
			aiDisabled: getVisibleEntries(first.session, false).length,
		}, {
			first: [{ id: commandId, group: 'navigation', order: 4 }],
			second: 0,
			aiDisabled: 0,
		});
	});

	test('requires counts before contributing a sync action', () => {
		const data = createSession('first');
		data.workspace.set(undefined, undefined);
		setup([data.session]);
		const counts = [getEntries().length];
		data.workspace.set(createWorkspace(0, 0), undefined);
		counts.push(getEntries().length);
		data.workspace.set(createWorkspace(1, 0), undefined);
		counts.push(getEntries().length);
		data.workspace.set(createWorkspace(0, 0), undefined);
		counts.push(getEntries().length);

		assert.deepStrictEqual(counts, [0, 0, 1, 0]);
	});

	test('disabled sync icon matches the count label color in every theme', () => {
		const data = createSession('first');
		const action = store.add(new Action(commandId, 'Sync Changes', undefined, false));
		const item = store.add(new SessionSyncChangesActionViewItem(action, {}, new SessionContext(constObservable(data.session)), new class extends mock<ISessionsPartService>() { }()));
		const root = append(document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => root.remove()));
		root.style.setProperty('--vscode-disabledForeground', 'rgb(128, 128, 128)');
		root.style.setProperty('--vscode-icon-foreground', 'rgb(240, 240, 240)');
		const widget = append(root, $('.new-chat-widget-container.revealed'));
		const bottom = append(widget, $('.new-chat-bottom-container'));
		const repository = append(bottom, $('.new-chat-repo-config-container'));
		const actionBar = append(repository, $('.monaco-action-bar'));
		const container = append(actionBar, $('.action-item'));
		item.render(container);
		const label = container.querySelector<HTMLElement>('.action-label')!;
		const icon = label.querySelector<HTMLElement>('.codicon')!;
		const counts = label.querySelector<HTMLElement>('span:not(.codicon)')!;
		const targetWindow = getWindow(root);
		const colors = [];
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			root.classList.add(theme);
			colors.push({
				theme,
				label: targetWindow.getComputedStyle(label).color,
				icon: targetWindow.getComputedStyle(icon).color,
				counts: targetWindow.getComputedStyle(counts).color,
			});
			root.classList.remove(theme);
		}

		assert.deepStrictEqual(colors, ['vs', 'vs-dark', 'hc-black', 'hc-light'].map(theme => ({
			theme, label: 'rgb(128, 128, 128)', icon: 'rgb(128, 128, 128)', counts: 'rgb(128, 128, 128)',
		})));
	});

	test('leaves the presentation untouched until the menu removes the completed sync action', async () => {
		const data = createSession('first');
		data.operations.set([{ ...data.operation, status: SessionChangesetOperationStatus.Running }], undefined);
		setup([data.session]);
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		SessionIdContext.bindTo(contextKeyService).set(data.session.sessionId);
		IsSessionsWindowContext.bindTo(contextKeyService).set(true);
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		const menuService = store.add(new MenuService(new class extends mock<ICommandService>() { }(), new MockKeybindingService(), store.add(new TestStorageService())));
		const menu = store.add(menuService.createMenu(Menus.NewSessionRepositoryConfig, contextKeyService, { eventDebounceDelay: 0 }));
		const item = store.add(new MutableDisposable<SessionSyncChangesActionViewItem>());
		const container = document.createElement('div');
		const renderMenu = () => {
			item.clear();
			container.replaceChildren();
			const action = menu.getActions().flatMap(([, actions]) => actions).find(action => action.id === commandId);
			if (action) {
				item.value = new SessionSyncChangesActionViewItem(action, {}, new SessionContext(constObservable(data.session)), new class extends mock<ISessionsPartService>() { }());
				item.value.render(container);
			}
		};
		store.add(menu.onDidChange(renderMenu));
		renderMenu();
		const snapshot = () => ({ text: container.textContent, hasIcon: !!container.querySelector('.codicon') });
		const beforeCompletion = snapshot();
		const originalMarkup = container.innerHTML;
		const originalIcon = container.querySelector('.codicon');
		const removed = Event.toPromise(menu.onDidChange);
		data.workspace.set(createWorkspace(0, 0), undefined);
		const beforeMenuRemoval = snapshot();
		data.operations.set([], undefined);
		const presentationUnchanged = container.innerHTML === originalMarkup && container.querySelector('.codicon') === originalIcon;
		await removed;

		assert.deepStrictEqual({ beforeCompletion, beforeMenuRemoval, presentationUnchanged, afterRemoval: snapshot() }, {
			beforeCompletion: { text: '2\u2191', hasIcon: true },
			beforeMenuRemoval: { text: '2\u2191', hasIcon: true },
			presentationUnchanged: true,
			afterRemoval: { text: '', hasIcon: false },
		});
	});

	test('tracks changeset availability and enablement without rebuilding for label changes', () => {
		const data = createSession('first');
		const { visibleSessions, contribution } = setup([data.session]);
		const counts = [getEntries().length];
		data.operations.set([{ ...data.operation, status: SessionChangesetOperationStatus.Running, label: 'Updated label' }], undefined);
		const runningEntry = getEntries()[0];
		const disabledWhileRunning = runningEntry.command.precondition?.serialize();
		data.operations.set([{ ...data.operation, status: SessionChangesetOperationStatus.Running, label: 'Another label' }], undefined);
		const sameEntry = getEntries()[0] === runningEntry;
		data.operations.set([{ ...data.operation, status: SessionChangesetOperationStatus.Error }], undefined);
		const enabledAfterError = getEntries()[0].command.precondition === undefined;
		data.enabled.set(false, undefined);
		counts.push(getEntries().length);
		data.enabled.set(true, undefined);
		counts.push(getEntries().length);
		data.operations.set([{ ...data.operation, scopes: [SessionChangesetOperationScope.Resource] }], undefined);
		counts.push(getEntries().length);
		data.operations.set([data.operation], undefined);
		counts.push(getEntries().length);
		data.changesets.set([{ ...data.changeset, id: 'session' }], undefined);
		counts.push(getEntries().length);
		data.changesets.set([data.changeset], undefined);
		visibleSessions.set([undefined], undefined);
		counts.push(getEntries().length);
		visibleSessions.set([data.session], undefined);
		counts.push(getEntries().length);
		contribution.dispose();
		counts.push(getEntries().length);

		assert.deepStrictEqual({ sameEntry, disabledWhileRunning, enabledAfterError, counts, commandRemoved: !CommandsRegistry.getCommand(commandId) }, {
			sameEntry: true,
			disabledWhileRunning: 'false',
			enabledAfterError: true,
			counts: [1, 0, 1, 0, 1, 0, 0, 1, 0],
			commandRemoved: true,
		});
	});

	test('invokes the active session uncommitted changeset without command arguments or a resource target', async () => {
		const first = createSession('first');
		const second = createSession('second');
		const otherInvocations: string[] = [];
		second.changesets.set([upcastPartial<ISessionChangeset>({
			id: 'session',
			isEnabled: constObservable(true),
			isDefault: constObservable(true),
			operations: second.operations,
			invokeOperation: async id => { otherInvocations.push(id); },
		}), second.changeset], undefined);
		const { invoke, activeSession } = setup([first.session, second.session]);
		activeSession.set(second.session, undefined);
		await invoke();

		assert.deepStrictEqual({ first: first.invocations, second: second.invocations, other: otherInvocations }, {
			first: [],
			second: [[AGENT_HOST_SYNC_CHANGESET_OPERATION_ID]],
			other: [],
		});
	});

	test('revalidates missing, disabled and running operations before invocation', async () => {
		const data = createSession('first');
		const { invoke, activeSession } = setup([data.session]);
		for (const status of [SessionChangesetOperationStatus.Disabled, SessionChangesetOperationStatus.Running]) {
			data.operations.set([{ ...data.operation, status }], undefined);
			await assert.rejects(invoke(), /no longer available/);
		}
		data.operations.set([], undefined);
		await assert.rejects(invoke(), /no longer available/);
		data.operations.set([data.operation], undefined);
		data.enabled.set(false, undefined);
		await assert.rejects(invoke(), /no longer available/);
		data.enabled.set(true, undefined);
		activeSession.set(undefined, undefined);
		await assert.rejects(invoke(), /no longer available/);
		assert.deepStrictEqual(data.invocations, []);
	});

	test('allows retries and propagates operation failures', async () => {
		const data = createSession('first');
		const failure = new Error('Sync failed');
		data.operations.set([{ ...data.operation, status: SessionChangesetOperationStatus.Error }], undefined);
		data.changesets.set([{ ...data.changeset, invokeOperation: async () => { throw failure; } }], undefined);
		const { invoke } = setup([data.session]);
		await assert.rejects(invoke(), error => error === failure);
	});

	test('does not fall back to the active session when the originating session is unavailable', async () => {
		const first = createSession('first');
		const second = createSession('second');
		const { invoke } = setup([second.session, first.session]);
		await assert.rejects(invoke({ session: undefined }), /no longer available/);
		first.operations.set([], undefined);
		await assert.rejects(invoke({ session: first.session }), /no longer available/);

		assert.deepStrictEqual({ first: first.invocations, second: second.invocations }, { first: [], second: [] });
	});

	test('uses the supplied menu action with menu-owned enablement and captures its session before command activation', async () => {
		const first = createSession('first');
		const second = createSession('second');
		second.operations.set([{ ...second.operation, description: undefined }], undefined);
		const { invoke, getFactory, activeSession } = setup([first.session, second.session]);
		const session = observableValue<IActiveSession | undefined>('session', second.session);
		const activation = new DeferredPromise<void>();
		const commandArguments: unknown[][] = [];
		const commandService = new class extends mock<ICommandService>() {
			override async executeCommand<T>(_id: string, ...args: unknown[]): Promise<T | undefined> {
				commandArguments.push(args);
				await activation.p;
				await invoke(...args);
				return undefined;
			}
		}();
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		SessionIdContext.bindTo(contextKeyService).set(second.session.sessionId);
		IsSessionsWindowContext.bindTo(contextKeyService).set(true);
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		const menuService = store.add(new MenuService(commandService, new MockKeybindingService(), store.add(new TestStorageService())));
		const menu = store.add(menuService.createMenu(Menus.NewSessionRepositoryConfig, contextKeyService, { eventDebounceDelay: 0 }));
		const scopedInstantiationService = store.add(new TestInstantiationService());
		scopedInstantiationService.stub(ISessionContext, new SessionContext(session));
		scopedInstantiationService.stub(ISessionsPartService, new class extends mock<ISessionsPartService>() { }());
		const container = document.createElement('div');
		const item = store.add(new MutableDisposable<SessionSyncChangesActionViewItem>());
		const actionRunner = store.add(new ActionRunner());
		const renderMenu = () => {
			const action = menu.getActions({ get arg() { return { session: session.get() }; } }).flatMap(([, actions]) => actions).find(action => action.id === commandId)!;
			assert.ok(action instanceof MenuItemAction);
			const viewItem = getFactory()(action, {}, scopedInstantiationService, 0)!;
			assert.ok(viewItem instanceof SessionSyncChangesActionViewItem);
			assert.strictEqual(viewItem.action, action);
			item.value = viewItem;
			viewItem.actionRunner = actionRunner;
			container.replaceChildren();
			viewItem.render(container);
			return action;
		};
		store.add(menu.onDidChange(() => renderMenu()));
		const action = renderMenu();
		const label = () => container.querySelector<HTMLElement>('.action-label')!;
		const snapshot = () => ({
			text: label().textContent,
			enabled: item.value!.action.enabled,
			busy: label().getAttribute('aria-busy'),
			disabled: label().getAttribute('aria-disabled'),
			spinning: !!label().querySelector('.codicon-modifier-spin'),
			icon: !!label().querySelector('.codicon-sync'),
			ariaLabel: label().getAttribute('aria-label'),
		});
		const idle = snapshot();
		const runningMenuChanged = Event.toPromise(menu.onDidChange);
		second.operations.set([{ ...second.operation, status: SessionChangesetOperationStatus.Running }], undefined);
		await runningMenuChanged;
		const running = snapshot();
		const retryMenuChanged = Event.toPromise(menu.onDidChange);
		second.operations.set([{ ...second.operation, description: undefined, status: SessionChangesetOperationStatus.Error, label: 'Sync Changes 3' }], undefined);
		second.workspace.set(createWorkspace(0, 3), undefined);
		await retryMenuChanged;
		const retry = snapshot();
		activeSession.set(second.session, undefined);
		const completed = Event.toPromise(actionRunner.onDidRun);
		label().click();
		session.set(first.session, undefined);
		activeSession.set(first.session, undefined);
		await activation.complete();
		await completed;
		await item.value!.action.run();

		assert.deepStrictEqual({
			idle, running, retry, first: first.invocations, second: second.invocations,
			menuAction: { label: action.label, tooltip: action.tooltip, enabled: action.enabled },
			commandArguments,
		}, {
			idle: { text: '2\u2191', enabled: true, busy: 'false', disabled: null, spinning: false, icon: true, ariaLabel: 'Push 2 commits to origin/main' },
			running: { text: '2\u2191', enabled: false, busy: 'true', disabled: 'true', spinning: true, icon: true, ariaLabel: 'Synchronizing Changes...' },
			retry: { text: '3\u2191', enabled: true, busy: 'false', disabled: null, spinning: false, icon: true, ariaLabel: 'Push 3 commits to origin/main' },
			first: [[AGENT_HOST_SYNC_CHANGESET_OPERATION_ID]],
			second: [[AGENT_HOST_SYNC_CHANGESET_OPERATION_ID]],
			menuAction: { label: 'Sync Changes', tooltip: '', enabled: true },
			commandArguments: [[{ session: second.session }], [{ session: first.session }]],
		});
	});

	test('renders incoming and outgoing counts from repository state without parsing the operation label', () => {
		const data = createSession('first');
		data.operations.set([{ ...data.operation, description: undefined, label: 'Localized sync operation' }], undefined);
		const action = store.add(new Action(commandId, 'Sync Changes'));
		const item = store.add(new SessionSyncChangesActionViewItem(action, {}, new SessionContext(constObservable(data.session)), new class extends mock<ISessionsPartService>() { }()));
		const container = document.createElement('div');
		item.render(container);
		const labels = [];
		for (const workspace of [createWorkspace(1, 0), createWorkspace(0, 2), createWorkspace(1, 2), createWorkspace(0, 0), createWorkspace(), undefined]) {
			data.workspace.set(workspace, undefined);
			labels.push(container.textContent);
		}

		assert.deepStrictEqual({ labels, ariaLabel: container.querySelector('.action-label')!.getAttribute('aria-label') }, {
			labels: ['1\u2193', '2\u2191', '1\u2193 2\u2191', '1\u2193 2\u2191', '1\u2193 2\u2191', '1\u2193 2\u2191'],
			ariaLabel: 'Pull 1 and push 2 commits between origin/main',
		});
	});

	test('matches the Git sync hover and accessible label as counts and upstream change', () => {
		const data = createSession('first');
		const action = store.add(new Action(commandId, 'Sync Changes'));
		const item = store.add(new SessionSyncChangesActionViewItem(action, {}, new SessionContext(constObservable(data.session)), new class extends mock<ISessionsPartService>() { }()));
		const container = document.createElement('div');
		item.render(container);
		const label = container.querySelector<HTMLElement>('.action-label')!;
		const hovers = [];
		for (const workspace of [
			createWorkspace(1, 0),
			createWorkspace(3, 0),
			createWorkspace(0, 1),
			createWorkspace(1, 2),
			createWorkspace(2, 0, 'upstream/feature/test'),
			createWorkspace(0, 0),
			createWorkspace(1, 0, ''),
			undefined,
		]) {
			data.workspace.set(workspace, undefined);
			hovers.push(label.getAttribute('aria-label'));
		}

		assert.deepStrictEqual(hovers, [
			'Pull 1 commits from origin/main',
			'Pull 3 commits from origin/main',
			'Push 1 commits to origin/main',
			'Pull 1 and push 2 commits between origin/main',
			'Pull 2 commits from upstream/feature/test',
			'Pull 2 commits from upstream/feature/test',
			'Synchronize Changes',
			'Synchronize Changes',
		]);
	});

	test('returns keyboard focus to the input when the focused action is removed', () => {
		const data = createSession('first');
		const action = store.add(new Action(commandId, 'Sync Changes'));
		const widget = document.createElement('div');
		widget.className = 'new-chat-widget-container';
		const input = document.createElement('textarea');
		input.setAttribute('role', 'textbox');
		const focusedSessions: (IActiveSession | undefined)[] = [];
		const sessionsPartService = new class extends mock<ISessionsPartService>() {
			override focusSession(session: IActiveSession | undefined): void {
				focusedSessions.push(session);
				input.focus();
			}
		}();
		const item = store.add(new SessionSyncChangesActionViewItem(action, {}, new SessionContext(constObservable(data.session)), sessionsPartService));
		const container = document.createElement('div');
		widget.append(input, container);
		document.body.append(widget);
		store.add(toDisposable(() => widget.remove()));
		item.render(container);
		item.focus();
		data.operations.set([], undefined);
		item.dispose();

		assert.deepStrictEqual({ inputFocused: document.activeElement === input, focusedSessions }, { inputFocused: true, focusedSessions: [data.session] });
	});
});
