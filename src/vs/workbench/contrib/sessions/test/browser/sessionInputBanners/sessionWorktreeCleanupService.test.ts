/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, raceCancellationError, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { constObservable, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IAgentHostWorktreeCleanupStatus } from '../../../../../../platform/agentHost/common/agentHostWorktreeCleanup.js';
import { IConfirmation, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ByteSize } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IProgress, IProgressOptions, IProgressService, IProgressStep, ProgressLocation } from '../../../../../../platform/progress/common/progress.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ISessionsListModelService } from '../../../browser/sessionsListModelService.js';
import { ISessionHostService } from '../../../../../services/sessions/browser/sessionHost.js';
import { DEFAULT_CHAT_CAPABILITIES, IChat, ISession, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IManagedSessionWorktree, ISessionsChangeEvent, ISessionsManagementService } from '../../../common/sessionsManagement.js';
import { AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING, getWorktreeCleanupId, getWorktreeCleanupLastActivity, getWorktreeCleanupTitle, ISessionWorktree, SessionWorktreeCleanupProgress, SessionWorktreeCleanupService } from '../../../browser/sessionInputBanners/sessionWorktreeCleanupService.js';

suite('SessionWorktreeCleanupService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function managedWorktree(worktree = '/repo.worktrees/unlinked'): IManagedSessionWorktree {
		return { providerId: 'test', repository: URI.file('/repo').toString(), worktree: URI.file(worktree).toString(), branch: 'agents/unlinked', cleanupStatus: { state: 'unknown' } };
	}

	test('groups shared checkouts, measures once, and cleans up every associated session', async () => {
		const first = createSession('first', oldDate());
		const latest = { ...createSession('latest', new Date()), workspace: first.workspace };
		const sessions = [first, latest];
		const measured: string[] = [];
		const archived: string[] = [];
		const scheduled: string[] = [];
		const service = disposables.add(createService(sessions, true, session => {
			measured.push(session.sessionId);
			return 100;
		}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			onArchive: async session => { archived.push(session.sessionId); },
			onCleanup: async (session, retry) => { if (retry) { scheduled.push(session.sessionId); } return { state: 'pending' }; },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		const rows = await service.getWorktrees(0);
		sessions.reverse();
		const reordered = await service.getWorktrees(0, undefined, undefined, true);
		await service.cleanupWorktrees(rows);
		assert.deepStrictEqual({
			count: rows.length, worktrees: rows[0].worktreeCount, bytes: rows[0].sizeBytes,
			lastActivity: getWorktreeCleanupLastActivity(rows[0]), measured, archived: archived.sort(), scheduled: scheduled.sort(),
			stableIdentity: getWorktreeCleanupId(rows[0]) === getWorktreeCleanupId(reordered[0]),
		}, {
			count: 1, worktrees: 1, bytes: 100, lastActivity: latest.updatedAt.get(),
			measured: ['latest', 'latest'], archived: ['first', 'latest'], scheduled: ['first', 'latest'], stableIdentity: true,
		});
	});

	test('shared worktrees use the newest activity and protect a running or pinned associated session', async () => {
		const first = createSession('first', oldDate());
		const status = observableValue('status', SessionStatus.Completed);
		const updatedAt = observableValue('updatedAt', new Date());
		const latest = { ...createSession('latest', oldDate()), workspace: first.workspace, status, updatedAt };
		const service = disposables.add(createService([first, latest], true, () => 100));
		const recent = (await service.getWorktrees(15))[0].cleanupState;
		updatedAt.set(oldDate(), undefined);
		status.set(SessionStatus.InProgress, undefined);
		const running = (await service.getWorktrees(0))[0].cleanupState;
		status.set(SessionStatus.Completed, undefined);
		const pinnedService = disposables.add(createService([first, latest], true, () => 100, undefined, undefined, undefined, undefined, latest));
		assert.deepStrictEqual({ recent, running, pinned: (await pinnedService.getWorktrees(0))[0].cleanupState }, { recent: 'recent', running: 'running', pinned: 'pinned' });
	});

	test('overlapping multi-folder sessions stay together without double-counting worktrees or storage', async () => {
		const first = createSession('first', oldDate(), SessionStatus.Completed, false, true, 2);
		const other = createSession('other', oldDate());
		const overlap = {
			...other,
			workspace: constObservable({ ...other.workspace.get()!, folders: [first.workspace.get()!.folders[1], ...other.workspace.get()!.folders] }),
		};
		const service = disposables.add(createService([first, overlap], true, () => 200));
		const rows = await service.getWorktrees(0);
		assert.deepStrictEqual(rows.map(row => ({ count: row.worktreeCount, size: row.sizeBytes, state: row.cleanupState, sessions: row.sessions?.length })), [
			{ count: 3, size: undefined, state: 'eligible', sessions: 2 },
		]);
	});

	test('active and needs-input members outrank eligible members regardless of representative order', async () => {
		const first = createSession('first', oldDate());
		const active = { ...createSession('active', oldDate()), workspace: first.workspace };
		const needsInput = { ...createSession('input', oldDate(), SessionStatus.NeedsInput), workspace: first.workspace };
		const results: string[] = [];
		for (const member of [active, needsInput]) {
			for (const sessions of [[first, member], [member, first]]) {
				const service = disposables.add(createService(sessions, true, () => 100, undefined, undefined, [active]));
				results.push((await service.getWorktrees(0))[0].cleanupState);
			}
		}
		const pinned = disposables.add(createService([first, needsInput], true, () => 100, undefined, undefined, [], undefined, first));
		results.push((await pinned.getWorktrees(0))[0].cleanupState);
		assert.deepStrictEqual(results, ['active', 'active', 'needsInput', 'needsInput', 'pinned']);
	});

	test('prepares every shared session before archive and awaits archive completion before retry', async () => {
		const first = createSession('first', oldDate());
		const second = { ...createSession('second', new Date(0)), workspace: first.workspace };
		const archiveStarted = new DeferredPromise<void>();
		const archiveCompleted = new DeferredPromise<void>();
		const calls: string[] = [];
		const service = disposables.add(createService([first, second], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			onPrepare: async session => { calls.push(`prepare:${session.sessionId}`); },
			onArchive: async session => {
				calls.push(`archive:${session.sessionId}`);
				await archiveStarted.complete();
				await archiveCompleted.p;
			},
			onCleanup: async (session, retry) => { if (retry) { calls.push(`retry:${session.sessionId}`); } return { state: 'pending' }; },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		const cleanup = service.cleanupWorktrees([{ session: first, sessions: [first, second], sizeBytes: 100, worktreeCount: 1 }]);
		await archiveStarted.p;
		const beforeAcknowledgement = [...calls];
		await archiveCompleted.complete();
		await cleanup;
		assert.deepStrictEqual({ beforeAcknowledgement, calls }, {
			beforeAcknowledgement: ['prepare:first', 'prepare:second', 'archive:first'],
			calls: ['prepare:first', 'prepare:second', 'archive:first', 'archive:second', 'retry:first', 'retry:second'],
		});
	});

	test('preparation failure prevents archiving any associated session', async () => {
		const first = createSession('first', oldDate());
		const second = { ...createSession('second', new Date(0)), workspace: first.workspace };
		const calls: string[] = [];
		const service = disposables.add(createService([first, second], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			onPrepare: async session => {
				calls.push(`prepare:${session.sessionId}`);
				if (session === second) {
					throw new Error('Unsupported cleanup preparation');
				}
			},
			onArchive: async session => { calls.push(`archive:${session.sessionId}`); },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		await assert.rejects(service.cleanupWorktrees([{ session: first, sessions: [first, second], sizeBytes: 100, worktreeCount: 1 }]), /Unsupported cleanup preparation/);
		assert.deepStrictEqual(calls, ['prepare:first', 'prepare:second']);
	});

	test('publishes cleanup eligibility before disk usage is available', async () => {
		const measurement = new DeferredPromise<number>();
		const session = createSession('ready', oldDate());
		const service = disposables.add(createService([session], true, () => measurement.p));
		const snapshots: { state: string; measuring: boolean | undefined; size: number | undefined }[] = [];
		const loading = service.getWorktrees(0, rows => {
			if (rows[0]) {
				snapshots.push({ state: rows[0].cleanupState, measuring: rows[0].isMeasuring, size: rows[0].sizeBytes });
			}
		});
		await measurement.complete(100);
		await loading;
		assert.deepStrictEqual([snapshots[0], snapshots[snapshots.length - 1]], [
			{ state: 'eligible', measuring: true, size: undefined },
			{ state: 'eligible', measuring: false, size: 100 },
		]);
	});

	test('explicit cleanup verifies scheduling after archive and rejects an unknown outcome', async () => {
		const session = createSession('branch', oldDate());
		const calls: string[] = [];
		const progress: string[] = [];
		const service = disposables.add(createService([session], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			onArchive: async () => { calls.push('archive'); },
			onCleanup: async (_session, retry) => { calls.push(`cleanup:${retry}`); return { state: 'unknown' }; },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		await assert.rejects(service.cleanupWorktrees([{ session, sizeBytes: 100, worktreeCount: 1 }], update => progress.push(update.state)), /cleanup was not confirmed/);
		assert.deepStrictEqual({ calls, progress, operations: service.cleanupOperations.get().map(operation => operation.state) }, {
			calls: ['archive', 'cleanup:true'], progress: ['started', 'failed'], operations: ['failed'],
		});
	});

	test('excludes remote linked and unlinked worktrees before measuring or publishing inventory', async () => {
		const local = createSession('local', oldDate());
		const original = createSession('remote', oldDate());
		const workspace = original.workspace.get()!;
		const remote: ISession = {
			...original,
			workspace: constObservable({
				...workspace,
				folders: workspace.folders.map(folder => ({
					...folder,
					gitRepository: {
						...folder.gitRepository!,
						workTreeUri: folder.gitRepository!.workTreeUri!.with({ scheme: 'vscode-agent-host', authority: 'remote' }),
					},
				})),
			}),
		};
		const unlinked = managedWorktree();
		const remoteUnlinked = {
			...managedWorktree('/repo.worktrees/remote'),
			worktree: URI.from({ scheme: 'vscode-agent-host', authority: 'remote', path: '/repo.worktrees/remote' }).toString(),
		};
		const measured: string[] = [];
		const published: string[][] = [];
		const service = disposables.add(createService([local, remote], true, session => {
			measured.push(session.sessionId);
			return 1;
		}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => [unlinked, remoteUnlinked],
		}));
		const rows = await service.getWorktrees(0, worktrees => published.push(worktrees.map(getWorktreeCleanupId)));
		assert.deepStrictEqual({
			rows: rows.map(getWorktreeCleanupId),
			measured,
			publishedRemote: published.some(ids => ids.includes('remote') || ids.includes(getWorktreeCleanupId({ unlinkedWorktree: remoteUnlinked, sizeBytes: undefined, worktreeCount: 1 }))),
		}, {
			rows: ['local', `managed:test:${unlinked.worktree}`],
			measured: ['local'],
			publishedRemote: false,
		});
	});

	test('includes unlinked managed worktrees without measuring them or duplicating session paths', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const linked = managedWorktree(archived.workspace.get()!.folders[0].gitRepository!.workTreeUri!.fsPath);
		const unlinked = managedWorktree();
		const measurements: string[] = [];
		const service = disposables.add(createService([archived], true, session => {
			measurements.push(session.sessionId);
			return 1;
		}, undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => [linked, unlinked, unlinked],
		}));
		const first = await service.getWorktrees(0, () => { });
		const cached = await service.getWorktrees(0, () => { });
		assert.deepStrictEqual({
			rows: [first, cached].map(worktrees => worktrees.map(worktree => ({ id: getWorktreeCleanupId(worktree), size: worktree.sizeBytes, state: worktree.cleanupState }))),
			measurements,
		}, {
			rows: Array.from({ length: 2 }, () => [
				{ id: 'archived', size: undefined, state: 'archived' },
				{ id: `managed:test:${unlinked.worktree}`, size: undefined, state: 'unlinked' },
			]),
			measurements: [],
		});
	});

	test('excludes non-agent branches from inventory, refreshes, force eligibility, and scheduling', async () => {
		const eligible = managedWorktree();
		const excluded = ['component-explorer-1', 'main', 'agents-other', 'custom/agents-other/task', ''].map((branch, index) => ({
			...managedWorktree(`/repo.worktrees/foreign-${index}`), branch,
		}));
		let inventory = [eligible, ...excluded];
		const confirmations: string[] = [];
		const service = disposables.add(createService([], true, () => undefined,
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => inventory,
			canForceWorktreeCleanup: () => true,
			dialogService: upcastPartial<IDialogService>({ confirm: async options => { confirmations.push(options.message); return { confirmed: true }; } }),
		}));
		const initial = await service.getWorktrees(0);
		inventory = [{ ...eligible, branch: 'component-explorer-1' }];
		const refreshed = await service.refreshPendingCleanup(initial.map(getWorktreeCleanupId), 0);
		const foreign: ISessionWorktree = { unlinkedWorktree: excluded[0], sizeBytes: undefined, worktreeCount: 1, cleanupState: 'unlinked', worktreeExists: true, cleanupStatus: { state: 'failed' } };
		await assert.rejects(service.cleanupWorktrees([foreign]), /agent-managed branches/);
		await assert.rejects(service.forceCleanupWorktrees([foreign]), /cannot be forcibly removed/);
		assert.deepStrictEqual({
			initial: initial.map(getWorktreeCleanupId), refreshed: refreshed.map(getWorktreeCleanupId),
			forceEligible: service.canForceCleanup(foreign), confirmations,
		}, { initial: [`managed:test:${eligible.worktree}`], refreshed: [], forceEligible: false, confirmations: [] });
	});

	test('excludes linked worktrees with a known non-agent branch before measuring storage', async () => {
		const original = createSession('foreign', oldDate());
		const workspace = original.workspace.get()!;
		const foreign: ISession = {
			...original,
			workspace: constObservable({ ...workspace, folders: workspace.folders.map(folder => ({ ...folder, gitRepository: { ...folder.gitRepository!, branchName: 'component-explorer-1' } })) }),
		};
		const measured: string[] = [];
		const service = disposables.add(createService([foreign], true, session => { measured.push(session.sessionId); return 1; }));
		assert.deepStrictEqual({ worktrees: await service.getWorktrees(0), measured }, { worktrees: [], measured: [] });
	});

	test('includes and schedules prefixed linked worktrees after the configured prefix changes', async () => {
		const original = createSession('prefixed', oldDate());
		const workspace = original.workspace.get()!;
		const session: ISession = {
			...original,
			workspace: constObservable({
				...workspace,
				folders: workspace.folders.map(folder => ({
					...folder,
					gitRepository: { ...folder.gitRepository!, uri: URI.file('/repo'), branchName: 'old-prefix/agents/prefixed-0' },
				})),
			}),
		};
		const configuration = new TestConfigurationService({ git: { branchPrefix: 'old-prefix/' } });
		const measured: string[] = [];
		const archived: string[] = [];
		const service = disposables.add(createService([session], true, session => { measured.push(session.sessionId); return 1; },
			undefined, undefined, undefined, undefined, undefined, configuration, undefined, {
			onArchive: async session => { archived.push(session.sessionId); },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		const initial = await service.getWorktrees(0);
		await configuration.setUserConfiguration('git.branchPrefix', 'new-prefix/');
		const refreshed = await service.getWorktrees(0, undefined, undefined, true);
		await service.cleanupWorktrees(refreshed, () => { });
		assert.deepStrictEqual({
			rows: [initial, refreshed].map(rows => rows.map(getWorktreeCleanupId)),
			measured, archived,
		}, { rows: [['prefixed'], ['prefixed']], measured: ['prefixed', 'prefixed'], archived: ['prefixed'] });
	});

	for (const prefix of ['user/', 'team/user/', 'user-']) {
		test(`includes, refreshes, and forcibly removes an unlinked ${prefix} prefixed worktree`, async () => {
			let unlinked: IManagedSessionWorktree = { ...managedWorktree(), branch: `${prefix}agents/unlinked` };
			const cleaned: { branch: string; force: boolean | undefined }[] = [];
			const service = disposables.add(createService([], true, () => undefined,
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
				listManagedWorktrees: async () => [unlinked],
				canForceWorktreeCleanup: () => true,
				cleanupManagedWorktree: async (worktree, force) => { cleaned.push({ branch: worktree.branch, force }); },
				dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			}));
			const initial = await service.getWorktrees(0);
			const refreshed = await service.refreshPendingCleanup(initial.map(getWorktreeCleanupId), 0);
			const failed: ISessionWorktree = { ...refreshed[0], worktreeExists: true, cleanupStatus: { state: 'failed' } };
			await service.cleanupWorktrees(refreshed, () => { });
			await assert.rejects(service.forceCleanupWorktrees([failed], () => { }), /already scheduled/);
			unlinked = { ...unlinked, cleanupStatus: { state: 'failed' } };
			await service.refreshPendingCleanup(initial.map(getWorktreeCleanupId), 0);
			await service.forceCleanupWorktrees([failed], () => { });
			assert.deepStrictEqual({
				rows: [initial, refreshed].map(rows => rows.map(getWorktreeCleanupId)),
				forceEligible: service.canForceCleanup(failed), cleaned,
			}, {
				rows: [[`managed:test:${unlinked.worktree}`], [`managed:test:${unlinked.worktree}`]],
				forceEligible: true,
				cleaned: [{ branch: unlinked.branch, force: undefined }, { branch: unlinked.branch, force: true }],
			});
		});
	}

	test('cleans up an unlinked row explicitly without archiving a fabricated session and verifies removal', async () => {
		const unlinked = managedWorktree();
		let inventory = [unlinked];
		const cleaned: IManagedSessionWorktree[] = [];
		const service = disposables.add(createService([], true, () => { throw new Error('Must not measure ownerless storage'); },
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => inventory,
			cleanupManagedWorktree: async worktree => { cleaned.push(worktree); },
			managedWorktreeExists: async () => false,
			onArchive: async () => { throw new Error('Must not archive a fabricated session'); },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		const worktrees = await service.getWorktrees(0, () => { });
		await service.cleanupWorktrees(worktrees);
		inventory = [];
		const refreshed = await service.refreshPendingCleanup(worktrees.map(getWorktreeCleanupId), 0);
		assert.deepStrictEqual({ cleaned, rows: refreshed.map(worktree => ({ exists: worktree.worktreeExists, size: worktree.sizeBytes })) }, {
			cleaned: [unlinked], rows: [{ exists: false, size: 0 }],
		});
	});

	for (const state of ['pending', 'running'] as const) {
		for (const exists of [false, true, undefined]) {
			test(`verifies discovered ${state} managed cleanup after disappearance with existence ${exists}`, async () => {
				const unlinked = { ...managedWorktree(), cleanupStatus: { state } };
				let inventory = [unlinked];
				const checked: IManagedSessionWorktree[] = [];
				const service = disposables.add(createService([], true, () => undefined,
					undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
					listManagedWorktrees: async () => inventory,
					managedWorktreeExists: async worktree => { checked.push(worktree); return exists; },
					cleanupManagedWorktree: async () => { throw new Error('Must not schedule discovered cleanup again'); },
				}));
				const worktrees = await service.getWorktrees(0);
				inventory = [];
				const refreshed = await service.refreshPendingCleanup(worktrees.map(getWorktreeCleanupId), 0);
				assert.deepStrictEqual({
					checked,
					rows: refreshed.map(worktree => ({
						exists: worktree.worktreeExists,
						size: worktree.sizeBytes,
						listed: worktree.isListedByHost,
						status: worktree.cleanupStatus,
						unverified: !!worktree.cleanupStatusError,
					})),
				}, {
					checked: [unlinked],
					rows: [{ exists, size: exists === false ? 0 : undefined, listed: false, status: undefined, unverified: exists !== false }],
				});
			});
		}
	}

	test('drops discovered worktrees no longer listed by the host rather than offering stale blocked rows', async () => {
		const unlinked = managedWorktree();
		let inventory = [unlinked];
		const service = disposables.add(createService([], true, () => undefined,
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => inventory,
			managedWorktreeExists: async () => { throw new Error('Unscheduled inventory rows must not be retained'); },
		}));
		const worktrees = await service.getWorktrees(0);
		inventory = [];
		assert.deepStrictEqual(await service.refreshPendingCleanup(worktrees.map(getWorktreeCleanupId), 0), []);
	});

	test('marks a scheduled worktree that still exists but is no longer listed as unavailable for cleanup', async () => {
		const unlinked = managedWorktree();
		let inventory = [unlinked];
		const service = disposables.add(createService([], true, () => undefined,
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => inventory,
			managedWorktreeExists: async () => true,
			cleanupManagedWorktree: async () => { },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		const worktrees = await service.getWorktrees(0);
		await service.cleanupWorktrees(worktrees);
		inventory = [];
		const refreshed = await service.refreshPendingCleanup(worktrees.map(getWorktreeCleanupId), 0);
		assert.deepStrictEqual(refreshed.map(worktree => ({ exists: worktree.worktreeExists, listed: worktree.isListedByHost, force: service.canForceCleanup(worktree) })), [
			{ exists: true, listed: false, force: false },
		]);
		await assert.rejects(service.cleanupWorktrees(refreshed), /no longer listed by its host/);
	});

	test('marks failed cleanup attempts as unlisted when their worktrees leave the managed inventory', async () => {
		const unlinked = managedWorktree();
		let inventory = [unlinked];
		const service = disposables.add(createService([], true, () => undefined,
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => inventory,
			managedWorktreeExists: async () => true,
			cleanupManagedWorktree: async () => { throw new Error('Scheduling failed'); },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		const worktrees = await service.getWorktrees(0);
		await assert.rejects(service.cleanupWorktrees(worktrees), /Scheduling failed/);
		inventory = [];
		const refreshed = await service.refreshPendingCleanup(worktrees.map(getWorktreeCleanupId), 0);
		assert.deepStrictEqual(refreshed.map(worktree => ({ exists: worktree.worktreeExists, listed: worktree.isListedByHost })), [
			{ exists: true, listed: false },
		]);
	});

	test('does not claim removal when a scheduled unlinked worktree is no longer listed but its existence is unknown', async () => {
		const unlinked = managedWorktree();
		let inventory = [unlinked];
		const service = disposables.add(createService([], true, () => undefined,
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => inventory,
			managedWorktreeExists: async () => undefined,
			cleanupManagedWorktree: async () => { },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		const worktrees = await service.getWorktrees(0, () => { });
		await service.cleanupWorktrees(worktrees);
		inventory = [];
		const refreshed = await service.refreshPendingCleanup(worktrees.map(getWorktreeCleanupId), 0);
		assert.deepStrictEqual(refreshed.map(worktree => ({
			id: getWorktreeCleanupId(worktree), exists: worktree.worktreeExists, size: worktree.sizeBytes, hasError: !!worktree.cleanupStatusError,
		})), [{ id: getWorktreeCleanupId(worktrees[0]), exists: undefined, size: undefined, hasError: true }]);
	});

	test('retains failed existence checks without losing other rows and recovers on refresh', async () => {
		const missing = managedWorktree();
		const healthy = managedWorktree('/repo.worktrees/healthy');
		let inventory = [missing, healthy];
		let fail = true;
		const service = disposables.add(createService([], true, () => undefined,
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => inventory,
			cleanupManagedWorktree: async () => { },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			managedWorktreeExists: async () => {
				if (fail) {
					throw new Error('Host disconnected');
				}
				return false;
			},
		}));
		const worktrees = await service.getWorktrees(0);
		await service.cleanupWorktrees([worktrees[0]]);
		inventory = [healthy];
		const failed = await service.refreshPendingCleanup(worktrees.map(getWorktreeCleanupId), 0);
		fail = false;
		const recovered = await service.refreshPendingCleanup(worktrees.map(getWorktreeCleanupId), 0);
		assert.deepStrictEqual([failed, recovered].map(rows => rows.map(row => ({
			id: getWorktreeCleanupId(row), exists: row.worktreeExists, size: row.sizeBytes, error: row.worktreeCheckError,
		}))), [
			[
				{ id: getWorktreeCleanupId(worktrees[1]), exists: true, size: undefined, error: undefined },
				{ id: getWorktreeCleanupId(worktrees[0]), exists: undefined, size: undefined, error: 'Host disconnected' },
			],
			[
				{ id: getWorktreeCleanupId(worktrees[1]), exists: true, size: undefined, error: undefined },
				{ id: getWorktreeCleanupId(worktrees[0]), exists: false, size: 0, error: undefined },
			],
		]);
	});

	for (const cancelToken of [true, false]) {
		test(`preserves cancellation while checking a missing managed worktree when ${cancelToken ? 'the request is cancelled' : 'the provider cancels'}`, async () => {
			let inventory = [managedWorktree()];
			const checking = new DeferredPromise<void>();
			const cancellation = disposables.add(new CancellationTokenSource());
			const service = disposables.add(createService([], true, () => undefined,
				undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
				listManagedWorktrees: async () => inventory,
				cleanupManagedWorktree: async () => { },
				dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
				managedWorktreeExists: async () => {
					await checking.complete();
					if (cancelToken) {
						cancellation.cancel();
					}
					throw new CancellationError();
				},
			}));
			const worktrees = await service.getWorktrees(0);
			await service.cleanupWorktrees(worktrees);
			inventory = [];
			const refresh = service.refreshPendingCleanup(worktrees.map(getWorktreeCleanupId), 0, undefined, cancellation.token);
			await checking.p;
			await assert.rejects(refresh, error => isCancellationError(error));
		});
	}

	test('publishes unlinked inventory while an existing session measurement is still pending', async () => {
		const measurement = new DeferredPromise<number>();
		const unlinked = managedWorktree();
		let visible: readonly string[] = [];
		const service = disposables.add(createService([createSession('linked', oldDate())], true, () => measurement.p,
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => [unlinked],
		}));
		const loading = service.getWorktrees(0, worktrees => { visible = worktrees.map(getWorktreeCleanupId); });
		try {
			await timeout(0);
			assert.deepStrictEqual(visible, ['linked', `managed:test:${unlinked.worktree}`]);
		} finally {
			await measurement.complete(1);
			await loading;
		}
	});

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
			id: getWorktreeCleanupId(worktree),
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
			ordinaryDescription: '1 agent session worktree has been inactive for at least 15 days and can be cleaned up. Estimated disk usage: 6.00GB.',
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
		], true, () => 1, undefined, undefined, [active], undefined, pinned));

		assert.deepStrictEqual((await service.getWorktrees(0)).map(worktree => ({
			id: getWorktreeCleanupId(worktree),
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
			description: '1 agent session worktree has been inactive for at least 15 days and can be cleaned up. Estimated disk usage: 6.00GB.',
		});
	});

	test('shows a storage suggestion at 20 eligible worktrees below the size threshold', async () => {
		const sessions = Array.from({ length: 20 }, (_, index) => createSession(`session-${index}`, oldDate()));
		const service = disposables.add(createService(sessions, true, () => 1));

		await service.activate();

		assert.strictEqual(service.suggestion.get()?.description, '20 agent session worktrees have been inactive for at least 15 days and can be cleaned up. Estimated disk usage: 20B.');
	});

	test('counts every worktree a session owns toward the worktree threshold', async () => {
		const service = disposables.add(createService(
			[createSession('multi', oldDate(), SessionStatus.Completed, false, true, 20)],
			true,
			() => 1,
		));

		await service.activate();

		assert.strictEqual(service.suggestion.get()?.description, '20 agent session worktrees have been inactive for at least 15 days and can be cleaned up. Estimated disk usage: 1B.');
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
			items: worktrees.map(worktree => getWorktreeCleanupId(worktree)),
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
			description: '1 agent session worktree has been inactive for at least 15 days and can be cleaned up. Estimated disk usage: 6.00GB.',
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
				label: getWorktreeCleanupTitle(worktree),
				sizeBytes: worktree.sizeBytes,
				state: worktree.cleanupState,
			})),
		}, {
			progressTitles: ['Measuring agent session worktrees...'],
			items: [
				{ label: 'eligible', sizeBytes: 4 * ByteSize.GB, state: 'eligible' },
				{ label: 'running', sizeBytes: ByteSize.GB, state: 'running' },
				{ label: 'recent', sizeBytes: ByteSize.GB, state: 'recent' },
				{ label: 'archived', sizeBytes: undefined, state: 'archived' },
				{ label: 'unavailable', sizeBytes: undefined, state: 'unavailable' },
				{ label: 'empty-archived', sizeBytes: undefined, state: 'archived' },
			],
		});
	});

	test('refresh retries failed measurements and retains unmeasured archived rows', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const unavailable = createSession('unavailable', oldDate());
		let refreshed = false;
		const service = disposables.add(createService(
			[archived, unavailable],
			true,
			session => refreshed ? (session === archived ? 0 : ByteSize.GB) : (session === archived ? ByteSize.GB : undefined),
		));

		await service.getWorktrees(14);
		refreshed = true;
		await service.refresh();

		assert.deepStrictEqual((await service.getWorktrees(14)).map(worktree => ({
			label: getWorktreeCleanupTitle(worktree),
			sizeBytes: worktree.sizeBytes,
			state: worktree.cleanupState,
		})), [
			{ label: 'archived', sizeBytes: undefined, state: 'archived' },
			{ label: 'unavailable', sizeBytes: ByteSize.GB, state: 'eligible' },
		]);
	});

	test('never measures archived worktrees on opening, refresh, cache hits or status polling', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		let measurements = 0;
		const service = disposables.add(createService([archived], true, () => {
			measurements++;
			return 134 * ByteSize.GB;
		}));
		await service.getWorktrees(14);
		await service.refresh();
		await service.getWorktrees(14, undefined, CancellationToken.None, true);
		await service.refreshPendingCleanup(['archived'], 14);
		assert.deepStrictEqual({
			measurements,
			rows: (await service.getWorktrees(14)).map(worktree => ({
				id: getWorktreeCleanupId(worktree), failed: worktree.measurementFailed, size: worktree.sizeBytes, state: worktree.cleanupState,
			})),
		}, { measurements: 0, rows: [{ id: 'archived', failed: false, size: undefined, state: 'archived' }] });
	});

	test('discards a cached size on archive and measures again on restore without an activity change', async () => {
		const archived = observableValue('archived', false);
		const session = createSession('session', oldDate(), SessionStatus.Completed, false, true, 1, archived);
		let measurements = 0;
		const service = disposables.add(createService([session], true, () => ++measurements * ByteSize.GB));
		const before = (await service.getWorktrees(0))[0].sizeBytes;
		archived.set(true, undefined);
		const during = (await service.getWorktrees(0))[0].sizeBytes;
		archived.set(false, undefined);
		const after = (await service.getWorktrees(0))[0].sizeBytes;
		assert.deepStrictEqual({ before, during, after, measurements }, { before: ByteSize.GB, during: undefined, after: 2 * ByteSize.GB, measurements: 2 });
	});

	test('distinguishes empty worktrees from missing or unverified worktrees before displaying zero usage', async () => {
		const session = createSession('session', oldDate());
		const results: { exists: boolean | undefined; size: number | undefined; failed: boolean | undefined; error: string | undefined }[] = [];
		for (const exists of [true, false, undefined, 'error'] as const) {
			const service = disposables.add(createService([session], true, () => 0, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
				onExists: async () => {
					if (exists === 'error') {
						throw new Error('Host disconnected');
					}
					return exists;
				},
			}));
			const [worktree] = await service.getWorktrees(0);
			results.push({ exists: worktree.worktreeExists, size: worktree.sizeBytes, failed: worktree.measurementFailed, error: worktree.worktreeCheckError });
		}
		assert.deepStrictEqual(results, [
			{ exists: true, size: 0, failed: false, error: undefined },
			{ exists: false, size: 0, failed: false, error: undefined },
			{ exists: undefined, size: undefined, failed: true, error: undefined },
			{ exists: undefined, size: undefined, failed: true, error: 'Host disconnected' },
		]);
	});

	test('does not count missing unarchived worktrees toward cleanup suggestions and rechecks them on refresh', async () => {
		const sessions = Array.from({ length: 20 }, (_, index) => createSession(`missing-${index}`, oldDate()));
		let exists = false;
		const service = disposables.add(createService(sessions, true, () => 0, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			onExists: async () => exists,
		}));
		await service.activate();
		const before = { suggestion: !!service.suggestion.get(), missing: (await service.getWorktrees(0)).filter(worktree => worktree.worktreeExists === false).length };
		exists = true;
		await service.refresh();
		const after = { suggestion: !!service.suggestion.get(), missing: (await service.getWorktrees(0)).filter(worktree => worktree.worktreeExists === false).length };
		assert.deepStrictEqual({ before, after }, {
			before: { suggestion: false, missing: 20 },
			after: { suggestion: true, missing: 0 },
		});
	});

	test('does not hide a restored session using an in-flight archived existence check', async () => {
		const archived = observableValue('archived', true);
		const session = createSession('session', oldDate(), SessionStatus.Completed, true, true, 1, archived);
		const started = new DeferredPromise<void>();
		const existence = new DeferredPromise<boolean>();
		const service = disposables.add(createService([session], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			onExists: async () => { started.complete(); return existence.p; },
		}));
		const loading = service.getWorktrees(0);
		await started.p;
		archived.set(false, undefined);
		await existence.complete(false);
		const [worktree] = await loading;
		assert.deepStrictEqual({ state: worktree.cleanupState, exists: worktree.worktreeExists }, { state: 'eligible', exists: undefined });
	});

	test('rechecks archived existence on cached loads without scanning sizes or reusing absence after recreation', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		let exists = true;
		let measurements = 0;
		const service = disposables.add(createService([archived], true, () => { measurements++; return ByteSize.GB; }, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			onExists: async () => exists,
		}));
		const snapshots: { exists: boolean | undefined; size: number | undefined }[] = [];
		for (const value of [true, false, true]) {
			exists = value;
			const [worktree] = await service.getWorktrees(0);
			snapshots.push({ exists: worktree.worktreeExists, size: worktree.sizeBytes });
		}
		assert.deepStrictEqual({ measurements, snapshots }, {
			measurements: 0,
			snapshots: [{ exists: true, size: undefined }, { exists: false, size: 0 }, { exists: true, size: undefined }],
		});
	});

	test('failed and unsupported existence checks never reuse a previous zero size or claim removal', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		let state: 'absent' | 'failed' | 'unsupported' = 'absent';
		const service = disposables.add(createService([archived], true, () => { throw new Error('Must not measure'); }, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			onExists: async () => {
				if (state === 'failed') {
					throw new Error('Host disconnected');
				}
				return state === 'absent' ? false : undefined;
			},
			onCleanup: async () => ({ state: 'unknown' }),
		}));
		await service.getWorktrees(0);
		const results: { exists: boolean | undefined; size: number | undefined; error: string | undefined }[] = [];
		for (const value of ['failed', 'unsupported'] as const) {
			state = value;
			const [worktree] = await service.getWorktrees(0);
			results.push({ exists: worktree.worktreeExists, size: worktree.sizeBytes, error: worktree.worktreeCheckError });
		}
		assert.deepStrictEqual(results, [
			{ exists: undefined, size: undefined, error: 'Host disconnected' },
			{ exists: undefined, size: undefined, error: undefined },
		]);
	});

	test('publishes archived entries only after their existence check and polls for confirmed absence without size scans', async () => {
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const started = new DeferredPromise<void>();
		const existence = new DeferredPromise<boolean>();
		let removed = false;
		const service = disposables.add(createService([archived], true, () => { throw new Error('Must not measure'); }, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			onExists: async () => { started.complete(); return removed ? false : existence.p; },
			onCleanup: async () => ({ state: removed ? 'unknown' : 'pending' }),
		}));
		const updates: number[] = [];
		const loading = service.getWorktrees(0, rows => updates.push(rows.length));
		await started.p;
		const initialUpdates = [...updates];
		await existence.complete(true);
		await loading;
		removed = true;
		const [worktree] = await service.refreshPendingCleanup(['archived'], 0);
		assert.deepStrictEqual({ initialUpdates, exists: worktree.worktreeExists, size: worktree.sizeBytes }, {
			initialUpdates: [0], exists: false, size: 0,
		});
	});

	test('discards an in-flight size when the session is archived during measurement', async () => {
		const archived = observableValue('archived', false);
		const session = createSession('session', oldDate(), SessionStatus.Completed, false, true, 1, archived);
		const started = new DeferredPromise<void>();
		const result = new DeferredPromise<number>();
		const service = disposables.add(createService([session], true, () => { started.complete(); return result.p; }));
		const loading = service.getWorktrees(0);
		await started.p;
		archived.set(true, undefined);
		await result.complete(134 * ByteSize.GB);
		const row = (await loading)[0];
		assert.deepStrictEqual({ size: row.sizeBytes, state: row.cleanupState, failed: row.measurementFailed }, { size: undefined, state: 'archived', failed: false });
	});

	test('rechecks requested cleanup without rescanning unrelated worktrees', async () => {
		const pending = createSession('pending', oldDate(), SessionStatus.Completed, true);
		const existing = createSession('existing', oldDate(), SessionStatus.Completed, true);
		const eligible = createSession('eligible', oldDate());
		const scans: string[] = [];
		const service = disposables.add(createService([pending, existing, eligible], true, session => {
			scans.push(session.sessionId);
			return ByteSize.GB;
		}));
		await service.getWorktrees(14);
		const worktrees = await service.refreshPendingCleanup(['pending'], 14);
		assert.deepStrictEqual({ scans, ids: worktrees.map(worktree => getWorktreeCleanupId(worktree)) }, {
			scans: ['eligible'], ids: ['pending', 'existing', 'eligible'],
		});
	});

	test('publishes a cleanup status update before another pending status recheck finishes', async () => {
		const slow = new DeferredPromise<IAgentHostWorktreeCleanupStatus>();
		const published = new DeferredPromise<readonly (IAgentHostWorktreeCleanupStatus['state'] | undefined)[]>();
		let checking = false;
		const service = disposables.add(createService([
			createSession('fast', oldDate(), SessionStatus.Completed, true),
			createSession('slow', oldDate(), SessionStatus.Completed, true),
		], true, () => { throw new Error('Archived worktrees must not be measured'); }, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			onCleanup: async session => checking ? session.sessionId === 'slow' ? slow.p : { state: 'unknown' } : { state: 'pending' },
		}));
		await service.getWorktrees(14);
		checking = true;
		const refresh = service.refreshPendingCleanup(['fast', 'slow'], 14, worktrees => {
			if (!published.isSettled) {
				published.complete(worktrees.map(worktree => worktree.cleanupStatus?.state));
			}
		});
		try {
			assert.deepStrictEqual(await published.p, ['unknown', 'pending']);
		} finally {
			await slow.complete({ state: 'unknown' });
			await refresh;
		}
	});

	test('sessions shown in any window, pinned, running, and recent sessions are not eligible', async () => {
		const old = oldDate();
		const eligible = createSession('eligible', old);
		const shownInMainWindow = createSession('shownInMainWindow', old);
		const shownInChatWindow = createSession('shownInChatWindow', old);
		const pinned = createSession('pinned', old);
		const running = createSession('running', old, SessionStatus.InProgress);
		const recent = createSession('recent', new Date());
		const service = disposables.add(createService(
			[eligible, shownInMainWindow, shownInChatWindow, pinned, running, recent],
			true,
			session => session === eligible ? 6 * ByteSize.GB : ByteSize.GB,
			undefined,
			undefined,
			[shownInMainWindow, shownInChatWindow],
			undefined,
			pinned,
		));

		await service.activate();

		assert.strictEqual(service.suggestion.get()?.description, '1 agent session worktree has been inactive for at least 15 days and can be cleaned up. Estimated disk usage: 6.00GB.');
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
			states: worktrees.map(worktree => [getWorktreeCleanupId(worktree), worktree.cleanupState]),
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
		let scheduled = false;
		const service = disposables.add(createService([archived], true, () => { throw new Error('Archived sessions must not be measured'); }, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			onArchive: async () => { throw new Error('Must not archive again'); },
			onCleanup: async (_session, retry) => { calls.push(retry); scheduled ||= retry; return { state: scheduled ? 'pending' : 'failed', message: scheduled ? undefined : 'permission denied' }; },
		}));
		const before = (await service.getWorktrees(0))[0].cleanupStatus;
		await service.cleanupWorktrees([{ session: archived, sizeBytes: undefined, worktreeCount: 1 }]);
		const after = (await service.getWorktrees(0))[0].cleanupStatus;
		assert.deepStrictEqual({ before, after, calls, archived: archived.isArchived.get() }, {
			before: { state: 'failed', message: 'permission denied' },
			after: { state: 'pending', message: undefined },
			calls: [false, false, true, false],
			archived: true,
		});
	});

	test('confirmation omits size totals for archived and mixed selections without implying zero usage', async () => {
		const active = createSession('active', oldDate());
		const archived = createSession('archived', oldDate(), SessionStatus.Completed, true);
		const dialogs: Pick<IConfirmation, 'message' | 'detail'>[] = [];
		const service = disposables.add(createService([active, archived], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({
				confirm: async confirmation => {
					dialogs.push({ message: confirmation.message, detail: confirmation.detail });
					return { confirmed: false };
				},
			}),
		}));
		const activeCandidate = { session: active, sizeBytes: ByteSize.GB, worktreeCount: 1 };
		const archivedCandidate = { session: archived, sizeBytes: 134 * ByteSize.GB, worktreeCount: 1 };
		await service.cleanupWorktrees([activeCandidate]);
		await service.cleanupWorktrees([archivedCandidate]);
		await service.cleanupWorktrees([activeCandidate, archivedCandidate]);
		assert.deepStrictEqual(dialogs, [
			{ message: 'Clean up 1 worktree?', detail: 'Sessions will be marked as done. Changes are saved to their branches; ignored files are deleted. You can restore sessions later.' },
			{ message: 'Clean up 1 worktree?', detail: 'Sessions will be marked as done. Changes are saved to their branches; ignored files are deleted. You can restore sessions later.' },
			{ message: 'Clean up 2 worktrees?', detail: 'Sessions will be marked as done. Changes are saved to their branches; ignored files are deleted. You can restore sessions later.' },
		]);
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
			status: undefined, error: 'host disconnected', size: undefined,
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
		let connected = false;
		const service = disposables.add(createService([archived], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			onCleanup: async (_session, retry) => {
				calls.push(retry);
				connected ||= retry;
				if (!connected) {
					throw new Error('host disconnected');
				}
				return { state: 'pending' };
			},
		}));
		await service.getWorktrees(0);
		await service.cleanupWorktrees([{ session: archived, sizeBytes: 100, worktreeCount: 1 }]);
		const worktree = (await service.getWorktrees(0))[0];
		assert.deepStrictEqual({ calls, status: worktree.cleanupStatus, error: worktree.cleanupStatusError }, {
			calls: [false, false, true, false], status: { state: 'pending' }, error: undefined,
		});
	});

	for (const confirmed of [false, true]) {
		test(`force cleanup requires destructive confirmation (${confirmed})`, async () => {
			const session = createSession('failed', oldDate(), SessionStatus.Completed, true);
			const calls: { retry: boolean; force: boolean | undefined }[] = [];
			const confirmations: string[] = [];
			const service = disposables.add(createService([session], true, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
				canForceWorktreeCleanup: () => true,
				dialogService: upcastPartial<IDialogService>({
					confirm: async confirmation => {
						confirmations.push(typeof confirmation.detail === 'string' ? confirmation.detail : confirmation.detail?.value ?? '');
						return { confirmed };
					},
				}),
				onCleanup: async (_session, retry, force) => {
					calls.push({ retry, force });
					return { state: 'unknown' };
				},
			}));
			const worktree: ISessionWorktree = { session, sizeBytes: undefined, worktreeCount: 1, cleanupState: 'archived', worktreeExists: true, cleanupStatus: { state: 'failed' } };
			const result = await service.forceCleanupWorktrees([worktree]);
			assert.deepStrictEqual({
				result, calls,
				warnsAboutLoss: confirmations.length === 1 && confirmations[0].includes('all uncommitted changes') && confirmations[0].includes('cannot be undone'),
				warnsAboutUsage: confirmations[0].includes('even if another session or chat is using them') && confirmations[0].includes('may stop working'),
				warnsAboutBranchChange: confirmations[0].includes('their branch changed since they were listed'),
			}, { result: confirmed, calls: confirmed ? [{ retry: true, force: true }] : [], warnsAboutLoss: true, warnsAboutUsage: true, warnsAboutBranchChange: true });
		});
	}

	for (const confirmed of [false, true]) {
		test(`bulk force cleanup confirms the whole selection once (${confirmed})`, async () => {
			const sessions = ['first', 'second'].map(id => createSession(id, oldDate(), SessionStatus.Completed, true));
			const calls: { id: string; retry: boolean; force: boolean | undefined }[] = [];
			const confirmations: string[] = [];
			const service = disposables.add(createService(sessions, true, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
				canForceWorktreeCleanup: () => true,
				dialogService: upcastPartial<IDialogService>({
					confirm: async confirmation => {
						confirmations.push(confirmation.message);
						return { confirmed };
					},
				}),
				onCleanup: async (session, retry, force) => {
					calls.push({ id: session.sessionId, retry, force });
					return { state: 'unknown' };
				},
			}));
			const worktrees: ISessionWorktree[] = sessions.map((session, index) => ({ session, sizeBytes: undefined, worktreeCount: 1, cleanupState: 'archived', worktreeExists: true, cleanupStatus: { state: index === 0 ? 'failed' : 'inUse' } }));
			const result = await service.forceCleanupWorktrees(worktrees);
			assert.deepStrictEqual({ result, confirmations, calls }, {
				result: confirmed,
				confirmations: ['Forcibly remove 2 worktrees?'],
				calls: confirmed ? sessions.map(session => ({ id: session.sessionId, retry: true, force: true })) : [],
			});
		});
	}

	test('force cleanup supports in-use worktrees but excludes running, unverified, or unsupported worktrees', async () => {
		const session = createSession('failed', oldDate(), SessionStatus.Completed, true);
		let supported = true;
		const service = disposables.add(createService([session], true, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			canForceWorktreeCleanup: () => supported,
		}));
		const worktree: ISessionWorktree = { session, sizeBytes: undefined, worktreeCount: 1, cleanupState: 'archived', worktreeExists: true, cleanupStatus: { state: 'failed' } };
		const states = (['failed', 'skipped', 'inUse', 'pending', 'running', 'unknown'] as const).map(state => service.canForceCleanup({ ...worktree, cleanupStatus: { state } }));
		supported = false;
		await assert.rejects(service.forceCleanupWorktrees([worktree]), /cannot be forcibly removed/);
		assert.deepStrictEqual({ states, unverified: service.canForceCleanup({ ...worktree, worktreeExists: undefined }) }, {
			states: [true, true, true, false, false, false], unverified: false,
		});
	});

	test('force cleanup rejects a session restored while confirmation was open', async () => {
		const archived = observableValue('archived', true);
		const session = createSession('restored', oldDate(), SessionStatus.Completed, true, true, 1, archived);
		let cleanups = 0;
		const service = disposables.add(createService([session], true, () => undefined, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			canForceWorktreeCleanup: () => true,
			dialogService: upcastPartial<IDialogService>({ confirm: async () => { archived.set(false, undefined); return { confirmed: true }; } }),
			onCleanup: async () => { cleanups++; return { state: 'unknown' }; },
		}));
		await assert.rejects(service.forceCleanupWorktrees([{ session, sizeBytes: undefined, worktreeCount: 1, cleanupState: 'archived', worktreeExists: true, cleanupStatus: { state: 'failed' } }]), /Only sessions marked as done/);
		assert.strictEqual(cleanups, 0);
	});

	test('shows concise scheduling progress when no caller handles it', async () => {
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
				location: options.location,
				title: options.title,
				total: options.total,
			})),
			reports: progressService.reports,
		}, {
			cleaned: true,
			archived: ['first', 'second'],
			progress: [{
				location: ProgressLocation.Notification,
				title: 'Scheduling worktree cleanup...',
				total: 3,
			}],
			reports: [
				{ increment: 2, message: '2 of 3 worktrees scheduled' },
				{ increment: 1, message: '3 of 3 worktrees scheduled' },
			],
		});
	});

	test('publishes inline progress without a duplicate notification while continuing after scheduling failures', async () => {
		const first = createSession('first', oldDate(), SessionStatus.Completed, false, true, 2);
		const second = createSession('second', oldDate());
		const third = createSession('third', oldDate());
		const archived: string[] = [];
		const updates: SessionWorktreeCleanupProgress[] = [];
		const progressService = new TestProgressService();
		const service = disposables.add(createService([first, second, third], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			progressService,
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			onArchive: async session => {
				archived.push(session.sessionId);
				assert.strictEqual(updates[0]?.state, 'started');
				if (session === second) {
					throw new Error('host disconnected');
				}
			},
		}));
		await assert.rejects(service.cleanupWorktrees([
			{ session: first, sizeBytes: 100, worktreeCount: 2 },
			{ session: second, sizeBytes: 100, worktreeCount: 1 },
			{ session: third, sizeBytes: 100, worktreeCount: 1 },
		], progress => updates.push(progress)), /Couldn't schedule cleanup for 1 worktrees\.\nsecond: host disconnected/);
		assert.deepStrictEqual({
			archived,
			notifications: progressService.options,
			updates: updates.map(progress => progress.state === 'started' ? progress : {
				state: progress.state,
				session: getWorktreeCleanupId(progress.candidate),
				message: progress.state === 'failed' ? progress.message : undefined,
			}),
		}, {
			archived: ['first', 'second', 'third'],
			notifications: [],
			updates: [
				{ state: 'started' },
				{ state: 'scheduled', session: 'first', message: undefined },
				{ state: 'failed', session: 'second', message: 'host disconnected' },
				{ state: 'scheduled', session: 'third', message: undefined },
			],
		});
	});

	test('does not start a batch or archive sessions when confirmation is canceled', async () => {
		const session = createSession('first', oldDate());
		const updates: SessionWorktreeCleanupProgress[] = [];
		let archived = false;
		const service = disposables.add(createService([session], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: false }) }),
			onArchive: async () => { archived = true; },
		}));
		const result = await service.cleanupWorktrees([{ session, sizeBytes: 100, worktreeCount: 1 }], progress => updates.push(progress));
		assert.deepStrictEqual({ result, updates, archived }, { result: false, updates: [], archived: false });
	});

	test('owns confirmed batch progress without an editor and prevents duplicate scheduling', async () => {
		const first = createSession('first', oldDate());
		const second = createSession('second', oldDate());
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const archived: string[] = [];
		const service = disposables.add(createService([first, second], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			onArchive: async session => {
				archived.push(session.sessionId);
				if (session === first) {
					await entered.complete();
					await release.p;
				}
			},
		}));
		const candidates = [first, second].map(session => ({ session, sizeBytes: 100, worktreeCount: 1 }));
		const scheduled = service.cleanupWorktrees(candidates);
		await entered.p;
		const during = service.cleanupOperations.get().map(operation => [getWorktreeCleanupId(operation.candidate), operation.state]);
		const duplicateWhileScheduling = await service.cleanupWorktrees(candidates);
		await release.complete();
		await scheduled;
		await assert.rejects(service.cleanupWorktrees(candidates), /already scheduled/);
		assert.deepStrictEqual({
			during,
			duplicateWhileScheduling,
			archived,
			scheduling: service.isSchedulingCleanup.get(),
			after: service.cleanupOperations.get().map(operation => [getWorktreeCleanupId(operation.candidate), operation.state]),
		}, {
			during: [['first', 'queued'], ['second', 'queued']],
			duplicateWhileScheduling: false,
			archived: ['first', 'second'],
			scheduling: false,
			after: [['first', 'pending'], ['second', 'pending']],
		});
	});

	test('serializes confirmation and cancellation leaves no retained operations', async () => {
		const session = createSession('first', oldDate());
		const confirmation = new DeferredPromise<{ confirmed: boolean }>();
		let confirmations = 0;
		const service = disposables.add(createService([session], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => { confirmations++; return confirmation.p; } }),
		}));
		const candidates = [{ session, sizeBytes: 100, worktreeCount: 1 }];
		const first = service.cleanupWorktrees(candidates);
		const second = await service.cleanupWorktrees(candidates);
		await confirmation.complete({ confirmed: false });
		const result = await first;
		assert.deepStrictEqual({ confirmations, second, result, operations: service.cleanupOperations.get(), scheduling: service.isSchedulingCleanup.get() }, {
			confirmations: 1, second: false, result: false, operations: [], scheduling: false,
		});
	});

	test('only confirmed restoration cancels retained cleanup and allows cleanup again', async () => {
		const archived = observableValue('archived', false);
		const session = createSession('restored', oldDate(), SessionStatus.Completed, false, true, 1, archived);
		const onDidUnarchiveSession = disposables.add(new Emitter<ISession>());
		let submissions = 0;
		const service = disposables.add(createService([session], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			onDidUnarchiveSession: onDidUnarchiveSession.event,
			onArchive: async () => { submissions++; },
		}));
		const candidates = [{ session, sizeBytes: 100, worktreeCount: 1 }];
		await service.cleanupWorktrees(candidates);
		await service.getWorktrees(0, () => { });
		const staleSnapshot = service.cleanupOperations.get().map(operation => operation.state);
		await assert.rejects(service.cleanupWorktrees(candidates), /already scheduled/);
		onDidUnarchiveSession.fire(session);
		const restored = service.cleanupOperations.get();
		await service.cleanupWorktrees(candidates);
		assert.deepStrictEqual({ staleSnapshot, restored, submissions, operations: service.cleanupOperations.get().map(operation => operation.state) }, {
			staleSnapshot: ['pending'], restored: [], submissions: 2, operations: ['pending'],
		});
	});

	for (const archiveFails of [false, true]) {
		test(`restoration during an outstanding archive does not recreate its cancelled operation when archive ${archiveFails ? 'fails' : 'succeeds'}`, async () => {
			const session = createSession('restored', oldDate());
			const onDidUnarchiveSession = disposables.add(new Emitter<ISession>());
			const entered = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			const updates: SessionWorktreeCleanupProgress[] = [];
			const service = disposables.add(createService([session], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
				dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
				onDidUnarchiveSession: onDidUnarchiveSession.event,
				onArchive: async () => {
					await entered.complete();
					await release.p;
					if (archiveFails) {
						throw new Error('archive cancelled');
					}
				},
			}));
			const cleanup = service.cleanupWorktrees([{ session, sizeBytes: 100, worktreeCount: 1 }], update => updates.push(update));
			await entered.p;
			onDidUnarchiveSession.fire(session);
			await release.complete();
			await cleanup;
			assert.deepStrictEqual({ operations: service.cleanupOperations.get(), progress: updates.map(update => update.state), scheduling: service.isSchedulingCleanup.get() }, {
				operations: [], progress: ['started'], scheduling: false,
			});
		});
	}

	test('a restored queued session is not archived when the batch reaches it', async () => {
		const first = createSession('first', oldDate());
		const restored = createSession('restored', oldDate());
		const onDidUnarchiveSession = disposables.add(new Emitter<ISession>());
		const entered = new DeferredPromise<void>();
		const release = new DeferredPromise<void>();
		const archived: string[] = [];
		const service = disposables.add(createService([first, restored], true, () => 100, undefined, undefined, undefined, undefined, undefined, undefined, Event.None, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			onDidUnarchiveSession: onDidUnarchiveSession.event,
			onArchive: async session => {
				archived.push(session.sessionId);
				await entered.complete();
				await release.p;
			},
		}));
		const cleanup = service.cleanupWorktrees([first, restored].map(session => ({ session, sizeBytes: 100, worktreeCount: 1 })));
		await entered.p;
		onDidUnarchiveSession.fire(restored);
		await release.complete();
		await cleanup;
		assert.deepStrictEqual({ archived, operations: service.cleanupOperations.get().map(operation => getWorktreeCleanupId(operation.candidate)) }, {
			archived: ['first'], operations: ['first'],
		});
	});

	test('accepts prefixed agent worktrees without measuring sessionless storage', async () => {
		const unlinked = { ...managedWorktree('/repo.worktrees/task'), branch: 'users/alice/agents/task' };
		const requests: IManagedSessionWorktree[] = [];
		const service = disposables.add(createService([], true, () => { throw new Error('Must not measure sessionless storage'); },
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			listManagedWorktrees: async () => [unlinked],
			cleanupManagedWorktree: async worktree => { requests.push(worktree); },
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
		}));
		const worktrees = await service.getWorktrees(0, () => { });
		await service.cleanupWorktrees(worktrees);
		assert.deepStrictEqual({ branches: worktrees.map(worktree => worktree.unlinkedWorktree?.branch), requests }, {
			branches: ['users/alice/agents/task'], requests: [unlinked],
		});
	});

	test('reconciles outstanding operations with host failures and confirmed absence', async () => {
		const session = createSession('archived', oldDate(), SessionStatus.Completed, true);
		let cleanupStatus: IAgentHostWorktreeCleanupStatus = { state: 'pending' };
		let exists = true;
		let retries = 0;
		const service = disposables.add(createService([session], true, () => { throw new Error('Must not measure done sessions'); },
			undefined, undefined, undefined, undefined, undefined, undefined, undefined, {
			dialogService: upcastPartial<IDialogService>({ confirm: async () => ({ confirmed: true }) }),
			onCleanup: async (_session, retry) => {
				if (retry) {
					retries++;
					return { state: 'pending' };
				}
				return cleanupStatus;
			},
			onExists: async () => exists,
		}));
		const worktrees = await service.getWorktrees(0, () => { });
		await service.cleanupWorktrees(worktrees);
		cleanupStatus = { state: 'failed', message: 'locked directory' };
		const failedWorktrees = await service.refreshPendingCleanup([session.sessionId], 0);
		const failed = service.cleanupOperations.get().map(operation => ({ state: operation.state, message: operation.message }));
		await service.cleanupWorktrees(worktrees);
		exists = false;
		await service.refreshPendingCleanup([session.sessionId], 0);
		assert.deepStrictEqual({ failed, failure: failedWorktrees[0].cleanupStatus, retries, outstanding: service.cleanupOperations.get() }, {
			failed: [{ state: 'failed', message: undefined }], failure: { state: 'failed', message: 'locked directory' }, retries: 2, outstanding: [],
		});
	});

	test('refreshes the measurement snapshot after cleanup without rescanning archived worktrees', async () => {
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
			sessionIds: reloaded.map(worktree => getWorktreeCleanupId(worktree)),
		}, {
			scanCount: 3,
			measurementProgressCount: 2,
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

		assert.deepStrictEqual((await service.getWorktrees(14)).map(worktree => getWorktreeCleanupId(worktree)), ['eligible']);
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
			snapshots.push(worktrees.map(worktree => ({ id: getWorktreeCleanupId(worktree), calculating: !!worktree.isMeasuring, size: worktree.sizeBytes })));
			if (worktrees.some(worktree => getWorktreeCleanupId(worktree) === 'fast' && worktree.sizeBytes !== undefined)) {
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
			label: getWorktreeCleanupTitle(worktree),
			sizeBytes: worktree.sizeBytes,
			state: worktree.cleanupState,
		})), [
			{ label: 'slow', sizeBytes: ByteSize.GB, state: 'eligible' },
			{ label: 'fast', sizeBytes: ByteSize.GB, state: 'eligible' },
		]);
	}));

	test('excludes archived rows from scan totals while retaining them in fresh and cached results', async () => {
		const service = disposables.add(createService(
			[createSession('empty', oldDate(), SessionStatus.Completed, true), createSession('retained', oldDate())],
			true,
			session => session.sessionId === 'empty' ? 0 : ByteSize.GB,
		));
		const snapshots: { ids: string[]; scanned: number | undefined; total: number | undefined }[] = [];
		const record: NonNullable<Parameters<typeof service.getWorktrees>[1]> = (worktrees, progress) => {
			snapshots.push({ ids: worktrees.map(worktree => getWorktreeCleanupId(worktree)), scanned: progress?.scannedWorktrees, total: progress?.totalWorktrees });
		};
		await service.getWorktrees(0, record);
		await service.getWorktrees(0, record);
		assert.deepStrictEqual({
			initial: snapshots[0],
			completed: snapshots.slice(-2),
		}, {
			initial: { ids: ['retained'], scanned: 0, total: 1 },
			completed: [
				{ ids: ['empty', 'retained'], scanned: 1, total: 1 },
				{ ids: ['empty', 'retained'], scanned: 1, total: 1 },
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
			sessionIds: worktrees.map(worktree => getWorktreeCleanupId(worktree)),
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
	shownSessions: readonly ISession[] = [],
	onCommand?: (id: string, args: readonly unknown[]) => void,
	pinnedSession?: ISession,
	configurationService = new TestConfigurationService({ [AGENT_SESSIONS_STORAGE_CLEANUP_SUGGESTION_SETTING]: enabled }),
	onDidChangeSessions: Event<ISessionsChangeEvent> = Event.None,
	overrides: {
		readonly progressService?: IProgressService;
		readonly dialogService?: IDialogService;
		readonly onArchive?: (session: ISession) => Promise<void>;
		readonly onPrepare?: ISessionsManagementService['prepareSessionWorktreeCleanup'];
		readonly onCleanup?: ISessionsManagementService['sessionWorktreeCleanup'];
		readonly canForceWorktreeCleanup?: ISessionsManagementService['canForceWorktreeCleanup'];
		readonly onExists?: ISessionsManagementService['sessionWorktreeExists'];
		readonly onDidArchiveSession?: Event<ISession>;
		readonly onDidUnarchiveSession?: Event<ISession>;
		readonly listManagedWorktrees?: ISessionsManagementService['listManagedWorktrees'];
		readonly cleanupManagedWorktree?: ISessionsManagementService['cleanupManagedWorktree'];
		readonly managedWorktreeExists?: ISessionsManagementService['managedWorktreeExists'];
	} = {},
): SessionWorktreeCleanupService {
	return new SessionWorktreeCleanupService(
		upcastPartial<ISessionsManagementService>({
			getSessions: () => sessions,
			getSessionWorktreeDiskUsage: async (session, token) => sizeForSession(session, token),
			archiveSession: async session => overrides.onArchive?.(session),
			prepareSessionWorktreeCleanup: async session => overrides.onPrepare?.(session),
			sessionWorktreeCleanup: overrides.onCleanup,
			canForceWorktreeCleanup: overrides.canForceWorktreeCleanup,
			sessionWorktreeExists: overrides.onExists ?? (async () => true),
			onDidArchiveSession: overrides.onDidArchiveSession ?? Event.None,
			onDidUnarchiveSession: overrides.onDidUnarchiveSession ?? Event.None,
			onDidChangeSessions,
			listManagedWorktrees: overrides.listManagedWorktrees,
			cleanupManagedWorktree: overrides.cleanupManagedWorktree,
			managedWorktreeExists: overrides.managedWorktreeExists,
		}),
		upcastPartial<ISessionHostService>({ isShown: resource => shownSessions.some(session => isEqual(session.resource, resource)) }),
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
