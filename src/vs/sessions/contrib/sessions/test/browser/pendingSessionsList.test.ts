/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { $, append, isHTMLElement } from '../../../../../base/browser/dom.js';
import { IContextMenuDelegate } from '../../../../../base/browser/contextmenu.js';
import { Gesture } from '../../../../../base/browser/touch.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import '../../../../../workbench/browser/actions/listCommands.js';
import { IChatScheduledRequest } from '../../../../../workbench/contrib/chat/common/model/chatViewModel.js';
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
			const initialSection = list.getTreeSnapshot().find(node => node.type === 'section' && node.id === 'drafts');
			const count = list.getItemRow({ section: 'drafts' })!.querySelector<HTMLElement>('.session-section-count')!;
			const initial = { collapsed: initialSection?.type === 'section' && initialSection.collapsed, count: count.textContent, countVisible: mainWindow.getComputedStyle(count).display !== 'none' };
			list.setItemCollapsed({ section: 'drafts' }, false);
			const expandedSection = create().getTreeSnapshot().find(node => node.type === 'section' && node.id === 'drafts');
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
				initial, expandedRestored: expandedSection?.type === 'section' && !expandedSection.collapsed,
				headers, draftTitles, scheduledRow, scheduledCollapsed, scheduledOnlySection,
				emptyHasPending: empty.includes('drafts') || empty.includes('scheduled'),
				restoredCollapsed: restoredSection?.type === 'section' && restoredSection.collapsed,
			}, { initial: { collapsed: true, count: '3', countVisible: true }, expandedRestored: true, headers: ['pinned', 'drafts'], draftTitles: ['z-draft', 'a-draft'], scheduledRow: true, scheduledCollapsed: true, scheduledOnlySection: true, emptyHasPending: false, restoredCollapsed: true });
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
		list.setItemCollapsed({ section: 'drafts' }, false);
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
			list.setItemCollapsed({ section: 'drafts' }, false);
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
		list.setItemCollapsed({ section: 'drafts' }, false);
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

	test('drafts expose only Delete as a focus-revealed inline action without opening the row', async () => {
		const harness = createListHarness(disposables, []);
		const invoked: string[] = [];
		const draft = item('draft', {
			open: async () => { invoked.push('open'); },
			actions: [
				toAction({ id: 'sessions.drafts.resume', label: 'Resume Draft', class: ThemeIcon.asClassName(Codicon.play), run: () => { invoked.push('resume'); } }),
				toAction({ id: 'sessions.drafts.delete', label: 'Delete Draft', class: ThemeIcon.asClassName(Codicon.trash), run: () => { invoked.push('delete'); } }),
			],
		});
		const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(), {
			grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
			pendingSections: constObservable<readonly IPendingSessionSection[]>([{ id: 'drafts', label: 'Drafts', items: [draft] }]),
			onSessionOpen: () => { invoked.push('session'); },
		}));
		list.layout(400, 400);
		list.setItemCollapsed({ section: 'drafts' }, false);
		const row = list.getItemRow({ pendingSession: 'draft' })!;
		const toolbar = row.querySelector<HTMLElement>('.session-title-toolbar')!;
		const resting = mainWindow.getComputedStyle(toolbar).display;
		list.setFocusedItem({ pendingSession: 'draft' });
		const focused = mainWindow.getComputedStyle(toolbar).display;
		const actions = [...toolbar.querySelectorAll<HTMLElement>('.action-label')];
		actions.forEach(action => action.click());
		await timeout(0);
		assert.deepStrictEqual({
			resting, focused, invoked,
			labels: actions.map(action => action.getAttribute('aria-label')),
			icons: actions.map(action => ['codicon-play', 'codicon-trash'].filter(icon => action.classList.contains(icon))),
			overflow: !!toolbar.querySelector('.codicon-ellipsis'),
		}, {
			resting: 'none', focused: 'block', invoked: ['delete'],
			labels: ['Delete Draft'], icons: [['codicon-trash']], overflow: false,
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
		list.setItemCollapsed({ section: 'drafts' }, false);
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

	test('revealing a draft expands its section and selects it without taking composer focus', () => {
		const harness = createListHarness(disposables, []);
		const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(400, 800), {
			grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
			pendingSections: constObservable<readonly IPendingSessionSection[]>([{ id: 'drafts', label: 'Drafts', items: [item('draft')] }]),
			onSessionOpen: () => { },
		}));
		list.layout(800, 400);
		const input = append(list.element.parentElement!, $('input'));
		input.focus();
		const revealed = list.revealPendingSession('draft');
		const row = list.getItemRow({ pendingSession: 'draft' });
		assert.deepStrictEqual({
			revealed, selected: row?.getAttribute('aria-selected'),
			focused: row?.classList.contains('focused'), inputFocused: mainWindow.document.activeElement === input,
		}, { revealed: true, selected: 'true', focused: true, inputFocused: true });
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
		row.classList.add('hovered');
		const hovered = mainWindow.getComputedStyle(indicator).display;
		row.classList.remove('hovered');
		list.filters.setScheduledOnly(true);
		const filtered = list.getVisibleSessions().map(session => session.sessionId);
		const draftHidden = !list.getItemRow({ pendingSession: 'draft' });
		scheduledSessionResources.set(new Set(), undefined);
		list.update();
		const afterDispatch = list.getVisibleSessions().map(session => session.sessionId);
		schedulingEnabled.set(false, undefined);
		list.update();
		assert.deepStrictEqual({
			before, hovered, filtered, draftHidden, afterDispatch,
			disabled: list.getVisibleSessions().map(session => session.sessionId).sort(),
			indicatorHidden: mainWindow.getComputedStyle(list.getItemRow({ session: scheduled.resource })!.querySelector('.session-scheduled-indicator')!).display,
		}, {
			before: { indicator: 'flex', aria: true }, hovered: 'flex', filtered: ['scheduled'], draftHidden: true, afterDispatch: [],
			disabled: ['normal', 'scheduled'], indicatorHidden: 'none',
		});
	});

	for (const keyboard of [false, true]) {
		test(`scheduled-message preview keeps actions across row refreshes and resolves the latest request (keyboard: ${keyboard})`, async () => {
			const session = createTestSession('scheduled').session;
			const harness = createListHarness(disposables, [session]);
			const invoked: string[] = [];
			const notifications: string[] = [];
			const error = sinon.stub(harness.instantiationService.get(INotificationService), 'error').callsFake(error => { notifications.push(String(error)); });
			disposables.add(toDisposable(() => error.restore()));
			const request: IChatScheduledRequest = {
				id: 'message', text: 'Check the build\nInclude the test results', description: 'Scheduled',
				runAt: new Date(Date.now() + 3 * 60 * 60_000).toISOString(), attachments: [],
				actions: ([
					['edit', 'Edit', Codicon.edit],
					['sendNow', 'Send Now', Codicon.newLine],
					['reschedule', 'Reschedule...', Codicon.clock],
					['cancel', 'Cancel Schedule', Codicon.closeSmall],
				] as const).map(([id, label, icon]) => toAction({
					id: `sessions.scheduled.${id}`, label, class: ThemeIcon.asClassName(icon),
					run: () => { invoked.push('stale'); },
				})),
			};
			const key = getComparisonKey(session.resource);
			const requests = observableValue<ReadonlyMap<string, readonly IChatScheduledRequest[]>>('requests', new Map([[key, [request]]]));
			const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(400, 800), {
				grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
				scheduledSessionResources: constObservable(new Set([session.resource.toString()])), scheduledRequests: requests,
				onSessionOpen: () => { invoked.push('opened session'); },
			}));
			list.layout(800, 400);
			let card: HTMLElement | undefined;
			let focused: boolean | undefined;
			const hover = sinon.stub(harness.instantiationService.get(IHoverService), 'showInstantHover').callsFake((options, focus) => {
				assert.ok(isHTMLElement(options.content));
				card = options.content;
				focused = focus;
				return undefined;
			});
			disposables.add(toDisposable(() => hover.restore()));
			const indicator = list.getItemRow({ session: session.resource })!.querySelector<HTMLElement>('.session-scheduled-indicator')!;
			if (keyboard) {
				indicator.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			} else {
				indicator.click();
			}
			assert.ok(card);
			const action = card.querySelector<HTMLElement>('.codicon-edit')!;
			requests.set(new Map([[key, [{
				...request,
				actions: request.actions.map(action => toAction({ ...action, run: () => { invoked.push('latest'); } })),
			}]]]), undefined);
			list.update();
			action.click();
			await timeout(0);
			requests.set(new Map(), undefined);
			action.click();
			await timeout(0);
			assert.deepStrictEqual({
				text: card.querySelector('.session-scheduled-card-text')?.textContent,
				time: card.querySelector('.session-scheduled-card-time')?.textContent,
				actions: [...card.querySelectorAll('.action-label')].map(action => action.getAttribute('aria-label')),
				focused, invoked, role: indicator.getAttribute('role'),
				staleActionReported: notifications.length === 1 && notifications[0].includes('scheduled message has changed'),
			}, {
				text: 'Check the build', time: 'Sends in 3 hours', actions: ['Edit', 'Send Now', 'Cancel Schedule'],
				focused: keyboard, invoked: ['latest'], role: 'button', staleActionReported: true,
			});
		});
	}

	function createScheduledPreview() {
		const session = createTestSession('scheduled').session;
		const harness = createListHarness(disposables, [session]);
		const configuration = new TestConfigurationService();
		configuration.setUserConfiguration('workbench.hover.delay', 0);
		harness.instantiationService.stub(IConfigurationService, configuration);
		harness.instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		const hoverService = disposables.add(harness.instantiationService.createInstance(HoverService));
		disposables.add(toDisposable(() => hoverService.hideHover(true)));
		harness.instantiationService.stub(IHoverService, hoverService);
		const opened: string[] = [];
		const container = harness.createContainer(400, 800);
		// Native hover visibility must not depend on scrolling left by another test.
		container.style.position = 'fixed';
		container.style.top = '0';
		container.style.left = '0';
		const list = disposables.add(harness.instantiationService.createInstance(TestSessionsList, container, {
			grouping: () => SessionsGrouping.Date, sorting: () => SessionsSorting.Created,
			scheduledSessionResources: constObservable(new Set([session.resource.toString()])),
			scheduledRequests: constObservable(new Map([[getComparisonKey(session.resource), [{
				id: 'message', text: 'Check the build', description: 'Tomorrow', attachments: [], actions: [],
			}]]])),
			onSessionOpen: resource => { opened.push(resource.toString()); },
		}));
		list.layout(800, 400);
		const indicator = list.getItemRow({ session: session.resource })!.querySelector<HTMLElement>('.session-scheduled-indicator')!;
		return { list, indicator, session, opened, container };
	}

	async function settleIntersections(container: HTMLElement): Promise<void> {
		const sentinel = append(container, $('div', { style: 'position:fixed;top:0;left:0;width:1px;height:1px;pointer-events:none' }));
		disposables.add(toDisposable(() => sentinel.remove()));
		const observe = (intersecting: boolean) => new Promise<void>(resolve => {
			const observer = new mainWindow.IntersectionObserver(entries => {
				if (entries.some(entry => entry.isIntersecting === intersecting)) {
					observer.disconnect();
					resolve();
				}
			});
			disposables.add(toDisposable(() => observer.disconnect()));
			observer.observe(sentinel);
		});
		await observe(true);
		sentinel.remove();
		await observe(false);
	}

	test('clock mouseover opens the scheduled preview rather than the parent session hover', async () => {
		const { indicator, opened } = createScheduledPreview();
		indicator.dispatchEvent(new mainWindow.MouseEvent('mouseover', { bubbles: true }));
		await timeout(0);
		assert.deepStrictEqual({
			preview: mainWindow.document.querySelector('.monaco-hover .session-scheduled-card-text')?.textContent,
			opened,
		}, { preview: 'Check the build', opened: [] });
	});

	test('an open scheduled preview survives the real hover lifecycle during a row refresh', async () => {
		const { list, indicator, session, container } = createScheduledPreview();
		indicator.click();
		const preview = mainWindow.document.querySelector('.monaco-hover.session-scheduled-card-hover');
		assert.ok(preview);
		await settleIntersections(container);
		assert.ok(preview.isConnected, 'The preview must be visible before refreshing the row');
		list.update();
		await settleIntersections(container);
		assert.deepStrictEqual({
			sameClock: list.getItemRow({ session: session.resource })!.querySelector('.session-scheduled-indicator') === indicator,
			previewConnected: preview.isConnected,
		}, { sameClock: true, previewConnected: true });
	});

	test('Escape restores clock focus after a keyboard-opened scheduled preview', async () => {
		const { indicator } = createScheduledPreview();
		indicator.focus();
		indicator.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
		const preview = mainWindow.document.querySelector('.monaco-hover.session-scheduled-card-hover');
		assert.ok(preview && preview.contains(mainWindow.document.activeElement));
		mainWindow.document.activeElement!.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
		await timeout(0);
		assert.deepStrictEqual({
			closed: !preview.isConnected, clockFocused: mainWindow.document.activeElement === indicator,
		}, { closed: true, clockFocused: true });
	});

	test('clock touches bypass list gestures without suppressing the preview click', async () => {
		const touchDevice = sinon.stub(Gesture, 'isTouchDevice').returns(true);
		disposables.add(toDisposable(() => touchDevice.restore()));
		const { indicator, opened } = createScheduledPreview();
		const bounds = indicator.getBoundingClientRect();
		const touch = new mainWindow.Touch({
			identifier: 1, target: indicator, clientX: bounds.x + bounds.width / 2, clientY: bounds.y + bounds.height / 2,
			pageX: bounds.x + bounds.width / 2, pageY: bounds.y + bounds.height / 2,
		});
		const start = new mainWindow.TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true });
		const end = new mainWindow.TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [touch], bubbles: true, cancelable: true });
		indicator.dispatchEvent(start);
		indicator.dispatchEvent(end);
		if (!start.defaultPrevented && !end.defaultPrevented) {
			indicator.click();
		}
		await timeout(0);
		assert.deepStrictEqual({
			startPrevented: start.defaultPrevented, endPrevented: end.defaultPrevented, opened,
			preview: mainWindow.document.querySelector('.monaco-hover .session-scheduled-card-text')?.textContent,
		}, { startPrevented: false, endPrevented: false, opened: [], preview: 'Check the build' });
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
		list.setItemCollapsed({ section: 'drafts' }, false);
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
