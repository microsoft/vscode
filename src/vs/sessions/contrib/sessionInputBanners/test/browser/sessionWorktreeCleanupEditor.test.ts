/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { SessionWorktreeCleanupEditor } from '../../browser/sessionWorktreeCleanupEditor.js';
import { SessionWorktreeCleanupEditorInput } from '../../browser/sessionWorktreeCleanupEditorInput.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, ISessionWorktree, ISessionWorktreeCleanupService, ISessionWorktreeMeasurementProgress } from '../../browser/sessionWorktreeCleanupService.js';

suite('SessionWorktreeCleanupEditor', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createEditor(cleanupService: Partial<ISessionWorktreeCleanupService> = {}) {
		const instantiationService = workbenchInstantiationService(undefined, disposables);
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
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({}));
		const editor = disposables.add(instantiationService.createInstance(SessionWorktreeCleanupEditor, new TestEditorGroupView(1)));
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		disposables.add(toDisposable(() => container.remove()));
		editor.create(container);
		return { editor, container, configuration, updateValue };
	}

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
			publish?.([first, measuredSecond]);
			await timeout(100);
			assert.deepStrictEqual({
				sameRows: rows().map(row => initialRows.includes(row)),
				reordered: rows().map(row => row === initialRows[1] ? 'second' : 'first'),
				storage: rows().map(row => row.lastElementChild?.textContent),
				checked: rows().map(row => row.querySelector('[role="checkbox"]')?.getAttribute('aria-checked')),
			}, {
				sameRows: [true, true],
				reordered: ['second', 'first'],
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

	test('shows cleanup progress and removes completed rows without reopening', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = createWorktree('first', '/repos/app');
		const second = createWorktree('second', '/repos/app');
		const existing = createWorktree('existing', '/repos/app', 'archived');
		let archived = false;
		const checked: string[][] = [];
		const { editor, container } = createEditor({
			getWorktrees: async () => [archived ? { ...first, cleanupState: 'archived' } : first, archived ? { ...second, cleanupState: 'archived' } : second, existing],
			cleanupWorktrees: async () => { archived = true; return true; },
			refreshPendingCleanup: async ids => { checked.push([...ids]); return checked.length === 1 ? [{ ...second, cleanupState: 'archived' }, existing] : [existing]; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		assert.deepStrictEqual([...container.querySelectorAll('.session-worktree-cleanup-row:not(.header)')].map(row => ({
			title: row.querySelector('a')?.textContent,
			progress: row.querySelector('.session-worktree-cleanup-reason')?.textContent,
		})), [{ title: 'first', progress: 'Cleaning up…' }, { title: 'second', progress: 'Cleaning up…' }, { title: 'existing', progress: 'Worktree still present. Cleanup retry is unavailable on this host.' }]);
		await timeout(2_100);
		assert.deepStrictEqual({
			checked,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
		}, { checked: [['first', 'second']], rows: ['second', 'existing'] });
		await timeout(4_100);
		assert.deepStrictEqual({
			checked,
			rows: [...container.querySelectorAll('.session-worktree-cleanup-session-link')].map(link => link.textContent),
		}, { checked: [['first', 'second'], ['second']], rows: ['existing'] });
	}));

	test('keeps row order stable while cleanup measurements shrink', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = { ...createWorktree('first', '/repos/app'), sizeBytes: 300 };
		const second = { ...createWorktree('second', '/repos/app'), sizeBytes: 200 };
		const existing = { ...createWorktree('existing', '/repos/app', 'archived'), sizeBytes: 100 };
		let archived = false;
		let checks = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => archived
				? [{ ...first, cleanupState: 'archived' }, { ...second, cleanupState: 'archived' }, existing]
				: [first, second, existing],
			cleanupWorktrees: async () => { archived = true; return true; },
			refreshPendingCleanup: async () => ++checks === 1
				? [{ ...first, sizeBytes: 50, cleanupState: 'archived' }, { ...second, cleanupState: 'archived' }, existing]
				: [{ ...second, cleanupState: 'archived' }, existing],
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
			rowsAfterRemoval: ['second', 'existing'],
		});
	}));

	test('stops showing active progress when cleanup has not completed after repeated checks', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const worktree = createWorktree('first', '/repos/app');
		let archived = false;
		let checks = 0;
		const { editor, container } = createEditor({
			getWorktrees: async () => [archived ? { ...worktree, cleanupState: 'archived' } : worktree],
			cleanupWorktrees: async () => { archived = true; return true; },
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
		}, { checks: 3, spinning: false, reason: 'Worktree still present. Cleanup retry is unavailable on this host.' });
	}));

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
			intro: 'Review all agent session worktrees, or filter by workspace and inactivity period. Inactive, unpinned sessions can be cleaned up to reclaim disk space, including recently used sessions. Active sessions and sessions waiting for input can be selected manually but are not selected by default. Remaining worktrees for sessions already marked as done are selected by default when their host supports retrying cleanup, unless a previous removal failed. Failed cleanup can be retried by selecting the worktree manually. Scheduled or running cleanup cannot be selected again. Any uncommitted changes are committed before the worktree is removed. Cleaning up a session marks it as done; you can restore the session later to recreate its worktree. Expand Unavailable for cleanup to see other worktrees and why they cannot be selected.',
		});
	});

	function createWorktree(id: string, workspacePath: string, cleanupState: ISessionWorktree['cleanupState'] = 'eligible', ageDays = 0): ISessionWorktree {
		return {
			session: upcastPartial<ISession>({
				sessionId: id,
				resource: URI.parse(`test:/${id}`),
				title: constObservable(id),
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
			sizeBytes: cleanupState === 'unavailable' ? undefined : 100,
			worktreeCount: 1,
			cleanupState,
		};
	}

	async function openEditor(worktrees: readonly ISessionWorktree[]) {
		const cleaned: string[][] = [];
		const ages: number[] = [];
		const { editor, container } = createEditor({
			getWorktrees: async age => { ages.push(age); return worktrees; },
			cleanupWorktrees: async candidates => { cleaned.push(candidates.map(candidate => candidate.session.sessionId)); return false; },
		});
		await editor.setInput(disposables.add(new SessionWorktreeCleanupEditorInput()), undefined, {}, CancellationToken.None);
		await timeout(0);
		return { editor, container, cleaned, ages };
	}

	test('preselects archived worktrees except failed removals and allows manual retries with accessible reasons', async () => {
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
		rows[1].querySelector<HTMLElement>('[role="checkbox"]')!.click();
		container.querySelector<HTMLElement>('.session-worktree-cleanup-action')!.click();
		await timeout(0);
		const labels = [
			'Worktree still present. Select to retry cleanup.',
			'Cleanup failed: permission denied',
			'Cleanup blocked: another session or chat uses this worktree.',
			'Cleanup deferred: the worktree could not be safely removed. Select to retry cleanup.',
			'Cleanup scheduled…',
			'Cleaning up…',
			'Worktree still present. Cleanup retry is unavailable on this host.',
		];
		assert.deepStrictEqual({ states, cleaned }, {
			states: labels.map((reason, index) => ({ disabled: index < 4 ? null : undefined, checked: index < 4 ? [0, 2, 3].includes(index) ? 'true' : 'false' : undefined, reason, accessibleReason: reason })),
			cleaned: [['unknown', 'failed', 'shared', 'deferred']],
		});
	});

	test('preselects archived worktrees after measurement without resetting manual deselection', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const finished = new DeferredPromise<readonly ISessionWorktree[]>();
		let publish: ((worktrees: readonly ISessionWorktree[]) => void) | undefined;
		const worktree: ISessionWorktree = { ...createWorktree('archived', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' } };
		const { editor, container } = createEditor({
			getWorktrees: async (_age, onUpdate) => {
				publish = onUpdate;
				onUpdate?.([{ ...worktree, sizeBytes: undefined, isMeasuring: true }]);
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
		assert.deepStrictEqual(states, [undefined, 'true', 'false', 'false']);
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
		}, { pending: 'Cleanup scheduled…', failed: 'Cleanup failed: worktree is locked', disabled: null, checked: 'false' });
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
		container.querySelector<HTMLElement>('.header [role="checkbox"]')!.click();
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
			if (worktrees.some(worktree => worktree.session.sessionId === 'other')) {
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
		const selectAll = container.querySelector<HTMLElement>('.header [role="checkbox"]')!;
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
			summary: '2 of 3 matching worktrees can be cleaned up, reclaiming about 200B.',
			selectAllDisabled: null,
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

	test('keeps requested retries in the main table until confirmed removed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const retry: ISessionWorktree = { ...createWorktree('retry', '/repos/app', 'archived'), cleanupStatus: { state: 'unknown' } };
		const queued: ISessionWorktree = { ...createWorktree('queued', '/repos/app', 'archived'), cleanupStatus: { state: 'pending' } };
		let requested = false;
		let removed = false;
		const { editor, container } = createEditor({
			getWorktrees: async () => [{ ...retry, cleanupStatus: { state: requested ? 'pending' : 'unknown' } }, queued],
			cleanupWorktrees: async () => { requested = true; return true; },
			refreshPendingCleanup: async () => removed ? [queued] : [{ ...retry, cleanupStatus: { state: 'running' } }, queued],
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
			afterCleanup: { mainHidden: true, rows: ['queued'] },
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
