/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
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

	test('worktree manager data excludes sessions without measurable active worktrees', async () => {
		const eligible = createSession('eligible', oldDate());
		const running = createSession('running', oldDate(), SessionStatus.InProgress);
		const recent = createSession('recent', new Date());
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const unavailable = createSession('unavailable', oldDate());
		const withoutWorktree = createSession('without-worktree', oldDate(), SessionStatus.Completed, false, false);
		const sessions = [eligible, running, recent, archived, unavailable, withoutWorktree];
		const progressTitles: (string | undefined)[] = [];
		const service = disposables.add(createService(
			sessions,
			true,
			session => session === unavailable ? undefined : session === eligible ? 4 * ByteSize.GB : ByteSize.GB,
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
			],
		});
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

	test('coalesces concurrent measurements while giving each caller cancellable progress', async () => {
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

	test('times out a stalled disk measurement without blocking other sessions', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const stalledMeasurement = new DeferredPromise<number | undefined>();
		const stalled = createSession('stalled', oldDate());
		const measured = createSession('measured', oldDate());
		const service = disposables.add(createService(
			[stalled, measured],
			true,
			session => session === stalled ? stalledMeasurement.p : ByteSize.GB,
		));

		const worktrees = await service.getWorktrees(14);
		stalledMeasurement.complete(ByteSize.GB);

		assert.deepStrictEqual(worktrees.map(worktree => worktree.session.sessionId), ['measured']);
	}));

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
	sizeForSession: (session: ISession) => number | undefined | Promise<number | undefined>,
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
	} = {},
): SessionWorktreeCleanupService {
	return new SessionWorktreeCleanupService(
		upcastPartial<ISessionsManagementService>({
			getSessions: () => sessions,
			getSessionWorktreeDiskUsage: async session => sizeForSession(session),
			archiveSession: async session => overrides.onArchive?.(session),
			onDidArchiveSession: Event.None,
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

function createSession(id: string, updatedAt: Date, status = SessionStatus.Completed, archived = false, hasWorktree = true, worktreeCount = 1): ISession {
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
		isArchived: constObservable(archived),
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
