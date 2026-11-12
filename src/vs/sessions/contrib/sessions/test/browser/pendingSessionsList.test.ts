/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import '../../../../../workbench/browser/actions/listCommands.js';
import { ISessionsListModelService, SessionsListModelService } from '../../../../../workbench/contrib/sessions/browser/sessionsListModelService.js';
import { IPendingSessionItem, IPendingSessionSection } from '../../../../../workbench/contrib/sessions/browser/views/pendingSessions.js';
import { SessionsGrouping, SessionsSorting } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { TestSessionsList } from '../../../../../workbench/contrib/sessions/test/browser/views/testSessionsList.js';
import { createListHarness, createTestSession, IListHarness } from './sessionsListTestUtils.js';

suite('Sessions - pending list items', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function item(id: string, options: Partial<IPendingSessionItem> = {}): IPendingSessionItem {
		return {
			pendingSession: true, id, kind: 'draft', title: id, description: 'Unsent request',
			providerId: 'test', sessionType: 'copilot', harness: 'copilot', environmentId: 'local', applicationId: 'vscode',
			actions: [], open: async () => { }, ...options,
		};
	}

	function openFocusedItem(harness: IListHarness, list: TestSessionsList): void {
		list.focus();
		if (!mainWindow.document.hasFocus()) {
			list.element.querySelector('.monaco-list')!.dispatchEvent(new FocusEvent('focus'));
		}
		harness.instantiationService.invokeFunction(CommandsRegistry.getCommand('list.select')!.handler);
	}

	for (const grouping of [SessionsGrouping.Workspace, SessionsGrouping.Repository, SessionsGrouping.Environment, SessionsGrouping.Date, SessionsGrouping.Inbox]) {
		test(`drafts and new-session schedules share Drafts after Pinned in ${grouping}`, () => {
			const pinned = createTestSession('pinned').session;
			const regular = createTestSession('regular').session;
			const harness = createListHarness(disposables, [pinned, regular], { pinnedSessionIds: new Set(['pinned']) });
			if (grouping === SessionsGrouping.Inbox) {
				const model = disposables.add(harness.instantiationService.createInstance(SessionsListModelService));
				harness.instantiationService.stub(ISessionsListModelService, model);
				model.pinSession(pinned);
			}
			const pendingSections = observableValue<readonly IPendingSessionSection[]>('pending', [
				{ id: 'drafts', label: 'Drafts', items: [item('z-draft'), item('a-draft')] },
			]);
			const scheduledSessions = observableValue<readonly IPendingSessionItem[]>('scheduled', [item('send-later', { kind: 'scheduled' })]);
			const create = () => disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(400, 800), {
				grouping: () => grouping, sorting: () => SessionsSorting.Updated, pendingSections,
				scheduledSessions, onSessionOpen: () => { },
			}));
			const list = create();
			list.layout(800, 400);
			const headers = list.getTreeSnapshot().flatMap(node => node.type === 'section' ? [node.id] : []).slice(0, 2);
			const scheduledRow = !!list.getItemRow({ pendingSession: 'send-later' });
			const draftTitles = [...list.element.querySelectorAll('.session-title')].map(element => element.textContent).filter(title => title?.endsWith('-draft'));
			list.setItemCollapsed({ section: 'drafts' }, true);
			const scheduledCollapsed = !list.getItemRow({ pendingSession: 'send-later' });
			pendingSections.set([], undefined);
			const scheduledOnlySection = list.getTreeSnapshot().some(node => node.type === 'section' && node.id === 'drafts');
			scheduledSessions.set([], undefined);
			list.update();
			const empty = list.getTreeSnapshot().filter(node => node.type !== 'session').map(node => node.id);
			pendingSections.set([{ id: 'drafts', label: 'Drafts', items: [item('reappeared')] }], undefined);
			const restored = create();
			const restoredSection = restored.getTreeSnapshot().find(node => node.type !== 'session' && node.id === 'drafts');
			assert.deepStrictEqual({
				headers, draftTitles, scheduledRow, scheduledCollapsed, scheduledOnlySection,
				emptyHasPending: empty.includes('drafts') || empty.includes('scheduled'),
				restoredCollapsed: restoredSection?.type === 'section' && restoredSection.collapsed,
			}, { headers: ['pinned', 'drafts'], draftTitles: ['z-draft', 'a-draft'], scheduledRow: true, scheduledCollapsed: true, scheduledOnlySection: true, emptyHasPending: false, restoredCollapsed: true });
		});
	}

	test('scheduled-only Drafts retains schedule metadata and works without ordinary saved drafts', () => {
		const harness = createListHarness(disposables, []);
		const pendingSections = observableValue<readonly IPendingSessionSection[]>('drafts', [
			{ id: 'drafts', label: 'Drafts', items: [item('ordinary-draft')] },
		]);
		const scheduledSessions = observableValue<readonly IPendingSessionItem[]>('scheduled', [
			item('Follow up', { kind: 'scheduled', folderUri: URI.file('/workspace/vscode'), description: 'Scheduled for tomorrow at 10:00 AM' }),
		]);
		const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(400, 800), {
			grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
			pendingSections, scheduledSessions, schedulingEnabled: constObservable(true), onSessionOpen: () => { },
		}));
		list.layout(800, 400);
		list.filters.setScheduledOnly(true);
		const row = list.getItemRow({ pendingSession: 'Follow up' })!;
		const filtered = {
			draftHidden: !list.getItemRow({ pendingSession: 'ordinary-draft' }),
			description: row.querySelector('.session-details-row')?.textContent,
			clock: mainWindow.getComputedStyle(row.querySelector('.session-scheduled-indicator')!).display,
			ariaLabel: row.getAttribute('aria-label'),
		};
		pendingSections.set([], undefined);
		const schedulesWithoutSavedDrafts = [...list.element.querySelectorAll('.session-section-label')].map(element => element.textContent);
		scheduledSessions.set([], undefined);
		list.update();
		assert.deepStrictEqual({
			filtered, schedulesWithoutSavedDrafts,
			emptySections: list.element.querySelectorAll('.session-section-label').length,
		}, {
			filtered: {
				draftHidden: true, description: 'vscode - Scheduled for tomorrow at 10:00 AM', clock: 'flex',
				ariaLabel: 'Follow up, scheduled, vscode - Scheduled for tomorrow at 10:00 AM',
			},
			schedulesWithoutSavedDrafts: ['Drafts'], emptySections: 0,
		});
	});

	test('omitting pending input leaves normal row dispatch and session inventory unchanged', async () => {
		const session = createTestSession('normal').session;
		const harness = createListHarness(disposables, [session]);
		harness.instantiationService.stub(IListService, disposables.add(new ListService()));
		const opened: string[] = [];
		const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(), {
			grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
			onSessionOpen: resource => { opened.push(resource.toString()); },
		}));
		list.layout(400, 400);
		list.setFocusedItem({ session: session.resource });
		openFocusedItem(harness, list);
		await timeout(0);
		assert.deepStrictEqual({
			opened, inventory: list.getVisibleSessions().map(session => session.sessionId),
			pending: list.getTreeSnapshot().some(node => node.type === 'section' && (node.id === 'drafts' || node.id === 'scheduled')),
		}, { opened: [session.resource.toString()], inventory: ['normal'], pending: false });
	});

	for (const indentItems of [false, true]) {
		test(`draft and scheduled rows use normal session dots and indentation with indentItems=${indentItems}`, () => {
			const session = createTestSession('normal').session;
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(IConfigurationService, new TestConfigurationService({ 'sessions.list.indentItems': indentItems }));
			});
			const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(400, 800), {
				grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
				pendingSections: constObservable<readonly IPendingSessionSection[]>([
					{ id: 'drafts', label: 'Drafts', items: [item('draft')] },
				]), scheduledSessions: constObservable([item('scheduled', { kind: 'scheduled' })]), onSessionOpen: () => { },
			}));
			list.layout(800, 400);
			const draft = list.getItemRow({ pendingSession: 'draft' })!.querySelector<HTMLElement>('.session-item')!;
			for (const size of [2, 6, 16]) {
				list.element.style.setProperty(`--vscode-spacing-size${size * 10}`, `${size}px`);
			}
			const normal = list.getItemRow({ session: session.resource })!.querySelector<HTMLElement>('.session-item')!;
			const scheduled = list.getItemRow({ pendingSession: 'scheduled' })!.querySelector<HTMLElement>('.session-item')!;
			const appearance = (element: HTMLElement) => ({
				icon: element.querySelector('.session-icon > span')?.className,
				indent: mainWindow.getComputedStyle(element).marginLeft,
			});
			assert.deepStrictEqual([appearance(draft), appearance(scheduled)], [appearance(normal), appearance(normal)]);
		});
	}

	test('keyboard opens pending items without normal session actions, and context actions disable for multi-select', async () => {
		const harness = createListHarness(disposables, []);
		harness.instantiationService.stub(IListService, disposables.add(new ListService()));
		let actions: readonly IAction[] = [];
		harness.instantiationService.stub(IContextMenuService, new class extends mock<IContextMenuService>() {
			override showContextMenu(delegate: IContextMenuDelegate): void { actions = delegate.getActions(); }
		});
		const opened: string[] = [];
		let discarded = 0;
		const first = item('first', {
			open: async () => { opened.push('pending'); },
			actions: [toAction({ id: 'discard', label: 'Discard Draft', run: () => { discarded++; } })],
		});
		const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(), {
			grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
			pendingSections: constObservable<readonly IPendingSessionSection[]>([{ id: 'drafts', label: 'Drafts', items: [first, item('second')] }]),
			onSessionOpen: () => { opened.push('session'); },
		}));
		list.layout(400, 400);
		list.setFocusedItem({ pendingSession: 'first' });
		openFocusedItem(harness, list);
		const tree = list.element.querySelector('.monaco-list')!;
		await timeout(0);
		tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true }));
		tree.dispatchEvent(new KeyboardEvent('keyup', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true }));
		const single = actions.map(action => [action.id, action.enabled]);
		await actions[0]?.run();
		list.setSelectedItems([{ pendingSession: 'first' }, { pendingSession: 'second' }]);
		tree.dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true }));
		tree.dispatchEvent(new KeyboardEvent('keyup', { key: 'F10', keyCode: 121, shiftKey: true, bubbles: true }));
		const multiple = actions.map(action => [action.id, action.enabled]);
		await actions[0]?.run();
		const row = list.getItemRow({ pendingSession: 'first' });
		assert.deepStrictEqual({
			opened, single, multiple, discarded,
			draggable: row?.draggable, normalInventory: list.getVisibleSessions(),
			focusedSessions: list.getFocusedSessions(),
			ariaLabel: row?.getAttribute('aria-label'),
		}, {
			opened: ['pending'], single: [['discard', true]], multiple: [['discard', false]], discarded: 1,
			draggable: false, normalInventory: [], focusedSessions: [],
			ariaLabel: 'first, draft, Unsent request',
		});
	});

	test('pending search matches descriptions and workspace paths without leaving empty sections', async () => {
		const harness = createListHarness(disposables, []);
		const container = harness.createContainer();
		const findWidgetContainer = append(container, $('div'));
		const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, container, {
			grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created, findWidgetContainer,
			pendingSections: constObservable<readonly IPendingSessionSection[]>([
				{ id: 'drafts', label: 'Drafts', items: [item('Fix layout', { folderUri: URI.file('/workspace/editor'), description: 'Tomorrow afternoon' })] },
			]),
			scheduledSessions: constObservable([item('Other task', { kind: 'scheduled' })]),
			onSessionOpen: () => { },
		}));
		list.layout(600, 400);
		list.openFind();
		const input = findWidgetContainer.querySelector<HTMLInputElement>('input')!;
		input.value = 'editor tomorrow';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		const matching = {
			titles: [...list.element.querySelectorAll('.session-title')].map(element => element.textContent),
			headers: [...list.element.querySelectorAll('.session-section-label')].map(element => element.textContent),
		};
		input.value = 'unmatched';
		input.dispatchEvent(new mainWindow.Event('input', { bubbles: true }));
		const unmatched = list.element.querySelectorAll('.session-section-label').length;
		list.closeFind();
		await timeout(350);
		assert.deepStrictEqual({ matching, unmatched }, { matching: { titles: ['Fix layout'], headers: ['Drafts'] }, unmatched: 0 });
	});

	test('scheduled filtering and indicators update without duplicating conversations or affecting the disabled feature', () => {
		const scheduled = createTestSession('scheduled').session;
		const normal = createTestSession('normal').session;
		const harness = createListHarness(disposables, [scheduled, normal]);
		const schedulingEnabled = observableValue('enabled', true);
		const scheduledSessionResources = observableValue<ReadonlySet<string>>('scheduled resources', new Set([scheduled.resource.toString()]));
		const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(400, 800), {
			grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
			schedulingEnabled, scheduledSessionResources,
			pendingSections: constObservable<readonly IPendingSessionSection[]>([{ id: 'drafts', label: 'Drafts', items: [item('draft')] }]),
			onSessionOpen: () => { },
		}));
		list.layout(800, 400);
		const row = list.getItemRow({ session: scheduled.resource })!;
		const indicator = row.querySelector<HTMLElement>('.session-scheduled-indicator')!;
		const before = { indicator: mainWindow.getComputedStyle(indicator).display, aria: row.getAttribute('aria-label')?.includes('has scheduled messages') };
		list.filters.setScheduledOnly(true);
		const filtered = list.getVisibleSessions().map(session => session.sessionId);
		const draftHidden = !list.getItemRow({ pendingSession: 'draft' });
		scheduledSessionResources.set(new Set(), undefined);
		list.update();
		const afterDispatch = list.getVisibleSessions().map(session => session.sessionId);
		schedulingEnabled.set(false, undefined);
		list.update();
		assert.deepStrictEqual({
			before, filtered, draftHidden, afterDispatch,
			disabled: list.getVisibleSessions().map(session => session.sessionId).sort(),
			indicatorHidden: mainWindow.getComputedStyle(list.getItemRow({ session: scheduled.resource })!.querySelector('.session-scheduled-indicator')!).display,
		}, {
			before: { indicator: 'flex', aria: true }, filtered: ['scheduled'], draftHidden: true, afterDispatch: [],
			disabled: ['normal', 'scheduled'], indicatorHidden: 'none',
		});
	});

	test('pending filtering composes harness, environment and application with strict Inbox workspace scope', () => {
		const harness = createListHarness(disposables, []);
		let grouping = SessionsGrouping.Workspace;
		const folder = URI.file('/work/project');
		const drafts = [
			item('local', { folderUri: folder }),
			item('remote', { folderUri: folder, environmentId: 'remote' }),
			item('claude', { folderUri: folder, harness: 'claude' }),
			item('external', { folderUri: folder, applicationId: 'cli' }),
			item('no-workspace', { isQuickChat: true }),
			item('unknown-workspace'),
		];
		const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(400, 800), {
			grouping: () => grouping, sorting: () => SessionsSorting.Created,
			pendingSections: constObservable<readonly IPendingSessionSection[]>([{ id: 'drafts', label: 'Drafts', items: drafts }]), onSessionOpen: () => { },
		}));
		list.layout(800, 400);
		const visible = () => drafts.filter(item => !!list.getItemRow({ pendingSession: item.id })).map(item => item.id);
		list.filters.setExcluded({ kind: 'harness', id: 'claude' }, true);
		list.filters.setExcluded({ kind: 'environment', id: 'remote' }, true);
		const ordinary = visible();
		grouping = SessionsGrouping.Inbox;
		list.filters.setInboxWorkspace({ environment: 'remote', resource: getComparisonKey(folder), label: 'Project' });
		const inbox = visible();
		list.filters.setInboxEnvironment({ id: 'local', label: 'Local' });
		list.filters.setInboxWorkspace('none');
		const noWorkspace = visible();
		list.filters.setInboxWorkspace({ environment: 'missing', resource: getComparisonKey(folder), label: 'Missing host' });
		const unavailable = visible();
		assert.deepStrictEqual({ ordinary, inbox, noWorkspace, unavailable }, {
			ordinary: ['local', 'no-workspace', 'unknown-workspace'], inbox: ['remote'], noWorkspace: ['no-workspace'], unavailable: [],
		});
	});
});
