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
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IListService, ListService, WorkbenchTable } from '../../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SessionWorktreeCleanupEditor } from '../../browser/sessionWorktreeCleanupEditor.js';
import { SessionWorktreeCleanupEditorInput } from '../../browser/sessionWorktreeCleanupEditorInput.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, getWorktreeCleanupId, ISessionWorktree, ISessionWorktreeCleanupCandidate, ISessionWorktreeCleanupService, ISessionWorktreeMeasurementProgress, SessionWorktreeCleanupProgress } from '../../browser/sessionWorktreeCleanupService.js';
import '../../../../../workbench/browser/actions/listCommands.js';

suite('SessionWorktreeCleanupEditor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor(cleanupService: Partial<ISessionWorktreeCleanupService> = {}) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
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
		instantiationService.stub(ISessionWorktreeCleanupService, upcastPartial<ISessionWorktreeCleanupService>({ refresh: async () => { }, ...cleanupService }));
		const opened: string[] = [];
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({ openSession: async resource => { opened.push(resource.toString()); return undefined; } }));
		const errors: string[] = [];
		instantiationService.stub(INotificationService, upcastPartial<INotificationService>({ error: error => errors.push(getErrorMessage(error)) }));
		const editor = disposables.add(instantiationService.createInstance(SessionWorktreeCleanupEditor, new TestEditorGroupView(1)));
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		disposables.add(toDisposable(() => container.remove()));
		editor.create(container);
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

	test('shows unlinked worktrees with unknown size, leaves them unselected, and allows explicit cleanup', async () => {
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
			title: 'agents/recoveredNo matching session - /repos/app.worktrees/recovered',
			storage: 'Unknown', lastUsed: 'Unknown', selected: 'false', selectable: null,
			titleRole: 'button', titleTabIndex: 0, announcesPath: true,
			inspectedPaths: Array.from({ length: 2 }, () => ({ content: '/repos/app.worktrees/recovered', focus: true })),
		});
		checkbox.click();
		container.querySelector<HTMLAnchorElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({ requests: requests.map(candidates => candidates.map(getWorktreeCleanupId)), opened }, {
			requests: [[getWorktreeCleanupId(unlinked)]], opened: [],
		});
	});

	test('keeps an unlinked worktree unavailable when its existence check fails', async () => {
		const { container } = await openEditor([{
			unlinkedWorktree: { providerId: 'test', repository: URI.file('/repos/app').toString(), worktree: URI.file('/repos/app.worktrees/unlinked').toString(), branch: 'agents/unlinked', cleanupStatus: { state: 'unknown' } },
			sizeBytes: undefined, worktreeCount: 1, cleanupState: 'unlinked', worktreeCheckError: 'Host disconnected',
		}]);
		const section = container.querySelector<HTMLDetailsElement>('details')!;
		section.open = true;
		section.dispatchEvent(new mainWindow.Event('toggle'));
		assert.deepStrictEqual({
			unavailable: section.querySelector('summary')?.textContent,
			reason: section.querySelector('.session-worktree-cleanup-reason')?.textContent,
			selectable: section.querySelectorAll('[role="checkbox"]').length,
		}, {
			unavailable: 'Unavailable for cleanup (1)',
			reason: 'Couldn\'t check whether the worktree still exists: Host disconnected - /repos/app.worktrees/unlinked',
			selectable: 0,
		});
	});

	test('moves archived git-add exit-128 failures to unavailable without hiding other retryable failures', async () => {
		const { container, cleaned } = await openEditor([
			{ ...createWorktree('blocked', '/repos/app', 'archived'), cleanupStatus: { state: 'failed', message: 'git add exited with code 128: remove the file manually to continue.' } },
			{ ...createWorktree('retryable', '/repos/app', 'archived'), cleanupStatus: { state: 'failed', message: 'git timed out' } },
			{
				unlinkedWorktree: { providerId: 'test', repository: URI.file('/repos/app').toString(), worktree: URI.file('/repos/app.worktrees/unlinked').toString(), branch: 'agents/unlinked', cleanupStatus: { state: 'failed', message: 'git add exited with code 128' } },
				sizeBytes: undefined, worktreeCount: 1, cleanupState: 'unlinked', cleanupStatus: { state: 'failed', message: 'git add exited with code 128' }, worktreeExists: true,
			},
		]);
		const section = container.querySelector<HTMLDetailsElement>('details')!;
		section.open = true;
		section.dispatchEvent(new mainWindow.Event('toggle'));
		assert.deepStrictEqual({
			unavailable: section.querySelector('summary')?.textContent,
			titles: [...section.querySelectorAll('.session-worktree-cleanup-session-link')].map(element => element.textContent),
			reason: section.querySelector('.session-worktree-cleanup-reason')?.textContent,
			selectable: section.querySelectorAll('[role="checkbox"]').length,
			sessionlessReason: [...container.querySelectorAll('.session-worktree-cleanup-reason')].some(element => element.textContent?.startsWith('Cleanup failed; retry scheduled: git add exited with code 128')),
		}, {
			unavailable: 'Unavailable for cleanup (1)',
			titles: ['blocked'],
			reason: 'Unarchive and archive the session to remove this worktree.',
			selectable: 0,
			sessionlessReason: true,
		});
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual(cleaned, [['retryable']]);
	});

	test('moves a git-add exit-128 failure out of an already submitted cleanup batch', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree = { ...createWorktree('blocked', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' as const } };
		const failed = { ...worktree, cleanupStatus: { state: 'failed' as const, message: 'git add exited with code 128' } };
		const { editor, container } = createEditor({
			getWorktrees: async () => [worktree],
			cleanupWorktrees: async (candidates, onProgress) => scheduleCleanup(candidates, onProgress),
			refreshPendingCleanup: async () => [failed],
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(2_100);
		const section = container.querySelector<HTMLDetailsElement>('details')!;
		section.open = true;
		section.dispatchEvent(new mainWindow.Event('toggle'));
		assert.deepStrictEqual({
			unavailable: section.querySelector('summary')?.textContent,
			reason: section.querySelector('.session-worktree-cleanup-reason')?.textContent,
			retryDisabled: container.querySelector('.session-worktree-cleanup-retry')?.getAttribute('aria-disabled'),
		}, {
			unavailable: 'Unavailable for cleanup (1)',
			reason: 'Unarchive and archive the session to remove this worktree.',
			retryDisabled: 'true',
		});
	}));

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
				heading: container.querySelector('h2')?.textContent,
				loading: container.querySelector('.session-worktree-cleanup-summary')?.textContent,
				pickerDisabled: container.querySelector<HTMLSelectElement>('select')?.disabled,
			}, {
				opened: true,
				heading: 'Cleanup Settings',
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
				storage: row.lastElementChild?.textContent,
				disabled: row.querySelector('[role="checkbox"]')?.getAttribute('aria-disabled'),
			})), [
				{ storage: '100B', disabled: null },
				{ storage: 'Calculating…', disabled: undefined },
			]);
			const initialRows = rows();
			initialRows[0].querySelector<HTMLElement>('[role="checkbox"]')!.click();
			container.querySelector<HTMLDetailsElement>('details')!.open = true;
			focusElement(initialRows[1].querySelector<HTMLElement>('a')!);
			publish?.([first, measuredSecond]);
			await timeout(100);
			assert.deepStrictEqual({
				reordered: rows().map(row => row.querySelector('a')?.textContent),
				focused: mainWindow.document.activeElement?.textContent,
				storage: rows().map(row => row.lastElementChild?.textContent),
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
		assert.strictEqual(container.querySelector('.session-worktree-cleanup-row:not(.header)')?.lastElementChild?.textContent, '100B');
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
				onlyStorageChanged: records.every(record => record.target === first.lastElementChild),
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
				scrolledStorage: last?.lastElementChild?.textContent,
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

	test('virtualizes protected worktrees without making them selectable', async () => {
		const { editor, container } = await openEditor(Array.from({ length: 2000 }, (_, index) => createWorktree(`pinned-${index}`, '/repos/app', 'pinned')));
		editor.layout(new dom.Dimension(480, 600));
		const section = container.querySelector<HTMLDetailsElement>('details')!;
		section.open = true;
		section.dispatchEvent(new mainWindow.Event('toggle'));
		const count = section.querySelectorAll('.session-worktree-cleanup-row:not(.header)').length;
		assert.deepStrictEqual({
			bounded: count > 0 && count <= 20,
			summary: section.querySelector('summary')?.textContent,
			selectable: section.querySelectorAll('[role="checkbox"]').length,
			cleanupDisabled: container.querySelector('.session-worktree-cleanup-action')?.getAttribute('aria-disabled'),
		}, {
			bounded: true,
			summary: 'Unavailable for cleanup (2000)',
			selectable: 0,
			cleanupDisabled: 'true',
		});
	});

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
		const cells = [...tableNode.querySelectorAll<HTMLElement>('.session-worktree-cleanup-row:first-child .monaco-table-td')].slice(0, 5);
		const aligned = () => headers.length === 5 && cells.length === 5 && headers.every((header, index) => {
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
			columns: ['', 'Session', 'Workspace', 'Last Used', 'Disk Usage'],
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
			label: rowNode.getAttribute('aria-label')?.match(/second, workspace app, last used .+, disk usage 100B\. .*Selected for cleanup\./)?.length === 1,
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

	test('preserves logical table focus through reordering and moves to the unavailable table', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
			const unavailable = container.querySelector<HTMLDetailsElement>('details')!;
			const unavailableList = unavailable.querySelector<HTMLElement>('.monaco-list')!;
			const row = unavailable.querySelector('.session-worktree-cleanup-row')!;
			const moved = {
				expanded: unavailable.open,
				focused: dom.getActiveElement() === unavailableList,
				activeDescendant: unavailableList.getAttribute('aria-activedescendant') === row.parentElement?.id,
				explanation: row.parentElement?.getAttribute('aria-label')?.includes('Pinned'),
			};
			unavailableList.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
			unavailableList.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
			const link = row.querySelector<HTMLElement>('a')!;
			const tabFocus = dom.getActiveElement() === link;
			link.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
			assert.deepStrictEqual({
				reordered,
				moved,
				checkbox: row.querySelector('[role="checkbox"]'),
				tabFocus,
				opened,
			}, {
				reordered: { focused: true, session: ['first'], index: [1] },
				moved: { expanded: true, focused: true, activeDescendant: true, explanation: true },
				checkbox: null,
				tabFocus: true,
				opened: ['test:/first'],
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
		const queued = { busy: row.getAttribute('aria-busy'), checkbox: row.querySelector('[role="checkbox"]'), spinning: !!row.querySelector('.codicon-loading.codicon-modifier-spin') };
		await scheduling.complete();
		await timeout(100);
		listNode.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
		const retainedFocus = dom.getActiveElement() === listNode;
		listNode.dispatchEvent(new mainWindow.KeyboardEvent('keydown', { key: 'Tab', keyCode: 9, bubbles: true, cancelable: true }));
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

	test('keeps calculating rows visible and hides finished unknown storage', async () => {
		const { container } = await openEditor([
			createWorktree('unavailable', '/repos/app', 'unavailable'),
			{ ...createWorktree('failed', '/repos/app', 'unavailable'), measurementFailed: true },
			{ ...createWorktree('pending', '/repos/app', 'unavailable'), isMeasuring: true },
		]);
		assert.deepStrictEqual([...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map(row => ({
			title: row.querySelector('a')?.textContent,
			storage: row.lastElementChild?.textContent,
		})), [{ title: 'pending', storage: 'Calculating…' }]);
	});

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

	test('retains verified removed rows, session links, and focus after pending cleanup ends', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
		const initialRows = [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')];
		const firstLink = initialRows[0].querySelector('a')!;
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		focusElement(firstLink);
		assert.deepStrictEqual([...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map(row => ({
			title: row.querySelector('a')?.textContent,
			progress: row.querySelector('.session-worktree-cleanup-reason')?.textContent,
		})), [{ title: 'first', progress: 'Cleanup scheduled…' }, { title: 'second', progress: 'Cleanup scheduled…' }, { title: 'existing', progress: 'Done' }]);
		await timeout(2_100);
		assert.deepStrictEqual({
			checked,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
		}, { checked: [['first', 'second']], rows: ['first', 'second', 'existing'] });
		await timeout(4_100);
		firstLink.click();
		assert.deepStrictEqual({
			checked,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map((row, index) => ({
				sameRow: row === initialRows[index],
				title: row.querySelector('a')?.textContent,
				reason: row.querySelector('a')?.getAttribute('aria-description'),
				storage: row.lastElementChild?.textContent,
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
				{ sameRow: true, title: 'existing', reason: 'Done', storage: '—', selectable: false, busy: false },
			],
			focused: true,
			opened: ['test:/first'],
			cleanupDisabled: 'true',
		});
	}));

	test('retains completed workspace filters until reopening and keeps archived cleanup failures retryable', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
			reason: container.querySelector('.session-worktree-cleanup-reason')?.textContent,
		};
		selectWorkspace('/other/app');
		const failure = container.querySelector('.session-worktree-cleanup-reason')?.textContent;
		selectWorkspace('/repos/app');
		const restoredFilter = container.querySelector('.session-worktree-cleanup-reason')?.textContent;
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
				reason: row.querySelector('.session-worktree-cleanup-reason')?.textContent,
				disabled: row.querySelector('[role="checkbox"]')?.getAttribute('aria-disabled'),
				checked: row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
			})),
		}, {
			requests: [['first']],
			checked: [['first']],
			completed: { workspace: URI.file('/repos/app').toString(), rows: ['first'], reason: 'Worktree removed' },
			failure: 'Cleanup failed; retry scheduled: git timed out',
			restoredFilter: 'Worktree removed',
			reopened: [{ title: 'old-timeout', reason: 'Cleanup failed; retry scheduled: git timed out', disabled: null, checked: 'true' }],
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
			rowsAfterShrink: ['first', 'second', 'existing'],
			rowsAfterRemoval: ['first', 'second', 'existing'],
		});
	}));

	test('limits existence polling and reports unverified removal when the host has no cleanup status support', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
			reason: container.querySelector('.session-worktree-cleanup-reason')?.textContent,
		}, { checks: 3, spinning: false, reason: 'Couldn\'t verify whether the worktree still exists.' });
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
				reason: row.querySelector('.session-worktree-cleanup-reason')?.textContent,
				accessibleReason: row.querySelector('a')?.getAttribute('aria-description'),
				busy: row.getAttribute('aria-busy'),
				spinning: !!row.querySelector('.codicon-loading.codicon-modifier-spin'),
				selectable: !!row.querySelector('[role="checkbox"]'),
			};
			await timeout(30_001);
			assert.deepStrictEqual({
				pending,
				finished: {
					busy: row.getAttribute('aria-busy'),
					spinning: !!row.querySelector('.codicon-loading.codicon-modifier-spin'),
					selectable: !!row.querySelector('[role="checkbox"]'),
				},
			}, {
				pending: { reason: 'Waiting for cleanup…', accessibleReason: 'Waiting for cleanup…', busy: 'true', spinning: true, selectable: false },
				finished: { busy: null, spinning: false, selectable: !!cleanupStatus },
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
			reasons: rows().map(row => row.querySelector('.session-worktree-cleanup-reason')?.textContent),
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
		};
		await finished.complete();
		await timeout(0);
		const afterScheduling = {
			sameRemainingRow: rows()[2] === remainingRow,
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
			remaining: rows().map(row => row.querySelector('a')?.textContent),
			checked: remainingRow.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
		}, {
			queued: {
				requests: 1,
				disabled: 'true',
				reasons: ['Queued for cleanup…', 'Queued for cleanup…', undefined],
				summary: 'Cleanup: 0 of 3 worktrees removed, 3 pending, 0 failed, 0 need attention.',
			},
			afterScheduling: { sameRemainingRow: true, checked: 'false' },
			partial: 'Cleanup: 2 of 3 worktrees removed, 1 pending, 0 failed, 0 need attention.',
			complete: 'Cleanup complete: 3 worktrees removed.',
			remaining: ['first', 'second', 'remaining'],
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
		const queued = container.querySelector('.session-worktree-cleanup-reason')?.textContent;
		const renderCounts = [renderRows.callCount];
		await timeout(99);
		renderCounts.push(renderRows.callCount);
		await timeout(1);
		renderCounts.push(renderRows.callCount);
		const intervalFlushed = container.querySelector('.session-worktree-cleanup-reason')?.textContent !== queued;
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
				summary: 'Cleanup: 0 of 50 worktrees removed, 49 pending, 1 failed, 0 need attention.',
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
			pending: 'Cleanup: 0 of 2 worktrees removed, 2 pending, 0 failed, 0 need attention.',
			checked: [['first', 'second']],
			summary: 'Cleanup complete: 2 worktrees removed.',
		});
	}));

	test('reconciles partial scheduling failures and retries only failed rows without losing completed counts', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = createWorktree('first', '/repos/app');
		const second = createWorktree('second', '/repos/app');
		const remaining = createWorktree('remaining', '/repos/app');
		const requests: string[][] = [];
		let firstRemoved = false;
		let secondRemoved = false;
		const getWorktrees = (): ISessionWorktree[] => [
			firstRemoved ? removedWorktree(first) : requests.length ? { ...first, cleanupState: 'archived' } : first,
			secondRemoved ? removedWorktree(second) : requests.length > 1 ? { ...second, cleanupState: 'archived' } : second,
			remaining,
		];
		const { editor, container, errors } = createEditor({
			getWorktrees: async () => getWorktrees(),
			cleanupWorktrees: async (candidates, onProgress) => {
				requests.push(candidates.map(candidate => getWorktreeCleanupId(candidate)));
				onProgress?.({ state: 'started' });
				for (const candidate of candidates) {
					onProgress?.(getWorktreeCleanupId(candidate) === 'second' && requests.length === 1
						? { state: 'failed', candidate, message: 'host disconnected' }
						: { state: 'scheduled', candidate });
				}
				if (requests.length === 1) {
					throw new Error('Some cleanup requests failed');
				}
				return true;
			},
			refreshPendingCleanup: async () => {
				firstRemoved = true;
				secondRemoved = requests.length > 1;
				return getWorktrees();
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		const row = (title: string) => [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].find(row => row.querySelector('a')?.textContent === title)!;
		row('remaining').querySelector<HTMLElement>('[role="checkbox"]')!.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(2_100);
		const failed = {
			reason: row('second').querySelector('.session-worktree-cleanup-reason')?.textContent,
			checked: row('second').querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
		};
		row('remaining').querySelector<HTMLElement>('[role="checkbox"]')!.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-retry')!.click();
		await timeout(2_100);
		assert.deepStrictEqual({
			requests,
			errors,
			failed,
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			remainingChecked: row('remaining').querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
			cleanupLabel: container.querySelector('.session-worktree-cleanup-action')?.textContent,
			retryDisabled: container.querySelector('.session-worktree-cleanup-retry')?.getAttribute('aria-disabled'),
		}, {
			requests: [['first', 'second'], ['second']],
			errors: ['Some cleanup requests failed'],
			failed: {
				reason: 'Couldn\'t schedule cleanup: host disconnected',
				checked: 'false',
				summary: 'Cleanup results: 1 of 2 worktrees removed, 1 failed, 0 need attention.',
			},
			summary: 'Cleanup complete: 2 worktrees removed.',
			remainingChecked: 'true',
			cleanupLabel: 'Clean Up 1 Worktree (~100B)',
			retryDisabled: 'true',
		});
	}));

	test('keeps batch counts across filters and restricts retry to visible failed worktrees', async () => {
		const worktrees = [createWorktree('first', '/repos/app'), createWorktree('second', '/other/app')];
		const requests: string[][] = [];
		const { editor, container } = createEditor({
			getWorktrees: async () => worktrees,
			cleanupWorktrees: async (candidates, onProgress) => {
				requests.push(candidates.map(candidate => getWorktreeCleanupId(candidate)));
				onProgress?.({ state: 'started' });
				for (const candidate of candidates) {
					onProgress?.({ state: 'failed', candidate, message: 'host disconnected' });
				}
				throw new Error('Some cleanup requests failed');
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
		picker.value = URI.file('/repos/app').toString();
		picker.dispatchEvent(new Event(dom.EventType.CHANGE));
		container.querySelector<HTMLElement>('.session-worktree-cleanup-retry')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			requests,
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
		}, {
			requests: [['first', 'second'], ['first']],
			summary: 'Cleanup results: 0 of 2 worktrees removed, 2 failed, 0 need attention.',
			rows: ['first'],
		});
	});

	test('does not claim cleanup succeeded when the session is not done and storage cannot be measured', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree = createWorktree('first', '/repos/app');
		let submitted = false;
		const { editor, container } = createEditor({
			getWorktrees: async () => [submitted ? { ...worktree, sizeBytes: undefined, cleanupState: 'unavailable', measurementFailed: true } : worktree],
			cleanupWorktrees: async (candidates, onProgress) => { submitted = true; return scheduleCleanup(candidates, onProgress); },
			refreshPendingCleanup: async () => [{ ...worktree, sizeBytes: undefined, cleanupState: 'unavailable', measurementFailed: true }],
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(2_100);
		const pending = container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent;
		await timeout(30_000);
		assert.deepStrictEqual({
			rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
			reason: container.querySelector('.session-worktree-cleanup-reason')?.textContent,
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			pending,
		}, {
			rows: ['first'],
			reason: 'Couldn\'t measure storage. Cleanup has not been confirmed.',
			summary: 'Cleanup results: 0 of 1 worktrees removed, 0 failed, 1 need attention.',
			pending: 'Cleanup: 0 of 1 worktrees removed, 1 pending, 0 failed, 0 need attention.',
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

	test('distinguishes missing storage measurements from an age filter mismatch', async () => {
		const { container } = await openEditor([createWorktree('unavailable', '/repos/app', 'unavailable')]);
		assert.strictEqual(container.querySelector('.session-worktree-cleanup-empty span:last-child')?.textContent, 'No worktrees with available storage measurements.');
	});

	test('shows a text-only settings heading and no configure actions', () => {
		const { container } = createEditor();

		assert.deepStrictEqual({
			heading: container.querySelector('h2')?.textContent,
			headingIcons: container.querySelectorAll('h2 .codicon').length,
			gears: container.querySelectorAll('.codicon-settings-gear').length,
			configureActions: container.querySelectorAll('.session-worktree-cleanup-configure').length,
			intro: container.querySelector('.session-worktree-cleanup-intro')?.textContent,
		}, {
			heading: 'Cleanup Settings',
			headingIcons: 0,
			gears: 0,
			configureActions: 0,
			intro: 'Clean up worktrees to free disk space. Uncommitted changes are committed and sessions marked as done; restore a session to recreate its worktree. Managed worktrees with no matching session can also be selected for cleanup; their branches are kept.',
		});
	});

	function removedWorktree(worktree: ISessionWorktree): ISessionWorktree {
		return { ...worktree, cleanupState: 'archived', worktreeExists: false, sizeBytes: 0 };
	}

	function createWorktree(id: string, workspacePath: string, cleanupState: ISessionWorktree['cleanupState'] = 'eligible', ageDays = 0): ISessionWorktree {
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
			storage: rows.map(row => row.lastElementChild?.textContent),
			checked: rows.map(row => row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')),
			archivedLabel: rows[1].parentElement?.getAttribute('aria-label')?.includes('disk usage not measured for done sessions'),
			summary: container.querySelector('.session-worktree-cleanup-summary')?.textContent,
			button: button.textContent,
			accessibleButton: button.getAttribute('aria-label'),
		};
		rows[1].querySelector<HTMLElement>('[role="checkbox"]')!.click();
		const activeOnly = button.textContent;
		rows[1].querySelector<HTMLElement>('[role="checkbox"]')!.click();
		rows[0].querySelector<HTMLElement>('[role="checkbox"]')!.click();
		const archivedOnly = button.textContent;
		button.click();
		await timeout(0);
		assert.deepStrictEqual({ initial, activeOnly, archivedOnly, cleaned }, {
			initial: {
				storage: ['1.00GB', '—'],
				checked: ['true', 'true'],
				archivedLabel: true,
				summary: '2 of 2 matching worktrees can be cleaned up.',
				button: 'Clean Up 2 Worktrees',
				accessibleButton: 'Clean Up 2 Worktrees',
			},
			activeOnly: 'Clean Up 1 Worktree (~1.00GB)',
			archivedOnly: 'Clean Up 1 Worktree',
			cleaned: [['archived']],
		});
	});

	test('preselects unmeasured archived worktrees including failures and allows retries with accessible reasons', async () => {
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
			reason: row.querySelector('.session-worktree-cleanup-reason')?.textContent,
			accessibleReason: row.querySelector('a')?.getAttribute('aria-description'),
		}));
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		const labels = [
			'Worktree still exists. Select to retry cleanup.',
			'Cleanup failed; retry scheduled: permission denied',
			'Cleanup blocked: another session or chat uses this worktree.',
			'Cleanup deferred: the worktree could not be safely removed.',
			'Cleanup scheduled…',
			'Cleaning up…',
			'Done',
		];
		assert.deepStrictEqual({ states, cleaned }, {
			states: labels.map((reason, index) => ({ disabled: index < 4 ? null : undefined, checked: index < 4 ? 'true' : undefined, reason, accessibleReason: reason })),
			cleaned: [['unknown', 'failed', 'shared', 'deferred']],
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
				storage: row.lastElementChild?.textContent,
			})));
			editor.clearInput();
		}
		assert.deepStrictEqual(openings, [
			[{ title: 'leftover', checked: 'true', storage: '—' }],
			[{ title: 'leftover', checked: 'true', storage: '—' }],
		]);
	});

	test('preserves unchecked archived leftovers and pending checks across an initially empty refresh', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = createWorktree('first', '/repos/app');
		const leftover: ISessionWorktree = { ...createWorktree('leftover', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' } };
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
		const leftoverRow = () => [...container.querySelectorAll('.session-worktree-cleanup-row')].find(row => row.querySelector('a')?.textContent === 'leftover')!;
		leftoverRow().querySelector<HTMLElement>('[role="checkbox"]')!.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(2_200);
		assert.deepStrictEqual({
			checked,
			leftoverSelected: leftoverRow().querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
			summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
		}, { checked: [['first']], leftoverSelected: 'false', summary: 'Cleanup complete: 1 worktree removed.' });
	}));

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
			const row = container.querySelector('.session-worktree-cleanup-row')!;
			assert.deepStrictEqual({
				storage: row.lastElementChild?.textContent,
				reason: row.querySelector('a')?.getAttribute('aria-description'),
				summary: container.querySelector('.session-worktree-cleanup-batch [role="status"]')?.textContent,
			}, {
				storage: '—',
				reason: verification === 'failed' ? 'Couldn\'t check whether the worktree still exists: Host disconnected' : 'Couldn\'t verify whether the worktree still exists.',
				summary: 'Cleanup results: 0 of 1 worktrees removed, 0 failed, 1 need attention.',
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

	test('keeps polling host-confirmed cleanup beyond thirty seconds and shows an actual failure', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree = createWorktree('pending', '/repos/app', 'archived');
		let failed = false;
		const { editor, container } = createEditor({
			getWorktrees: async () => [{ ...worktree, cleanupStatus: { state: 'pending' } }],
			refreshPendingCleanup: async () => [{ ...worktree, cleanupStatus: failed ? { state: 'failed', message: 'worktree is locked' } : { state: 'pending' } }],
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(31_000);
		const pending = container.querySelector('.session-worktree-cleanup-reason')?.textContent;
		failed = true;
		await timeout(30_100);
		assert.deepStrictEqual({
			pending,
			failed: container.querySelector('.session-worktree-cleanup-reason')?.textContent,
			disabled: container.querySelector('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')?.getAttribute('aria-disabled'),
			checked: container.querySelector('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')?.getAttribute('aria-checked'),
			spinning: !!container.querySelector('.codicon-modifier-spin'),
		}, { pending: 'Cleanup scheduled…', failed: 'Cleanup failed; retry scheduled: worktree is locked', disabled: null, checked: 'true', spinning: false });
	}));

	test('explains status request errors without claiming removal failed or retry is unsupported', async () => {
		const { container } = await openEditor([{ ...createWorktree('unavailable', '/repos/app', 'archived'), cleanupStatusError: 'host disconnected' }]);
		assert.strictEqual(container.querySelector('.session-worktree-cleanup-reason')?.textContent, 'Couldn\'t read cleanup status: host disconnected');
	});

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
			reason: container.querySelector('.session-worktree-cleanup-reason')?.textContent,
			disabled: container.querySelector('.session-worktree-cleanup-row:not(.header) [role="checkbox"]')?.getAttribute('aria-disabled'),
		};
		const previousChecks = checks;
		disconnected = false;
		await timeout(30_100);
		assert.deepStrictEqual({
			duringError,
			resumedPolling: checks > previousChecks,
			rows: container.querySelectorAll('.session-worktree-cleanup-row:not(.header)').length,
		}, {
			duringError: { reason: 'Couldn\'t read cleanup status: host disconnected', disabled: undefined },
			resumedPolling: true,
			rows: 0,
		});
	}));

	test('shows recent and protected worktrees with workspace names and eligibility reasons', async () => {
		const { container, ages } = await openEditor([
			createWorktree('recent', '/repos/app'),
			createWorktree('active', '/repos/app', 'active'),
			createWorktree('running', '/repos/other', 'running'),
			createWorktree('unmeasured', '/repos/other', 'unavailable'),
		]);

		assert.deepStrictEqual({
			ages,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map(row => ({
				title: row.querySelector('a')?.textContent,
				workspace: row.querySelector('.workspace')?.textContent,
				disabled: row.querySelector('[role="checkbox"]')?.getAttribute('aria-disabled'),
				reason: row.querySelector('.session-worktree-cleanup-reason')?.textContent ?? '',
				storage: row.lastElementChild?.textContent,
			})),
		}, {
			ages: [0],
			rows: [
				{ title: 'recent', workspace: 'app', disabled: null, reason: '', storage: '100B' },
				{ title: 'active', workspace: 'app', disabled: null, reason: 'Active session', storage: '100B' },
				{ title: 'running', workspace: 'other', disabled: undefined, reason: 'Running', storage: '100B' },
			],
		});
	});

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

	test('shows only the collapsed unavailable section when protected worktrees match', async () => {
		const { container } = await openEditor([createWorktree('pinned', '/repos/app', 'pinned')]);
		assert.deepStrictEqual({
			tableHidden: container.querySelector('.session-worktree-cleanup-list')?.classList.contains('hidden'),
			emptyHidden: container.querySelector('.session-worktree-cleanup-empty')?.classList.contains('hidden'),
			summary: container.querySelector('.session-worktree-cleanup-summary')?.textContent,
			unavailable: container.querySelector('summary')?.textContent,
			expanded: container.querySelector<HTMLDetailsElement>('details')?.open,
			unavailableCheckboxes: container.querySelectorAll('details [role="checkbox"]').length,
			cleanupDisabled: container.querySelector('.session-worktree-cleanup-action')?.getAttribute('aria-disabled'),
		}, {
			tableHidden: true,
			emptyHidden: true,
			summary: '0 of 1 matching worktrees can be cleaned up.',
			unavailable: 'Unavailable for cleanup (1)',
			expanded: false,
			unavailableCheckboxes: 0,
			cleanupDisabled: 'true',
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
			summary: '2 of 3 matching worktrees can be cleaned up. Estimated disk usage: 200B.',
			selectAllDisabled: 'false',
			initialChecked: ['false', 'false', undefined],
			disabled: [null, null, undefined],
			checked: ['true', 'true', undefined],
			cleaned: [['active', 'needsInput']],
		});
	});

	test('groups protected cleanup states without checkboxes and never includes them in cleanup', async () => {
		const states: ISessionWorktree['cleanupState'][] = ['running', 'pinned', 'recent', 'archived', 'untitled', 'error'];
		const { container, cleaned } = await openEditor([
			createWorktree('eligible', '/repos/app'),
			...states.map(state => createWorktree(state, '/repos/app', state)),
		]);
		const protectedRows = [...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].slice(1);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual({
			inUnavailableSection: protectedRows.map(row => !!row.closest('details')),
			checkboxes: protectedRows.map(row => row.querySelectorAll('[role="checkbox"]').length),
			cleaned,
		}, { inUnavailableSection: states.map(() => true), checkboxes: states.map(() => 0), cleaned: [['eligible']] });
	});

	test('keeps unavailable details expanded and focused during measurement updates and filters both groups', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const finished = new DeferredPromise<readonly ISessionWorktree[]>();
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		const worktrees = [
			createWorktree('pinned', '/repos/app', 'pinned'),
			createWorktree('eligible', '/repos/other'),
			{ ...createWorktree('pending', '/repos/other', 'archived'), worktreeCount: 2, cleanupStatus: { state: 'pending' as const } },
		];
		const { editor, container } = createEditor({
			getWorktrees: async (_age, onUpdate) => {
				publish = onUpdate;
				onUpdate?.(worktrees);
				return finished.p;
			},
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		const section = container.querySelector<HTMLDetailsElement>('details')!;
		const summary = section.querySelector('summary')!;
		const titles = (parent: Element) => [...parent.querySelectorAll('a')].map(link => link.textContent);
		const initial = {
			main: titles(container.querySelector('.session-worktree-cleanup-list')!),
			unavailable: titles(section),
			count: summary.textContent,
			expanded: section.open,
		};
		try {
			section.open = true;
			summary.focus();
			publish?.(worktrees.map(worktree => ({ ...worktree, sizeBytes: 200 })));
			await timeout(100);
			const afterUpdate = { expanded: section.open, focused: dom.getActiveElement() === summary };
			const picker = container.querySelector<HTMLSelectElement>('.session-worktree-cleanup-workspace')!;
			picker.value = URI.file('/repos/app').toString();
			picker.dispatchEvent(new Event(dom.EventType.CHANGE));
			assert.deepStrictEqual({
				initial,
				afterUpdate,
				filtered: { mainHidden: container.querySelector('.session-worktree-cleanup-list')?.classList.contains('hidden'), unavailable: titles(section), count: summary.textContent },
			}, {
				initial: { main: ['eligible'], unavailable: ['pinned', 'pending'], count: 'Unavailable for cleanup (3)', expanded: false },
				afterUpdate: { expanded: true, focused: true },
				filtered: { mainHidden: true, unavailable: ['pinned'], count: 'Unavailable for cleanup (1)' },
			});
		} finally {
			await finished.complete(worktrees);
		}
	}));

	test('keeps requested retries in the main table after confirmed removal', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
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
			reason: main.querySelector('.session-worktree-cleanup-reason')?.textContent,
			checkboxes: main.querySelectorAll('.session-worktree-cleanup-row:not(.header) [role="checkbox"]').length,
			unavailable: [...container.querySelectorAll('details a')].map(link => link.textContent),
		};
		removed = true;
		await timeout(30_100);
		assert.deepStrictEqual({
			duringCleanup,
			afterCleanup: { mainHidden: main.classList.contains('hidden'), rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent) },
		}, {
			duringCleanup: { title: 'retry', reason: 'Cleaning up…', checkboxes: 0, unavailable: ['queued'] },
			afterCleanup: { mainHidden: false, rows: ['retry', 'queued'] },
		});
	}));

	test('shows a clickable cursor over both filter pickers but not their labels', async () => {
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

	test('shows the Command Palette command in a bold second paragraph', () => {
		const { container } = createEditor();
		const paragraph = container.querySelector('.session-worktree-cleanup-content > p:nth-child(2)')!;

		assert.deepStrictEqual({
			text: paragraph.textContent,
			boldText: paragraph.querySelector('strong')?.textContent,
		}, {
			text: 'You can return to this editor at any time by running Open Worktree Cleanup from the Command Palette.',
			boldText: 'You can return to this editor at any time by running Open Worktree Cleanup from the Command Palette.',
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
