/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey, AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey } from '../../common/agentHostSchema.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { isSessionStatusArchived, SessionStatus, withSessionGitHubState, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostSessionLifecycle, type IAgentHostSessionLifecycleCandidate, type IAgentHostSessionLifecyclePullRequest } from '../../node/agentHostSessionLifecycle.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { NullLogService } from '../../../log/common/log.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 3);
const PULL_REQUEST_URL = 'https://github.com/microsoft/vscode/pull/1';

suite('AgentHostSessionLifecycle', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options?: {
		readonly pullRequest?: IAgentHostSessionLifecyclePullRequest;
		readonly status?: SessionStatus;
		readonly modifiedTime?: number;
		readonly archiveAfterDays?: number;
		readonly deleteAfterDays?: number;
		readonly autoArchivedAt?: number;
		readonly canDelete?: boolean;
		readonly onResolve?: (configurationService: AgentConfigurationService) => void;
	}) {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		configurationService.updateRootConfig({
			[AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey]: options?.archiveAfterDays ?? 1,
			[AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey]: options?.deleteAfterDays ?? 1,
		});
		const session = URI.parse('ahp-copilot://automatic-cleanup');
		const modifiedTime = options?.modifiedTime ?? NOW - 2 * DAY_MS;
		const summary: SessionSummary = {
			resource: session.toString(),
			provider: 'copilot',
			title: 'Automatic cleanup',
			status: options?.status ?? SessionStatus.Idle,
			createdAt: new Date(modifiedTime - DAY_MS).toISOString(),
			modifiedAt: new Date(modifiedTime).toISOString(),
			_meta: withSessionGitHubState(undefined, { pullRequestUrls: [PULL_REQUEST_URL] }),
		};
		stateManager.createSession(summary);
		const archived: string[] = [];
		const deleted: string[] = [];
		const cleaned: string[] = [];
		const timestamps: number[] = [];
		let autoArchivedAt = options?.autoArchivedAt;
		let resolveCount = 0;
		const lifecycle = disposables.add(new AgentHostSessionLifecycle(
			{
				listCandidates: async (archiveCutoff, deleteCutoff) => {
					const current = stateManager.getSessionSummary(session.toString());
					if (!current || (current.status !== undefined && (current.status & SessionStatus.InProgress) !== 0)) {
						return [];
					}
					const isArchived = isSessionStatusArchived(current.status);
					const action = isArchived
						? deleteCutoff !== undefined && autoArchivedAt !== undefined && autoArchivedAt <= deleteCutoff ? 'delete' : undefined
						: archiveCutoff !== undefined && modifiedTime <= archiveCutoff ? 'archive' : undefined;
					return action ? [{ session, pullRequestUrls: [PULL_REQUEST_URL], action } satisfies IAgentHostSessionLifecycleCandidate] : [];
				},
				restoreSession: async () => { },
				getAutoArchivedAt: async () => autoArchivedAt,
				setAutoArchivedAt: async (_session, timestamp) => {
					autoArchivedAt = timestamp;
					timestamps.push(timestamp);
				},
				archiveSession: resource => {
					archived.push(resource.toString());
					stateManager.dispatchServerAction(resource.toString(), {
						type: ActionType.SessionIsArchivedChanged,
						isArchived: true,
					});
				},
				canDeleteSession: async () => options?.canDelete !== false,
				cleanupWorktree: async resource => {
					cleaned.push(resource.toString());
				},
				deleteSession: async (resource, validate, canCommit) => {
					if (!await validate() || !canCommit()) {
						return false;
					}
					deleted.push(resource.toString());
					stateManager.deleteSession(resource.toString());
					return true;
				},
			},
			configurationService,
			stateManager,
			{
				resolveForLifecycle: async () => {
					resolveCount++;
					options?.onResolve?.(configurationService);
					return options?.pullRequest;
				},
			},
			logService,
			{ now: () => NOW, start: false },
		));
		return { lifecycle, stateManager, session, archived, deleted, cleaned, timestamps, get resolveCount() { return resolveCount; } };
	}

	test('marks an inactive session done only after an authoritative merged result', async () => {
		const merged = createHarness({ pullRequest: { url: PULL_REQUEST_URL, state: 'merged' } });
		const open = createHarness({ pullRequest: { url: PULL_REQUEST_URL, state: 'open' } });

		await merged.lifecycle.run();
		await open.lifecycle.run();

		assert.deepStrictEqual({
			merged: {
				archived: merged.archived,
				timestamps: merged.timestamps,
				isArchived: isSessionStatusArchived(merged.stateManager.getSessionSummary(merged.session.toString())?.status),
			},
			open: { archived: open.archived, timestamps: open.timestamps },
		}, {
			merged: {
				archived: [merged.session.toString()],
				timestamps: [NOW],
				isArchived: true,
			},
			open: { archived: [], timestamps: [] },
		});
	});

	test('permanently deletes only sessions previously marked done automatically', async () => {
		const automatic = createHarness({
			pullRequest: { url: PULL_REQUEST_URL, state: 'merged' },
			status: SessionStatus.Idle | SessionStatus.IsArchived,
			autoArchivedAt: NOW - 2 * DAY_MS,
			archiveAfterDays: 0,
		});
		const manual = createHarness({
			pullRequest: { url: PULL_REQUEST_URL, state: 'merged' },
			status: SessionStatus.Idle | SessionStatus.IsArchived,
			archiveAfterDays: 0,
		});

		await automatic.lifecycle.run();
		await manual.lifecycle.run();

		assert.deepStrictEqual({
			automatic: automatic.deleted,
			manual: manual.deleted,
		}, {
			automatic: [automatic.session.toString()],
			manual: [],
		});
	});

	test('revalidates the configured threshold before marking a session done', async () => {
		let changed = false;
		const harness = createHarness({
			pullRequest: { url: PULL_REQUEST_URL, state: 'merged' },
			onResolve: configurationService => {
				if (!changed) {
					changed = true;
					configurationService.updateRootConfig({
						[AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey]: 3,
						[AgentHostAutoDeleteArchivedMergedSessionsAfterDaysConfigKey]: 1,
					});
				}
			},
		});

		await harness.lifecycle.run();

		assert.deepStrictEqual({
			archived: harness.archived,
			resolveCount: harness.resolveCount,
		}, {
			archived: [],
			resolveCount: 1,
		});
	});

	test('retains an archived session when its worktree cannot be removed safely', async () => {
		const harness = createHarness({
			pullRequest: { url: PULL_REQUEST_URL, state: 'merged' },
			status: SessionStatus.Idle | SessionStatus.IsArchived,
			autoArchivedAt: NOW - 2 * DAY_MS,
			archiveAfterDays: 0,
			canDelete: false,
		});

		await harness.lifecycle.run();

		assert.deepStrictEqual({
			cleaned: harness.cleaned,
			deleted: harness.deleted,
		}, {
			cleaned: [harness.session.toString()],
			deleted: [],
		});
	});
});
