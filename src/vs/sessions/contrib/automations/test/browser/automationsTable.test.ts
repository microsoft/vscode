/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { getFlatActionBarActions } from '../../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { IMenuService, isIMenuItem, MenuRegistry, SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../platform/actions/common/menuService.js';
import { Event as BaseEvent } from '../../../../../base/common/event.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { useFakeTimers } from 'sinon';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IChatModel, IChatRequestModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IMissionControlEnvironmentService } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { IRemoteAgentHostService } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { CommandsRegistry, ICommandService } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { CHAT_AUTOMATIONS_ENABLED_SETTING, CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, ChatAutomationsEnabledContext } from '../../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { IAutomationDescriptor } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { AutomationCatalogueState, AutomationMutationGuard, IAutomationService, IGuardedAutomationUpdateResult, IUpdateAutomationOptions } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IAutomationDialogService, IShowAutomationDialogOptions } from '../../../../../workbench/contrib/chat/common/automations/automationDialogService.js';
import { IAutomationRunner, IAutomationRunDispatch, IAutomationRunOperation } from '../../../../../workbench/contrib/chat/common/automations/automationRunner.js';
import { SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { AgentsWindowMenus } from '../../../../browser/agentsWindowMenus.js';
import { AutomationsModalCommands } from '../../browser/automationsModalActions.js';
import { AutomationCommands } from '../../browser/automationCommands.js';
import { AutomationsModalWidget } from '../../browser/automationsModalWidget.js';
import { TableAutomationService, TableEnvironmentService, TableRemoteService, tableAutomation, setupModalHistoryServices } from './automationsTableTestUtils.js';
import { createTestSession } from '../../../sessions/test/browser/sessionsListTestUtils.js';
import { SessionStatus } from '../../../../../workbench/services/sessions/common/session.js';
import { AutomationDisableConditionKind } from '../../../../../platform/agentHost/common/state/protocol/channels-automation/state.js';
import { SessionItemIsAutomationContext, SessionItemIsInSessionsListContext } from '../../../../../workbench/contrib/sessions/browser/views/sessionsListCommon.js';
import { SessionIsArchivedContext } from '../../../../../workbench/contrib/sessions/common/contextkeys.js';
import { HIDE_AUTOMATION_SESSION_FROM_LIST_COMMAND_ID, SHOW_AUTOMATION_SESSION_IN_LIST_COMMAND_ID } from '../../../../../workbench/contrib/sessions/common/sessionCommands.js';

suite('Automations modal table', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class TestAutomationsModalWidget extends AutomationsModalWidget {
		localizeEnabledLabels(): void {
			for (let index = 0; index < this.table.length; index++) {
				const row = this.table.row(index);
				Object.assign(row, { enabled: row.automation.enabled ? 'Aktiviert' : 'Deaktiviert' });
			}
		}
	}

	function setup(applyCommand = false, initialAutomations?: readonly IAutomationDescriptor[]) {
		const container = dom.append(dom.getActiveDocument().body, dom.$('div'));
		container.style.width = '1100px';
		container.style.height = '560px';
		store.add(toDisposable(() => container.remove()));
		const services = workbenchInstantiationService(undefined, store);
		const historyServices = setupModalHistoryServices(services, store);
		const updates: { id: string; patch: IUpdateAutomationOptions; expected: IAutomationDescriptor }[] = [];
		const automations = new class extends TableAutomationService {
			override readonly historyState = observableValue<AutomationCatalogueState>(this, 'ready');
			override readonly isRefreshing = observableValue(this, false);
			conflict = false;
			override async updateAutomationIfUnchanged(id: string, patch: IUpdateAutomationOptions, expected: IAutomationDescriptor, guard?: AutomationMutationGuard): Promise<IGuardedAutomationUpdateResult> {
				guard?.();
				updates.push({ id, patch, expected });
				return this.conflict ? { kind: 'conflict', current: expected } : { kind: 'updated', automation: expected };
			}
		}();
		if (initialAutomations) {
			automations.automations.set(initialAutomations, undefined);
		}
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const contextMenus: IContextMenuMenuDelegate[] = [];
		services.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: IContextMenuMenuDelegate): void { contextMenus.push(delegate); }
		}());
		services.stub(IAutomationService, automations);
		const editDialogs: IShowAutomationDialogOptions[] = [];
		const failures = { edit: false };
		services.stub(IAutomationDialogService, new class extends mock<IAutomationDialogService>() {
			override async showAutomationDialog(options: IShowAutomationDialogOptions): Promise<undefined> {
				editDialogs.push(options);
				if (failures.edit) {
					await Promise.resolve();
					throw new Error('Edit failed asynchronously');
				}
				return undefined;
			}
		}());
		const errors: string[] = [];
		services.stub(IDialogService, new class extends mock<IDialogService>() {
			override async error(message: string, detail?: string): Promise<void> { errors.push(`${message} ${detail ?? ''}`); }
			override async info(message: string): Promise<void> { errors.push(message); }
		}());
		const runs: IAutomationDescriptor[] = [];
		const dispatch: { result: Promise<IAutomationRunDispatch> } = { result: Promise.resolve({ kind: 'accepted' }) };
		services.stub(IAutomationRunner, new class extends mock<IAutomationRunner>() {
			override runOnce(automation: IAutomationDescriptor): IAutomationRunOperation {
				runs.push(automation);
				return { whenDispatched: dispatch.result, whenCompleted: Promise.resolve() };
			}
		}());
		services.stub(IRemoteAgentHostService, new TableRemoteService());
		services.stub(IMissionControlEnvironmentService, new TableEnvironmentService());
		const configurationService = new TestConfigurationService({ chat: { automations: { enabled: true, cloud: { enabled: true } } } });
		services.stub(IConfigurationService, configurationService);
		const contextKeyService = store.add(services.createInstance(ContextKeyService));
		services.stub(IContextKeyService, contextKeyService);
		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		ChatAutomationsEnabledContext.bindTo(contextKeyService).set(true);
		services.stub(ICommandService, new class extends mock<ICommandService>() {
			override readonly onWillExecuteCommand = BaseEvent.None;
			override readonly onDidExecuteCommand = BaseEvent.None;
			override async executeCommand<T>(id: string, ...args: readonly unknown[]): Promise<T> {
				commands.push({ id, args });
				if ([AutomationsModalCommands.createWithAgent.id, AutomationsModalCommands.run.id, AutomationCommands.edit.id, AutomationCommands.run.id, AutomationCommands.showSharedByOthers.id].includes(id)) {
					const result: unknown = await services.invokeFunction(CommandsRegistry.getCommand(id)!.handler, ...args);
					return result as T;
				}
				if (applyCommand && (id === 'sessions.automations.disable' || id === 'sessions.automations.enable')) {
					const automation = args[0] as IAutomationDescriptor;
					automations.automations.set(automations.automations.get().map(item => item.id === automation.id ? { ...item, enabled: id === 'sessions.automations.enable' } : item), undefined);
				}
				return undefined as T;
			}
		}());
		const menuService = store.add(services.createInstance(MenuService));
		services.stub(IMenuService, menuService);
		let agentDrafts = 0;
		const openedRuns: string[] = [];
		const widget = store.add(services.createInstance(TestAutomationsModalWidget, container, async () => { agentDrafts++; }, async resource => { openedRuns.push(resource.toString()); }));
		widget.layout();
		const click = (label: string) => {
			const button = [...container.querySelectorAll<HTMLElement>('.monaco-button')].find(button => button.textContent === label);
			assert.ok(button, label);
			button.click();
		};
		const names = () => [...container.querySelectorAll('.automations-modal-table .monaco-list-row')].map(row => row.querySelector('.automations-modal-cell')?.textContent);
		const openContextMenu = (index: number) => {
			const row = container.querySelectorAll<HTMLElement>('.automations-modal-table .monaco-list-row')[index];
			assert.ok(row);
			contextMenus.length = 0;
			row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
			const contextMenu = contextMenus.at(-1);
			assert.ok(contextMenu);
			assert.ok(contextMenu.menuId && contextMenu.contextKeyService);
			return {
				...contextMenu,
				getActions: () => getFlatActionBarActions(menuService.getMenuActions(contextMenu.menuId!, contextMenu.contextKeyService!, contextMenu.menuActionOptions)),
			};
		};
		return { container, widget, automations, commands, configurationService, contextKeyService, menuService, editDialogs, updates, errors, runs, click, names, openContextMenu, historyServices, openedRuns, failures, dispatch, agentDrafts: () => agentDrafts };
	}

	test('row context menu deletes the clicked automation through the existing guarded command', async () => {
		const { container, automations, commands, openContextMenu } = setup();
		const menu = openContextMenu(1);
		const actions = await menu.getActions();
		const action = actions.at(-1);
		assert.ok(action);
		await action.run();
		assert.deepStrictEqual({
			actions: actions.map(action => ({ id: action.id, enabled: action.enabled })),
			command: commands[0]?.id,
			automation: (commands[0]?.args[0] as IAutomationDescriptor).id,
			focused: container.querySelector('.monaco-list-row.focused')?.textContent?.includes('Bravo daily'),
			definitions: automations.automations.get().length,
		}, {
			actions: [{ id: AutomationsModalCommands.run.id, enabled: true }, { id: 'vs.actions.separator', enabled: false }, { id: 'sessions.automations.disable', enabled: true }, { id: 'vs.actions.separator', enabled: false }, { id: AutomationCommands.duplicate.id, enabled: true }, { id: AutomationCommands.export.id, enabled: true }, { id: 'vs.actions.separator', enabled: false }, { id: AutomationCommands.edit.id, enabled: true }, { id: 'sessions.automations.delete', enabled: true }],
			command: 'sessions.automations.delete', automation: 'bravo', focused: true, definitions: 3,
		});
	});

	test('Send Later hides scheduled chats before and after dispatch', async () => {
		const { configurationService, automations, names } = setup();
		await configurationService.setUserConfiguration(SESSIONS_SEND_LATER_ENABLED_SETTING, true);
		automations.automations.set([
			tableAutomation('regular', 'Regular'),
			tableAutomation('pending', 'Pending chat', { purpose: 'scheduledChat' }),
			tableAutomation('sent', 'Sent chat', { purpose: 'scheduledChat', oneTimeDispatchedAt: '2026-02-02T00:00:00Z' }),
		], undefined);
		const hidden = names();
		await configurationService.setUserConfiguration(SESSIONS_SEND_LATER_ENABLED_SETTING, false);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === SESSIONS_SEND_LATER_ENABLED_SETTING,
			affectedKeys: new Set([SESSIONS_SEND_LATER_ENABLED_SETTING]),
			change: { keys: [SESSIONS_SEND_LATER_ENABLED_SETTING], overrides: [] },
			source: ConfigurationTarget.USER,
		});
		assert.deepStrictEqual({ hidden, shown: names() }, {
			hidden: ['Regular'], shown: ['Pending chat', 'Regular', 'Sent chat'],
		});
	});

	test('row context menu reflects provider mutation capabilities', async () => {
		const { automations, openContextMenu } = setup();
		automations.mutable = false;
		automations.runnable = false;
		const actions = await openContextMenu(2).getActions();
		assert.deepStrictEqual(actions.filter(action => action.id !== 'vs.actions.separator').map(action => ({ id: action.id, enabled: action.enabled })), [
			{ id: AutomationsModalCommands.run.id, enabled: false },
			{ id: 'sessions.automations.enable', enabled: false },
			{ id: AutomationCommands.duplicate.id, enabled: true },
			{ id: AutomationCommands.edit.id, enabled: false },
			{ id: 'sessions.automations.delete', enabled: false },
		]);
	});

	test('empty modal owns its creation buttons without the cards contribution', async () => {
		const { container, agentDrafts } = setup(false, []);
		const create = container.querySelector<HTMLAnchorElement>('.automations-modal-actions .chat-pill-button');
		assert.ok(create);
		create.click();
		await Promise.resolve();
		assert.deepStrictEqual({
			label: create.textContent,
			agentDrafts: agentDrafts(),
			cardsClass: container.querySelector('.custom-view-header-actions'),
			rowCount: container.querySelectorAll('.monaco-list-row').length,
		}, { label: 'Create with Agent', agentDrafts: 1, cardsClass: null, rowCount: 0 });
	});

	test('row details use the invoking modal and follow authoritative removal', () => {
		const first = setup();
		const second = setup();
		first.container.querySelectorAll<HTMLElement>('.monaco-list-row')[1].click();
		const detail = first.container.querySelector<HTMLElement>('.automations-modal-detail')!;
		const shown = { visible: !detail.hidden, name: detail.querySelector('h3')?.textContent, otherHidden: second.container.querySelector<HTMLElement>('.automations-modal-detail')!.hidden };
		first.automations.automations.set(first.automations.automations.get().filter(automation => automation.id !== 'bravo'), undefined);
		assert.deepStrictEqual({ shown, hiddenAfterRemoval: detail.hidden }, { shown: { visible: true, name: 'Bravo daily', otherHidden: true }, hiddenAfterRemoval: true });
	});

	test('details history filters exact automation identity, switches scope and opens the exact run session', async () => {
		const { container, automations, historyServices, openedRuns, widget } = setup();
		const first = createTestSession('Alpha run', { resourceId: 'local/run', status: SessionStatus.Completed }).session;
		const other = createTestSession('Bravo run', { resourceId: 'remote/run', status: SessionStatus.Completed }).session;
		historyServices.sessions.sessions = [first, other];
		automations.runs.set([
			{ id: 'one', automationId: 'alpha', sessionResource: first.resource, status: 'completed', trigger: 'manual', startedAt: '2026-02-01T10:00:00Z' },
			{ id: 'one-continued', automationId: 'alpha', sessionResource: first.resource, status: 'completed', trigger: 'manual', startedAt: '2026-02-01T12:00:00Z' },
			{ id: 'two', automationId: 'bravo', sessionResource: other.resource, status: 'completed', trigger: 'manual', startedAt: '2026-02-01T11:00:00Z' },
		], undefined);
		const rows = () => container.querySelectorAll<HTMLElement>('.automations-modal-table .monaco-list-row');
		rows()[0].click();
		const history = () => [...container.querySelectorAll('.automations-modal-history .session-title')].map(element => element.textContent);
		const firstScope = history();
		const accessible = widget.getAccessibilityContent();
		rows()[1].click();
		const secondScope = history();
		container.querySelector<HTMLElement>('.automations-modal-history .monaco-list-row')!.click();
		await Promise.resolve();
		await Promise.resolve();
		const globalMarkAllRead = container.querySelector('.automations-modal-history .automations-mark-all-read');
		container.querySelector<HTMLElement>('.automations-modal-history .monaco-list')!.focus();
		automations.automations.set(automations.automations.get().filter(automation => automation.id !== 'bravo'), undefined);
		assert.deepStrictEqual({
			firstScope, secondScope, openedRuns,
			accessibleSelected: accessible.includes('Alpha run'),
			accessibleOther: accessible.includes('Bravo run'),
			globalMarkAllRead,
			historyRemoved: container.querySelector('.automations-modal-history') === null,
			focusRestored: dom.getActiveElement() === container.querySelector('input'),
		}, { firstScope: ['Alpha run'], secondScope: ['Bravo run'], openedRuns: [other.resource.toString()], accessibleSelected: true, accessibleOther: false, globalMarkAllRead: null, historyRemoved: true, focusRestored: true });
	});

	test('selected history reveals pages reactively and resets when switching or reopening details', () => {
		const { container, automations, historyServices, click, widget } = setup();
		const sessions = Array.from({ length: 31 }, (_, index) => createTestSession(`Alpha ${index}`, {
			resourceId: `modal-history-${index}`, status: SessionStatus.Completed,
		}).session);
		historyServices.sessions.sessions = sessions;
		automations.runs.set(sessions.map((session, index) => ({
			id: `run-${index}`, automationId: 'alpha', sessionResource: session.resource,
			status: 'completed', trigger: 'manual', startedAt: new Date(Date.UTC(2026, 1, 1, 12, 31 - index)).toISOString(),
		})), undefined);
		const open = () => container.querySelector<HTMLElement>('.automations-modal-table .monaco-list-row')!.click();
		const rows = () => container.querySelectorAll('.automations-modal-history .session-title').length;
		open();
		const initial = rows();
		const includesOlderAccessibleHistory = widget.getAccessibilityContent().includes('Alpha 30');
		const more = container.querySelector<HTMLElement>('.automations-modal-history .automations-history-show-more')!;
		more.click();
		const secondPage = rows();
		container.querySelectorAll<HTMLElement>('.automations-modal-table .monaco-list-row')[1].click();
		open();
		const afterSwitch = rows();
		container.querySelector<HTMLElement>('.automations-modal-history .automations-history-show-more')!.click();
		const currentMore = container.querySelector<HTMLElement>('.automations-modal-history .automations-history-show-more')!;
		currentMore.click();
		const lastPage = { count: rows(), moreHidden: currentMore.style.display === 'none' };
		click('Close Details');
		open();
		assert.deepStrictEqual({ initial, secondPage, afterSwitch, lastPage, reopened: rows(), includesOlderAccessibleHistory }, {
			initial: 10, secondPage: 30, afterSwitch: 10, lastPage: { count: 31, moreHidden: true }, reopened: 10, includesOlderAccessibleHistory: true,
		});
	});

	test('selected details expose the prompt and read-only reason in Accessible View', () => {
		const { container, widget, click } = setup(false, [tableAutomation('alpha', 'Alpha', { prompt: 'Selected instructions', readOnlyReason: 'Provider disconnected' })]);
		container.querySelector<HTMLElement>('.automations-modal-table .monaco-list-row')!.click();
		const selected = widget.getAccessibilityContent();
		click('Close Details');
		assert.deepStrictEqual({
			prompt: selected.includes('Selected instructions'), reason: selected.includes('Provider disconnected'),
			closed: widget.getAccessibilityContent().includes('Selected instructions'),
		}, { prompt: true, reason: true, closed: false });
	});

	test('asynchronous edit failures retain the original error', async () => {
		const { failures, errors, openContextMenu } = setup();
		failures.edit = true;
		await openContextMenu(0).getActions().find(action => action.id === AutomationCommands.edit.id)!.run();
		assert.deepStrictEqual(errors, ['Failed to update automation. Edit failed asynchronously']);
	});

	test('repeated Run is guarded until dispatch settles and permits retry after failure', async () => {
		const { dispatch, runs, errors, openContextMenu } = setup();
		const pending = new DeferredPromise<IAutomationRunDispatch>();
		dispatch.result = pending.p;
		const menu = openContextMenu(0);
		const action = menu.getActions().find(action => action.id === AutomationsModalCommands.run.id)!;
		const first = action.run(menu.getActionsContext!());
		await action.run(menu.getActionsContext!());
		const pendingRequests = runs.length;
		await pending.error(new Error('Dispatch failed asynchronously'));
		await first;
		dispatch.result = Promise.resolve({ kind: 'accepted' });
		await action.run(menu.getActionsContext!());
		assert.deepStrictEqual({ pendingRequests, total: runs.length, errors }, {
			pendingRequests: 1, total: 2, errors: ['Failed to run automation. Dispatch failed asynchronously'],
		});
	});

	test('catalogue refresh repeats while visible, waits for in-flight work and stops on disposal', async () => {
		const clock = useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
		try {
			const { automations, widget } = setup();
			await clock.tickAsync(0);
			const initial = automations.refreshCalls;
			await clock.tickAsync(60_000);
			const periodic = automations.refreshCalls;
			automations.isRefreshing.set(true, undefined);
			await clock.tickAsync(120_000);
			const whileRefreshing = automations.refreshCalls;
			automations.isRefreshing.set(false, undefined);
			await clock.tickAsync(60_000);
			const resumed = automations.refreshCalls;
			widget.dispose();
			await clock.tickAsync(120_000);
			assert.deepStrictEqual({ initial, periodic, whileRefreshing, resumed, disposed: automations.refreshCalls }, {
				initial: 1, periodic: 2, whileRefreshing: 2, resumed: 3, disposed: 3,
			});
		} finally {
			clock.restore();
		}
	});

	test('accepted Run stays disabled until history reconciles or the cards recovery conditions apply', async () => {
		const { openContextMenu, automations, runs, container } = setup();
		const menu = openContextMenu(0);
		const run = menu.getActions().find(action => action.id === AutomationsModalCommands.run.id)!;
		const invoke = () => run.run(menu.getActionsContext!());
		const enabled = () => openContextMenu(0).getActions().find(action => action.id === AutomationsModalCommands.run.id)!.enabled;
		await invoke();
		await invoke();
		assert.deepStrictEqual({ calls: runs.length, enabled: enabled(), starting: container.textContent!.includes('Starting run...') }, { calls: 1, enabled: false, starting: true });
		automations.runs.set([{ id: 'accepted', automationId: 'alpha', status: 'completed', trigger: 'manual', startedAt: '2026-02-02T00:00:00Z' }], undefined);
		assert.strictEqual(enabled(), true);
		await invoke();
		automations.historyState.set('error', undefined);
		assert.strictEqual(enabled(), true);
		automations.historyState.set('ready', undefined);
		await invoke();
		automations.catalogueState.set('error', undefined);
		assert.strictEqual(enabled(), true);
	});

	test('modal row actions match cloud, event and end-date applicability', () => {
		const { automations, openContextMenu } = setup();
		automations.automations.set([tableAutomation('alpha', 'Alpha', {
			ownership: 'user', externalResource: URI.parse('https://github.com/owner/repo'),
			disableConditions: [{ kind: AutomationDisableConditionKind.AfterDate, date: '2099-01-01T00:00:00Z' }],
			cloudTrigger: { triggers: { issue_labeled: { types: ['labeled'] } } },
		})], undefined);
		const actions = () => openContextMenu(0).getActions().filter(action => action.id !== 'vs.actions.separator').map(action => action.id);
		const cloudEvent = actions();
		automations.automations.set([tableAutomation('alpha', 'Alpha')], undefined);
		assert.deepStrictEqual({ cloudEvent, local: actions() }, {
			cloudEvent: [AutomationCommands.openOnGitHub.id, AutomationsModalCommands.run.id, AutomationCommands.disable.id, AutomationCommands.removeEndDate.id, AutomationCommands.edit.id, AutomationCommands.delete.id],
			local: [AutomationsModalCommands.run.id, AutomationCommands.disable.id, AutomationCommands.duplicate.id, AutomationCommands.export.id, AutomationCommands.edit.id, AutomationCommands.delete.id],
		});
	});

	test('narrow layouts stack categories, catalogue and details without clipping controls', () => {
		const { container, widget } = setup();
		container.querySelector<HTMLElement>('.automations-modal-table .monaco-list-row')!.click();
		container.style.width = '400px';
		widget.layout();
		const root = container.querySelector<HTMLElement>('.automations-modal-widget')!;
		const bounds = (selector: string) => container.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
		const categories = bounds('.automations-modal-categories');
		const catalogue = bounds('.automations-modal-content');
		const details = bounds('.automations-modal-detail');
		const narrow = {
			stacked: categories.bottom <= catalogue.top && catalogue.bottom <= details.top,
			noHorizontalClipping: root.scrollWidth <= root.clientWidth,
			tableVisible: bounds('.automations-modal-table').height >= 100,
		};
		container.style.width = '1100px';
		widget.layout();
		assert.deepStrictEqual({ narrow, restored: !root.classList.contains('narrow') }, {
			narrow: { stacked: true, noHorizontalClipping: true, tableVisible: true }, restored: true,
		});
	});
	test('history updates when its session hydrates and is disposed when details close', () => {
		const { container, automations, historyServices, click } = setup();
		const session = createTestSession('Hydrated run', { status: SessionStatus.Completed }).session;
		automations.runs.set([{ id: 'new', automationId: 'alpha', sessionResource: session.resource, status: 'completed', trigger: 'manual', startedAt: '2026-02-01T10:00:00Z' }], undefined);
		container.querySelector<HTMLElement>('.automations-modal-table .monaco-list-row')!.click();
		const before = container.querySelector('.automations-modal-history-message')?.textContent;
		historyServices.sessions.sessions = [session];
		historyServices.sessionsChanged.fire({ added: [session], removed: [], changed: [] });
		const hydrated = container.querySelector('.automations-modal-history .session-title')?.textContent;
		click('Close Details');
		automations.runs.set([], undefined);
		historyServices.sessionsChanged.fire({ added: [], removed: [session], changed: [] });
		assert.deepStrictEqual({ before, hydrated, historyAfterClose: container.querySelector('.automations-modal-history') }, {
			before: 'Run sessions are not available yet.', hydrated: 'Hydrated run', historyAfterClose: null,
		});
	});

	test('unavailable history is not described as an empty history', () => {
		const { container, automations } = setup();
		automations.runs.set([], undefined);
		automations.catalogueState.set('unavailable', undefined);
		container.querySelector<HTMLElement>('.automations-modal-table .monaco-list-row')!.click();
		assert.deepStrictEqual(container.querySelector('.automations-modal-history-message')?.textContent, 'Some run history may be unavailable.');
	});

	test('Edit opens the latest clicked definition and cancellation makes no update', async () => {
		const { automations, openContextMenu, editDialogs, updates, container } = setup();
		const edit = openContextMenu(1).getActions().find(action => action.id === AutomationCommands.edit.id);
		assert.ok(edit);
		automations.automations.set(automations.automations.get().map(automation => automation.id === 'bravo' ? { ...automation, name: 'Latest Bravo' } : automation), undefined);
		await edit.run();
		assert.deepStrictEqual({
			existing: editDialogs[0].existing,
			updates,
			detailsHidden: container.querySelector<HTMLElement>('.automations-modal-detail')?.hidden,
		}, { existing: automations.getAutomation('bravo'), updates: [], detailsHidden: true });
	});

	test('Edit uses guarded updates and surfaces conflicts and feature-disable during save', async () => {
		const { automations, openContextMenu, editDialogs, updates, configurationService } = setup();
		const edit = openContextMenu(1).getActions().find(action => action.id === AutomationCommands.edit.id);
		assert.ok(edit);
		await edit.run();
		const options = editDialogs[0];
		assert.ok(options.commit);
		const result = { kind: 'update' as const, id: 'bravo', value: { name: 'Renamed' } };
		await options.commit(result);
		assert.deepStrictEqual(updates, [{ id: 'bravo', patch: { name: 'Renamed' }, expected: automations.getAutomation('bravo') }]);
		automations.conflict = true;
		await assert.rejects(options.commit(result), /changed while the dialog was open/);
		await configurationService.setUserConfiguration(CHAT_AUTOMATIONS_ENABLED_SETTING, false);
		await assert.rejects(options.commit(result), /disabled before the change could be saved/);
	});

	test('Run uses the shared runner and latest definition while status follows provider publications', async () => {
		const { automations, openContextMenu, runs, container } = setup();
		const menu = openContextMenu(1);
		const run = menu.getActions().find(action => action.id === AutomationsModalCommands.run.id);
		assert.ok(run);
		automations.automations.set(automations.automations.get().map(automation => automation.id === 'bravo' ? { ...automation, prompt: 'Latest prompt' } : automation), undefined);
		await run.run(menu.getActionsContext!());
		const running = { id: 'new-run', automationId: 'bravo', status: 'running' as const, trigger: 'manual' as const, startedAt: '2026-02-02T09:00:00Z' };
		automations.runs.set([running], undefined);
		const runningShown = container.querySelectorAll('.monaco-list-row')[1].textContent?.includes('Starting run...');
		automations.runs.set([{ ...running, status: 'completed' }], undefined);
		assert.deepStrictEqual({
			requests: runs.map(automation => ({ id: automation.id, prompt: automation.prompt })),
			runningShown,
			completedShown: container.querySelectorAll('.monaco-list-row')[1].textContent?.includes('Completed'),
		}, { requests: [{ id: 'bravo', prompt: 'Latest prompt' }], runningShown: true, completedShown: true });
	});

	test('last-run text preserves provider status and newer local progress for every surface', () => {
		const { container, automations, widget, historyServices } = setup(false, [tableAutomation('alpha', 'Alpha')]);
		const session = createTestSession('Alpha run', { status: SessionStatus.Completed }).session;
		historyServices.sessions.sessions = [session];
		const run = {
			id: 'run', automationId: 'alpha', sessionResource: session.resource,
			externalResource: URI.parse('https://github.com/owner/repo/tasks/run'),
			status: 'failed' as const, trigger: 'manual' as const, startedAt: '2026-02-01T10:00:00Z',
		};
		const snapshots: boolean[][] = [];
		const capture = (label: string) => {
			const row = container.querySelector<HTMLElement>('.automations-modal-table .monaco-list-row')!;
			row.click();
			snapshots.push([
				row.textContent!.includes(label), row.getAttribute('aria-label')!.includes(label),
				container.querySelector('.automations-modal-detail-content')!.textContent!.includes(label),
				widget.getAccessibilityContent().includes(`Last run: ${label}`),
			]);
		};
		automations.runs.set([{ ...run, statusDescription: 'Cancelled' }], undefined);
		capture('Cancelled');
		automations.runs.set([{ ...run, status: 'running', needsInput: true, statusDescription: 'Needs input on GitHub' }], undefined);
		capture('Needs input on GitHub');
		automations.runs.set([{ ...run, status: 'completed' }], undefined);
		const needsInput = observableValue<{ title: string } | undefined>('needsInput', { title: 'Approval' });
		historyServices.chatModels.set([upcastPartial<IChatModel>({
			sessionResource: session.resource, requestInProgress: constObservable(false), requestNeedsInput: needsInput,
			lastRequestObs: constObservable(upcastPartial<IChatRequestModel>({ timestamp: Date.now() })),
			onDidChange: BaseEvent.None, getRequests: () => [],
		})], undefined);
		capture('Needs input');
		needsInput.set(undefined, undefined);
		capture('Completed');
		assert.deepStrictEqual(snapshots, Array.from({ length: 4 }, () => [true, true, true, true]));
	});

	test('missing last-run history is unknown until settled without disabling mutations', () => {
		const { container, automations, widget } = setup(false, [tableAutomation('alpha', 'Alpha')]);
		automations.runs.set([], undefined);
		const snapshots = (['loading', 'error', 'unavailable', 'ready'] as const).map(state => {
			automations.historyState.set(state, undefined);
			const row = container.querySelector<HTMLElement>('.automations-modal-table .monaco-list-row')!;
			row.click();
			return {
				lastRun: row.querySelectorAll('.automations-modal-cell')[3].textContent,
				never: widget.getAccessibilityContent().includes('Last run: Never'),
				canChange: row.querySelector('[role="checkbox"]')!.getAttribute('aria-disabled') !== 'true',
			};
		});
		assert.deepStrictEqual(snapshots, [
			{ lastRun: 'Unknown', never: false, canChange: true },
			{ lastRun: 'Unknown', never: false, canChange: true },
			{ lastRun: 'Unknown', never: false, canChange: true },
			{ lastRun: 'Never', never: true, canChange: true },
		]);
		const incompleteCatalogue = (['error', 'loading', 'unavailable'] as const).map(state => {
			automations.catalogueState.set(state, undefined);
			return container.querySelectorAll('.automations-modal-table .automations-modal-cell')[3].textContent;
		});
		assert.deepStrictEqual(incompleteCatalogue, ['Unknown', 'Unknown', 'Unknown']);
	});

	test('enabled ordering uses state rather than translated labels', () => {
		const { container, widget, names } = setup();
		widget.localizeEnabledLabels();
		const sort = container.querySelector<HTMLSelectElement>('select[aria-label="Sort automations"]')!;
		sort.selectedIndex = [...sort.options].findIndex(option => option.text === 'Enabled First');
		sort.dispatchEvent(new Event('change', { bubbles: true }));
		const enabledFirst = names();
		sort.selectedIndex = [...sort.options].findIndex(option => option.text === 'Disabled First');
		sort.dispatchEvent(new Event('change', { bubbles: true }));
		assert.deepStrictEqual({ enabledFirst, disabledFirst: names() }, {
			enabledFirst: ['Bravo daily', 'Alpha manual', 'Charlie shared'],
			disabledFirst: ['Charlie shared', 'Alpha manual', 'Bravo daily'],
		});
	});

	test('stale Edit and Run menus recheck provider capabilities before acting', async () => {
		const { automations, openContextMenu, editDialogs, runs, errors } = setup();
		const menu = openContextMenu(1);
		const actions = menu.getActions();
		automations.mutable = false;
		automations.runnable = false;
		await actions.find(action => action.id === AutomationCommands.edit.id)!.run();
		await actions.find(action => action.id === AutomationsModalCommands.run.id)!.run(menu.getActionsContext!());
		assert.deepStrictEqual({ editDialogs, runs, errors: errors.length }, { editDialogs: [], runs: [], errors: 2 });
	});

	test('modal menu contributions do not enter the cards menu', async () => {
		const extra = store.add(MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalRowContext, {
			command: { id: 'test.modalAction', title: 'Modal Action' }, group: '3_copy', order: 1,
		}));
		store.add(MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalToolbar, {
			command: { id: 'test.modalButton', title: 'Modal Button' }, group: 'navigation', order: 4,
		}));
		const { openContextMenu, click, commands } = setup();
		click('Modal Button');
		const ids = openContextMenu(0).getActions().map(action => action.id);
		assert.deepStrictEqual({
			modalHasAction: ids.includes('test.modalAction'),
			buttonCommand: commands.at(-1)?.id,
			deleteIsLast: ids.at(-1),
			cardsHaveAction: MenuRegistry.getMenuItems(AgentsWindowMenus.AutomationCardContext).some(item => isIMenuItem(item) && item.command.id === 'test.modalAction'),
		}, { modalHasAction: true, buttonCommand: 'test.modalButton', deleteIsLast: 'sessions.automations.delete', cardsHaveAction: false });
		extra.dispose();
	});

	test('history exposes existing session-list visibility actions under the same predicates', () => {
		const { openContextMenu, menuService } = setup();
		const context = openContextMenu(0).contextKeyService!;
		const actions = (listed: boolean, archived: boolean, automation: boolean) => {
			const row = context.createOverlay([
				[SessionItemIsAutomationContext.key, automation],
				[SessionItemIsInSessionsListContext.key, listed],
				[SessionIsArchivedContext.key, archived],
			]);
			return menuService.getMenuActions(AgentsWindowMenus.AutomationsModalHistoryContext, row)
				.flatMap(([, items]) => items).filter(item => [SHOW_AUTOMATION_SESSION_IN_LIST_COMMAND_ID, HIDE_AUTOMATION_SESSION_FROM_LIST_COMMAND_ID].includes(item.id)).map(item => item.id);
		};
		assert.deepStrictEqual([actions(false, false, true), actions(true, false, true), actions(false, true, true), actions(false, false, false)], [
			[SHOW_AUTOMATION_SESSION_IN_LIST_COMMAND_ID], [HIDE_AUTOMATION_SESSION_FROM_LIST_COMMAND_ID], [], [],
		]);
	});

	test('view-options discovery and row capabilities stay scoped to their modal', () => {
		const first = setup(false, [
			tableAutomation('own', 'Own'),
			tableAutomation('other', 'Other shared', { ownership: 'repository', isCreatedByCurrentUser: false }),
		]);
		const second = setup();
		const firstContext = first.openContextMenu(0).contextKeyService!;
		const secondContext = second.openContextMenu(0).contextKeyService!;
		const firstOptions = getFlatActionBarActions(first.menuService.getMenuActions(AgentsWindowMenus.AutomationsModalViewOptions, firstContext));
		const secondOptions = getFlatActionBarActions(second.menuService.getMenuActions(AgentsWindowMenus.AutomationsModalViewOptions, secondContext));
		assert.deepStrictEqual({
			firstOptions: firstOptions.filter(action => action.id !== 'vs.actions.separator').map(action => action.id),
			secondOptions: secondOptions.map(action => action.id),
			rootIsModal: first.contextKeyService.getContextKeyValue('automationsModal') === true,
			secondCanDelete: secondContext.getContextKeyValue('automationModalRowCanDelete'),
		}, {
			firstOptions: ['sessions.automations.refresh', 'sessions.automations.toggleShowSharedByOthers'],
			secondOptions: ['sessions.automations.refresh'],
			rootIsModal: false,
			secondCanDelete: true,
		});
	});

	test('create/import submenu uses real contributions instead of an embedded action list', () => {
		const { container, commands } = setup(false, []);
		const manual = container.querySelector<HTMLElement>('.monaco-button-dropdown .monaco-text-button');
		assert.ok(manual);
		manual.click();
		assert.deepStrictEqual({ label: manual.textContent, command: commands.at(-1)?.id }, {
			label: 'Create Manually', command: 'sessionsView.newAutomation',
		});
	});

	test('a local view option remains reachable when cloud automations are disabled', async () => {
		store.add(MenuRegistry.appendMenuItem(AgentsWindowMenus.AutomationsModalViewOptions, {
			command: { id: 'test.localViewOption', title: 'Local View Option' }, group: '2_organize', order: 1,
		}));
		const { configurationService, openContextMenu, menuService } = setup();
		await configurationService.setUserConfiguration(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING, false);
		configurationService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING,
			affectedKeys: new Set([CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING]),
			change: { keys: [CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING], overrides: [] },
			source: ConfigurationTarget.USER,
		});
		const context = openContextMenu(0).contextKeyService!;
		const toolbar = getFlatActionBarActions(menuService.getMenuActions(AgentsWindowMenus.AutomationsModalToolbar, context));
		const options = toolbar.find(action => action instanceof SubmenuItemAction && action.item.submenu === AgentsWindowMenus.AutomationsModalViewOptions);
		assert.ok(options instanceof SubmenuItemAction);
		assert.deepStrictEqual(options.actions.map(action => action.id), ['test.localViewOption']);
	});

	test('three definitions share real metadata, stable sorting and text/category filters', () => {
		const { container, widget, click, names } = setup();
		const initial = names();
		const sort = container.querySelector<HTMLSelectElement>('select[aria-label="Sort automations"]');
		assert.ok(sort);
		sort.selectedIndex = 1;
		sort.dispatchEvent(new Event('change', { bubbles: true }));
		const reversed = names();
		click('Repository (1)');
		const repository = names();
		click('All automations (3)');
		const input = container.querySelector<HTMLInputElement>('input');
		assert.ok(input);
		input.value = 'manual';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		assert.deepStrictEqual({ initial, reversed, repository, filtered: names(), summary: widget.getAccessibilityContent().includes('Manual'), host: widget.getAccessibilityContent().includes('Runs on This Computer') }, {
			initial: ['Alpha manual', 'Bravo daily', 'Charlie shared'],
			reversed: ['Charlie shared', 'Bravo daily', 'Alpha manual'],
			repository: ['Charlie shared'],
			filtered: ['Alpha manual'],
			summary: true,
			host: true,
		});
	});

	test('enable checkbox delegates to the existing guarded command without optimistic state', async () => {
		const { container, automations, commands } = setup();
		const checkbox = container.querySelector<HTMLElement>('[role="checkbox"]');
		assert.ok(checkbox);
		checkbox.click();
		await Promise.resolve();
		assert.deepStrictEqual({
			command: commands[0]?.id,
			id: (commands[0]?.args[0] as IAutomationDescriptor).id,
			enabled: automations.getAutomation('alpha')?.enabled,
			checked: checkbox.getAttribute('aria-checked'),
		}, { command: 'sessions.automations.disable', id: 'alpha', enabled: true, checked: 'true' });
	});

	test('provider loss disables mutations but retains readable catalogue and reasons', () => {
		const { container, automations, widget } = setup();
		automations.mutable = false;
		automations.unavailableProviders.set([{ id: 'local', label: 'This Computer', unavailableReasonCode: 'disconnected' }], undefined);
		automations.catalogueState.set('unavailable', undefined);
		assert.deepStrictEqual({
			disabled: [...container.querySelectorAll('[role="checkbox"]')].every(element => element.getAttribute('aria-disabled') === 'true'),
			rows: container.querySelectorAll('.monaco-list-row').length,
			reason: widget.getAccessibilityContent().includes('disconnected'),
		}, { disabled: true, rows: 3, reason: true });
	});

	test('follows main visibility for shared automations created by others', async () => {
		const { automations, names, openContextMenu, menuService } = setup();
		automations.automations.set([
			...automations.automations.get(),
			tableAutomation('other', 'Other shared', { ownership: 'repository', isCreatedByCurrentUser: false }),
		], undefined);
		const action = () => getFlatActionBarActions(menuService.getMenuActions(AgentsWindowMenus.AutomationsModalViewOptions, openContextMenu(0).contextKeyService!))
			.find(action => action.id === AutomationCommands.showSharedByOthers.id)!;
		const snapshot = () => ({ names: names(), checked: action().checked });
		const hidden = snapshot();
		await action().run();
		const shown = snapshot();
		await action().run();
		assert.deepStrictEqual({ hidden, shown, hiddenAgain: snapshot() }, {
			hidden: { names: ['Alpha manual', 'Bravo daily', 'Charlie shared'], checked: false },
			shown: { names: ['Alpha manual', 'Bravo daily', 'Charlie shared', 'Other shared'], checked: true },
			hiddenAgain: { names: ['Alpha manual', 'Bravo daily', 'Charlie shared'], checked: false },
		});
	});

	test('provider acknowledgement during a pending toggle keeps the row editable', async () => {
		const { container, commands } = setup(true);
		const initial = container.querySelector<HTMLElement>('[role="checkbox"]');
		assert.ok(initial);
		initial.focus();
		initial.click();
		await Promise.resolve();
		await Promise.resolve();
		const checkbox = container.querySelector<HTMLElement>('[role="checkbox"]');
		assert.ok(checkbox);
		assert.deepStrictEqual({
			command: commands[0]?.id,
			checked: checkbox.getAttribute('aria-checked'),
			label: checkbox.getAttribute('aria-label'),
			disabled: checkbox.getAttribute('aria-disabled') === 'true',
			focused: checkbox === dom.getActiveElement(),
		}, { command: 'sessions.automations.disable', checked: 'false', label: 'Enable automation Alpha manual', disabled: false, focused: true });
	});

	test('authoritative updates preserve filtered state and disposal removes the presentation', () => {
		const { container, automations, widget, click, names } = setup();
		click('Personal (2)');
		automations.automations.set([tableAutomation('new', 'New definition', { enabled: false })], undefined);
		const updated = names();
		widget.dispose();
		automations.automations.set([], undefined);
		assert.deepStrictEqual({ updated, children: container.childElementCount, refreshes: automations.refreshCalls }, {
			updated: ['New definition'], children: 0, refreshes: 1,
		});
	});

	test('narrow table scrolls headers and cells together and returns to a wide layout', () => {
		const { container, widget } = setup();
		container.style.width = '400px';
		widget.layout();
		const viewport = container.querySelector<HTMLElement>('.automations-modal-table-viewport');
		const header = [...container.querySelectorAll<HTMLElement>('.monaco-table-th')].at(-1);
		const cell = container.querySelector<HTMLElement>('.monaco-list-row .monaco-table-td:last-child');
		assert.ok(viewport && header && cell);
		let bubbled = false;
		const listener = store.add(dom.addDisposableListener(viewport, 'wheel', () => { bubbled = true; }));
		cell.dispatchEvent(new WheelEvent('wheel', { deltaX: 120, bubbles: true, cancelable: true }));
		listener.dispose();
		assert.ok(bubbled);
		viewport.scrollLeft = viewport.scrollWidth;
		const narrow = {
			scrolled: viewport.scrollLeft > 0,
			aligned: Math.abs(header.getBoundingClientRect().left - cell.getBoundingClientRect().left) < 1,
		};
		container.style.width = '1100px';
		widget.layout();
		assert.deepStrictEqual({ narrow, wideScroll: viewport.scrollLeft }, { narrow: { scrolled: true, aligned: true }, wideScroll: 0 });
	});
});
