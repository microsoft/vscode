/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { timeout } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey, AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey, AgentHostAutoRemoveWorktreesAfterMergeConfigKey } from '../../common/agentHostSchema.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { isSessionStatusArchived, SessionStatus, withSessionExternal, withSessionGitHubState, withSessionGitState, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import type { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import type { IAgentHostPullRequestStatus, IAgentHostPullRequestStatusService } from '../../node/agentHostPullRequestStatusService.js';
import { AgentHostSessionLifecycle, type IAgentHostSessionLifecycleCandidate } from '../../node/agentHostSessionLifecycle.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { NullLogService } from '../../../log/common/log.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 3);
const PULL_REQUEST_URL = 'https://github.com/microsoft/vscode/pull/1';
const SECOND_PULL_REQUEST_URL = 'https://github.com/microsoft/vscode/pull/2';

suite('AgentHostSessionLifecycle', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options?: {
		readonly status?: IAgentHostPullRequestStatus;
		readonly resolveStatus?: (pullRequestUrl: string) => IAgentHostPullRequestStatus | undefined;
		readonly sessionStatus?: SessionStatus;
		readonly modifiedTime?: number;
		readonly external?: boolean;
		readonly enabled?: boolean;
		readonly archiveAfterDays?: number;
		readonly deleteAfterDays?: number;
		readonly autoRemoveWorktreesAfterMerge?: boolean;
		readonly onResolve?: (configurationService: AgentConfigurationService, stateManager: AgentHostStateManager, session: URI) => void;
		readonly pullRequestUrls?: readonly string[];
		readonly deleteError?: Error;
		readonly autoArchivedAt?: number;
		readonly canDeleteSession?: boolean;
		readonly worktreePresent?: boolean;
		readonly onGetAutoArchivedAt?: (configurationService: AgentConfigurationService) => void;
		readonly onSetAutoArchivedAt?: (timestamp: number, configurationService: AgentConfigurationService, stateManager: AgentHostStateManager, session: URI) => void;
	}) {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		if (options?.enabled !== false) {
			configurationService.updateRootConfig({
				[AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey]: options?.archiveAfterDays ?? 1,
				[AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey]: options?.deleteAfterDays ?? 1,
			});
		}
		configurationService.updateRootConfig({
			[AgentHostAutoRemoveWorktreesAfterMergeConfigKey]: options?.autoRemoveWorktreesAfterMerge ?? true,
		});

		const session = URI.parse('ahp-copilot://auto-archive');
		const modifiedTime = options?.modifiedTime ?? NOW - 2 * DAY_MS;
		const status = options?.sessionStatus ?? SessionStatus.Idle;
		const meta = withSessionExternal(withSessionGitHubState(
			withSessionGitState(undefined, { branchName: 'feature' }),
			{ pullRequestUrls: options?.pullRequestUrls ?? [PULL_REQUEST_URL], pullRequestBranchName: 'feature' },
		), options?.external ?? false);
		const summary: SessionSummary = {
			resource: session.toString(),
			provider: 'copilot',
			title: 'Auto archive',
			status,
			createdAt: new Date(modifiedTime - DAY_MS).toISOString(),
			modifiedAt: new Date(modifiedTime).toISOString(),
			_meta: meta,
		};
		stateManager.createSession(summary);
		const restored: string[] = [];
		const resolved: string[] = [];
		const resolvedPullRequestUrls: string[] = [];
		const cleanedWorktrees: string[] = [];
		const archivedSessions: string[] = [];
		const deleted: string[] = [];
		const autoArchiveTimestamps: number[] = [];
		const listed: { readonly archiveCutoff: number | undefined; readonly deleteCutoff: number | undefined; readonly cleanupWorktrees: boolean }[] = [];
		let autoArchivedAt = options?.autoArchivedAt;
		let worktreePresent = options?.worktreePresent ?? false;
		const pullRequestStatusService = new class extends mock<IAgentHostPullRequestStatusService>() {
			override readonly onDidChangePullRequestStatus = Event.None;
			override getPullRequestStatus() { return options?.status; }
			override markPullRequestMerged() { }
			override async refresh() { }
			override async resolveForLifecycle(sessionKey: string, pullRequestUrl: string) {
				resolved.push(sessionKey);
				resolvedPullRequestUrls.push(pullRequestUrl);
				assert.ok((options?.pullRequestUrls ?? [PULL_REQUEST_URL]).includes(pullRequestUrl));
				options?.onResolve?.(configurationService, stateManager, session);
				return options?.resolveStatus?.(pullRequestUrl) ?? options?.status;
			}
			override dispose() { }
		}();
		const providerService = new class extends mock<IAgentHostProviderService>() {
			override readonly onDidRegisterProvider = Event.None;
		}();
		const lifecycle = disposables.add(new AgentHostSessionLifecycle(
			{
				listCandidates: async (archiveCutoff, deleteCutoff, cleanupWorktrees) => {
					listed.push({ archiveCutoff, deleteCutoff, cleanupWorktrees });
					if (options?.external || status === SessionStatus.InProgress) {
						return [];
					}
					const pullRequestUrls = options?.pullRequestUrls ?? [PULL_REQUEST_URL];
					const archived = isSessionStatusArchived(status);
					const action = archived
						? deleteCutoff !== undefined && autoArchivedAt !== undefined && autoArchivedAt <= deleteCutoff ? 'delete' : undefined
						: archiveCutoff !== undefined && modifiedTime <= archiveCutoff ? 'archive' : cleanupWorktrees ? 'cleanupWorktree' : undefined;
					return pullRequestUrls.length > 0 && action ? [{
						session,
						pullRequestUrls,
						action,
					} satisfies IAgentHostSessionLifecycleCandidate] : [];
				},
				restoreSession: async resource => { restored.push(resource.toString()); },
				getAutoArchivedAt: async () => {
					options?.onGetAutoArchivedAt?.(configurationService);
					return autoArchivedAt;
				},
				setAutoArchivedAt: async (_resource, timestamp) => {
					autoArchiveTimestamps.push(timestamp);
					autoArchivedAt = timestamp;
					options?.onSetAutoArchivedAt?.(timestamp, configurationService, stateManager, session);
				},
				archiveSession: resource => {
					archivedSessions.push(resource.toString());
					stateManager.dispatchServerAction(resource.toString(), {
						type: ActionType.SessionIsArchivedChanged,
						isArchived: true,
					});
				},
				canDeleteSession: async () => options?.canDeleteSession !== false && !worktreePresent,
				cleanupWorktree: async resource => {
					cleanedWorktrees.push(resource.toString());
					worktreePresent = false;
				},
				deleteSession: async (resource, validate) => {
					if (!await validate()) {
						return false;
					}
					deleted.push(resource.toString());
					if (options?.deleteError) {
						throw options.deleteError;
					}
					stateManager.deleteSession(resource.toString());
					return true;
				},
			},
			configurationService,
			stateManager,
			pullRequestStatusService,
			providerService,
			logService,
			{ now: () => NOW, start: false },
		));
		return { lifecycle, configurationService, stateManager, session, restored, resolved, resolvedPullRequestUrls, cleanedWorktrees, archivedSessions, deleted, autoArchiveTimestamps, listed };
	}

	test('archives an inactive internal session after an authoritative merged result', async () => {
		const { lifecycle, stateManager, session, restored, resolved, archivedSessions } = createHarness({
			status: mergedPullRequestStatus(),
		});
		const actions: string[] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.action.type === ActionType.SessionIsArchivedChanged) {
				actions.push(`${envelope.channel}:${envelope.action.isArchived}`);
			}
		}));

		await lifecycle.run();

		assert.deepStrictEqual({
			restored,
			resolved,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
			actions,
			archivedSessions,
		}, {
			restored: [session.toString()],
			resolved: [session.toString(), session.toString()],
			archived: true,
			actions: [`${session.toString()}:true`],
			archivedSessions: [session.toString()],
		});
	});

	test('does not archive when GitHub still reports the pull request open', async () => {
		const { lifecycle, stateManager, session, restored, resolved } = createHarness({
			status: { ...mergedPullRequestStatus(), state: 'open' },
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			restored,
			resolved,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			restored: [],
			resolved: [session.toString()],
			archived: false,
		});
	});

	test('cleans up an inactive merged session worktree without restoring when record cleanup is disabled', async () => {
		const { lifecycle, session, restored, cleanedWorktrees } = createHarness({
			enabled: false,
			status: mergedPullRequestStatus(),
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			restored,
			cleanedWorktrees,
		}, {
			restored: [],
			cleanedWorktrees: [session.toString()],
		});
	});

	test('keeps the worktree when automatic removal and record cleanup are disabled', async () => {
		const { lifecycle, restored, resolved, cleanedWorktrees, listed } = createHarness({
			enabled: false,
			autoRemoveWorktreesAfterMerge: false,
			status: mergedPullRequestStatus(),
		});

		await lifecycle.run();

		assert.deepStrictEqual({ restored, resolved, cleanedWorktrees, listed }, {
			restored: [],
			resolved: [],
			cleanedWorktrees: [],
			listed: [],
		});
	});

	test('archive configuration overrides the standalone worktree cleanup opt-out', async () => {
		const { lifecycle, session, restored, cleanedWorktrees, listed } = createHarness({
			archiveAfterDays: 7,
			deleteAfterDays: 0,
			autoRemoveWorktreesAfterMerge: false,
			modifiedTime: NOW,
			status: mergedPullRequestStatus(),
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			restored,
			cleanedWorktrees,
			listed,
		}, {
			restored: [],
			cleanedWorktrees: [session.toString()],
			listed: [{
				archiveCutoff: NOW - 7 * DAY_MS,
				deleteCutoff: undefined,
				cleanupWorktrees: true,
			}],
		});
	});

	test('deletion configuration removes a retained worktree before deleting', async () => {
		const { lifecycle, session, restored, cleanedWorktrees, deleted, listed } = createHarness({
			archiveAfterDays: 0,
			deleteAfterDays: 1,
			autoRemoveWorktreesAfterMerge: false,
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			autoArchivedAt: NOW - 2 * DAY_MS,
			worktreePresent: true,
			status: mergedPullRequestStatus(),
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			restored,
			cleanedWorktrees,
			deleted,
			listed,
		}, {
			restored: [session.toString()],
			cleanedWorktrees: [session.toString()],
			deleted: [session.toString()],
			listed: [{
				archiveCutoff: undefined,
				deleteCutoff: NOW - DAY_MS,
				cleanupWorktrees: true,
			}],
		});
	});

	test('commits the archive state before recording the auto-archive timestamp', async () => {
		let archivedWhenTimestampWritten = false;
		const { lifecycle, stateManager, session, autoArchiveTimestamps } = createHarness({
			status: mergedPullRequestStatus(),
			onSetAutoArchivedAt: (timestamp, _configurationService, manager, resource) => {
				archivedWhenTimestampWritten = isSessionStatusArchived(manager.getSessionSummary(resource.toString())?.status);
			},
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			status: stateManager.getSessionSummary(session.toString())?.status,
			archivedWhenTimestampWritten,
			autoArchiveTimestamps,
		}, {
			status: SessionStatus.Idle | SessionStatus.IsArchived,
			archivedWhenTimestampWritten: true,
			autoArchiveTimestamps: [NOW],
		});
	});

	test('permanently deletes an automatically archived merged-pull-request session after the deletion grace period', async () => {
		const { lifecycle, stateManager, session, restored, resolved, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			modifiedTime: NOW - 3 * DAY_MS,
			status: mergedPullRequestStatus(),
			autoArchivedAt: NOW - 2 * DAY_MS,
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			restored,
			resolved,
			deleted,
			summary: stateManager.getSessionSummary(session.toString()),
		}, {
			restored: [session.toString()],
			resolved: [session.toString(), session.toString(), session.toString()],
			deleted: [session.toString()],
			summary: undefined,
		});
	});

	test('keeps archived sessions during the permanent deletion grace period', async () => {
		const { lifecycle, stateManager, session, restored, resolved, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			modifiedTime: NOW - 3 * DAY_MS,
			status: mergedPullRequestStatus(),
			autoArchivedAt: NOW - 0.5 * DAY_MS,
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			restored,
			resolved,
			deleted,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			restored: [],
			resolved: [],
			deleted: [],
			archived: true,
		});
	});

	test('archives an inactive session when permanent deletion is disabled', async () => {
		const { lifecycle, stateManager, session } = createHarness({
			status: mergedPullRequestStatus(),
			deleteAfterDays: 0,
		});

		await lifecycle.run();

		assert.strictEqual(isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status), true);
	});

	test('deletes an automatically archived session when automatic archival is disabled', async () => {
		const { lifecycle, stateManager, session, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			status: mergedPullRequestStatus(),
			autoArchivedAt: NOW - 2 * DAY_MS,
			archiveAfterDays: 0,
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			deleted,
			summary: stateManager.getSessionSummary(session.toString()),
		}, {
			deleted: [session.toString()],
			summary: undefined,
		});
	});

	test('does not delete an automatically archived session when permanent deletion is disabled', async () => {
		const { lifecycle, stateManager, session, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			status: mergedPullRequestStatus(),
			autoArchivedAt: NOW - 30 * DAY_MS,
			deleteAfterDays: 0,
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			deleted,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			deleted: [],
			archived: true,
		});
	});

	test('does not retroactively delete a manually archived session', async () => {
		const { lifecycle, stateManager, session, restored, resolved, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			modifiedTime: NOW - 30 * DAY_MS,
			status: mergedPullRequestStatus(),
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			restored,
			resolved,
			deleted,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			restored: [],
			resolved: [],
			deleted: [],
			archived: true,
		});
	});

	test('does not delete an archived session while its worktree remains', async () => {
		const { lifecycle, stateManager, session, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			modifiedTime: NOW - 3 * DAY_MS,
			status: mergedPullRequestStatus(),
			autoArchivedAt: NOW - 2 * DAY_MS,
			canDeleteSession: false,
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			deleted,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			deleted: [],
			archived: true,
		});
	});

	test('does not delete an archived session when GitHub reports the pull request open', async () => {
		const { lifecycle, stateManager, session, resolved, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			modifiedTime: NOW - 3 * DAY_MS,
			status: { ...mergedPullRequestStatus(), state: 'open' },
			autoArchivedAt: NOW - 2 * DAY_MS,
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			resolved,
			deleted,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			resolved: [session.toString()],
			deleted: [],
			archived: true,
		});
	});

	test('does not delete an archived session that is unarchived during GitHub refresh', async () => {
		const { lifecycle, stateManager, session, cleanedWorktrees, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			modifiedTime: NOW - 3 * DAY_MS,
			status: mergedPullRequestStatus(),
			autoArchivedAt: NOW - 2 * DAY_MS,
			worktreePresent: true,
			onResolve: (_configurationService, manager, resource) => manager.dispatchServerAction(resource.toString(), {
				type: ActionType.SessionIsArchivedChanged,
				isArchived: false,
			}),
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			cleanedWorktrees,
			deleted,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			cleanedWorktrees: [],
			deleted: [],
			archived: false,
		});
	});

	test('does not delete when cleanup is disabled during final validation', async () => {
		let metadataReads = 0;
		const { lifecycle, stateManager, session, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			modifiedTime: NOW - 3 * DAY_MS,
			status: mergedPullRequestStatus(),
			autoArchivedAt: NOW - 2 * DAY_MS,
			onGetAutoArchivedAt: configurationService => {
				if (++metadataReads === 2) {
					configurationService.updateRootConfig({ [AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey]: 0 });
				}
			},
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			deleted,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			deleted: [],
			archived: true,
		});
	});

	test('retains an archived session when permanent deletion fails', async () => {
		const { lifecycle, stateManager, session, deleted } = createHarness({
			sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
			modifiedTime: NOW - 3 * DAY_MS,
			status: mergedPullRequestStatus(),
			autoArchivedAt: NOW - 2 * DAY_MS,
			deleteError: new Error('delete failed'),
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			deleted,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			deleted: [session.toString()],
			archived: true,
		});
	});

	test('revalidates the configured threshold after the GitHub refresh', async () => {
		const { lifecycle, stateManager, session } = createHarness({
			status: mergedPullRequestStatus(),
			onResolve: configurationService => {
				configurationService.updateRootConfig({ [AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey]: 30 });
			},
		});

		await lifecycle.run();

		assert.strictEqual(isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status), false);
	});

	test('does not archive, delete, or clean the worktree while any related pull request is open', async () => {
		const pullRequestUrls = [PULL_REQUEST_URL, SECOND_PULL_REQUEST_URL];
		const resolveStatus = (pullRequestUrl: string) => pullRequestUrl === PULL_REQUEST_URL
			? mergedPullRequestStatus()
			: { ...mergedPullRequestStatus(SECOND_PULL_REQUEST_URL, 2), state: 'open' as const };
		const harnesses = [
			createHarness({ pullRequestUrls, resolveStatus }),
			createHarness({ enabled: false, pullRequestUrls, resolveStatus }),
			createHarness({
				sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
				autoArchivedAt: NOW - 2 * DAY_MS,
				pullRequestUrls,
				resolveStatus,
			}),
		];

		await Promise.all(harnesses.map(harness => harness.lifecycle.run()));

		assert.deepStrictEqual(harnesses.map(harness => ({
			restored: harness.restored,
			resolvedPullRequestUrls: harness.resolvedPullRequestUrls,
			cleanedWorktrees: harness.cleanedWorktrees,
			deleted: harness.deleted,
			archived: isSessionStatusArchived(harness.stateManager.getSessionSummary(harness.session.toString())?.status),
		})), [
			{ restored: [], resolvedPullRequestUrls: pullRequestUrls, cleanedWorktrees: [], deleted: [], archived: false },
			{ restored: [], resolvedPullRequestUrls: pullRequestUrls, cleanedWorktrees: [], deleted: [], archived: false },
			{ restored: [], resolvedPullRequestUrls: pullRequestUrls, cleanedWorktrees: [], deleted: [], archived: true },
		]);
	});

	test('does not archive, delete, or clean the worktree without a related pull request', async () => {
		const harnesses = [
			createHarness({ pullRequestUrls: [] }),
			createHarness({ enabled: false, pullRequestUrls: [] }),
			createHarness({
				sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
				autoArchivedAt: NOW - 2 * DAY_MS,
				pullRequestUrls: [],
			}),
		];

		await Promise.all(harnesses.map(harness => harness.lifecycle.run()));

		assert.deepStrictEqual(harnesses.map(harness => ({
			restored: harness.restored,
			resolved: harness.resolved,
			cleanedWorktrees: harness.cleanedWorktrees,
			deleted: harness.deleted,
			archived: isSessionStatusArchived(harness.stateManager.getSessionSummary(harness.session.toString())?.status),
		})), [
			{ restored: [], resolved: [], cleanedWorktrees: [], deleted: [], archived: false },
			{ restored: [], resolved: [], cleanedWorktrees: [], deleted: [], archived: false },
			{ restored: [], resolved: [], cleanedWorktrees: [], deleted: [], archived: true },
		]);
	});

	test('archives when all related pull requests are merged', async () => {
		const pullRequestUrls = [PULL_REQUEST_URL, SECOND_PULL_REQUEST_URL];
		const { lifecycle, stateManager, session, resolvedPullRequestUrls } = createHarness({
			pullRequestUrls,
			resolveStatus: pullRequestUrl => pullRequestUrl === PULL_REQUEST_URL
				? mergedPullRequestStatus()
				: mergedPullRequestStatus(SECOND_PULL_REQUEST_URL, 2),
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			resolvedPullRequestUrls,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			resolvedPullRequestUrls: [...pullRequestUrls, ...pullRequestUrls],
			archived: true,
		});
	});

	test('archives when one related pull request is merged and the others are closed', async () => {
		const pullRequestUrls = [PULL_REQUEST_URL, SECOND_PULL_REQUEST_URL];
		const { lifecycle, stateManager, session, resolvedPullRequestUrls } = createHarness({
			pullRequestUrls,
			resolveStatus: pullRequestUrl => pullRequestUrl === PULL_REQUEST_URL
				? mergedPullRequestStatus()
				: { ...mergedPullRequestStatus(SECOND_PULL_REQUEST_URL, 2), state: 'closed' },
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			resolvedPullRequestUrls,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			resolvedPullRequestUrls: [...pullRequestUrls, ...pullRequestUrls],
			archived: true,
		});
	});

	test('does not archive, delete, or clean the worktree when a closed related pull request reopens', async () => {
		const pullRequestUrls = [PULL_REQUEST_URL, SECOND_PULL_REQUEST_URL];
		const reopeningStatus = () => {
			let secondPullRequestReads = 0;
			return (pullRequestUrl: string) => {
				if (pullRequestUrl === PULL_REQUEST_URL) {
					return mergedPullRequestStatus();
				}
				return {
					...mergedPullRequestStatus(SECOND_PULL_REQUEST_URL, 2),
					state: ++secondPullRequestReads === 1 ? 'closed' as const : 'open' as const,
				};
			};
		};
		const harnesses = [
			createHarness({ pullRequestUrls, resolveStatus: reopeningStatus() }),
			createHarness({ enabled: false, pullRequestUrls, resolveStatus: reopeningStatus() }),
			createHarness({
				sessionStatus: SessionStatus.Idle | SessionStatus.IsArchived,
				autoArchivedAt: NOW - 2 * DAY_MS,
				worktreePresent: true,
				pullRequestUrls,
				resolveStatus: reopeningStatus(),
			}),
		];

		await Promise.all(harnesses.map(harness => harness.lifecycle.run()));

		assert.deepStrictEqual(harnesses.map(harness => ({
			restored: harness.restored,
			resolvedPullRequestUrls: harness.resolvedPullRequestUrls,
			cleanedWorktrees: harness.cleanedWorktrees,
			deleted: harness.deleted,
			archived: isSessionStatusArchived(harness.stateManager.getSessionSummary(harness.session.toString())?.status),
		})), [
			{ restored: [harnesses[0].session.toString()], resolvedPullRequestUrls: [...pullRequestUrls, ...pullRequestUrls], cleanedWorktrees: [], deleted: [], archived: false },
			{ restored: [], resolvedPullRequestUrls: [...pullRequestUrls, ...pullRequestUrls], cleanedWorktrees: [], deleted: [], archived: false },
			{ restored: [harnesses[2].session.toString()], resolvedPullRequestUrls: [...pullRequestUrls, ...pullRequestUrls], cleanedWorktrees: [], deleted: [], archived: true },
		]);
	});

	test('does not archive when every related pull request is closed without merging', async () => {
		const pullRequestUrls = [PULL_REQUEST_URL, SECOND_PULL_REQUEST_URL];
		const { lifecycle, stateManager, session, resolvedPullRequestUrls } = createHarness({
			pullRequestUrls,
			resolveStatus: pullRequestUrl => ({
				...mergedPullRequestStatus(pullRequestUrl, pullRequestUrl === PULL_REQUEST_URL ? 1 : 2),
				state: 'closed',
			}),
		});

		await lifecycle.run();

		assert.deepStrictEqual({
			resolvedPullRequestUrls,
			archived: isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status),
		}, {
			resolvedPullRequestUrls: pullRequestUrls,
			archived: false,
		});
	});

	test('does not archive when a lifecycle lookup returns a different pull request', async () => {
		const { lifecycle, stateManager, session } = createHarness({
			pullRequestUrls: [PULL_REQUEST_URL, SECOND_PULL_REQUEST_URL],
			status: { ...mergedPullRequestStatus(), number: 2, url: SECOND_PULL_REQUEST_URL },
		});

		await lifecycle.run();

		assert.strictEqual(isSessionStatusArchived(stateManager.getSessionSummary(session.toString())?.status), false);
	});

	test('skips fully disabled, active, and external sessions before restoring', async () => {
		const harnesses = [
			createHarness({ enabled: false, autoRemoveWorktreesAfterMerge: false, status: mergedPullRequestStatus() }),
			createHarness({ sessionStatus: SessionStatus.InProgress, status: mergedPullRequestStatus() }),
			createHarness({ external: true, status: mergedPullRequestStatus() }),
		];

		await Promise.all(harnesses.map(harness => harness.lifecycle.run()));

		assert.deepStrictEqual(harnesses.map(harness => ({
			restored: harness.restored,
			resolved: harness.resolved,
			archived: isSessionStatusArchived(harness.stateManager.getSessionSummary(harness.session.toString())?.status),
		})), [
			{ restored: [], resolved: [], archived: false },
			{ restored: [], resolved: [], archived: false },
			{ restored: [], resolved: [], archived: false },
		]);
	});

	test('ignores unrelated root configuration changes', async () => {
		const { configurationService, listed } = createHarness({ status: mergedPullRequestStatus() });

		configurationService.updateRootConfig({ unrelated: true });
		await timeout(10);

		assert.deepStrictEqual(listed, []);
	});

	test('runs immediately when a lifecycle threshold changes', async () => {
		const { configurationService, listed } = createHarness({ enabled: false, status: mergedPullRequestStatus() });

		configurationService.updateRootConfig({ [AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey]: 7 });
		await timeout(10);

		assert.deepStrictEqual(listed, [{
			archiveCutoff: NOW - 7 * DAY_MS,
			deleteCutoff: undefined,
			cleanupWorktrees: true,
		}]);
	});
});

function mergedPullRequestStatus(url = PULL_REQUEST_URL, number = 1): IAgentHostPullRequestStatus {
	return {
		pullRequestId: 'PR_1',
		number,
		url,
		headSha: 'sha',
		state: 'merged',
		draft: false,
		mergeReady: false,
		viewerCanEnableAutoMerge: false,
		autoMergeEnabled: false,
		allowedMergeMethods: [],
	};
}
