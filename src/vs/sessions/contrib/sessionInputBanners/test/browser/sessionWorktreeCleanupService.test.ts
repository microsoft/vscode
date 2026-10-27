/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ByteSize } from '../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IProgress, IProgressOptions, IProgressService, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { DEFAULT_CHAT_CAPABILITIES, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsChangeEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, SessionWorktreeCleanupService } from '../../browser/sessionWorktreeCleanupService.js';

suite('SessionWorktreeCleanupService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('refreshes the measurement snapshot when an existing session changes', async () => {
		const updatedAt = observableValue('updatedAt', oldDate());
		const session = upcastPartial<ISession>({ ...createSession('changed', oldDate()), updatedAt });
		let scans = 0;
		const service = disposables.add(createService([session], true, () => ++scans));
		await service.getWorktrees(0);
		await service.getWorktrees(0);
		const unchangedScans = scans;
		updatedAt.set(new Date(), undefined);
		const worktrees = await service.getWorktrees(0);
		assert.deepStrictEqual({ unchangedScans, scans, size: worktrees[0].sizeBytes }, { unchangedScans: 1, scans: 2, size: 2 });
	});

	test('throttles existing hint triggers to once an hour without a recurring timer', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const hour = 60 * 60 * 1000;
		const updatedAt = observableValue('updatedAt', oldDate());
		const changed = upcastPartial<ISession>({ ...createSession('changed', oldDate()), updatedAt });
		const onDidChangeSessions = disposables.add(new Emitter<ISessionsChangeEvent>());
		const requests: string[] = [];
		const service = disposables.add(createService(
			[changed, createSession('unchanged', oldDate())], true,
			session => { requests.push(session.sessionId); return 6 * ByteSize.GB; },
			undefined, undefined, undefined, undefined, undefined, undefined, onDidChangeSessions.event,
		));
		try {
			await service.activate();
			updatedAt.set(new Date(), undefined);
			onDidChangeSessions.fire({ added: [], removed: [], changed: [changed] });
			await timeout(10_001);
			const beforeHour = [...requests];
			await timeout(hour - 10_001);
			const withoutTrigger = [...requests];
			onDidChangeSessions.fire({ added: [], removed: [], changed: [changed] });
			await timeout(10_001);
			const afterTrigger = [...requests];
			await timeout(hour);
			assert.deepStrictEqual({ beforeHour, withoutTrigger, afterTrigger, withoutAnotherTrigger: requests }, {
				beforeHour: ['changed', 'unchanged'],
				withoutTrigger: ['changed', 'unchanged'],
				afterTrigger: ['changed', 'unchanged', 'changed', 'unchanged'],
				withoutAnotherTrigger: ['changed', 'unchanged', 'changed', 'unchanged'],
			});
		} finally {
			service.dispose();
		}
	}));

	test('explicitly opening cleanup shows a fresh size for a new active session and on reopening', async () => {
		const session = createSession('active', new Date(), SessionStatus.InProgress);
		let requests = 0;
		const service = disposables.add(createService([session], true, () => ++requests));
		const first = await service.getWorktrees(0, () => { }, CancellationToken.None, true);
		const reopened = await service.getWorktrees(0, () => { }, CancellationToken.None, true);
		assert.deepStrictEqual([first, reopened].map(worktrees => worktrees.map(worktree => ({
			id: worktree.session.sessionId,
			sizeBytes: worktree.sizeBytes,
			state: worktree.cleanupState,
		}))), [
			[{ id: 'active', sizeBytes: 1, state: 'running' }],
			[{ id: 'active', sizeBytes: 2, state: 'running' }],
		]);
	});

	test('opening cleanup refreshes changed sessions before the next automatic hint check', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const updatedAt = observableValue('updatedAt', oldDate());
		const session = upcastPartial<ISession>({ ...createSession('changed', oldDate()), updatedAt });
		let requests = 0;
		const service = disposables.add(createService([session], true, () => ++requests));
		try {
			await service.activate();
			updatedAt.set(new Date(), undefined);
			const worktrees = await service.getWorktrees(0);
			assert.deepStrictEqual({ requests, size: worktrees[0].sizeBytes }, { requests: 2, size: 2 });
		} finally {
			service.dispose();
		}
	}));

	test('does not repeatedly restart measurement while an existing session keeps changing', async () => {
		const updatedAt = observableValue('updatedAt', oldDate());
		const session = upcastPartial<ISession>({ ...createSession('changed', oldDate()), updatedAt });
		let requests = 0;
		const service = disposables.add(createService([session], true, () => {
			updatedAt.set(new Date(updatedAt.get().getTime() + 1), undefined);
			return ++requests;
		}));
		const first = await service.getWorktrees(0, () => { });
		const second = await service.getWorktrees(0, () => { });
		assert.deepStrictEqual({ requests, sizes: [first[0].sizeBytes, second[0].sizeBytes] }, { requests: 2, sizes: [1, 2] });
	});

	test('uses the existing cleanup suggestion for low disk space with a recent worktree', async () => {
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const service = disposables.add(createService(
			[createSession('recent', new Date())], true, () => undefined,
			undefined, undefined, undefined, (id, args) => commands.push({ id, args }),
		));
		service.setAvailableDiskSpace(ByteSize.GB);
		const description = service.suggestion.get()?.description;
		await service.activate();
		const descriptionAfterScan = service.suggestion.get()?.description;
		await service.suggestion.get()?.manage();
		service.setAvailableDiskSpace(0);

		assert.deepStrictEqual({ description, descriptionAfterScan, commands, dismissed: service.suggestion.get() }, {
			description: 'Your disk is almost full (1.00GB available). Clean up agent session worktrees to free up space.',
			descriptionAfterScan: 'Your disk is almost full (1.00GB available). Clean up agent session worktrees to free up space.',
			commands: [{ id: 'sessions.chat.manageAgentSessionWorktrees', args: ['all'] }],
			dismissed: undefined,
		});
	});

	test('low disk space takes priority and falls back to the ordinary cleanup suggestion on recovery', async () => {
		const service = disposables.add(createService([createSession('eligible', oldDate())], true, () => 6 * ByteSize.GB));
		await service.activate();
		const ordinaryDescription = service.suggestion.get()?.description;
		service.setAvailableDiskSpace(ByteSize.GB);
		const lowDiskDescription = service.suggestion.get()?.description;
		service.setAvailableDiskSpace(undefined);
		assert.deepStrictEqual({
			ordinaryDescription,
			lowDiskDescription,
			recoveredDescription: service.suggestion.get()?.description,
		}, {
			ordinaryDescription: '1 agent session worktree has been inactive for at least 15 days and can be cleaned up, reclaiming about 6.00GB.',
			lowDiskDescription: 'Your disk is almost full (1.00GB available). Clean up agent session worktrees to free up space.',
			recoveredDescription: ordinaryDescription,
		});
	});

	test('low disk suggestion uses the same dismissal and disable actions as ordinary cleanup', async () => {
		const configuration = new TrackingConfigurationService({ [AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: true });
		const service = disposables.add(createService(
			[createSession('recent', new Date())], true, () => 1,
			undefined, undefined, undefined, undefined, undefined, configuration,
		));
		service.setAvailableDiskSpace(ByteSize.GB);
		await service.suggestion.get()?.disable();
		service.setAvailableDiskSpace(0);
		assert.deepStrictEqual({ updates: configuration.updates, suggestion: service.suggestion.get() }, {
			updates: [{ key: AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, value: false }],
			suggestion: undefined,
		});
	});

	test('dismissing the cleanup widget also suppresses later low disk hints for this window', async () => {
		const service = disposables.add(createService([createSession('recent', new Date())], true, () => 1));
		service.setAvailableDiskSpace(ByteSize.GB);
		service.suggestion.get()?.dismiss();
		service.setAvailableDiskSpace(0);
		await service.refresh();
		assert.strictEqual(service.suggestion.get(), undefined);
	});

	for (const [enabled, hasWorktree] of [[false, true], [true, false]]) {
		test(`does not suggest low disk cleanup when enabled=${enabled} and hasWorktree=${hasWorktree}`, () => {
			const service = disposables.add(createService(
				[createSession('recent', new Date(), SessionStatus.Completed, false, hasWorktree)], enabled, () => 1,
			));
			service.setAvailableDiskSpace(0);
			assert.strictEqual(service.suggestion.get(), undefined);
		});
	}

	test('any-time cleanup includes recent worktrees but preserves safety exclusions', async () => {
		const now = new Date();
		const active = createSession('active', now);
		const pinned = createSession('pinned', now);
		const service = disposables.add(createService([
			createSession('recent', now),
			active,
			pinned,
			createSession('running', now, SessionStatus.InProgress),
			createSession('needsInput', now, SessionStatus.NeedsInput),
			createSession('archived', now, SessionStatus.Completed, true),
			createSession('untitled', now, SessionStatus.Untitled),
			createSession('error', now, SessionStatus.Error),
		], true, () => 1, undefined, undefined, upcastPartial<IActiveSession>(active), undefined, pinned));

		assert.deepStrictEqual((await service.getWorktrees(0)).map(worktree => ({
			id: worktree.session.sessionId,
			state: worktree.cleanupState,
		})), [
			{ id: 'recent', state: 'eligible' },
			{ id: 'active', state: 'active' },
			{ id: 'pinned', state: 'pinned' },
			{ id: 'running', state: 'running' },
			{ id: 'needsInput', state: 'needsInput' },
			{ id: 'archived', state: 'archived' },
			{ id: 'untitled', state: 'untitled' },
			{ id: 'error', state: 'error' },
		]);
	});

	test('shows a storage suggestion above the reclaimable-size threshold', async () => {
		const service = disposables.add(createService(
			[createSession('eligible', oldDate())],
			true,
			() => 6 * ByteSize.GB,
		));

		await service.activate();

		assert.deepStrictEqual(service.suggestion.get() && {
			description: service.suggestion.get()?.description,
		}, {
			description: '1 agent session worktree has been inactive for at least 15 days and can be cleaned up, reclaiming about 6.00GB.',
		});
	});

	test('shows a storage suggestion at 20 eligible worktrees below the size threshold', async () => {
		const sessions = Array.from({ length: 20 }, (_, index) => createSession(`session-${index}`, oldDate()));
		const service = disposables.add(createService(sessions, true, () => 1));

		await service.activate();

		assert.strictEqual(service.suggestion.get()?.description, '20 agent session worktrees have been inactive for at least 15 days and can be cleaned up, reclaiming about 20B.');
	});

	test('counts every worktree a session owns toward the worktree threshold', async () => {
		const service = disposables.add(createService(
			[createSession('multi', oldDate(), SessionStatus.Completed, false, true, 20)],
			true,
			() => 1,
		));

		await service.activate();

		assert.strictEqual(service.suggestion.get()?.description, '20 agent session worktrees have been inactive for at least 15 days and can be cleaned up, reclaiming about 1B.');
	});

	test('does not count ineligible worktrees toward the worktree threshold', async () => {
		const sessions = [
			createSession('eligible', oldDate()),
			...Array.from({ length: 19 }, (_, index) => createSession(`archived-${index}`, oldDate(), SessionStatus.Completed, true)),
		];
		const service = disposables.add(createService(sessions, true, () => 1));

		await service.activate();

		assert.strictEqual(service.suggestion.get(), undefined);
	});

	test('requires at least one eligible candidate', async () => {
		const sessions = Array.from({ length: 20 }, (_, index) => createSession(`session-${index}`, oldDate(), SessionStatus.InProgress));
		const service = disposables.add(createService(sessions, true, () => ByteSize.GB));

		await service.activate();

		assert.strictEqual(service.suggestion.get(), undefined);
	});

	test('does not scan when automatic prompting is disabled', async () => {
		let scanCount = 0;
		const sessions = Array.from({ length: 20 }, (_, index) => createSession(`session-${index}`, oldDate()));
		const service = disposables.add(createService(sessions, false, () => {
			scanCount++;
			return ByteSize.GB;
		}));

		await service.activate();

		assert.deepStrictEqual({ scanCount, suggestion: service.suggestion.get() }, { scanCount: 0, suggestion: undefined });
	});

	test('dismisses the automatic suggestion for the service lifetime', async () => {
		const service = disposables.add(createService(
			[createSession('eligible', oldDate())],
			true,
			() => 6 * ByteSize.GB,
		));
		await service.activate();

		service.suggestion.get()?.dismiss();
		await service.activate();

		assert.strictEqual(service.suggestion.get(), undefined);
	});

	test('does not show again after disabling cleanup suggestions', async () => {
		const configurationService = new TrackingConfigurationService({ [AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: true });
		const service = disposables.add(createService(
			[createSession('eligible', oldDate())],
			true,
			() => 6 * ByteSize.GB,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			configurationService,
		));
		await service.activate();

		await service.suggestion.get()?.disable();

		assert.deepStrictEqual({
			enabled: configurationService.getValue(AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING),
			updates: configurationService.updates,
			suggestion: service.suggestion.get(),
		}, {
			enabled: false,
			updates: [{ key: AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, value: false }],
			suggestion: undefined,
		});
	});

	test('opens the storage manager once per window from the storage suggestion', async () => {
		const commands: { id: string; args: readonly unknown[] }[] = [];
		const service = disposables.add(createService(
			[createSession('eligible', oldDate())],
			true,
			() => 6 * ByteSize.GB,
			undefined,
			undefined,
			undefined,
			(id, args) => commands.push({ id, args }),
		));
		await service.activate();

		await service.suggestion.get()?.manage();
		await service.activate();

		assert.deepStrictEqual({
			commands,
			suggestion: service.suggestion.get(),
		}, {
			commands: [{
				id: 'sessions.chat.manageAgentSessionWorktrees',
				args: [],
			}],
			suggestion: undefined,
		});
	});

	test('reuses the qualifying scan when opening the storage manager', async () => {
		let scanCount = 0;
		const progressTitles: (string | undefined)[] = [];
		const onDidChangeSessions = disposables.add(new Emitter<ISessionsChangeEvent>());
		const service = disposables.add(createService(
			[createSession('eligible', oldDate())],
			true,
			() => {
				scanCount++;
				return 6 * ByteSize.GB;
			},
			undefined,
			title => progressTitles.push(title),
			undefined,
			undefined,
			undefined,
			undefined,
			onDidChangeSessions.event,
		));

		await service.activate();
		onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
		const worktrees = await service.getWorktrees(14);

		assert.deepStrictEqual({
			scanCount,
			progressTitles,
			items: worktrees.map(worktree => worktree.session.sessionId),
		}, {
			scanCount: 1,
			progressTitles: [],
			items: ['eligible'],
		});
	});

	test('refreshes after sessions become available following activation', async () => {
		const sessions: ISession[] = [];
		let scanCount = 0;
		const service = disposables.add(createService(
			sessions,
			true,
			() => {
				scanCount++;
				return 6 * ByteSize.GB;
			},
		));

		await service.activate();
		sessions.push(createSession('eligible', oldDate()));
		await service.refresh();

		assert.deepStrictEqual({
			scanCount,
			description: service.suggestion.get()?.description,
		}, {
			scanCount: 1,
			description: '1 agent session worktree has been inactive for at least 15 days and can be cleaned up, reclaiming about 6.00GB.',
		});
	});

	test('worktree manager retains failed measurements and archived worktrees with remaining storage', async () => {
		const eligible = createSession('eligible', oldDate());
		const running = createSession('running', oldDate(), SessionStatus.InProgress);
		const recent = createSession('recent', new Date());
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const unavailable = createSession('unavailable', oldDate());
		const emptyArchived = createSession('empty-archived', oldDate(), SessionStatus.Completed, true);
		const withoutWorktree = createSession('without-worktree', oldDate(), SessionStatus.Completed, false, false);
		const sessions = [eligible, running, recent, archived, unavailable, emptyArchived, withoutWorktree];
		const progressTitles: (string | undefined)[] = [];
		const service = disposables.add(createService(
			sessions,
			true,
			session => session === unavailable ? undefined : session === emptyArchived ? 0 : session === eligible ? 4 * ByteSize.GB : ByteSize.GB,
			undefined,
			title => progressTitles.push(title),
		));

		const worktrees = await service.getWorktrees(14);

		assert.deepStrictEqual({
			progressTitles,
			items: worktrees.map(worktree => ({
				label: worktree.session.title.get(),
				sizeBytes: worktree.sizeBytes,
				state: worktree.cleanupState,
			})),
		}, {
			progressTitles: ['Measuring agent session worktrees...'],
			items: [
				{ label: 'eligible', sizeBytes: 4 * ByteSize.GB, state: 'eligible' },
				{ label: 'running', sizeBytes: ByteSize.GB, state: 'running' },
				{ label: 'recent', sizeBytes: ByteSize.GB, state: 'recent' },
				{ label: 'archived', sizeBytes: ByteSize.GB, state: 'archived' },
				{ label: 'unavailable', sizeBytes: undefined, state: 'unavailable' },
			],
		});
	});

	test('refresh retries failed measurements and drops archived worktrees after storage is removed', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const unavailable = createSession('unavailable', oldDate());
		let refreshed = false;
		const service = disposables.add(createService(
			[archived, unavailable],
			true,
			session => refreshed ? (session === archived ? undefined : ByteSize.GB) : (session === archived ? ByteSize.GB : undefined),
		));

		await service.getWorktrees(14);
		refreshed = true;
		await service.refresh();

		assert.deepStrictEqual((await service.getWorktrees(14)).map(worktree => ({
			label: worktree.session.title.get(),
			sizeBytes: worktree.sizeBytes,
			state: worktree.cleanupState,
		})), [{ label: 'unavailable', sizeBytes: ByteSize.GB, state: 'eligible' }]);
	});

	test('retains an archived worktree measurement failure instead of treating it as removed storage', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		let fail = false;
		const service = disposables.add(createService([archived], true, () => {
			if (fail) {
				throw new Error('Permission denied');
			}
			return ByteSize.GB;
		}));
		await service.getWorktrees(14);
		fail = true;
		await service.refresh();
		assert.deepStrictEqual((await service.getWorktrees(14)).map(worktree => ({
			id: worktree.session.sessionId, failed: worktree.measurementFailed, size: worktree.sizeBytes,
		})), [{ id: 'archived', failed: true, size: undefined }]);
	});

	test('rechecks requested cleanup without rescanning unrelated worktrees', async () => {
		const pending = createSession('pending', oldDate(), SessionStatus.Completed, true);
		const existing = createSession('existing', oldDate(), SessionStatus.Completed, true);
		const eligible = createSession('eligible', oldDate());
		const scans: string[] = [];
		let removed = false;
		const service = disposables.add(createService([pending, existing, eligible], true, session => {
			scans.push(session.sessionId);
			return removed && session === pending ? undefined : ByteSize.GB;
		}));
		await service.getWorktrees(14);
		removed = true;
		const worktrees = await service.refreshPendingCleanup(['pending'], 14);
		assert.deepStrictEqual({ scans, ids: worktrees.map(worktree => worktree.session.sessionId) }, {
			scans: ['pending', 'existing', 'eligible', 'pending'], ids: ['existing', 'eligible'],
		});
	});

	test('publishes completed cleanup before another pending recheck finishes', async () => {
		const slow = new DeferredPromise<number | undefined>();
		const published = new DeferredPromise<readonly string[]>();
		let checking = false;
		const service = disposables.add(createService([
			createSession('fast', oldDate(), SessionStatus.Completed, true),
			createSession('slow', oldDate(), SessionStatus.Completed, true),
		], true, session => checking ? session.sessionId === 'slow' ? slow.p : undefined : ByteSize.GB));
		await service.getWorktrees(14);
		checking = true;
		const refresh = service.refreshPendingCleanup(['fast', 'slow'], 14, worktrees => {
			if (!published.isSettled) {
				published.complete(worktrees.map(worktree => worktree.session.sessionId));
			}
		});
		try {
			assert.deepStrictEqual(await published.p, ['slow']);
		} finally {
			await slow.complete(undefined);
			await refresh;
		}
	});

	test('active, pinned, running, and recent sessions are not eligible', async () => {
		const old = oldDate();
		const eligible = createSession('eligible', old);
		const activeSession = createSession('active', old);
		const active = upcastPartial<IActiveSession>({
			...activeSession,
			activeChat: activeSession.mainChat,
			isCreated: constObservable(true),
			sticky: constObservable(false),
			openChats: activeSession.chats,
			closedChats: constObservable([]),
			lastClosedChat: undefined,
			visibleChatTabs: activeSession.chats,
		});
		const pinned = createSession('pinned', old);
		const running = createSession('running', old, SessionStatus.InProgress);
		const recent = createSession('recent', new Date());
		const service = disposables.add(createService(
			[eligible, activeSession, pinned, running, recent],
			true,
			session => session === eligible ? 6 * ByteSize.GB : ByteSize.GB,
			undefined,
			undefined,
			active,
			undefined,
			pinned,
		));

		await service.activate();

		assert.strictEqual(service.suggestion.get()?.description, '1 agent session worktree has been inactive for at least 15 days and can be cleaned up, reclaiming about 6.00GB.');
	});

	test('adjusting the untouched period loads additional eligible sessions', async () => {
		const tenDaysOld = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
		const service = disposables.add(createService(
			[createSession('ten-days-old', tenDaysOld)],
			true,
			() => ByteSize.GB,
		));

		const [fourteenDays, sevenDays] = await Promise.all([
			service.getWorktrees(14),
			service.getWorktrees(7),
		]);

		assert.deepStrictEqual({
			fourteenDays: fourteenDays[0].cleanupState,
			sevenDays: sevenDays[0].cleanupState,
		}, {
			fourteenDays: 'recent',
			sevenDays: 'eligible',
		});
	});

	test('any-time cleanup allows recent sessions while preserving protection and suggestion thresholds', async () => {
		const recent = new Date();
		const pinned = createSession('pinned', recent);
		const service = disposables.add(createService(
			[
				createSession('recent', recent),
				pinned,
				createSession('running', recent, SessionStatus.InProgress),
				createSession('needs-input', recent, SessionStatus.NeedsInput),
				createSession('untitled', recent, SessionStatus.Untitled),
				createSession('error', recent, SessionStatus.Error),
			],
			true,
			() => 6 * ByteSize.GB,
			undefined, undefined, undefined, undefined, pinned,
		));
		await service.activate();
		const worktrees = await service.getWorktrees(0);
		assert.deepStrictEqual({
			states: worktrees.map(worktree => [worktree.session.sessionId, worktree.cleanupState]),
			suggestion: service.suggestion.get(),
		}, {
			states: [
				['recent', 'eligible'],
				['pinned', 'pinned'],
				['running', 'running'],
				['needs-input', 'needsInput'],
				['untitled', 'untitled'],
				['error', 'error'],
			],
			suggestion: undefined,
		});
	});

	test('coalesces concurrent editor loads into one foreground measurement', async () => {
		const diskUsage = new DeferredPromise<number | undefined>();
		const progressService = new TestProgressService();
		let scanCount = 0;
		const service = disposables.add(createService(
			[createSession('eligible', oldDate())],
			true,
			() => {
				scanCount++;
				return diskUsage.p;
			},
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			Event.None,
			{ progressService },
		));

		const fourteenDays = service.getWorktrees(14);
		const sevenDays = service.getWorktrees(7);
		diskUsage.complete(ByteSize.GB);

		assert.deepStrictEqual({
			scanCount,
			progress: progressService.options.map(options => ({
				title: options.title,
				cancellable: options.cancellable,
			})),
			states: [(await fourteenDays)[0].cleanupState, (await sevenDays)[0].cleanupState],
		}, {
			scanCount: 1,
			progress: [
				{
					title: 'Measuring agent session worktrees...',
					cancellable: true,
				},
			],
			states: ['eligible', 'eligible'],
		});
	});

	test('reports the number of scanned worktrees during measurement', async () => {
		const firstDiskUsage = new DeferredPromise<number | undefined>();
		const secondDiskUsage = new DeferredPromise<number | undefined>();
		const first = createSession('first', oldDate(), SessionStatus.Completed, false, true, 2);
		const second = createSession('second', oldDate());
		const progressService = new TestProgressService();
		const service = disposables.add(createService(
			[first, second],
			true,
			session => session === first ? firstDiskUsage.p : secondDiskUsage.p,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			Event.None,
			{ progressService },
		));

		const measurement = service.getWorktrees(14);
		firstDiskUsage.complete(ByteSize.GB);
		await Promise.resolve();
		secondDiskUsage.complete(ByteSize.GB);
		await measurement;

		assert.deepStrictEqual(progressService.reports.map(report => report.message), [
			'Scanned 0 of 3 worktrees',
			'Scanned 2 of 3 worktrees',
			'Scanned 3 of 3 worktrees',
		]);
	});

	test('retries leftover worktrees without archiving or restoring their sessions', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const calls: boolean[] = [];
		const service = disposables.add(createService([archived], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			onArchive: async () => { throw new Error('Must not archive again'); },
			onCleanup: async (_session, retry) => { calls.push(retry); return { state: retry ? 'pending' : 'failed', message: retry ? undefined : 'permission denied' }; },
		}));
		const before = (await service.getWorktrees(0))[0].cleanupStatus;
		await service.cleanupWorktrees([{ session: archived, sizeBytes: 100, worktreeCount: 1 }]);
		const after = (await service.getWorktrees(0))[0].cleanupStatus;
		assert.deepStrictEqual({ before, after, calls, archived: archived.isArchived.get() }, {
			before: { state: 'failed', message: 'permission denied' },
			after: { state: 'pending', message: undefined },
			calls: [false, true],
			archived: true,
		});
	});

	test('reports unsupported cleanup retry rather than pretending cleanup started', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const service = disposables.add(createService([archived], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		await assert.rejects(service.cleanupWorktrees([{ session: archived, sizeBytes: 100, worktreeCount: 1 }]), /unavailable/);
	});

	test('does not confuse a cleanup status request error with an unsupported host or removal failure', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const service = disposables.add(createService([archived], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			onCleanup: async () => { throw new Error('host disconnected'); },
		}));
		const worktree = (await service.getWorktrees(0))[0];
		assert.deepStrictEqual({ status: worktree.cleanupStatus, error: worktree.cleanupStatusError, size: worktree.sizeBytes }, {
			status: undefined, error: 'host disconnected', size: 100,
		});
	});

	for (const state of ['pending', 'running'] as const) {
		test(`preserves ${state} cleanup through transient status errors and recovers on polling`, async () => {
			const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
			let disconnected = false;
			let complete = false;
			const service = disposables.add(createService([archived], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
				onCleanup: async () => {
					if (disconnected) {
						throw new Error('host disconnected');
					}
					return { state: complete ? 'failed' : state };
				},
			}));
			await service.getWorktrees(0);
			disconnected = true;
			const refreshed = (await service.refreshPendingCleanup(['archived'], 0))[0];
			const forced = (await service.getWorktrees(0, undefined, CancellationToken.None, true))[0];
			disconnected = false;
			complete = true;
			const recovered = (await service.refreshPendingCleanup(['archived'], 0))[0];
			assert.deepStrictEqual([refreshed, forced, recovered].map(worktree => ({
				status: worktree.cleanupStatus,
				error: worktree.cleanupStatusError,
			})), [
				{ status: { state }, error: 'host disconnected' },
				{ status: { state }, error: 'host disconnected' },
				{ status: { state: 'failed' }, error: undefined },
			]);
		});
	}

	test('clears a cached status-request error when retry starts cleanup', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const calls: boolean[] = [];
		const service = disposables.add(createService([archived], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			onCleanup: async (_session, retry) => {
				calls.push(retry);
				if (!retry) {
					throw new Error('host disconnected');
				}
				return { state: 'pending' };
			},
		}));
		await service.getWorktrees(0);
		await service.cleanupWorktrees([{ session: archived, sizeBytes: 100, worktreeCount: 1 }]);
		const worktree = (await service.getWorktrees(0))[0];
		assert.deepStrictEqual({ calls, status: worktree.cleanupStatus, error: worktree.cleanupStatusError }, {
			calls: [false, true], status: { state: 'pending' }, error: undefined,
		});
	});

	test('reports cleanup scheduling progress after each archived session', async () => {
		const archived: string[] = [];
		const progressService = new TestProgressService();
		const first = createSession('first', oldDate(), SessionStatus.Completed, false, true, 2);
		const second = createSession('second', oldDate());
		const service = disposables.add(createService(
			[first, second],
			true,
			() => ByteSize.GB,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			Event.None,
			{
				progressService,
				dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
				onArchive: async session => { archived.push(session.sessionId); },
			},
		));

		const cleaned = await service.cleanupWorktrees([
			{ session: first, sizeBytes: ByteSize.GB, worktreeCount: 2 },
			{ session: second, sizeBytes: ByteSize.GB, worktreeCount: 1 },
		]);

		assert.deepStrictEqual({
			cleaned,
			archived,
			progress: progressService.options.map(options => ({
				title: options.title,
				total: options.total,
			})),
			reports: progressService.reports,
		}, {
			cleaned: true,
			archived: ['first', 'second'],
			progress: [{
				title: 'Scheduling cleanup for 3 agent session worktrees...',
				total: undefined,
			}],
			reports: [
				{ increment: 2 / 3 * 100, message: 'Scheduled 2 of 3 worktrees' },
				{ increment: 1 / 3 * 100, message: 'Scheduled 3 of 3 worktrees' },
			],
		});
	});

	test('reuses measured remaining worktrees after cleanup', async () => {
		const archived = observableValue<boolean>('archived', false);
		const onDidArchiveSession = disposables.add(new Emitter<ISession>());
		const selected = createSession('selected', oldDate(), SessionStatus.Completed, false, true, 1, archived);
		const remaining = createSession('remaining', oldDate());
		let scanCount = 0;
		const progressService = new TestProgressService();
		const service = disposables.add(createService(
			[selected, remaining],
			true,
			() => {
				scanCount++;
				return ByteSize.GB;
			},
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			Event.None,
			{
				progressService,
				dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
				onArchive: async session => {
					archived.set(true, undefined);
					onDidArchiveSession.fire(session);
				},
				onDidArchiveSession: onDidArchiveSession.event,
			},
		));

		const worktrees = await service.getWorktrees(14);
		await service.cleanupWorktrees([{
			session: selected,
			sizeBytes: worktrees[0].sizeBytes!,
			worktreeCount: worktrees[0].worktreeCount,
		}]);
		const reloaded = await service.getWorktrees(14);

		assert.deepStrictEqual({
			scanCount,
			measurementProgressCount: progressService.options.filter(option => option.title === 'Measuring agent session worktrees...').length,
			sessionIds: reloaded.map(worktree => worktree.session.sessionId),
		}, {
			scanCount: 2,
			measurementProgressCount: 1,
			sessionIds: ['selected', 'remaining'],
		});
	});

	test('cancels a foreground wait while disk measurement remains unresolved', async () => {
		const diskUsage = new DeferredPromise<number | undefined>();
		const progressService = new TestProgressService();
		const service = disposables.add(createService(
			[createSession('eligible', oldDate())],
			true,
			() => diskUsage.p,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			Event.None,
			{ progressService },
		));

		const measurement = service.getWorktrees(14);
		progressService.cancel();

		await assert.rejects(measurement, error => isCancellationError(error));
		diskUsage.complete(ByteSize.GB);
	});

	test('cancels the underlying scan and skips queued sessions when the last caller cancels', async () => {
		const cancellation = disposables.add(new CancellationTokenSource());
		const scanned: string[] = [];
		const tokens: CancellationToken[] = [];
		const stalled = new DeferredPromise<number | undefined>();
		const service = disposables.add(createService(
			['first', 'second', 'queued'].map(id => createSession(id, oldDate())), true,
			(session, token = CancellationToken.None) => {
				scanned.push(session.sessionId);
				tokens.push(token);
				return raceCancellationError(stalled.p, token);
			},
		));
		const measurement = service.getWorktrees(14, () => { }, cancellation.token);
		cancellation.cancel();
		await assert.rejects(measurement, error => isCancellationError(error));
		assert.deepStrictEqual({ scanned, canceled: tokens.every(token => token.isCancellationRequested) }, {
			scanned: ['first', 'second'], canceled: true,
		});
	});

	test('keeps a shared scan until both progressive callers cancel', async () => {
		const first = disposables.add(new CancellationTokenSource());
		const second = disposables.add(new CancellationTokenSource());
		let scanToken = CancellationToken.None;
		const stalled = new DeferredPromise<number | undefined>();
		const service = disposables.add(createService([createSession('shared', oldDate())], true, (_session, token = CancellationToken.None) => {
			scanToken = token;
			return raceCancellationError(stalled.p, token);
		}));
		const firstMeasurement = service.getWorktrees(14, () => { }, first.token);
		const secondMeasurement = service.getWorktrees(14, () => { }, second.token);
		first.cancel();
		await assert.rejects(firstMeasurement, error => isCancellationError(error));
		assert.strictEqual(scanToken.isCancellationRequested, false);
		second.cancel();
		await assert.rejects(secondMeasurement, error => isCancellationError(error));
		assert.strictEqual(scanToken.isCancellationRequested, true);
	});

	test('canceling a foreground wait does not cancel a shared background measurement', async () => {
		const diskUsage = new DeferredPromise<number | undefined>();
		const progressService = new TestProgressService();
		const service = disposables.add(createService(
			[createSession('eligible', oldDate())],
			true,
			() => diskUsage.p,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			Event.None,
			{ progressService },
		));

		const backgroundMeasurement = service.activate();
		const foregroundMeasurement = service.getWorktrees(14);
		progressService.cancel();

		await assert.rejects(foregroundMeasurement, error => isCancellationError(error));
		diskUsage.complete(ByteSize.GB);
		await backgroundMeasurement;

		assert.deepStrictEqual((await service.getWorktrees(14)).map(worktree => worktree.session.sessionId), ['eligible']);
	});

	test('publishes initial worktrees and completed sizes while another scan is pending', async () => {
		const slow = new DeferredPromise<number | undefined>();
		const fastPublished = new DeferredPromise<void>();
		const snapshots: { id: string; calculating: boolean; size: number | undefined }[][] = [];
		const service = disposables.add(createService(
			[createSession('slow', oldDate()), createSession('fast', oldDate())],
			true,
			session => session.title.get() === 'slow' ? slow.p : ByteSize.GB,
		));
		const measurement = service.getWorktrees(14, worktrees => {
			snapshots.push(worktrees.map(worktree => ({ id: worktree.session.sessionId, calculating: !!worktree.isMeasuring, size: worktree.sizeBytes })));
			if (worktrees.some(worktree => worktree.session.sessionId === 'fast' && worktree.sizeBytes !== undefined)) {
				if (!fastPublished.isSettled) {
					fastPublished.complete();
				}
			}
		});
		try {
			await fastPublished.p;
			assert.deepStrictEqual(snapshots, [
				[{ id: 'slow', calculating: true, size: undefined }, { id: 'fast', calculating: true, size: undefined }],
				[{ id: 'slow', calculating: true, size: undefined }, { id: 'fast', calculating: false, size: ByteSize.GB }],
			]);
		} finally {
			await slow.complete(ByteSize.GB);
			await measurement;
		}
	});

	test('allows disk measurements to complete after more than ten seconds', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const service = disposables.add(createService(
			[createSession('slow', oldDate()), createSession('fast', oldDate())],
			true,
			async session => {
				if (session.title.get() === 'slow') {
					await new Promise<void>(resolve => setTimeout(resolve, 30_000));
				}
				return ByteSize.GB;
			},
		));

		const worktrees = await service.getWorktrees(14);

		assert.deepStrictEqual(worktrees.map(worktree => ({
			label: worktree.session.title.get(),
			sizeBytes: worktree.sizeBytes,
			state: worktree.cleanupState,
		})), [
			{ label: 'slow', sizeBytes: ByteSize.GB, state: 'eligible' },
			{ label: 'fast', sizeBytes: ByteSize.GB, state: 'eligible' },
		]);
	}));

	test('reports the full scan total when empty archived worktrees disappear and when cached', async () => {
		const service = disposables.add(createService(
			[createSession('empty', oldDate(), SessionStatus.Completed, true), createSession('retained', oldDate())],
			true,
			session => session.sessionId === 'empty' ? 0 : ByteSize.GB,
		));
		const snapshots: { ids: string[]; scanned: number | undefined; total: number | undefined }[] = [];
		const record: NonNullable<Parameters<typeof service.getWorktrees>[1]> = (worktrees, progress) => {
			snapshots.push({ ids: worktrees.map(worktree => worktree.session.sessionId), scanned: progress?.scannedWorktrees, total: progress?.totalWorktrees });
		};
		await service.getWorktrees(0, record);
		await service.getWorktrees(0, record);
		assert.deepStrictEqual({
			initial: snapshots[0],
			completed: snapshots.slice(-2),
		}, {
			initial: { ids: ['empty', 'retained'], scanned: 0, total: 2 },
			completed: [
				{ ids: ['retained'], scanned: 2, total: 2 },
				{ ids: ['retained'], scanned: 2, total: 2 },
			],
		});
	});

	test('cancels disk measurement when disposed', async () => {
		let canceled = false;
		const measurementStarted = new DeferredPromise<void>();
		const stalledMeasurement = new DeferredPromise<number | undefined>();
		const service = disposables.add(createService(
			[createSession('eligible', oldDate())],
			true,
			(_session, token) => {
				measurementStarted.complete();
				return raceCancellationError(stalledMeasurement.p, token ?? CancellationToken.None).catch(error => {
					canceled = isCancellationError(error);
					throw error;
				});
			},
		));

		const measurement = service.getWorktrees(14);
		await measurementStarted.p;
		service.dispose();
		await assert.rejects(measurement, error => isCancellationError(error));

		assert.strictEqual(canceled, true);
	});

	test('retries when the worktree session set changes during measurement', async () => {
		const firstMeasurement = new DeferredPromise<number | undefined>();
		const firstMeasurementStarted = new DeferredPromise<void>();
		const original = createSession('original', oldDate());
		const replacement = createSession('replacement', oldDate());
		const sessions = [original];
		let scanCount = 0;
		const service = disposables.add(createService(
			sessions,
			true,
			session => {
				scanCount++;
				if (session === original) {
					firstMeasurementStarted.complete();
					return firstMeasurement.p;
				}
				return ByteSize.GB;
			},
		));

		const measurement = service.getWorktrees(14);
		await firstMeasurementStarted.p;
		sessions.splice(0, 1, replacement);
		firstMeasurement.complete(ByteSize.GB);
		const worktrees = await measurement;

		assert.deepStrictEqual({
			scanCount,
			sessionIds: worktrees.map(worktree => worktree.session.sessionId),
		}, {
			scanCount: 2,
			sessionIds: ['replacement'],
		});
	});

});

function createService(
	sessions: ISession[],
	enabled: boolean,
	sizeForSession: (session: ISession, token?: CancellationToken) => number | undefined | Promise<number | undefined>,
	_quickInputService: IQuickInputService = upcastPartial<IQuickInputService>({}),
	onProgress?: (title: string | undefined) => void,
	activeSession?: IActiveSession,
	onCommand?: (id: string, args: readonly unknown[]) => void,
	pinnedSession?: ISession,
	configurationService = new TestConfigurationService({ [AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: enabled }),
	onDidChangeSessions: Event<ISessionsChangeEvent> = Event.None,
	overrides: {
		readonly progressService?: IProgressService;
		readonly dialogService?: IDialogService;
		readonly onArchive?: (session: ISession) => Promise<void>;
		readonly onCleanup?: ISessionsManagementService['sessionWorktreeCleanup'];
		readonly onDidArchiveSession?: Event<ISession>;
	} = {},
): SessionWorktreeCleanupService {
	return new SessionWorktreeCleanupService(
		upcastPartial<ISessionsManagementService>({
			getSessions: () => sessions,
			getSessionWorktreeDiskUsage: async (session, token) => sizeForSession(session, token),
			archiveSession: async session => overrides.onArchive?.(session),
			sessionWorktreeCleanup: overrides.onCleanup,
			onDidArchiveSession: overrides.onDidArchiveSession ?? Event.None,
			onDidChangeSessions,
		}),
		upcastPartial<ISessionsService>({ activeSession: constObservable(activeSession) }),
		upcastPartial<ISessionsListModelService>({ isSessionPinned: session => session === pinnedSession }),
		overrides.dialogService ?? upcastPartial<IDialogService>({}),
		upcastPartial<ILogService>({ warn: () => { }, error: () => { } }),
		configurationService,
		overrides.progressService ?? new TestProgressService(onProgress),
		upcastPartial<ICommandService>({
			executeCommand: async (id, ...args) => {
				onCommand?.(id, args);
			},
		}),
	);
}

class TestProgressService extends mock<IProgressService>() {
	readonly options: IProgressOptions[] = [];
	readonly reports: IProgressStep[] = [];
	private onDidCancel: (() => void) | undefined;

	constructor(private readonly onProgress?: (title: string | undefined) => void) {
		super();
	}

	override async withProgress<R>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>, onDidCancel?: () => void): Promise<R> {
		this.options.push(options);
		this.onDidCancel = onDidCancel;
		this.onProgress?.(typeof options.title === 'string' ? options.title : undefined);
		return task({ report: step => this.reports.push(step) });
	}

	cancel(): void {
		this.onDidCancel?.();
	}
}

class TrackingConfigurationService extends TestConfigurationService {
	readonly updates: { key: string; value: unknown }[] = [];

	override async updateValue(key: string, value: unknown): Promise<void> {
		this.updates.push({ key, value });
		await this.setUserConfiguration(key, value);
	}
}

function oldDate(): Date {
	return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function createSession(id: string, updatedAt: Date, status = SessionStatus.Completed, archived = false, hasWorktree = true, worktreeCount = 1, archivedState?: IObservable<boolean>): ISession {
	const resource = URI.parse(`test:/${id}`);
	const chat = upcastPartial<IChat>({
		resource,
		capabilities: constObservable(DEFAULT_CHAT_CAPABILITIES),
	});
	const folders = Array.from({ length: hasWorktree ? worktreeCount : 1 }, (_, index) => ({
		root: URI.file(`/repo/${id}`),
		workingDirectory: URI.file(`/repo.worktrees/${id}-${index}`),
		name: id,
		description: undefined,
		gitRepository: {
			uri: URI.file(`/repo/${id}`),
			workTreeUri: hasWorktree ? URI.file(`/repo.worktrees/${id}-${index}`) : undefined,
			baseBranchName: 'main',
			gitHubInfo: constObservable(undefined),
		},
	}));
	return upcastPartial<ISession>({
		sessionId: id,
		resource,
		providerId: 'test',
		sessionType: 'test',
		createdAt: updatedAt,
		updatedAt: constObservable(updatedAt),
		title: constObservable(id),
		status: constObservable(status),
		isArchived: archivedState ?? constObservable(archived),
		isRead: constObservable(true),
		workspace: constObservable({
			uri: URI.file(`/repo/${id}`),
			label: id,
			icon: Codicon.folder,
			folders,
			isVirtualWorkspace: false,
			requiresWorkspaceTrust: false,
		}),
		chats: constObservable([chat]),
		mainChat: constObservable(chat),
	});
}
