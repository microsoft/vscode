/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spy, stub } from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { getErrorMessage } from '../../../../../base/common/errors.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IListService, ListService, WorkbenchTable } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SessionWorktreeCleanupEditor } from '../../browser/sessionWorktreeCleanupEditor.js';
import { SessionWorktreeCleanupEditorInput } from '../../browser/sessionWorktreeCleanupEditorInput.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, getWorktreeCleanupId, ISessionWorktree, ISessionWorktreeCleanupCandidate, ISessionWorktreeCleanupOperation, ISessionWorktreeCleanupService, ISessionWorktreeMeasurementProgress, SessionWorktreeCleanupProgress } from '../../browser/sessionWorktreeCleanupService.js';
import '../../../../../workbench/browser/actions/listCommands.js';

suite('SessionWorktreeCleanupEditor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor(cleanupService: Partial<ISessionWorktreeCleanupService> = {}, contextKeyService?: IContextKeyService) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
		if (contextKeyService) {
			instantiationService.stub(IContextKeyService, contextKeyService);
		}
		instantiationService.stub(IListService, disposables.add(new ListService()));
		const configuration = new TestConfigurationService({
			[ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays]: 0,
			[ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays]: 0,
			[AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: true,
		});
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const updateValue = stub(configuration, 'updateValue').callsFake((key, value) => configuration.setUserConfiguration(key, value));
		disposables.add({ dispose: () => updateValue.restore() });
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(ISessionWorktreeCleanupService, upcastPartial<ISessionWorktreeCleanupService>({
			refresh: async () => { },
			cleanupOperations: constObservable([]),
			isSchedulingCleanup: constObservable(false),
			...cleanupService,
		}));
		const opened: string[] = [];
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ openSession: async resource => { opened.push(resource.toString()); return undefined; } }));
		const errors: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: error => errors.push(getErrorMessage(error)) }));
		const editor = disposables.add(instantiationService.createInstance(SessionWorktreeCleanupEditor, new TestEditorGroupView(1)));
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		disposables.add(toDisposable(() => container.remove()));
		editor.create(container);
		editor.layout(new dom.Dimension(1200, 1000));
		return { editor, container, configuration, updateValue, errors, opened, instantiationService };
	}

	function scheduleCleanup(candidates: readonly ISessionWorktreeCleanupCandidate[], onProgress?: (progress: SessionWorktreeCleanupProgress) => void): boolean {
		onProgress?.({ state: 'started' });
		for (const candidate of candidates) {
			onProgress?.({ state: 'scheduled', candidate });
		}
		return true;
	}

	function focusElement(element: HTMLElement): void {
		element.focus();
		// Hidden Electron windows update activeElement without emitting native focus events.
		if (!mainWindow.document.hasFocus()) {
			element.dispatchEvent(new mainWindow.FocusEvent('focus'));
		}

	}

	function rowStatus(row: ParentNode): string | undefined {
		return row.querySelector('.status')?.textContent?.replace(/^(?:Has session|Session marked as done|No matching session): /, '');
	}

	test('shows ownership once for idle worktrees and hides failed worktrees without hiding progress', async () => {
		const { container } = await openEditor([
			createWorktree('ready', '/repos/app'),
			createUnlinkedWorktree('unlinked'),
			{ ...createWorktree('failed', '/repos/app', 'archived'), cleanupStatus: { state: 'failed', message: 'locked directory' } },
			{ ...createUnlinkedWorktree('failed-unlinked'), cleanupStatus: { state: 'failed', message: 'locked directory' } },
			{ ...createWorktree('pending', '/repos/app', 'archived'), cleanupStatus: { state: 'pending' } },
		]);
		assert.deepStrictEqual(Object.fromEntries([...container.querySelectorAll('.session-worktree-cleanup-row')].map(row => [
			row.querySelector('.session-worktree-cleanup-session-link')?.textContent,
			row.querySelector('.status')?.textContent,
		])), {
			ready: 'Has session',
			'agents/unlinked': 'No matching session',
			pending: 'Session marked as done: Cleanup scheduled…',
		});
	});

	test('hides protected, failed, unverified, and blocked rows even when the host advertises forced cleanup', async () => {
		const unavailable: ISessionWorktree[] = [
			...(['running', 'pinned', 'recent', 'untitled', 'error', 'unavailable'] as const).map(state => createWorktree(state, '/repos/app', state)),
			...(['failed', 'skipped', 'inUse'] as const).flatMap(state => [
				{ ...createWorktree(state, '/repos/app', 'archived'), cleanupStatus: { state } },
				{ ...createUnlinkedWorktree(state), cleanupStatus: { state } },
			]),
			{ ...createWorktree('unmeasured', '/repos/app'), sizeBytes: undefined, measurementFailed: true },
			{ ...createUnlinkedWorktree('unlisted'), isListedByHost: false },
			{ ...createWorktree('status-error', '/repos/app', 'archived'), cleanupStatusError: 'disconnected' },
			{ ...createUnlinkedWorktree('existence-error'), worktreeCheckError: 'denied' },
		];
		const { editor, container } = createEditor({
			getWorktrees: async () => [createWorktree('eligible', '/repos/app'), ...unavailable],
			canForceCleanup: () => true,
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		assert.deepStrictEqual({
			titles: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			recoveryControls: container.querySelectorAll('.session-worktree-cleanup-retry, .session-worktree-cleanup-force-remove, .session-worktree-cleanup-view').length,
			summary: container.querySelector('.session-worktree-cleanup-summary')?.textContent,
		}, { titles: ['eligible'], recoveryControls: 0, summary: '1 of 1 matching worktrees can be cleaned up. Estimated disk usage: 100B.' });
	});

	test('shows an honest empty state and keeps settings when nothing can be cleaned up', async () => {
		const { container } = await openEditor([createWorktree('pinned', '/repos/app', 'pinned'), {
			...createWorktree('locked', '/repos/app', 'archived'), cleanupStatus: { state: 'failed', message: 'initializing lock' },
		}]);
		assert.deepStrictEqual({
			rows: container.querySelectorAll('.session-worktree-cleanup-row').length,
			empty: container.querySelector('.session-worktree-cleanup-empty')?.classList.contains('hidden'),
			message: container.querySelector('.session-worktree-cleanup-empty')?.textContent,
			batchHidden: container.querySelector('.session-worktree-cleanup-batch')?.classList.contains('hidden'),
			settings: container.querySelector('summary')?.textContent,
		}, { rows: 0, empty: false, message: 'No worktrees to clean up.', batchHidden: true, settings: 'Automatic Cleanup' });
	});

	test('a scheduling failure stays hidden after refresh and reopening without retry controls or failure counters', async () => {
		const worktree = createWorktree('failed', '/repos/app');
		const operations = observableValue<readonly ISessionWorktreeCleanupOperation[]>('operations', []);
		let requests = 0;
		const { editor, container, errors } = createEditor({
			cleanupOperations: operations,
			getWorktrees: async () => [worktree],
			cleanupWorktrees: async ([candidate], onProgress) => {
				requests++;
				onProgress?.({ state: 'started' });
				operations.set([{ candidate, state: 'failed', message: 'index.lock exists' }], undefined);
				onProgress?.({ state: 'failed', candidate, message: 'index.lock exists' });
				throw new Error('index.lock exists');
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		const afterFailure = {
			rows: container.querySelectorAll('.session-worktree-cleanup-row').length,
			batchHidden: container.querySelector('.session-worktree-cleanup-batch')?.classList.contains('hidden'),
		};
		editor.clearInput();
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		assert.deepStrictEqual({
			requests, errors, afterFailure,
			reopenedRows: container.querySelectorAll('.session-worktree-cleanup-row').length,
			reopenedBatchHidden: container.querySelector('.session-worktree-cleanup-batch')?.classList.contains('hidden'),
		}, { requests: 1, errors: ['index.lock exists'], afterFailure: { rows: 0, batchHidden: true }, reopenedRows: 0, reopenedBatchHidden: true });
	});

	test('a host failure is notified once and hidden without claiming removal or losing pending work', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = createWorktree('failed', '/repos/app', 'archived');
		const second = createWorktree('pending', '/repos/app', 'archived');
		const pending = [first, second].map(worktree => ({ ...worktree, cleanupStatus: { state: 'pending' as const } }));
		let checks = 0;
		const { editor, container, errors } = createEditor({
			getWorktrees: async () => pending,
			refreshPendingCleanup: async () => {
				checks++;
				return [{ ...first, cleanupStatus: { state: 'failed', message: 'index.lock exists' } }, pending[1]];
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(6_100);
		assert.deepStrictEqual({
			errors, checks,
			titles: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			failureCount: /\d+ failed|need attention/.test(container.textContent ?? ''),
		}, { errors: ['index.lock exists'], checks: 2, titles: ['pending'], summary: 'Cleanup: 0 of 1 worktrees removed, 1 pending.', failureCount: false });
	}));

	test('a failed scheduling attempt does not hide unrelated unchecked rows or count failed work as removed', async () => {
		const first = createWorktree('first', '/repos/app');
		const failed = createWorktree('failed', '/repos/app');
		const remaining = createWorktree('remaining', '/repos/app');
		let scheduled = false;
		const { editor, container, errors } = createEditor({
			getWorktrees: async () => [scheduled ? removedWorktree(first) : first, failed, remaining],
			cleanupWorktrees: async (candidates, onProgress) => {
				onProgress?.({ state: 'started' });
				for (const candidate of candidates) {
					onProgress?.(getWorktreeCleanupId(candidate) === 'first'
						? { state: 'scheduled', candidate }
						: { state: 'failed', candidate, message: 'locked' });
				}
				scheduled = true;
				throw new Error('locked');
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelectorAll<HTMLElement>('.session-worktree-cleanup-row [role="checkbox"]')[2].click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			errors,
			titles: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			unchecked: container.querySelector('.session-worktree-cleanup-row [role="checkbox"]')?.getAttribute('aria-checked'),
		}, { errors: ['locked'], titles: ['first', 'remaining'], summary: 'Cleanup: 1 worktree removed.', unchecked: 'false' });
	});

	test('keeps focus reachable when the last focused row becomes unavailable', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree = createWorktree('last', '/repos/app');
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		const { editor, container } = createEditor({
			getWorktrees: async (_age, update) => { publish = update; return [worktree]; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		focusElement(container.querySelector<HTMLElement>('.session-worktree-cleanup-session-link')!);
		publish?.([{ ...worktree, cleanupState: 'pinned' }]);
		await timeout(100);
		assert.deepStrictEqual({
			rows: container.querySelectorAll('.session-worktree-cleanup-row').length,
			focusedAgeFilter: dom.getActiveElement() === container.querySelector('.session-worktree-cleanup-age'),
		}, { rows: 0, focusedAgeFilter: true });
	}));

	test('cleans up one checked worktree without per-row actions', async () => {
		const worktrees = [createWorktree('selected', '/repos/app'), createWorktree('unchecked', '/repos/app'), createWorktree('active', '/repos/app', 'active')];
		const { container, cleaned } = await openEditor(worktrees);
		const checkboxes = container.querySelectorAll<HTMLElement>('.session-worktree-cleanup-row [role="checkbox"]');
		checkboxes[0].click();
		checkboxes[1].click();
		checkboxes[2].click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			cleaned,
			checked: [...container.querySelectorAll('.session-worktree-cleanup-row [role="checkbox"]')].map(checkbox => checkbox.getAttribute('aria-checked')),
			rowActions: container.querySelectorAll('.session-worktree-cleanup-row .actions, .session-worktree-cleanup-row .monaco-toolbar').length,
		}, { cleaned: [['active']], checked: ['false', 'false', 'true'], rowActions: 0 });
	});

	test('has one virtualized table and no outer vertical scroll container', async () => {
		const { editor, container } = await openEditor(Array.from({ length: 2000 }, (_, index) => createWorktree(`worktree-${index}`, '/repos/app')));
		editor.layout(new dom.Dimension(960, 600));
		const root = container.querySelector<HTMLElement>('.session-worktree-cleanup-editor')!;
		const content = container.querySelector<HTMLElement>('.session-worktree-cleanup-content')!;
		const body = container.querySelector<HTMLElement>('.session-worktree-cleanup-table-body')!;
		assert.deepStrictEqual({
			tables: container.querySelectorAll('.monaco-table').length,
			lists: container.querySelectorAll('.monaco-list').length,
			virtualized: container.querySelectorAll('.session-worktree-cleanup-row').length < 20,
			rootOverflow: mainWindow.getComputedStyle(root).overflowY,
			contentOverflow: mainWindow.getComputedStyle(content).overflowY,
			wrappedByOuterScroller: !!content.parentElement?.closest('.monaco-scrollable-element'),
			horizontalScrollerInsideInventory: !!body.closest('.session-worktree-cleanup-list'),
		}, { tables: 1, lists: 1, virtualized: true, rootOverflow: 'hidden', contentOverflow: 'visible', wrappedByOuterScroller: false, horizontalScrollerInsideInventory: true });
	});

	test('rehydrates service-owned cleanup operations after closing and reopening without duplicate submission', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree = createWorktree('first', '/repos/app');
		const operations = observableValue<readonly ISessionWorktreeCleanupOperation[]>('operations', []);
		const scheduling = observableValue('scheduling', false);
		const completion = new DeferredPromise<void>();
		let requests = 0;
		const { editor, container } = createEditor({
			cleanupOperations: operations,
			isSchedulingCleanup: scheduling,
			getWorktrees: async () => [worktree],
			cleanupWorktrees: async ([candidate], onProgress) => {
				requests++;
				transaction(tx => {
					operations.set([{ candidate, state: 'queued' }], tx);
					scheduling.set(true, tx);
				});
				onProgress?.({ state: 'started' });
				await completion.p;
				transaction(tx => {
					operations.set([{ candidate, state: 'failed', message: 'host disconnected' }], tx);
					scheduling.set(false, tx);
				});
				return true;
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		editor.clearInput();
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(100);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		const reopened = {
			reason: rowStatus(container),
			busy: container.querySelector('.session-worktree-cleanup-row')?.getAttribute('aria-busy'),
			checkboxes: container.querySelectorAll('.session-worktree-cleanup-row [role="checkbox"]').length,
		};
		await completion.complete();
		await timeout(100);
		assert.deepStrictEqual({
			requests, reopened,
			reason: rowStatus(container),
			rows: container.querySelectorAll('.session-worktree-cleanup-row').length,
			batchHidden: container.querySelector('.session-worktree-cleanup-batch')?.classList.contains('hidden'),
		}, { requests: 1, reopened: { reason: 'Queued for cleanup…', busy: 'true', checkboxes: 0 }, reason: undefined, rows: 0, batchHidden: true });
	}));

	test('refreshes restored submissions on completion and observes successful removal after reopening', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const archived = observableValue('archived', false);
		const initial = createWorktree('first', '/repos/app');
		const worktree: ISessionWorktree = { ...initial, session: upcastPartial<ISession>({ ...initial.session, isArchived: archived }) };
		const operations = observableValue<readonly ISessionWorktreeCleanupOperation[]>('operations', []);
		const scheduling = observableValue('scheduling', false);
		const completion = new DeferredPromise<void>();
		let requests = 0;
		let loads = 0;
		let checks = 0;
		const { editor, container } = createEditor({
			cleanupOperations: operations,
			isSchedulingCleanup: scheduling,
			getWorktrees: async () => {
				loads++;
				return [archived.get() ? { ...worktree, cleanupState: 'archived', cleanupStatus: { state: 'pending' } } : worktree];
			},
			refreshPendingCleanup: async () => { checks++; return [removedWorktree(worktree)]; },
			cleanupWorktrees: async ([candidate], onProgress) => {
				requests++;
				transaction(tx => {
					operations.set([{ candidate, state: 'queued' }], tx);
					scheduling.set(true, tx);
				});
				onProgress?.({ state: 'started' });
				await completion.p;
				transaction(tx => {
					archived.set(true, tx);
					operations.set([{ candidate, state: 'pending' }], tx);
					scheduling.set(false, tx);
				});
				return true;
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		editor.clearInput();
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(100);
		const beforeCompletion = loads;
		await completion.complete();
		await timeout(2_200);
		assert.deepStrictEqual({ beforeCompletion, loads, requests, checks, summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent }, {
			beforeCompletion: 2, loads: 3, requests: 1, checks: 1, summary: 'Cleanup: 1 worktree removed.',
		});
	}));

	test('restoration clears the local pending batch so its row can be cleaned up again', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const archived = observableValue('archived', false);
		const initial = createWorktree('restored', '/repos/app');
		const worktree: ISessionWorktree = { ...initial, session: upcastPartial<ISession>({ ...initial.session, isArchived: archived }) };
		const operations = observableValue<readonly ISessionWorktreeCleanupOperation[]>('operations', []);
		let requests = 0;
		const { editor, container } = createEditor({
			cleanupOperations: operations,
			getWorktrees: async () => [worktree],
			cleanupWorktrees: async ([candidate], onProgress) => {
				requests++;
				operations.set([{ candidate, state: 'pending' }], undefined);
				return scheduleCleanup([candidate], onProgress);
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(100);
		operations.set([], undefined);
		await timeout(100);
		const checkbox = container.querySelector<HTMLElement>('.session-worktree-cleanup-row [role="checkbox"]')!;
		if (checkbox.getAttribute('aria-checked') !== 'true') {
			checkbox.click();
		}
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({ requests, selectableRows: container.querySelectorAll('.session-worktree-cleanup-row [role="checkbox"]').length }, { requests: 2, selectableRows: 0 });
	}));

	test('expanded settings and controls remain reachable beside a virtualized inventory in a short narrow editor', async () => {
		const { editor, container } = await openEditor(Array.from({ length: 2000 }, (_, index) => createWorktree(`worktree-${index}`, '/repos/app')));
		const settings = container.querySelector<HTMLDetailsElement>('details')!;
		settings.open = true;
		settings.dispatchEvent(new mainWindow.Event('toggle'));
		editor.layout(new dom.Dimension(420, 320));
		const root = container.querySelector<HTMLElement>('.session-worktree-cleanup-editor')!;
		const inventory = container.querySelector<HTMLElement>('.session-worktree-cleanup-list')!;
		const regions = [...container.querySelectorAll<HTMLElement>('.session-worktree-cleanup-controls-content')];
		const regionBounds = regions.map(region => {
			region.scrollTop = region.scrollHeight;
			const last = region.lastElementChild!.getBoundingClientRect();
			const bounds = region.getBoundingClientRect();
			return { scrollable: region.scrollHeight > region.clientHeight, lastControlReachable: last.bottom <= bounds.bottom + 1 };
		});
		assert.deepStrictEqual({
			regionBounds,
			settingsVisible: settings.getBoundingClientRect().bottom <= root.getBoundingClientRect().bottom,
			settingsAboveInventory: settings.getBoundingClientRect().bottom <= inventory.getBoundingClientRect().top,
			inventoryVisible: inventory.clientHeight >= 80,
			inventoryOutsideControls: !inventory.closest('.session-worktree-cleanup-controls-content'),
			virtualized: container.querySelectorAll('.session-worktree-cleanup-row').length < 20,
		}, {
			regionBounds: [{ scrollable: true, lastControlReachable: true }, { scrollable: true, lastControlReachable: true }],
			settingsVisible: true, settingsAboveInventory: true, inventoryVisible: true, inventoryOutsideControls: true, virtualized: true,
		});
	});

	for (const result of ['empty', 'populated'] as const) {
		test(`focus enters the cleanup editor while loading and after ${result} results`, async () => {
			const finished = new DeferredPromise<readonly ISessionWorktree[]>();
			const { editor, container } = createEditor({ getWorktrees: () => finished.p });
			const previousFocus = dom.append(container, dom.$('button'));
			await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
			previousFocus.focus();
			editor.focus();
			const editorElement = container.querySelector<HTMLElement>('.session-worktree-cleanup-editor')!;
			const focusedWhileLoading = dom.getActiveElement() === editorElement;
			await finished.complete(result === 'empty' ? [] : [createWorktree('first', '/repos/app')]);
			await timeout(0);
			const focusedAfterLoading = dom.getActiveElement() === editorElement;
			previousFocus.focus();
			editor.focus();
			assert.deepStrictEqual({
				focusedWhileLoading,
				focusedAfterLoading,
				focusedOnReturn: dom.getActiveElement() === editorElement,
				tabIndex: editorElement.tabIndex,
			}, {
				focusedWhileLoading: true,
				focusedAfterLoading: true,
				focusedOnReturn: true,
				tabIndex: -1,
			});
		});
	}

	test('preselects unlinked worktrees with unknown size and allows cleanup', async () => {
		const unlinked: ISessionWorktree = {
			unlinkedWorktree: { providerId: 'test', repository: URI.file('/repos/app').toString(), worktree: URI.file('/repos/app.worktrees/recovered').toString(), branch: 'agents/recovered', cleanupStatus: { state: 'unknown' } },
			sizeBytes: undefined, worktreeCount: 1, cleanupState: 'unlinked', worktreeExists: true, cleanupStatus: { state: 'unknown' },
		};
		const requests: ISessionWorktreeCleanupCandidate[][] = [];
		const { editor, container, opened, instantiationService } = createEditor({
			getWorktrees: async () => [unlinked],
			cleanupWorktrees: async (candidates, onProgress) => {
				requests.push([...candidates]);
				return scheduleCleanup(candidates, onProgress);
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const row = container.querySelector('.session-worktree-cleanup-row:not(.header)')!;
		const checkbox = row.querySelector<HTMLElement>('.monaco-checkbox')!;
		const title = row.querySelector<HTMLAnchorElement>('.session-worktree-cleanup-session-link')!;
		const showHover = stub(instantiationService.get(IHoverService), 'showInstantHover').returns(undefined);
		disposables.add(toDisposable(() => showHover.restore()));
		title.click();
		title.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		assert.deepStrictEqual({
			title: row.querySelector('.title')?.textContent,
			storage: row.querySelector('.storage')?.textContent,
			lastUsed: row.querySelector('.lastUsed')?.textContent,
			selected: checkbox.getAttribute('aria-checked'),
			selectable: checkbox.getAttribute('aria-disabled'),
			titleRole: title.getAttribute('role'),
			titleTabIndex: title.tabIndex,
			announcesPath: title.closest('.monaco-list-row')?.getAttribute('aria-label')?.includes('/repos/app.worktrees/recovered'),
			inspectedPaths: showHover.args.map(([options, focus]) => ({ content: options.content, focus })),
		}, {
			title: 'agents/recovered/repos/app.worktrees/recovered',
			storage: 'Not measured', lastUsed: 'No session activity', selected: 'true', selectable: null,
			titleRole: 'button', titleTabIndex: 0, announcesPath: true,
			inspectedPaths: Array.from({ length: 2 }, () => ({ content: '/repos/app.worktrees/recovered', focus: true })),
		});
		container.querySelector<HTMLAnchorElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({ requests: requests.map(candidates => candidates.map(getWorktreeCleanupId)), opened }, {
			requests: [[getWorktreeCleanupId(unlinked)]], opened: [],
		});
	});

	for (const prefix of ['user/', 'agents/team/']) {
		test(`requires explicit selection of an unlinked ${prefix} prefixed worktree`, async () => {
			const original = createUnlinkedWorktree('recovered');
			const unlinked = { ...original, unlinkedWorktree: { ...original.unlinkedWorktree, branch: `${prefix}agents/recovered` } };
			const { container, cleaned } = await openEditor([unlinked]);
			const checkbox = container.querySelector<HTMLElement>('.session-worktree-cleanup-row [role="checkbox"]')!;
			const button = container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!;
			const initiallySelected = checkbox.getAttribute('aria-checked');
			const initiallyDisabled = button.getAttribute('aria-disabled');
			checkbox.click();
			button.click();
			await timeout(0);
			assert.deepStrictEqual({ initiallySelected, initiallyDisabled, cleaned }, {
				initiallySelected: 'false', initiallyDisabled: 'true', cleaned: [[getWorktreeCleanupId(unlinked)]],
			});
		});
	}

	test('select all toggles unlinked worktrees and active sessions without selecting unavailable worktrees', async () => {
		const unlinked: ISessionWorktree = {
			unlinkedWorktree: { providerId: 'test', repository: URI.file('/repos/app').toString(), worktree: URI.file('/repos/app.worktrees/unlinked').toString(), branch: 'agents/unlinked', cleanupStatus: { state: 'unknown' } },
			sizeBytes: undefined, worktreeCount: 1, cleanupState: 'unlinked', worktreeExists: true,
		};
		const unavailable: ISessionWorktree[] = [
			{ ...unlinked, worktreeExists: false },
			{ ...unlinked, worktreeCheckError: 'Host disconnected' },
			{ ...unlinked, cleanupStatusError: 'Host disconnected' },
			{ ...unlinked, unlinkedWorktree: { ...unlinked.unlinkedWorktree, branch: '' } },
			...(['inUse', 'pending', 'running'] as const).map(state => ({ ...unlinked, cleanupStatus: { state } })),
		].map((worktree, index) => ({
			...worktree,
			unlinkedWorktree: { ...worktree.unlinkedWorktree!, worktree: URI.file(`/repos/app.worktrees/unavailable-${index}`).toString() },
		}));
		const { container, cleaned } = await openEditor([unlinked, createWorktree('active', '/repos/app', 'active'), ...unavailable]);
		const selectAll = container.querySelector<HTMLElement>('.session-worktree-cleanup-select-all [role="checkbox"]')!;
		const selection = () => ({
			all: selectAll.getAttribute('aria-checked'),
			rows: [...container.querySelectorAll('.session-worktree-cleanup-row [role="checkbox"]')].map(checkbox => checkbox.getAttribute('aria-checked')),
		});
		const states = [selection()];
		selectAll.click();
		states.push(selection());
		selectAll.click();
		states.push(selection());
		selectAll.click();
		states.push(selection());
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({ states, cleaned }, {
			states: [
				{ all: 'mixed', rows: ['true', 'false'] },
				{ all: 'true', rows: ['true', 'true'] },
				{ all: 'false', rows: ['false', 'false'] },
				{ all: 'true', rows: ['true', 'true'] },
			],
			cleaned: [[getWorktreeCleanupId(unlinked), 'active']],
		});
	});

	test('cleanup header checkbox reflects partial selection and supports keyboard toggling', async () => {
		const worktrees = ['first', 'second'].map(id => createWorktree(id, '/repos/app', 'active'));
		const { editor, container } = createEditor({
			getWorktrees: async () => worktrees,
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const table = container.querySelector('.session-worktree-cleanup-content > .session-worktree-cleanup-list')!;
		const selectAll = table.querySelector<HTMLElement>('.monaco-table-th[data-col-index="0"] [role="checkbox"]')!;
		const rows = [...table.querySelectorAll<HTMLElement>('.session-worktree-cleanup-row [role="checkbox"]')];
		const selection = () => ({
			all: selectAll.getAttribute('aria-checked'),
			dash: selectAll.classList.contains('codicon-dash'),
			rows: rows.map(checkbox => checkbox.getAttribute('aria-checked')),
		});
		const pressSpace = () => {
			focusElement(selectAll);
			selectAll.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		};
		const states = [selection()];
		rows[0].click();
		states.push(selection());
		pressSpace();
		states.push(selection());
		rows[1].click();
		states.push(selection());
		selectAll.click();
		states.push(selection());
		pressSpace();
		states.push(selection());

		assert.deepStrictEqual({
			states,
			focused: dom.getActiveElement() === selectAll,
			outsideHeaders: container.querySelectorAll('.session-worktree-cleanup-summary-row [role="checkbox"]').length,
			progressHeaderCheckboxes: container.querySelectorAll('.session-worktree-cleanup-progress .monaco-table-th [role="checkbox"]').length,
		}, {
			states: [
				{ all: 'false', dash: false, rows: ['false', 'false'] },
				{ all: 'mixed', dash: true, rows: ['true', 'false'] },
				{ all: 'true', dash: false, rows: ['true', 'true'] },
				{ all: 'mixed', dash: true, rows: ['true', 'false'] },
				{ all: 'true', dash: false, rows: ['true', 'true'] },
				{ all: 'false', dash: false, rows: ['false', 'false'] },
			],
			focused: true,
			outsideHeaders: 0,
			progressHeaderCheckboxes: 0,
		});
	});

	test('excludes non-agent and failed branches from cleanup', async () => {
		const eligible = createUnlinkedWorktree('eligible');
		const foreign = (['unknown', 'failed', 'inUse'] as const).map((state, index): ISessionWorktree => {
			const worktree = createUnlinkedWorktree(`foreign-${index}`);
			return {
				...worktree,
				unlinkedWorktree: { ...worktree.unlinkedWorktree!, branch: index === 0 ? 'component-explorer-1' : 'custom/agents/task' },
				cleanupStatus: { state },
				isMeasuring: index === 0,
			};
		});
		const requests: string[][] = [];
		const { editor, container } = createEditor({
			getWorktrees: async () => [eligible, ...foreign],
			canForceCleanup: () => true,
			cleanupWorktrees: async candidates => { requests.push(candidates.map(getWorktreeCleanupId)); return false; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			titles: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			requests,
			selectableRows: container.querySelectorAll('.session-worktree-cleanup-row [role="checkbox"]').length,
		}, { titles: ['agents/eligible'], requests: [[getWorktreeCleanupId(eligible)]], selectableRows: 1 });
	});

	test('does not resurrect a failed batch row after its branch becomes unsupported', async () => {
		const initial = createUnlinkedWorktree('eligible');
		const owner = { ...initial.unlinkedWorktree! };
		const worktree = { ...initial, unlinkedWorktree: owner };
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		const { editor, container } = createEditor({
			getWorktrees: async (_age, onUpdate) => { publish = onUpdate; return [worktree]; },
			canForceCleanup: () => true,
			cleanupWorktrees: async (candidates, onProgress) => {
				onProgress?.({ state: 'started' });
				onProgress?.({ state: 'failed', candidate: candidates[0], message: 'branch changed' });
				throw new Error('Scheduling failed');
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		const before = [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent);
		owner.branch = 'component-explorer-1';
		publish?.([worktree]);
		await timeout(100);
		assert.deepStrictEqual({
			before, after: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			batchHidden: container.querySelector('.session-worktree-cleanup-batch')?.classList.contains('hidden'),
		}, { before: [], after: [], batchHidden: true });
	});

	test('retains a verified unlinked cleanup result after it leaves the host inventory', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree = createUnlinkedWorktree('removed');
		let scheduled = false;
		const { editor, container } = createEditor({
			getWorktrees: async () => [scheduled ? { ...worktree, cleanupStatus: { state: 'pending' } } : worktree],
			cleanupWorktrees: async (candidates, onProgress) => { scheduled = true; return scheduleCleanup(candidates, onProgress); },
			refreshPendingCleanup: async () => [{ ...removedWorktree(worktree), isListedByHost: false }],
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(2_100);
		assert.deepStrictEqual({
			rows: [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map(row => ({
				title: row.querySelector('.session-worktree-cleanup-session-link')?.textContent,
				reason: rowStatus(row),
				path: row.querySelector('.session-worktree-cleanup-reason')?.textContent,
				storage: row.querySelector('.storage')?.textContent,
				checkbox: row.querySelector('[role="checkbox"]'),
			}))
		}, { rows: [{ title: 'agents/removed', reason: 'Worktree removed', path: '/repos/app.worktrees/removed', storage: '0B', checkbox: null }] });
	}));

	test('live results preserve selection and show verified removals despite stale host errors without showing failures', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const completedSession = createWorktree('completed-session', '/repos/app', 'archived');
		const completedUnlinked = createUnlinkedWorktree('completed-unlinked');
		const failed: ISessionWorktree = { ...createUnlinkedWorktree('failed'), cleanupStatus: { state: 'failed', message: 'locked' } };
		const pending: ISessionWorktree = { ...createUnlinkedWorktree('pending'), cleanupStatus: { state: 'pending' } };
		const remaining = createWorktree('remaining', '/repos/app');
		let worktrees: readonly ISessionWorktree[] = [
			...[completedSession, completedUnlinked].map(worktree => ({ ...worktree, cleanupStatus: { state: 'pending' as const } })),
			failed, pending, remaining,
		];
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		const { editor, container } = createEditor({
			getWorktrees: async (_age, onUpdate) => { publish = onUpdate; return worktrees; },
			refreshPendingCleanup: async () => worktrees,
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		worktrees = [
			{ ...removedWorktree(completedSession), cleanupStatus: { state: 'failed', message: 'old error' } },
			{ ...removedWorktree(completedUnlinked), isListedByHost: false, cleanupStatusError: 'No longer listed' },
			failed, pending, remaining,
		];
		publish?.(worktrees);
		await timeout(100);
		const snapshot = () => ({
			titles: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent).sort(),
			selected: [...container.querySelectorAll('.session-worktree-cleanup-row [aria-checked="true"]')].length,
			batch: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
		});
		const completed = snapshot();
		publish?.(worktrees);
		await timeout(100);
		const batch = 'Cleanup: 2 of 3 worktrees removed, 1 pending.';
		assert.deepStrictEqual({ completed, refreshed: snapshot(), resultsControls: container.querySelectorAll('.session-worktree-cleanup-batch .monaco-button').length }, {
			completed: { titles: ['agents/completed-unlinked', 'agents/pending', 'completed-session', 'remaining'], selected: 1, batch },
			refreshed: { titles: ['agents/completed-unlinked', 'agents/pending', 'completed-session', 'remaining'], selected: 1, batch },
			resultsControls: 0,
		});
	}));

	test('defaults to status and supports size or session recency without changing checkbox choices', async () => {
		const { container } = await openEditor([
			{ ...createWorktree('older-large', '/repos/app', 'eligible', 30), sizeBytes: 300 },
			{ ...createWorktree('newer-small', '/repos/app'), sizeBytes: 100 },
			createUnlinkedWorktree('unknown-age'),
		]);
		const rows = () => [...container.querySelectorAll('.session-worktree-cleanup-row')].map(row => ({
			title: row.querySelector('a')?.textContent,
			checked: row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
		}));
		const sort = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-sort')!;
		const defaultSort = sort.value;
		const states = [rows()];
		sort.value = 'size';
		sort.dispatchEvent(new mainWindow.Event('change'));
		container.querySelector<HTMLElement>('.session-worktree-cleanup-row [role="checkbox"]')!.click();
		states.push(rows());
		sort.value = 'recent';
		sort.dispatchEvent(new mainWindow.Event('change'));
		states.push(rows());
		sort.value = 'size';
		sort.dispatchEvent(new mainWindow.Event('change'));
		states.push(rows());
		assert.deepStrictEqual({ defaultSort, states }, {
			defaultSort: 'status', states: [
				[{ title: 'agents/unknown-age', checked: 'true' }, { title: 'older-large', checked: 'true' }, { title: 'newer-small', checked: 'true' }],
				[{ title: 'older-large', checked: 'false' }, { title: 'newer-small', checked: 'true' }, { title: 'agents/unknown-age', checked: 'true' }],
				[{ title: 'newer-small', checked: 'true' }, { title: 'older-large', checked: 'false' }, { title: 'agents/unknown-age', checked: 'true' }],
				[{ title: 'older-large', checked: 'false' }, { title: 'newer-small', checked: 'true' }, { title: 'agents/unknown-age', checked: 'true' }],
			]
		});
	});

	test('sorts by status with removed worktrees last without rescanning', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const removedSession = createWorktree('removed-session', '/repos/app', 'archived');
		const removedUnlinked = createUnlinkedWorktree('removed-unlinked');
		const done = { ...createWorktree('done', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' as const } };
		let worktrees: readonly ISessionWorktree[] = [
			{ ...createWorktree('small', '/repos/app'), sizeBytes: 100 },
			createUnlinkedWorktree('unmatched'),
			{ ...removedSession, cleanupStatus: { state: 'pending' } },
			{ ...createWorktree('large', '/repos/app'), sizeBytes: 300 },
			{ ...removedUnlinked, cleanupStatus: { state: 'pending' } },
			done,
			{ ...createWorktree('pending', '/repos/app', 'archived'), cleanupStatus: { state: 'pending' } },
			createWorktree('active', '/repos/app', 'active'),
			createWorktree('needs-input', '/repos/app', 'needsInput'),
		];
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		let scans = 0;
		const { editor, container } = createEditor({
			getWorktrees: async (_age, update) => { scans++; publish = update; return worktrees; },
			refreshPendingCleanup: async () => worktrees,
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		worktrees = worktrees.map(worktree => getWorktreeCleanupId(worktree) === 'removed-session' || getWorktreeCleanupId(worktree) === getWorktreeCleanupId(removedUnlinked)
			? removedWorktree(worktree) : worktree);
		publish?.(worktrees);
		await timeout(100);
		const selectedIds = () => [...container.querySelectorAll('.session-worktree-cleanup-row')]
			.filter(row => row.querySelector('[aria-checked="true"]'))
			.map(row => row.querySelector('a')?.textContent).sort();
		const selectedBefore = selectedIds();
		const sort = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-sort')!;
		sort.value = 'status';
		sort.dispatchEvent(new mainWindow.Event('change'));
		assert.deepStrictEqual({
			scans,
			titles: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			doneStatus: [...container.querySelectorAll('.session-worktree-cleanup-row')].find(row => row.querySelector('a')?.textContent === 'done')?.querySelector('.status')?.textContent,
			pendingStatus: [...container.querySelectorAll('.session-worktree-cleanup-row')].find(row => row.querySelector('a')?.textContent === 'pending')?.querySelector('.status')?.textContent,
			accessibleDone: container.querySelector('.session-worktree-cleanup-row')?.parentElement?.getAttribute('aria-label')?.includes('Session marked as done'),
			selected: selectedIds(),
		}, {
			scans: 1,
			titles: ['done', 'pending', 'agents/unmatched', 'large', 'small', 'active', 'needs-input', 'removed-session', 'agents/removed-unlinked'],
			doneStatus: 'Session marked as done: Worktree still exists. Select to retry cleanup.',
			pendingStatus: 'Session marked as done: Cleanup scheduled…',
			accessibleDone: true,
			selected: selectedBefore,
		});
	}));

	test('moves measured worktrees from progress to available without rescanning', async () => {
		const worktree = createWorktree('measuring', '/repos/app');
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		let scans = 0;
		const { editor, container } = createEditor({
			getWorktrees: async (_age, onUpdate) => {
				scans++;
				publish = onUpdate;
				return [{ ...worktree, sizeBytes: undefined, isMeasuring: true }];
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const measuring = container.querySelector('.session-worktree-cleanup-session-link')?.textContent;
		publish?.([worktree]);
		await timeout(100);
		assert.deepStrictEqual({
			measuring, scans,
			status: rowStatus(container),
			available: container.querySelector('.session-worktree-cleanup-list .session-worktree-cleanup-session-link')?.textContent,
			checked: container.querySelector('.session-worktree-cleanup-list [role="checkbox"]')?.getAttribute('aria-checked'),
		}, { measuring: 'measuring', scans: 1, status: 'Has session', available: 'measuring', checked: 'true' });
	});

	test('preselects an unlinked worktree that becomes available during cleanup refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = createWorktree('first', '/repos/app');
		const unlinked = createUnlinkedWorktree('leftover');
		let scheduled = false;
		const { editor, container } = createEditor({
			getWorktrees: async () => scheduled
				? [removedWorktree(first), unlinked]
				: [first, { ...unlinked, cleanupStatus: { state: 'inUse' } }],
			cleanupWorktrees: async (candidates, onProgress) => {
				scheduled = true;
				return scheduleCleanup(candidates, onProgress);
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		const row = [...container.querySelectorAll('.session-worktree-cleanup-row')].find(row => row.querySelector('a')?.textContent === 'agents/leftover')!;
		assert.strictEqual(row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'), 'true');
	}));

	for (const selection of ['row', 'select all'] as const) {
		test(`preserves explicit unlinked deselection through ${selection} across workspace scans and age filters`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const initial = [createWorktree('first', '/repos/app'), createWorktree('protected', '/repos/other', 'pinned')];
			const worktrees = [...initial, createUnlinkedWorktree('leftover', '/repos/other')];
			const finished = new DeferredPromise<readonly ISessionWorktree[]>();
			let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
			let scans = 0;
			const { editor, container } = createEditor({
				getWorktrees: async (_age, onUpdate) => {
					if (scans++ === 0) {
						publish = onUpdate;
						onUpdate?.(initial);
						return finished.p;
					}
					return worktrees;
				},
			});
			await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
			const workspace = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
			workspace.value = URI.file('/repos/app').toString();
			workspace.dispatchEvent(new mainWindow.Event('change'));
			publish?.(worktrees);
			await timeout(100);
			workspace.value = URI.file('/repos/other').toString();
			workspace.dispatchEvent(new mainWindow.Event('change'));
			const checkbox = () => container.querySelector<HTMLElement>('.session-worktree-cleanup-list .session-worktree-cleanup-row [role="checkbox"]')!;
			const toggle = selection === 'row'
				? checkbox()
				: container.querySelector<HTMLElement>('.session-worktree-cleanup-select-all [role="checkbox"]')!;
			toggle.click();
			toggle.click();
			const states = [checkbox().getAttribute('aria-checked')];
			try {
				publish?.(worktrees);
				await timeout(100);
				states.push(checkbox().getAttribute('aria-checked'));
			} finally {
				await finished.complete(worktrees);
				await timeout(0);
			}
			states.push(checkbox().getAttribute('aria-checked'));
			const age = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-age')!;
			for (const days of [7, 0]) {
				age.value = String(days);
				age.dispatchEvent(new mainWindow.Event('change'));
				await timeout(0);
				states.push(checkbox().getAttribute('aria-checked'));
			}
			assert.deepStrictEqual(states, ['false', 'false', 'false', 'false', 'false']);
		}));
	}

	test('does not preselect unknown-age unlinked worktrees under an age filter but preserves explicit selection', async () => {
		const unlinked = createUnlinkedWorktree('leftover');
		const { container, cleaned } = await openEditor([unlinked]);
		const age = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-age')!;
		const checkbox = () => container.querySelector<HTMLElement>('.session-worktree-cleanup-row [role="checkbox"]')!;
		const states = [checkbox().getAttribute('aria-checked')];
		age.value = '7';
		age.dispatchEvent(new mainWindow.Event('change'));
		await timeout(0);
		states.push(checkbox().getAttribute('aria-checked'));
		checkbox().click();
		age.value = '30';
		age.dispatchEvent(new mainWindow.Event('change'));
		await timeout(0);
		states.push(checkbox().getAttribute('aria-checked'));
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({ states, cleaned }, {
			states: ['true', 'false', 'true'],
			cleaned: [[getWorktreeCleanupId(unlinked)]],
		});
	});

	test('finishes opening before worktree sessions load and then updates the results', async () => {
		const worktrees = new DeferredPromise<readonly ISessionWorktree[]>();
		const { editor, container } = createEditor({ getWorktrees: () => worktrees.p });
		const input = disposables.add(new SessionWorktreeCleanupEditorInput());
		let opened = false;
		const opening = editor.setInput(input, undefined, {}, CancellationToken.None).then(() => { opened = true; });
		try {
			await timeout(0);
			assert.deepStrictEqual({
				opened,
				heading: container.querySelector('details > summary')?.textContent,
				loading: container.querySelector('.session-worktree-cleanup-summary')?.textContent,
				pickerDisabled: container.querySelector<HTMLSelectElement>('select')?.disabled,
			}, {
				opened: true,
				heading: 'Automatic Cleanup',
				loading: 'Measuring worktree storage...',
				pickerDisabled: true,
			});
		} finally {
			await worktrees.complete([]);
			await opening;
		}

		assert.deepStrictEqual({
			emptyStateVisible: !container.querySelector('.session-worktree-cleanup-empty')?.classList.contains('hidden'),
			pickerDisabled: container.querySelector<HTMLSelectElement>('select')?.disabled,
		}, { emptyStateVisible: true, pickerDisabled: false });
	});

	test('updates individual sizes without waiting for all scans or resetting selections', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const finished = new DeferredPromise<readonly ISessionWorktree[]>();
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		const first = createWorktree('first', '/repos/app');
		const second = createWorktree('second', '/repos/app');
		const pending = { ...second, sizeBytes: undefined, cleanupState: 'unavailable' as const, isMeasuring: true };
		const measuredSecond = { ...second, sizeBytes: 200 };
		const { editor, container } = createEditor({
			getWorktrees: async (_age, onUpdate) => {
				publish = onUpdate;
				onUpdate?.([first, pending]);
				return finished.p;
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const rows = () => [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')];
		try {
			assert.deepStrictEqual(rows().map(row => ({
				storage: row.querySelector('.storage')?.textContent,
				disabled: row.querySelector('[role="checkbox"]')?.getAttribute('aria-disabled'),
			})), [
				{ storage: '100B', disabled: null },
				{ storage: 'Calculating…', disabled: undefined },
			]);
			const initialRows = rows();
			initialRows[0].querySelector<HTMLElement>('[role="checkbox"]')!.click();
			focusElement(initialRows[1].querySelector<HTMLElement>('a')!);
			publish?.([first, measuredSecond]);
			await timeout(100);
			assert.deepStrictEqual({
				reordered: rows().map(row => row.querySelector('a')?.textContent),
				focused: mainWindow.document.activeElement?.textContent,
				storage: rows().map(row => row.querySelector('.storage')?.textContent),
				checked: rows().map(row => row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')),
			}, {
				reordered: ['second', 'first'],
				focused: 'second',
				storage: ['200B', '100B'],
				checked: ['true', 'false'],
			});
		} finally {
			await finished.complete([first, measuredSecond]);
		}
	}));

	test('coalesces intermediate measurement renders and cancels on close', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const finished = new DeferredPromise<readonly ISessionWorktree[]>();
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		let scanToken = CancellationToken.None;
		const worktree = createWorktree('measured', '/repos/app');
		const { editor, container } = createEditor({
			getWorktrees: async (_age, onUpdate, token = CancellationToken.None) => {
				publish = onUpdate;
				scanToken = token;
				onUpdate?.([{ ...worktree, sizeBytes: undefined, isMeasuring: true }]);
				return finished.p;
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		const initialRow = container.querySelector('.session-worktree-cleanup-session-link');
		for (let sizeBytes = 1; sizeBytes <= 100; sizeBytes++) {
			publish?.([{ ...worktree, sizeBytes }]);
		}
		assert.strictEqual(container.querySelector('.session-worktree-cleanup-session-link'), initialRow);
		await timeout(100);
		assert.strictEqual(container.querySelector('.session-worktree-cleanup-row:not(.header) .storage')?.textContent, '100B');
		editor.clearInput();
		assert.strictEqual(scanToken.isCancellationRequested, true);
		await finished.complete([worktree]);
	}));

	test('bounds rendered rows for 2000 worktrees while keyboard navigation and filtered select all reach off-screen rows', async () => {
		const worktrees = Array.from({ length: 2000 }, (_, index) => createWorktree(`worktree-${index}`, index < 1000 ? '/repos/app' : '/repos/other'));
		let measurements = 0;
		const requests: string[][] = [];
		const { editor, container, instantiationService, opened } = createEditor({
			getWorktrees: async () => { measurements++; return worktrees; },
			cleanupWorktrees: async candidates => { requests.push(candidates.map(candidate => getWorktreeCleanupId(candidate))); return false; },
		});
		editor.layout(new dom.Dimension(960, 600));
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const renderedCount = () => container.querySelectorAll('.session-worktree-cleanup-row:not(.header)').length;
		const initialCount = renderedCount();
		const listNode = container.querySelector<HTMLElement>('.session-worktree-cleanup-table-body .monaco-list')!;
		focusElement(listNode);
		const list = instantiationService.get(IListService).lastFocusedList;
		assert.ok(list instanceof WorkbenchTable);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')!.click();
		await instantiationService.invokeFunction(CommandsRegistry.getCommand('list.focusLast')!.handler);
		await timeout(0);
		const last = [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].find(row => row.querySelector('a')?.textContent === 'worktree-1999')!;
		const position = last.parentElement?.getAttribute('aria-posinset');
		const total = last.parentElement?.getAttribute('aria-setsize');
		listNode.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		const lastChecked = last.querySelector('[role="checkbox"]')?.getAttribute('aria-checked');
		await instantiationService.invokeFunction(CommandsRegistry.getCommand('list.select')!.handler);
		await instantiationService.invokeFunction(CommandsRegistry.getCommand('list.focusFirst')!.handler);
		await timeout(0);
		const firstChecked = container.querySelector('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')?.getAttribute('aria-checked');
		let peakRows = initialCount;
		for (const index of [500, 1000, 1500, 0]) {
			list.scrollTop = index * 44;
			peakRows = Math.max(peakRows, renderedCount());
		}
		container.querySelector<HTMLElement>('.session-worktree-cleanup-select-all [role="checkbox"]')!.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
		picker.value = URI.file('/repos/app').toString();
		picker.dispatchEvent(new mainWindow.Event('change'));
		container.querySelector<HTMLElement>('.session-worktree-cleanup-select-all [role="checkbox"]')!.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			bounded: initialCount > 0 && peakRows <= 20,
			measurements,
			position,
			total,
			firstChecked,
			lastChecked,
			opened,
			requests: requests.map(ids => ({ count: ids.length, first: ids[0], last: ids[ids.length - 1] })),
		}, {
			bounded: true,
			measurements: 1,
			position: '2000',
			total: '2000',
			firstChecked: 'false',
			lastChecked: 'false',
			opened: ['test:/worktree-1999'],
			requests: [
				{ count: 2000, first: 'worktree-0', last: 'worktree-1999' },
				{ count: 1000, first: 'worktree-0', last: 'worktree-999' },
			],
		});
	});

	test('updates only the changed visible storage cell and defers off-screen rendering', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		let worktrees = Array.from({ length: 1000 }, (_, index) => createWorktree(`worktree-${index}`, '/repos/app'));
		const finished = new DeferredPromise<readonly ISessionWorktree[]>();
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		const { editor, container, instantiationService } = createEditor({
			getWorktrees: async (_age, onUpdate) => { publish = onUpdate; onUpdate?.(worktrees); return finished.p; },
		});
		editor.layout(new dom.Dimension(960, 600));
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		const table = container.querySelector('.session-worktree-cleanup-list')!;
		const header = table.querySelector('.monaco-table-th');
		const first = table.querySelector('.session-worktree-cleanup-row:not(.header)')!;
		const firstLink = first.querySelector('a');
		const records: MutationRecord[] = [];
		const observer = new mainWindow.MutationObserver(mutations => records.push(...mutations));
		disposables.add(toDisposable(() => observer.disconnect()));
		observer.observe(table, { subtree: true, childList: true });
		try {
			worktrees = worktrees.map((worktree, index) => index === 0 ? { ...worktree, sizeBytes: 200 } : worktree);
			publish?.(worktrees);
			await timeout(100);
			const visibleUpdate = {
				changes: records.length,
				onlyStorageChanged: records.every(record => record.target === first.querySelector('.storage')),
				sameHeader: table.querySelector('.monaco-table-th') === header,
				sameLink: first.querySelector('a') === firstLink,
			};
			records.length = 0;
			worktrees = worktrees.map((worktree, index) => index === 900 ? { ...worktree, sizeBytes: 99 } : worktree);
			publish?.(worktrees);
			await timeout(100);
			const offscreenChanges = records.length;
			focusElement(table.querySelector<HTMLElement>('.monaco-list')!);
			const list = instantiationService.get(IListService).lastFocusedList;
			assert.ok(list instanceof WorkbenchTable);
			list.reveal(999);
			const last = [...table.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].find(row => row.querySelector('a')?.textContent === 'worktree-900');
			assert.deepStrictEqual({
				visibleUpdate,
				offscreenChanges,
				scrolledStorage: last?.querySelector('.storage')?.textContent,
			}, {
				visibleUpdate: { changes: 1, onlyStorageChanged: true, sameHeader: true, sameLink: true },
				offscreenChanges: 0,
				scrolledStorage: '99B',
			});
		} finally {
			observer.disconnect();
			await finished.complete(worktrees);
		}
	}));

	test('uses native table columns that stay aligned after resizing and horizontal scrolling', async () => {
		const { editor, container, instantiationService } = createEditor({
			getWorktrees: async () => [createWorktree('first', '/repos/app'), createWorktree('second', '/repos/app')],
		});
		editor.layout(new dom.Dimension(960, 600));
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		focusElement(container.querySelector<HTMLElement>('.monaco-list')!);
		const table = instantiationService.get(IListService).lastFocusedList;
		assert.ok(table instanceof WorkbenchTable);
		const tableNode = table.getHTMLElement();
		const headers = [...tableNode.querySelectorAll<HTMLElement>('.monaco-table-th')];
		const row = tableNode.querySelector('.session-worktree-cleanup-row')!;
		const cells = [...row.querySelectorAll<HTMLElement>('.monaco-table-td')];
		const aligned = () => headers.length === 6 && cells.length === 6 && headers.every((header, index) => {
			const heading = header.getBoundingClientRect();
			const cell = cells[index].getBoundingClientRect();
			return heading.width > 0 && Math.abs(heading.width - cell.width) < 1 && Math.abs(heading.left - cell.left) < 1;
		});
		const initialWidth = cells[1].getBoundingClientRect().width;
		table.resizeColumn(1, 45);
		const resized = cells[1].getBoundingClientRect().width !== initialWidth && aligned();
		editor.layout(new dom.Dimension(320, 600));
		const body = container.querySelector<HTMLElement>('.session-worktree-cleanup-table-body')!;
		body.scrollLeft = 100;
		body.dispatchEvent(new mainWindow.Event('scroll'));
		const narrow = {
			overflows: body.scrollWidth > body.clientWidth,
			scrolled: body.scrollLeft > 0,
			aligned: aligned(),
			sameCell: tableNode.querySelector('.monaco-table-td') === cells[0],
		};
		editor.layout(new dom.Dimension(960, 600));
		assert.deepStrictEqual({
			columns: table.getColumnLabels(),
			resized,
			narrow,
			wideAligned: aligned(),
		}, {
			columns: ['', 'Session', 'Workspace', 'Last Session Activity', 'Disk Usage', 'Status'],
			resized: true,
			narrow: { overflows: true, scrolled: true, aligned: true, sameCell: true },
			wideAligned: true,
		});
	});

	test('supports table row announcements, native Tab entry, selection and single session activation', async () => {
		const { editor, container, instantiationService, opened } = createEditor({
			getWorktrees: async () => [createWorktree('first', '/repos/app'), createWorktree('second', '/repos/app')],
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const listNode = container.querySelector<HTMLElement>('.monaco-list')!;
		focusElement(listNode);
		const table = instantiationService.get(IListService).lastFocusedList;
		assert.ok(table instanceof WorkbenchTable);
		const initialFocus = table.getFocusedElements();
		await instantiationService.invokeFunction(CommandsRegistry.getCommand('list.focusDown')!.handler);
		const row = [...container.querySelectorAll('.session-worktree-cleanup-row')].find(row => row.querySelector('a')?.textContent === 'second')!;
		const rowNode = row.parentElement!;
		const checkbox = row.querySelector<HTMLElement>('[role="checkbox"]')!;
		const link = row.querySelector<HTMLElement>('a')!;
		listNode.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		const unchecked = checkbox.getAttribute('aria-checked');
		const uncheckedLabel = rowNode.getAttribute('aria-label')?.endsWith('Not selected for cleanup.');
		listNode.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
		const tabFocus = dom.getActiveElement() === checkbox;
		checkbox.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		const checked = checkbox.getAttribute('aria-checked');
		focusElement(listNode);
		await instantiationService.invokeFunction(CommandsRegistry.getCommand('list.select')!.handler);
		for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
			focusElement(link);
			link.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
		}
		assert.deepStrictEqual({
			initialFocus,
			focusedRow: table.getFocusedElements(),
			activeDescendant: listNode.getAttribute('aria-activedescendant') === rowNode.id,
			label: rowNode.getAttribute('aria-label')?.match(/second, worktree path .+, workspace app, last used .+, disk usage 100B\. .*Selected for cleanup\./)?.length === 1,
			position: rowNode.getAttribute('aria-posinset'),
			total: rowNode.getAttribute('aria-setsize'),
			unchecked,
			uncheckedLabel,
			tabFocus,
			checked,
			opened,
		}, {
			initialFocus: ['first'],
			focusedRow: ['second'],
			activeDescendant: true,
			label: true,
			position: '2',
			total: '2',
			unchecked: 'false',
			uncheckedLabel: true,
			tabFocus: true,
			checked: 'true',
			opened: ['test:/second', 'test:/second', 'test:/second'],
		});
	});

	test('header checkboxes do not inherit navigation commands for the previously focused table', async () => {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const { editor, container, instantiationService } = createEditor({
			getWorktrees: async () => [
				createWorktree('available', '/repos/app', 'active'),
			],
		}, contextKeyService);
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const tables = [
			container.querySelector('.session-worktree-cleanup-content > .session-worktree-cleanup-list')!,
		];
		const navigationRules = KeybindingsRegistry.getDefaultKeybindings().filter(rule =>
			rule.command !== null && ['list.focusDown', 'list.focusUp', 'list.focusPageDown', 'list.focusPageUp', 'list.focusFirst', 'list.focusLast'].includes(rule.command)
		);
		assert.ok(navigationRules.length > 0);
		const navigationEnabled = (element: HTMLElement) => navigationRules.some(rule => rule.when!.evaluate(contextKeyService.getContext(element)));
		const states = [];
		for (const table of tables) {
			const previousList = table.querySelector<HTMLElement>('.monaco-list')!;
			focusElement(previousList);
			const lastFocusedList = instantiationService.get(IListService).lastFocusedList;
			const checkbox = table.querySelector<HTMLElement>('.monaco-table-th [role="checkbox"]')!;
			focusElement(checkbox);
			checkbox.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
			states.push({
				bodyNavigation: navigationEnabled(previousList),
				headerNavigation: navigationEnabled(checkbox),
				headerFocused: dom.getActiveElement() === checkbox,
				previousListUnchanged: instantiationService.get(IListService).lastFocusedList === lastFocusedList,
				selected: checkbox.getAttribute('aria-checked'),
			});
		}
		assert.deepStrictEqual(states, [
			{ bodyNavigation: true, headerNavigation: false, headerFocused: true, previousListUnchanged: true, selected: 'true' },
		]);
	});

	test('preserves table focus through reordering and moves to an actionable row when the focused row becomes protected', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = createWorktree('first', '/repos/app');
		const second = createWorktree('second', '/repos/app');
		const finished = new DeferredPromise<readonly ISessionWorktree[]>();
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		const { editor, container, instantiationService, opened } = createEditor({
			getWorktrees: async (_age, onUpdate) => { publish = onUpdate; onUpdate?.([first, second]); return finished.p; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		const listNode = container.querySelector<HTMLElement>('.monaco-list')!;
		focusElement(listNode);
		const table = instantiationService.get(IListService).lastFocusedList;
		assert.ok(table instanceof WorkbenchTable);
		try {
			publish?.([first, { ...second, sizeBytes: 200 }]);
			await timeout(100);
			const reordered = {
				focused: dom.getActiveElement() === listNode,
				session: table.getFocusedElements(),
				index: table.getFocus(),
			};
			publish?.([{ ...first, cleanupState: 'pinned' }, second]);
			await timeout(100);
			const unavailableList = listNode;
			const row = [...container.querySelectorAll('.session-worktree-cleanup-row')].find(row => row.querySelector('a')?.textContent === 'second')!;
			const moved = {
				sameTable: container.querySelectorAll('.monaco-table').length === 1,
				focused: dom.getActiveElement() === unavailableList,
				activeDescendant: unavailableList.getAttribute('aria-activedescendant') === row.parentElement?.id,
				titles: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			};
			unavailableList.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
			unavailableList.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
			const link = row.querySelector<HTMLElement>('a')!;
			const tabFocus = dom.getActiveElement() === row.querySelector('[role="checkbox"]');
			link.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			assert.deepStrictEqual({
				reordered,
				moved,
				checkbox: !!row.querySelector('[role="checkbox"]'),
				tabFocus,
				opened,
			}, {
				reordered: { focused: true, session: ['first'], index: [1] },
				moved: { sameTable: true, focused: true, activeDescendant: true, titles: ['second'] },
				checkbox: true,
				tabFocus: true,
				opened: ['test:/second'],
			});
		} finally {
			await finished.complete([{ ...first, cleanupState: 'pinned' }, second]);
		}
	}));

	test('keeps queued and removed rows keyboard accessible with valid busy state', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const scheduling = new DeferredPromise<void>();
		const first = createWorktree('first', '/repos/app');
		let cleaned = false;
		const { editor, container, opened } = createEditor({
			getWorktrees: async () => [cleaned ? removedWorktree(first) : first],
			cleanupWorktrees: async (candidates, onProgress) => {
				onProgress?.({ state: 'started' });
				await scheduling.p;
				cleaned = true;
				return scheduleCleanup(candidates, onProgress);
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const listNode = container.querySelector<HTMLElement>('.monaco-list')!;
		focusElement(listNode);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		const row = container.querySelector('.session-worktree-cleanup-row')!;
		const progressListNode = listNode;
		const queued = { busy: row.getAttribute('aria-busy'), checkbox: row.querySelector('[role="checkbox"]'), spinning: !!row.querySelector('.codicon-loading.codicon-modifier-spin') };
		await scheduling.complete();
		await timeout(100);
		focusElement(progressListNode);
		progressListNode.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		const retainedFocus = dom.getActiveElement() === progressListNode;
		progressListNode.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
		const link = row.querySelector<HTMLElement>('a')!;
		const tabFocus = dom.getActiveElement() === link;
		link.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		assert.deepStrictEqual({
			queued,
			busy: row.getAttribute('aria-busy'),
			spinning: !!row.querySelector('.codicon-loading.codicon-modifier-spin'),
			checkbox: row.querySelector('[role="checkbox"]'),
			retainedFocus,
			tabFocus,
			removedLabel: row.parentElement?.getAttribute('aria-label')?.includes('Worktree removed'),
			opened,
		}, {
			queued: { busy: 'true', checkbox: null, spinning: true },
			busy: null,
			spinning: false,
			checkbox: null,
			retainedFocus: true,
			tabFocus: true,
			removedLabel: true,
			opened: ['test:/first'],
		});
	}));

	test('keeps overall measurement counts across filters and includes failed measurements', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const finished = new DeferredPromise<readonly ISessionWorktree[]>();
		let publish: ((worktrees: readonly ISessionWorktree[], progress?: ISessionWorktreeMeasurementProgress) => void) | undefined;
		const first = { ...createWorktree('first', '/repos/app'), worktreeCount: 2 };
		const second = createWorktree('second', '/repos/other');
		const pending = { ...second, sizeBytes: undefined, isMeasuring: true };
		const failed = { ...second, sizeBytes: undefined, measurementFailed: true };
		const { editor, container } = createEditor({
			getWorktrees: async (_age, onUpdate) => {
				publish = onUpdate;
				onUpdate?.([{ ...first, sizeBytes: undefined, isMeasuring: true }, pending], { scannedWorktrees: 0, totalWorktrees: 4 });
				return finished.p;
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		const progress = container.querySelector<HTMLElement>('.session-worktree-cleanup-measurement-progress')!;
		const counts = [progress.textContent];
		try {
			publish?.([first, pending], { scannedWorktrees: 3, totalWorktrees: 4 });
			await timeout(100);
			counts.push(progress.textContent);
			const workspace = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
			workspace.value = URI.file('/repos/other').toString();
			workspace.dispatchEvent(new mainWindow.Event('change'));
			counts.push(progress.textContent);
		} finally {
			publish?.([first, failed], { scannedWorktrees: 4, totalWorktrees: 4 });
			await finished.complete([first, failed]);
			await timeout(0);
		}
		counts.push(progress.textContent);
		assert.deepStrictEqual({
			counts,
			sameStatus: container.querySelector('.session-worktree-cleanup-measurement-progress') === progress,
			role: progress.getAttribute('role'),
			visible: progress.style.display !== 'none',
		}, {
			counts: [
				'Measuring worktree storage: 0 of 4 worktrees processed.',
				'Measuring worktree storage: 3 of 4 worktrees processed.',
				'Measuring worktree storage: 3 of 4 worktrees processed.',
				'Worktree storage scan complete: 4 of 4 worktrees processed.',
			],
			sameStatus: true,
			role: 'status',
			visible: true,
		});
	}));

	test('requests fresh measurements on opening without a refresh button', async () => {
		const calls: string[] = [];
		const { editor, container } = createEditor({
			refresh: async () => { calls.push('refresh'); },
			getWorktrees: async (_age, _update, _token, forceRefresh) => { calls.push(forceRefresh ? 'fresh load' : 'load'); return []; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		assert.deepStrictEqual({
			calls,
			buttons: [...container.querySelectorAll('.session-worktree-cleanup-controls .monaco-button')].map(button => button.textContent),
		}, { calls: ['fresh load'], buttons: [] });
	});

	test('updates cleanup rows in place through confirmed removal while preserving session links and focus', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = createWorktree('first', '/repos/app');
		const second = createWorktree('second', '/repos/app');
		const existing = createWorktree('existing', '/repos/app', 'archived');
		let archived = false;
		const checked: string[][] = [];
		const { editor, container, opened } = createEditor({
			getWorktrees: async () => [archived ? { ...first, cleanupState: 'archived', cleanupStatus: { state: 'pending' } } : first, archived ? { ...second, cleanupState: 'archived', cleanupStatus: { state: 'pending' } } : second, existing],
			cleanupWorktrees: async (candidates, onProgress) => { archived = true; return scheduleCleanup(candidates, onProgress); },
			refreshPendingCleanup: async ids => { checked.push([...ids]); return [removedWorktree(first), checked.length === 1 ? { ...second, cleanupState: 'archived', cleanupStatus: { state: 'pending' } } : removedWorktree(second), existing]; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		const initialRows = [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')];
		const firstLink = initialRows[0].querySelector('a')!;
		focusElement(firstLink);
		assert.deepStrictEqual([...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map(row => ({
			title: row.querySelector('a')?.textContent,
			progress: rowStatus(row),
		})), [{ title: 'first', progress: 'Cleanup scheduled…' }, { title: 'second', progress: 'Cleanup scheduled…' }]);
		await timeout(2_100);
		assert.deepStrictEqual({
			checked,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
		}, { checked: [['first', 'second']], rows: ['first', 'second'] });
		await timeout(4_100);
		firstLink.click();
		assert.deepStrictEqual({
			checked,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map((row, index) => ({
				sameRow: row === initialRows[index],
				title: row.querySelector('a')?.textContent,
				reason: rowStatus(row),
				storage: row.querySelector('.storage')?.textContent,
				selectable: !!row.querySelector('[role="checkbox"]'),
				busy: row.hasAttribute('aria-busy'),
			})),
			focused: mainWindow.document.activeElement === firstLink,
			opened,
			cleanupDisabled: container.querySelector('.session-worktree-cleanup-action')?.getAttribute('aria-disabled'),
		}, {
			checked: [['first', 'second'], ['second']],
			rows: [
				{ sameRow: true, title: 'first', reason: 'Worktree removed', storage: '0B', selectable: false, busy: false },
				{ sameRow: true, title: 'second', reason: 'Worktree removed', storage: '0B', selectable: false, busy: false },
			],
			focused: true,
			opened: ['test:/first'],
			cleanupDisabled: 'true',
		});
	}));

	test('retains completed workspace filters until reopening without showing archived cleanup failures', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = createWorktree('first', '/repos/app');
		const failed: ISessionWorktree = { ...createWorktree('old-timeout', '/other/app', 'archived'), cleanupStatus: { state: 'failed', message: 'git timed out' } };
		let scheduled = false;
		let removed = false;
		const requests: string[][] = [];
		const checked: string[][] = [];
		const { editor, container } = createEditor({
			getWorktrees: async () => [removed ? removedWorktree(first) : scheduled ? { ...first, cleanupState: 'archived', cleanupStatus: { state: 'pending' } } : first, failed],
			cleanupWorktrees: async (candidates, onProgress) => {
				requests.push(candidates.map(candidate => getWorktreeCleanupId(candidate)));
				scheduled = true;
				return scheduleCleanup(candidates, onProgress);
			},
			refreshPendingCleanup: async ids => { checked.push([...ids]); removed = true; return [removedWorktree(first), failed]; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
		const selectWorkspace = (path: string) => {
			picker.value = URI.file(path).toString();
			picker.dispatchEvent(new Event(dom.EventType.CHANGE));
		};
		selectWorkspace('/repos/app');
		container.querySelector<HTMLElement>('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')!.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(2_100);
		const completed = {
			workspace: picker.value,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			reason: rowStatus(container),
		};
		selectWorkspace('/other/app');
		const failure = rowStatus(container);
		selectWorkspace('/repos/app');
		const restoredFilter = rowStatus(container);
		editor.clearInput();
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		assert.deepStrictEqual({
			requests,
			checked,
			completed,
			failure,
			restoredFilter,
			reopened: [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map(row => ({
				title: row.querySelector('a')?.textContent,
				reason: rowStatus(row),
				disabled: row.querySelector('[role="checkbox"]')?.getAttribute('aria-disabled'),
				checked: row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
			})),
		}, {
			requests: [['first']],
			checked: [['first']],
			completed: { workspace: URI.file('/repos/app').toString(), rows: ['first'], reason: 'Worktree removed' },
			failure: undefined,
			restoredFilter: 'Worktree removed',
			reopened: [],
		});
	}));

	test('keeps row order stable while archived sizes are hidden and cleanup status changes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = { ...createWorktree('first', '/repos/app'), sizeBytes: 300 };
		const second = { ...createWorktree('second', '/repos/app'), sizeBytes: 200 };
		const existing = { ...createWorktree('existing', '/repos/app', 'archived'), sizeBytes: 100 };
		let archived = false;
		let checks = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => archived
				? [{ ...first, sizeBytes: undefined, cleanupState: 'archived', cleanupStatus: { state: 'pending' } }, { ...second, sizeBytes: undefined, cleanupState: 'archived', cleanupStatus: { state: 'pending' } }, existing]
				: [first, second, existing],
			cleanupWorktrees: async (candidates, onProgress) => { archived = true; return scheduleCleanup(candidates, onProgress); },
			refreshPendingCleanup: async () => ++checks === 1
				? [{ ...first, sizeBytes: undefined, cleanupState: 'archived', cleanupStatus: { state: 'running' } }, { ...second, sizeBytes: undefined, cleanupState: 'archived', cleanupStatus: { state: 'pending' } }, existing]
				: [removedWorktree(first), removedWorktree(second), existing],
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(2_100);
		const rowsAfterShrink = [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent);
		await timeout(4_100);
		assert.deepStrictEqual({
			rowsAfterShrink,
			rowsAfterRemoval: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
		}, {
			rowsAfterShrink: ['first', 'second'],
			rowsAfterRemoval: ['first', 'second'],
		});
	}));

	test('limits existence polling without claiming removal when the host has no cleanup status support', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree = createWorktree('first', '/repos/app');
		let archived = false;
		let checks = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => [archived ? { ...worktree, cleanupState: 'archived' } : worktree],
			cleanupWorktrees: async (candidates, onProgress) => { archived = true; return scheduleCleanup(candidates, onProgress); },
			refreshPendingCleanup: async () => { checks++; return [{ ...worktree, cleanupState: 'archived' }]; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(30_001);
		assert.deepStrictEqual({
			checks,
			spinning: !!container.querySelector('.codicon-loading.codicon-modifier-spin'),
			reason: rowStatus(container),
		}, { checks: 3, spinning: false, reason: undefined });
	}));

	for (const cleanupStatus of [undefined, { state: 'unknown' as const }]) {
		test(`shows pending feedback instead of retry instructions while awaiting ${cleanupStatus ? 'unknown' : 'unsupported'} host progress`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const first = createWorktree('first', '/repos/app');
			const archived: ISessionWorktree = { ...first, cleanupState: 'archived', sizeBytes: undefined, worktreeExists: true, cleanupStatus };
			let scheduled = false;
			const { editor, container } = createEditor({
				getWorktrees: async () => [scheduled ? archived : first],
				cleanupWorktrees: async (candidates, onProgress) => { scheduled = true; return scheduleCleanup(candidates, onProgress); },
				refreshPendingCleanup: async () => [archived],
			});
			await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
			await timeout(0);
			container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
			await timeout(0);
			const row = container.querySelector('.session-worktree-cleanup-row')!;
			const pending = {
				reason: rowStatus(row),
				accessibleReason: row.parentElement?.getAttribute('aria-label')?.includes('Waiting for cleanup…'),
				busy: row.getAttribute('aria-busy'),
				spinning: !!row.querySelector('.codicon-loading.codicon-modifier-spin'),
				selectable: !!row.querySelector('[role="checkbox"]'),
			};
			await timeout(30_001);
			assert.deepStrictEqual({
				pending,
				finishedRows: container.querySelectorAll('.session-worktree-cleanup-row').length,
			}, {
				pending: { reason: 'Waiting for cleanup…', accessibleReason: true, busy: 'true', spinning: true, selectable: false },
				finishedRows: 0,
			});
		}));
	}

	test('queues confirmed rows immediately, prevents duplicate submission, and preserves unchecked rows', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = { ...createWorktree('first', '/repos/app'), worktreeCount: 2 };
		const second = createWorktree('second', '/repos/app');
		const remaining = createWorktree('remaining', '/repos/app');
		const finished = new DeferredPromise<void>();
		let submitted = false;
		let requests = 0;
		let checks = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => submitted
				? [{ ...first, cleanupState: 'archived', cleanupStatus: { state: 'pending' } }, { ...second, cleanupState: 'archived', cleanupStatus: { state: 'pending' } }, remaining]
				: [first, second, remaining],
			cleanupWorktrees: async (candidates, onProgress) => {
				requests++;
				onProgress?.({ state: 'started' });
				await finished.p;
				submitted = true;
				for (const candidate of candidates) {
					onProgress?.({ state: 'scheduled', candidate });
				}
				return true;
			},
			refreshPendingCleanup: async () => [removedWorktree(first), ++checks === 1 ? { ...second, cleanupState: 'archived', cleanupStatus: { state: 'pending' } } : removedWorktree(second), remaining],
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const rows = () => [...container.querySelectorAll<HTMLElement>('.session-worktree-cleanup-row:not(.header)')];
		const remainingRow = rows()[2];
		remainingRow.querySelector<HTMLElement>('[role="checkbox"]')!.click();
		const cleanup = container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!;
		cleanup.click();
		cleanup.click();
		const queued = {
			requests,
			disabled: cleanup.getAttribute('aria-disabled'),
			reasons: rows().map(row => rowStatus(row)),
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
		};
		await finished.complete();
		await timeout(0);
		const afterScheduling = {
			sameRemainingRow: rows().find(row => row.querySelector('a')?.textContent === 'remaining') === remainingRow,
			checked: remainingRow.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
		};
		await timeout(2_100);
		const partial = container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent;
		await timeout(4_100);
		assert.deepStrictEqual({
			queued,
			afterScheduling,
			partial,
			complete: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			rows: rows().map(row => row.querySelector('a')?.textContent),
			checked: remainingRow.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
		}, {
			queued: {
				requests: 1,
				disabled: 'true',
				reasons: ['Queued for cleanup…', 'Queued for cleanup…', 'Has session'],
				summary: 'Cleanup: 0 of 3 worktrees removed, 3 pending.',
			},
			afterScheduling: { sameRemainingRow: true, checked: 'false' },
			partial: 'Cleanup: 2 of 3 worktrees removed, 1 pending.',
			complete: 'Cleanup: 3 worktrees removed.',
			rows: ['first', 'second', 'remaining'],
			checked: 'false',
		});
	}));

	test('canceling confirmation keeps selection and creates no batch', async () => {
		const confirmation = new DeferredPromise<boolean>();
		let requests = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => [createWorktree('first', '/repos/app')],
			cleanupWorktrees: async () => { requests++; return confirmation.p; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const cleanup = container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!;
		cleanup.click();
		cleanup.click();
		await confirmation.complete(false);
		await timeout(0);
		assert.deepStrictEqual({
			requests,
			disabled: cleanup.getAttribute('aria-disabled'),
			batchHidden: container.querySelector('.session-worktree-cleanup-batch')?.classList.contains('hidden'),
			checked: container.querySelector('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')?.getAttribute('aria-checked'),
		}, { requests: 1, disabled: 'false', batchHidden: true, checked: 'true' });
	});

	test('coalesces cleanup progress renders and flushes the final outcome before reconciliation', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktrees = Array.from({ length: 50 }, (_, index) => createWorktree(`session-${index}`, '/repos/app'));
		const scheduling = new DeferredPromise<void>();
		const reconciliation = new DeferredPromise<readonly ISessionWorktree[]>();
		let loads = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => ++loads === 1 ? worktrees : reconciliation.p,
			cleanupWorktrees: async (candidates, onProgress) => {
				onProgress?.({ state: 'started' });
				for (const candidate of candidates.slice(0, -1)) {
					onProgress?.({ state: 'scheduled', candidate });
				}
				await scheduling.p;
				onProgress?.({ state: 'failed', candidate: candidates[candidates.length - 1], message: 'host disconnected' });
				return true;
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		/* eslint-disable local/code-no-bracket-notation-for-identifiers -- Count actual renders without exposing a test-only API. */
		const originalRenderRows = editor['renderRows'];
		const renderRows = spy(originalRenderRows);
		editor['renderRows'] = renderRows;
		disposables.add(toDisposable(() => { editor['renderRows'] = originalRenderRows; }));
		/* eslint-enable local/code-no-bracket-notation-for-identifiers */
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		const queued = rowStatus(container);
		const renderCounts = [renderRows.callCount];
		await timeout(99);
		renderCounts.push(renderRows.callCount);
		await timeout(1);
		renderCounts.push(renderRows.callCount);
		const intervalFlushed = rowStatus(container) !== queued;
		await scheduling.complete();
		await timeout(0);
		renderCounts.push(renderRows.callCount);
		try {
			assert.deepStrictEqual({
				queued,
				renderCounts,
				intervalFlushed,
				summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			}, {
				queued: 'Queued for cleanup…',
				renderCounts: [1, 1, 2, 3],
				intervalFlushed: true,
				summary: 'Cleanup: 0 of 49 worktrees removed, 49 pending.',
			});
		} finally {
			editor.clearInput();
			await reconciliation.complete(worktrees);
			await timeout(100);
		}
	}));

	test('rechecks existence after long scheduling batches without claiming unverified removal', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktrees = [createWorktree('first', '/repos/app'), createWorktree('second', '/repos/app')];
		const checked: string[][] = [];
		let scheduled = false;
		const { editor, container } = createEditor({
			getWorktrees: async () => scheduled ? worktrees.map(worktree => ({ ...worktree, cleanupState: 'archived' })) : worktrees,
			cleanupWorktrees: async (candidates, onProgress) => {
				onProgress?.({ state: 'started' });
				onProgress?.({ state: 'scheduled', candidate: candidates[0] });
				await timeout(31_000);
				onProgress?.({ state: 'scheduled', candidate: candidates[1] });
				scheduled = true;
				return true;
			},
			refreshPendingCleanup: async ids => { checked.push([...ids]); return worktrees.map(removedWorktree); },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(31_001);
		const pending = container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent;
		await timeout(2_100);
		assert.deepStrictEqual({
			pending,
			checked,
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
		}, {
			pending: 'Cleanup: 0 of 2 worktrees removed, 2 pending.',
			checked: [['first', 'second']],
			summary: 'Cleanup: 2 worktrees removed.',
		});
	}));

	test('closing the editor during scheduling ignores late batch updates', async () => {
		const finished = new DeferredPromise<void>();
		let loads = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => { loads++; return [createWorktree('first', '/repos/app')]; },
			cleanupWorktrees: async (candidates, onProgress) => {
				onProgress?.({ state: 'started' });
				await finished.p;
				for (const candidate of candidates) {
					onProgress?.({ state: 'scheduled', candidate });
				}
				return true;
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		editor.clearInput();
		await finished.complete();
		await timeout(0);
		assert.deepStrictEqual({
			loads,
			batchHidden: container.querySelector('.session-worktree-cleanup-batch')?.classList.contains('hidden'),
			rows: container.querySelectorAll('.session-worktree-cleanup-row:not(.header)').length,
		}, { loads: 1, batchHidden: true, rows: 0 });
	});

	for (const dispose of [false, true]) {
		test(`${dispose ? 'disposing' : 'closing'} the editor during reconciliation does not recreate rows`, async () => {
			const worktree = createWorktree('first', '/repos/app');
			const reconciliation = new DeferredPromise<readonly ISessionWorktree[]>();
			let loads = 0;
			const { editor, container } = createEditor({
				getWorktrees: async () => ++loads === 1 ? [worktree] : reconciliation.p,
				cleanupWorktrees: async (candidates, onProgress) => scheduleCleanup(candidates, onProgress),
			});
			await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
			await timeout(0);
			container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
			await timeout(0);
			if (dispose) {
				editor.dispose();
			} else {
				editor.clearInput();
			}
			await reconciliation.complete([worktree]);
			await timeout(0);
			assert.deepStrictEqual({
				loads,
				rows: container.querySelectorAll('.session-worktree-cleanup-row:not(.header)').length,
			}, { loads: 2, rows: 0 });
		});
	}

	test('shows a gear-labeled automatic cleanup disclosure without separate configure actions', () => {
		const { container } = createEditor();
		const section = container.querySelector<HTMLDetailsElement>('details')!;
		const summary = section.querySelector<HTMLElement>('summary')!;
		const states = [section.open];
		focusElement(summary);
		summary.click();
		states.push(section.open);
		summary.click();
		states.push(section.open);
		assert.deepStrictEqual({
			heading: summary.textContent,
			headingIcons: container.querySelectorAll('h2 .codicon').length,
			gears: container.querySelectorAll('.codicon-settings-gear').length,
			decorativeIcon: summary.querySelector('.codicon-settings-gear')?.getAttribute('aria-hidden'),
			display: mainWindow.getComputedStyle(summary).display,
			states,
			focused: dom.getActiveElement() === summary,
			configureActions: container.querySelectorAll('.session-worktree-cleanup-configure').length,
			intro: container.querySelector('.session-worktree-cleanup-intro')?.textContent,
		}, {
			heading: 'Automatic Cleanup',
			headingIcons: 0,
			gears: 1,
			decorativeIcon: 'true',
			display: 'flex',
			states: [false, true, false],
			focused: true,
			configureActions: 0,
			intro: 'Free disk space by cleaning up worktrees. Normal cleanup saves changes and keeps branches and session history.',
		});
	});

	function removedWorktree(worktree: ISessionWorktree): ISessionWorktree {
		return { ...worktree, cleanupState: 'archived', worktreeExists: false, sizeBytes: 0 };
	}

	function createUnlinkedWorktree(id: string, workspacePath = '/repos/app'): Extract<ISessionWorktree, { readonly session?: undefined }> {
		return {
			unlinkedWorktree: { providerId: 'test', repository: URI.file(workspacePath).toString(), worktree: URI.file(`${workspacePath}.worktrees/${id}`).toString(), branch: id.startsWith('agents/') ? id : `agents/${id}`, cleanupStatus: { state: 'unknown' } },
			sizeBytes: undefined, worktreeCount: 1, cleanupState: 'unlinked', worktreeExists: true,
		};
	}

	function createWorktree(id: string, workspacePath: string, cleanupState: ISessionWorktree['cleanupState'] = 'eligible', ageDays = 0): Extract<ISessionWorktree, { readonly session: ISession }> {
		return {
			session: upcastPartial<ISession>({
				sessionId: id,
				resource: URI.parse(`test:/${id}`),
				title: constObservable(id),
				isArchived: constObservable(cleanupState === 'archived'),
				updatedAt: constObservable(new Date(Date.now() - ageDays * 24 * 60 * 60 * 1000)),
				workspace: constObservable({
					uri: URI.file(workspacePath),
					label: workspacePath.split('/').pop()!,
					icon: Codicon.folder,
					folders: [],
					requiresWorkspaceTrust: false,
					isVirtualWorkspace: false,
				}),
			}),
			sizeBytes: cleanupState === 'unavailable' || cleanupState === 'archived' ? undefined : 100,
			worktreeExists: cleanupState === 'archived' ? true : undefined,
			worktreeCount: 1,
			cleanupState,
		};
	}

	async function openEditor(worktrees: readonly ISessionWorktree[]) {
		const cleaned: string[][] = [];
		const ages: number[] = [];
		const { editor, container } = createEditor({
			getWorktrees: async age => { ages.push(age); return worktrees; },
			cleanupWorktrees: async candidates => { cleaned.push(candidates.map(candidate => getWorktreeCleanupId(candidate))); return false; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		return { editor, container, cleaned, ages };
	}

	test('shows the selected worktree count and estimated size together and updates with selection and filters', async () => {
		const { container } = await openEditor([
			{ ...createWorktree('first', '/repos/app'), sizeBytes: 300, worktreeCount: 2 },
			{ ...createWorktree('second', '/other/app'), sizeBytes: 100 },
		]);
		const button = container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!;
		const selectionState = () => ({ label: button.textContent, accessibleLabel: button.getAttribute('aria-label'), disabled: button.getAttribute('aria-disabled') });
		const states = [selectionState()];
		container.querySelector<HTMLElement>('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')!.click();
		states.push(selectionState());
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
		picker.value = URI.file('/other/app').toString();
		picker.dispatchEvent(new Event(dom.EventType.CHANGE));
		states.push(selectionState());
		container.querySelector<HTMLElement>('.session-worktree-cleanup-select-all [role="checkbox"]')!.click();
		states.push(selectionState());
		assert.deepStrictEqual(states, [
			{ label: 'Clean Up 3 Worktrees (~400B)', accessibleLabel: 'Clean Up 3 Worktrees, estimated disk usage 400B', disabled: 'false' },
			{ label: 'Clean Up 1 Worktree (~100B)', accessibleLabel: 'Clean Up 1 Worktree, estimated disk usage 100B', disabled: 'false' },
			{ label: 'Clean Up Worktrees', accessibleLabel: 'Clean Up Worktrees', disabled: 'true' },
			{ label: 'Clean Up 1 Worktree (~100B)', accessibleLabel: 'Clean Up 1 Worktree, estimated disk usage 100B', disabled: 'false' },
		]);
	});

	test('hides archived sizes and mixed totals while keeping unmeasured retries preselected', async () => {
		const { container, cleaned } = await openEditor([
			{ ...createWorktree('active', '/repos/app'), sizeBytes: 1024 ** 3 },
			{ ...createWorktree('archived', '/repos/app', 'archived'), sizeBytes: 134 * 1024 ** 3, cleanupStatus: { state: 'unknown' } },
		]);
		const button = container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!;
		const rows = [...container.querySelectorAll<HTMLElement>('.session-worktree-cleanup-row:not(.header)')];
		const initial = {
			storage: rows.map(row => row.querySelector('.storage')?.textContent),
			checked: rows.map(row => row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')),
			archivedLabel: rows[0].parentElement?.getAttribute('aria-label')?.includes('disk usage Not measured for done sessions'),
			summary: container.querySelector('.session-worktree-cleanup-summary')?.textContent,
			button: button.textContent,
			accessibleButton: button.getAttribute('aria-label'),
		};
		rows[0].querySelector<HTMLElement>('[role="checkbox"]')!.click();
		const activeOnly = button.textContent;
		rows[0].querySelector<HTMLElement>('[role="checkbox"]')!.click();
		rows[1].querySelector<HTMLElement>('[role="checkbox"]')!.click();
		const archivedOnly = button.textContent;
		button.click();
		await timeout(0);
		assert.deepStrictEqual({ initial, activeOnly, archivedOnly, cleaned }, {
			initial: {
				storage: ['Not measured', '1.00GB'],
				checked: ['true', 'true'],
				archivedLabel: true,
				summary: '2 of 2 matching worktrees can be cleaned up. Estimated disk usage: 1.00GB known, 1 unmeasured.',
				button: 'Clean Up 2 Worktrees (~1.00GB known, 1 unmeasured)',
				accessibleButton: 'Clean Up 2 Worktrees, estimated disk usage 1.00GB known, 1 unmeasured',
			},
			activeOnly: 'Clean Up 1 Worktree (~1.00GB)',
			archivedOnly: 'Clean Up 1 Worktree',
			cleaned: [['archived']],
		});
	});

	test('preselects available archived worktrees but keeps removal issues out of normal cleanup', async () => {
		const { container, cleaned } = await openEditor([
			{ ...createWorktree('unknown', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' } },
			{ ...createWorktree('failed', '/repos/app', 'archived'), cleanupStatus: { state: 'failed', message: 'permission denied' } },
			{ ...createWorktree('shared', '/repos/app', 'archived'), cleanupStatus: { state: 'inUse' } },
			{ ...createWorktree('deferred', '/repos/app', 'archived'), cleanupStatus: { state: 'skipped' } },
			{ ...createWorktree('pending', '/repos/app', 'archived'), cleanupStatus: { state: 'pending' } },
			{ ...createWorktree('running', '/repos/app', 'archived'), cleanupStatus: { state: 'running' } },
			createWorktree('unsupported', '/repos/app', 'archived'),
		]);
		const rows = [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')];
		const states = rows.map(row => ({
			disabled: row.querySelector('[role="checkbox"]')?.getAttribute('aria-disabled'),
			checked: row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
			reason: rowStatus(row),
			accessibleReason: row.parentElement?.getAttribute('aria-label')?.includes(rowStatus(row)!),
		}));
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		const labels = [
			'Worktree still exists. Select to retry cleanup.',
			'Cleanup scheduled…',
			'Cleaning up…',
		];
		assert.deepStrictEqual({ states, cleaned }, {
			states: labels.map((reason, index) => ({ disabled: index === 0 ? null : undefined, checked: index === 0 ? 'true' : undefined, reason, accessibleReason: true })),
			cleaned: [['unknown']],
		});
	});

	test('omits confirmed absent archived worktrees and preselects actual leftovers on every opening', async () => {
		const worktrees: ISessionWorktree[] = [
			removedWorktree(createWorktree('removed', '/repos/app', 'archived')),
			{ ...createWorktree('leftover', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' } },
		];
		const { editor, container } = createEditor({ getWorktrees: async () => worktrees });
		const openings: { title: string | null | undefined; checked: string | null | undefined; storage: string | null | undefined }[][] = [];
		for (let index = 0; index < 2; index++) {
			await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
			await timeout(0);
			openings.push([...container.querySelectorAll('.session-worktree-cleanup-row')].map(row => ({
				title: row.querySelector('a')?.textContent,
				checked: row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
				storage: row.querySelector('.storage')?.textContent,
			})));
			editor.clearInput();
		}
		assert.deepStrictEqual(openings, [
			[{ title: 'leftover', checked: 'true', storage: 'Not measured' }],
			[{ title: 'leftover', checked: 'true', storage: 'Not measured' }],
		]);
	});

	for (const cleanupState of ['archived', 'unlinked'] as const) {
		test(`preserves unchecked ${cleanupState} leftovers and pending checks across an initially empty refresh`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const first = createWorktree('first', '/repos/app');
			const leftover: ISessionWorktree = cleanupState === 'archived'
				? { ...createWorktree('leftover', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' } }
				: {
					unlinkedWorktree: { providerId: 'test', repository: URI.file('/repos/app').toString(), worktree: URI.file('/repos/app.worktrees/leftover').toString(), branch: 'agents/leftover', cleanupStatus: { state: 'unknown' } },
					sizeBytes: undefined, worktreeCount: 1, cleanupState: 'unlinked', worktreeExists: true,
				};
			let scheduled = false;
			const checked: string[][] = [];
			const { editor, container } = createEditor({
				getWorktrees: async (_age, onUpdate) => {
					if (scheduled) {
						onUpdate?.([]);
						await timeout(0);
					}
					return [scheduled ? { ...first, cleanupState: 'archived' } : first, leftover];
				},
				cleanupWorktrees: async (candidates, onProgress) => { scheduled = true; return scheduleCleanup(candidates, onProgress); },
				refreshPendingCleanup: async ids => { checked.push([...ids]); return [removedWorktree(first), leftover]; },
			});
			await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
			await timeout(0);
			const leftoverRow = () => [...container.querySelectorAll('.session-worktree-cleanup-row')].find(row => row.querySelector('a')?.textContent === (cleanupState === 'unlinked' ? 'agents/leftover' : 'leftover'))!;
			leftoverRow().querySelector<HTMLElement>('[role="checkbox"]')!.click();
			container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
			await timeout(2_200);
			assert.deepStrictEqual({
				checked,
				leftoverSelected: leftoverRow().querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
				summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			}, { checked: [['first']], leftoverSelected: 'false', summary: 'Cleanup: 1 worktree removed.' });
		}));
	}

	for (const verification of ['missing-row', 'unsupported', 'failed'] as const) {
		test(`does not claim removal after scheduling when existence is ${verification}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const first = createWorktree('first', '/repos/app');
			const after: ISessionWorktree[] = verification === 'missing-row' ? [] : [{
				...first, cleanupState: 'archived', sizeBytes: undefined,
				worktreeCheckError: verification === 'failed' ? 'Host disconnected' : undefined,
			}];
			let scheduled = false;
			const { editor, container } = createEditor({
				getWorktrees: async () => scheduled ? after : [first],
				cleanupWorktrees: async (candidates, onProgress) => { scheduled = true; return scheduleCleanup(candidates, onProgress); },
				refreshPendingCleanup: async () => after,
			});
			await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
			await timeout(0);
			container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
			await timeout(30_001);
			assert.deepStrictEqual({
				rows: container.querySelectorAll('.session-worktree-cleanup-row').length,
				batchHidden: container.querySelector('.session-worktree-cleanup-batch')?.classList.contains('hidden'),
				summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			}, {
				rows: 0,
				batchHidden: true,
				summary: 'Cleanup: 0 worktrees removed.',
			});
		}));
	}

	test('preselects archived worktrees without measurement and preserves manual deselection during updates', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const finished = new DeferredPromise<readonly ISessionWorktree[]>();
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		const worktree: ISessionWorktree = { ...createWorktree('archived', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' } };
		const { editor, container } = createEditor({
			getWorktrees: async (_age, onUpdate) => {
				publish = onUpdate;
				onUpdate?.([worktree]);
				return finished.p;
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		const checkbox = () => container.querySelector<HTMLElement>('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')!;
		const states = [checkbox()?.getAttribute('aria-checked')];
		try {
			publish?.([worktree]);
			await timeout(100);
			states.push(checkbox().getAttribute('aria-checked'));
			checkbox().click();
			publish?.([{ ...worktree, sizeBytes: 200 }]);
			await timeout(100);
			states.push(checkbox().getAttribute('aria-checked'));
		} finally {
			await finished.complete([worktree]);
			await timeout(0);
		}
		states.push(checkbox().getAttribute('aria-checked'));
		assert.deepStrictEqual(states, ['true', 'true', 'false', 'false']);
	}));

	test('keeps polling host-confirmed cleanup beyond thirty seconds and hides an actual failure', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree = createWorktree('pending', '/repos/app', 'archived');
		let failed = false;
		const { editor, container } = createEditor({
			getWorktrees: async () => [{ ...worktree, cleanupStatus: { state: 'pending' } }],
			refreshPendingCleanup: async () => [{ ...worktree, cleanupStatus: failed ? { state: 'failed', message: 'worktree is locked' } : { state: 'pending' } }],
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(31_000);
		const pending = rowStatus(container);
		failed = true;
		await timeout(30_100);
		assert.deepStrictEqual({
			pending,
			failed: rowStatus(container),
			disabled: container.querySelector('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')?.getAttribute('aria-disabled'),
			checked: container.querySelector('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')?.getAttribute('aria-checked'),
			spinning: !!container.querySelector('.codicon-modifier-spin'),
		}, { pending: 'Cleanup scheduled…', failed: undefined, disabled: undefined, checked: undefined, spinning: false });
	}));

	test('updates cleanup counts for worktrees already pending or running when opened', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktrees: ISessionWorktree[] = [
			{ ...createWorktree('pending', '/repos/app', 'archived'), cleanupStatus: { state: 'pending' } },
			{ ...createWorktree('running', '/repos/app', 'archived'), cleanupStatus: { state: 'running' } },
			{ ...createUnlinkedWorktree('pending'), cleanupStatus: { state: 'pending' } },
			{ ...createUnlinkedWorktree('running'), cleanupStatus: { state: 'running' } },
		];
		const available = createWorktree('available', '/repos/app');
		let checks = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => worktrees,
			refreshPendingCleanup: async () => {
				checks++;
				return checks === 1
					? [removedWorktree(worktrees[0]), ...worktrees.slice(1)]
					: [...worktrees.map(removedWorktree), available];
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const snapshot = () => ({
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			controlsHidden: container.querySelector('.session-worktree-cleanup-summary-row')?.classList.contains('hidden'),
			removed: [...container.querySelectorAll('.status')].filter(reason => reason.textContent?.includes('Worktree removed')).length,
		});
		const states = [snapshot()];
		await timeout(2_100);
		states.push(snapshot());
		await timeout(4_100);
		states.push(snapshot());
		assert.deepStrictEqual(states, [
			{ summary: 'Cleanup: 0 of 4 worktrees removed, 4 pending.', controlsHidden: false, removed: 0 },
			{ summary: 'Cleanup: 1 of 4 worktrees removed, 3 pending.', controlsHidden: false, removed: 1 },
			{ summary: 'Cleanup: 4 worktrees removed.', controlsHidden: false, removed: 4 },
		]);
	}));

	test('retries thrown cleanup refresh errors and shows completion without reopening', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree: ISessionWorktree = { ...createWorktree('pending', '/repos/app', 'archived'), cleanupStatus: { state: 'pending' } };
		let checks = 0;
		const { editor, container, errors } = createEditor({
			getWorktrees: async () => [worktree],
			refreshPendingCleanup: async () => {
				if (++checks === 1) {
					throw new Error('Host disconnected');
				}
				return [removedWorktree(worktree)];
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(6_100);
		assert.deepStrictEqual({
			checks, errors,
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			reason: rowStatus(container),
			controlsHidden: container.querySelector('.session-worktree-cleanup-summary-row')?.classList.contains('hidden'),
		}, {
			checks: 2, errors: ['Host disconnected'],
			summary: 'Cleanup: 1 worktree removed.',
			reason: 'Worktree removed',
			controlsHidden: true,
		});
	}));

	test('select all is centered above the row checkboxes in the selection column', async () => {
		const { container } = await openEditor([createWorktree('available', '/repos/app')]);
		container.style.setProperty('--vscode-spacing-size80', '8px');
		const checkbox = container.querySelector<HTMLElement>('.session-worktree-cleanup-select-all > .monaco-checkbox')!;
		const header = checkbox.parentElement!;
		const rowCheckbox = container.querySelector<HTMLElement>('.session-worktree-cleanup-row .selection > .monaco-checkbox')!;
		const checkboxBounds = checkbox.getBoundingClientRect();
		const headerBounds = header.getBoundingClientRect();
		const rowBounds = rowCheckbox.getBoundingClientRect();
		assert.deepStrictEqual({
			inSelectionHeader: header.matches('.monaco-table-th[data-col-index="0"]'),
			headerHasNoLabel: header.textContent,
			visible: checkboxBounds.width > 0 && checkboxBounds.height > 0,
			horizontallyCentered: Math.abs(checkboxBounds.left + checkboxBounds.width / 2 - headerBounds.left - headerBounds.width / 2) < 1,
			verticallyCentered: Math.abs(checkboxBounds.top + checkboxBounds.height / 2 - headerBounds.top - headerBounds.height / 2) < 1,
			alignedWithRows: Math.abs(checkboxBounds.left - rowBounds.left) < 1,
		}, {
			inSelectionHeader: true,
			headerHasNoLabel: '',
			visible: true,
			horizontallyCentered: true,
			verticallyCentered: true,
			alignedWithRows: true,
		});
	});

	for (const count of [1, 200]) {
		test(`does not move focus or reveal a cleanup candidate in ${count} sorted results`, async () => {
			const worktrees = Array.from({ length: count }, (_, index) => ({ ...createWorktree(`worktree-${index}`, '/repos/app'), sizeBytes: index + 1 }));
			let scheduled = false;
			const { editor, container } = createEditor({
				getWorktrees: async () => worktrees.map(worktree => scheduled ? { ...worktree, cleanupState: 'archived', cleanupStatus: { state: 'pending' } } : worktree),
				cleanupWorktrees: async (candidates, onProgress) => { scheduled = true; return scheduleCleanup(candidates, onProgress); },
			});
			editor.layout(new dom.Dimension(960, 600));
			await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
			await timeout(0);
			const initiallyRendered = [...container.querySelectorAll('.session-worktree-cleanup-session-link')].some(link => link.textContent === 'worktree-0');
			const button = container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!;
			focusElement(button);
			button.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			await timeout(0);
			const focused = dom.getActiveElement();
			assert.deepStrictEqual({
				initiallyRendered,
				controlsHidden: container.querySelector('.session-worktree-cleanup-summary-row')?.classList.contains('hidden'),
				focusedInResults: !!focused && !!container.querySelector('.session-worktree-cleanup-list')?.contains(focused),
				firstRendered: [...container.querySelectorAll('.session-worktree-cleanup-list .session-worktree-cleanup-session-link')].some(link => link.textContent === 'worktree-0'),
			}, { initiallyRendered: count === 1, controlsHidden: false, focusedInResults: false, firstRendered: count === 1 });
		});
	}

	test('continues polling pending cleanup through request errors beyond thirty seconds', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree: ISessionWorktree = { ...createWorktree('pending', '/repos/app', 'archived'), cleanupStatus: { state: 'pending' } };
		let disconnected = true;
		let checks = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => [worktree],
			refreshPendingCleanup: async () => {
				checks++;
				return disconnected ? [{ ...worktree, cleanupStatusError: 'host disconnected' }] : [];
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(31_000);
		const duringError = {
			reason: rowStatus(container),
			disabled: container.querySelector('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')?.getAttribute('aria-disabled'),
		};
		const previousChecks = checks;
		disconnected = false;
		await timeout(30_100);
		assert.deepStrictEqual({
			duringError,
			resumedPolling: checks > previousChecks,
			rows: container.querySelectorAll('.session-worktree-cleanup-row:not(.header)').length,
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
		}, {
			duringError: { reason: undefined, disabled: undefined },
			resumedPolling: true,
			rows: 0,
			summary: 'Cleanup: 0 worktrees removed.',
		});
	}));

	test('workspace filtering disambiguates names and restricts select all and cleanup to visible rows', async () => {
		const { container, cleaned } = await openEditor([
			createWorktree('first', '/repos/app'),
			createWorktree('second', '/other/app'),
			createWorktree('third', '/repos/app'),
			createWorktree('unique', '/repos/zeta'),
		]);
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
		const options = [...picker.options].map(option => option.textContent);
		picker.value = URI.file('/repos/app').toString();
		picker.dispatchEvent(new Event(dom.EventType.CHANGE));
		const rows = [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-select-all [role="checkbox"]')!.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);

		assert.deepStrictEqual({ options, rows, cleaned }, {
			options: ['All workspaces', 'app (file:///repos/app)', 'app (file:///other/app)', 'zeta'],
			rows: ['first', 'third'],
			cleaned: [['first', 'third']],
		});
	});

	test('shows the workspace picker only when multiple distinct workspaces are available', async () => {
		let worktrees: readonly ISessionWorktree[] = [];
		const { editor, container } = createEditor({ getWorktrees: async () => worktrees });
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
		const label = picker.parentElement!;
		const states = [];
		for (const nextWorktrees of [
			[],
			[createWorktree('first', '/repos/app'), createWorktree('second', '/repos/app')],
			[createWorktree('first', '/repos/app'), createWorktree('other', '/other/app')],
			[createWorktree('first', '/repos/app'), createWorktree('second', '/repos/app')],
			[],
		]) {
			worktrees = nextWorktrees;
			editor.showAllWorktrees();
			await timeout(0);
			states.push({
				visible: mainWindow.getComputedStyle(label).display !== 'none',
				ariaHidden: label.getAttribute('aria-hidden'),
				selected: picker.value,
				rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			});
			if (worktrees.some(worktree => getWorktreeCleanupId(worktree) === 'other')) {
				picker.value = URI.file('/repos/app').toString();
				picker.dispatchEvent(new Event(dom.EventType.CHANGE));
			}
		}

		assert.deepStrictEqual(states, [
			{ visible: false, ariaHidden: 'true', selected: '', rows: [] },
			{ visible: false, ariaHidden: 'true', selected: '', rows: ['first', 'second'] },
			{ visible: true, ariaHidden: null, selected: '', rows: ['first', 'other'] },
			{ visible: false, ariaHidden: 'true', selected: '', rows: ['first', 'second'] },
			{ visible: false, ariaHidden: 'true', selected: '', rows: [] },
		]);
	});

	test('age filtering includes all ages by default and can return to recently used worktrees', async () => {
		const { container, ages } = await openEditor([
			createWorktree('recent', '/repos/app'),
			createWorktree('old', '/repos/app', 'eligible', 30),
		]);
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-age')!;
		const rows = () => [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent);
		const states = [rows()];
		for (const days of [7, 60, 0]) {
			picker.value = String(days);
			picker.dispatchEvent(new Event(dom.EventType.CHANGE));
			await timeout(0);
			states.push(rows());
		}

		assert.deepStrictEqual({ ages, states }, {
			ages: [0, 7, 60, 0],
			states: [['recent', 'old'], ['old'], [], ['recent', 'old']],
		});
	});

	test('allows manually selecting active sessions and sessions waiting for input', async () => {
		const { container, cleaned } = await openEditor([
			createWorktree('active', '/repos/app', 'active'),
			createWorktree('needsInput', '/repos/app', 'needsInput'),
			createWorktree('running', '/repos/app', 'running'),
		]);
		const rows = [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')];
		const initialChecked = rows.map(row => row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'));
		const selectAll = container.querySelector<HTMLElement>('.session-worktree-cleanup-select-all [role="checkbox"]')!;
		selectAll.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);

		assert.deepStrictEqual({
			summary: container.querySelector('.session-worktree-cleanup-summary')?.textContent,
			selectAllDisabled: selectAll.getAttribute('aria-disabled'),
			initialChecked,
			disabled: rows.map(row => row.querySelector('[role="checkbox"]')?.getAttribute('aria-disabled')),
			checked: rows.map(row => row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')),
			cleaned,
		}, {
			summary: '2 of 2 matching worktrees can be cleaned up. Estimated disk usage: 200B.',
			selectAllDisabled: 'false',
			initialChecked: ['false', 'false'],
			disabled: [null, null],
			checked: ['true', 'true'],
			cleaned: [['active', 'needsInput']],
		});
	});

	test('keeps requested cleanup in inventory through running and confirmed removal', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const retry: ISessionWorktree = { ...createWorktree('retry', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' } };
		const queued: ISessionWorktree = { ...createWorktree('queued', '/repos/app', 'archived'), cleanupStatus: { state: 'pending' } };
		let requested = false;
		let removed = false;
		const { editor, container } = createEditor({
			getWorktrees: async () => [{ ...retry, cleanupStatus: { state: requested ? 'pending' : 'unknown' } }, queued],
			cleanupWorktrees: async (candidates, onProgress) => { requested = true; return scheduleCleanup(candidates, onProgress); },
			refreshPendingCleanup: async () => removed ? [removedWorktree(retry), queued] : [{ ...retry, cleanupStatus: { state: 'running' } }, queued],
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(31_000);
		const main = container.querySelector('.session-worktree-cleanup-list')!;
		const duringCleanup = {
			title: main.querySelector('a')?.textContent,
			reason: rowStatus(main),
			checkboxes: main.querySelectorAll('.session-worktree-cleanup-row:not(.header) [role="checkbox"]').length,
			tables: container.querySelectorAll('.monaco-table').length,
		};
		removed = true;
		await timeout(30_100);
		assert.deepStrictEqual({
			duringCleanup,
			afterCleanup: {
				mainHidden: main.classList.contains('hidden'),
				rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
				reason: rowStatus(main),
			},
		}, {
			duringCleanup: { title: 'retry', reason: 'Cleaning up…', checkboxes: 0, tables: 1 },
			afterCleanup: { mainHidden: false, rows: ['retry', 'queued'], reason: 'Worktree removed' },
		});
	}));

	test('shows a clickable cursor over filter and sort pickers but not their labels', async () => {
		const { container } = await openEditor([
			createWorktree('first', '/repos/app'),
			createWorktree('second', '/repos/other'),
		]);
		const labels = [...container.querySelectorAll<HTMLElement>('.session-worktree-cleanup-controls label')];

		assert.deepStrictEqual(labels.map(label => ({
			labelCursor: mainWindow.getComputedStyle(label).cursor,
			pickerCursor: mainWindow.getComputedStyle(label.querySelector('select')!).cursor,
		})), [
			{ labelCursor: 'default', pickerCursor: 'pointer' },
			{ labelCursor: 'default', pickerCursor: 'pointer' },
			{ labelCursor: 'default', pickerCursor: 'pointer' },
		]);
	});

	test('allows cleaning up worktrees used less than seven days ago', async () => {
		const ages: number[] = [];
		const { editor, container } = createEditor({
			getWorktrees: async age => {
				ages.push(age);
				return [];
			},
		});
		const picker = container.querySelector<HTMLSelectElement>('select')!;
		const options = Array.from(picker.options, option => ({ value: option.value, label: option.textContent }));
		picker.value = '1';
		picker.dispatchEvent(new Event(dom.EventType.CHANGE));
		await timeout(0);
		editor.showAllWorktrees();
		await timeout(0);

		assert.deepStrictEqual({ options: options.slice(0, 4), ages, selected: picker.value }, {
			options: [
				{ value: '0', label: 'Any time' },
				{ value: '1', label: '1 day' },
				{ value: '3', label: '3 days' },
				{ value: '7', label: '7 days' },
			],
			ages: [1, 0],
			selected: '0',
		});
	});

	test('keeps the introduction compact without a command paragraph and places collapsed settings above inventory', () => {
		const { container } = createEditor();
		const settings = container.querySelector<HTMLDetailsElement>('details')!;
		const inventory = container.querySelector('.session-worktree-cleanup-list')!;

		assert.deepStrictEqual({
			introParagraphs: container.querySelectorAll('.session-worktree-cleanup-intro').length,
			boldParagraphs: container.querySelectorAll('.session-worktree-cleanup-content > p strong').length,
			settingsCollapsed: !settings.open,
			settingsBeforeInventory: !!(settings.compareDocumentPosition(inventory) & mainWindow.Node.DOCUMENT_POSITION_FOLLOWING),
		}, {
			introParagraphs: 1,
			boldParagraphs: 0,
			settingsCollapsed: true,
			settingsBeforeInventory: true,
		});
	});

	for (const [index, setting] of [
		ChatConfiguration.AutoMarkAsDoneMergedSessionsAfterDays,
		ChatConfiguration.AutoDeleteMarkedAsDoneMergedSessionsAfterDays,
	].entries()) {
		test(`configures ${setting} inline`, async () => {
			const { container, configuration, updateValue } = createEditor();
			const row = container.querySelectorAll('.session-worktree-cleanup-setting')[index];
			const checkbox = row.querySelector<HTMLElement>('[role="checkbox"]')!;
			const days = row.querySelector<HTMLInputElement>('input[type="number"]')!;
			const getState = () => ({
				checked: checkbox.getAttribute('aria-checked'),
				disabled: days.disabled,
				days: days.value,
				value: configuration.getValue<number>(setting),
			});

			const states = [getState()];
			checkbox.click();
			await Promise.resolve();
			states.push(getState());
			days.value = '30';
			days.dispatchEvent(new Event(dom.EventType.INPUT));
			await Promise.resolve();
			states.push(getState());
			checkbox.click();
			await Promise.resolve();
			states.push(getState());

			assert.deepStrictEqual({ states, updates: updateValue.args }, {
				states: [
					{ checked: 'false', disabled: true, days: '15', value: 0 },
					{ checked: 'true', disabled: false, days: '15', value: 15 },
					{ checked: 'true', disabled: false, days: '30', value: 30 },
					{ checked: 'false', disabled: true, days: '15', value: 0 },
				],
				updates: [
					[setting, 15, ConfigurationTarget.APPLICATION],
					[setting, 30, ConfigurationTarget.APPLICATION],
					[setting, 0, ConfigurationTarget.APPLICATION],
				],
			});
		});
	}

	test('toggles the storage cleanup suggestion inline', async () => {
		const { container, configuration } = createEditor();
		const checkbox = container.querySelectorAll<HTMLElement>('.session-worktree-cleanup-setting [role="checkbox"]')[2];
		checkbox.click();
		await Promise.resolve();

		assert.deepStrictEqual({
			checked: checkbox.getAttribute('aria-checked'),
			value: configuration.getValue<boolean>(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING),
		}, { checked: 'false', value: false });
	});
});
