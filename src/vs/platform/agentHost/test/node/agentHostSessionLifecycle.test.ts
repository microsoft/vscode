/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { mock } from '../../../../base/test/common/mock.js';
import type { IAgentSessionMetadata } from '../../common/agent.js';
import { AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey } from '../../common/agentHostSchema.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { isSessionStatusArchived, SessionStatus, withSessionExternal, withSessionGitHubState, withSessionGitState, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import type { IAgentHostProviderService } from '../../node/agentHostProviderService.js';
import type { IAgentHostPullRequestStatus, IAgentHostPullRequestStatusService } from '../../node/agentHostPullRequestStatusService.js';
import { AgentHostSessionLifecycle } from '../../node/agentHostSessionLifecycle.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { NullLogService } from '../../../log/common/log.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 3);
const PULL_REQUEST_URL = 'https://github.com/microsoft/vscode/pull/1';

suite('AgentHostSessionLifecycle', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(options?: {
		readonly status?: IAgentHostPullRequestStatus;
		readonly sessionStatus?: SessionStatus;
		readonly modifiedTime?: number;
		readonly external?: boolean;
		readonly enabled?: boolean;
		readonly onResolve?: (configurationService: AgentConfigurationService) => void;
	}) {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		if (options?.enabled !== false) {
			configurationService.updateRootConfig({ [AgentHostAutoArchiveMergedSessionsAfterDaysConfigKey]: 1 });
		}

		const session = URI.parse('ahp-copilot://auto-archive');
		const modifiedTime = options?.modifiedTime ?? NOW - 2 * DAY_MS;
		const status = options?.sessionStatus ?? SessionStatus.Idle;
		const meta = withSessionExternal(withSessionGitHubState(
			withSessionGitState(undefined, { branchName: 'feature' }),
			{ pullRequestUrls: [PULL_REQUEST_URL], pullRequestBranchName: 'feature' },
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
		const metadata: IAgentSessionMetadata = {
			session,
			startTime: Date.parse(summary.createdAt),
			modifiedTime,
			status,
			_meta: meta,
		};

		const restored: string[] = [];
		const resolved: string[] = [];
		const pullRequestStatusService = new class extends mock<IAgentHostPullRequestStatusService>() {
			override readonly onDidChangePullRequestStatus = Event.None;
			override getPullRequestStatus() { return options?.status; }
			override markPullRequestMerged() { }
			override async refresh() { }
			override async resolveForLifecycle(sessionKey: string) {
				resolved.push(sessionKey);
				options?.onResolve?.(configurationService);
				return options?.status;
			}
			override dispose() { }
		}();
		const providerService = new class extends mock<IAgentHostProviderService>() {
			override readonly onDidRegisterProvider = Event.None;
		}();
		const lifecycle = disposables.add(new AgentHostSessionLifecycle(
			{
				listSessions: async () => [metadata],
				restoreSession: async resource => { restored.push(resource.toString()); },
			},
			configurationService,
			stateManager,
			pullRequestStatusService,
			providerService,
			logService,
			{ now: () => NOW, start: false },
		));
		return { lifecycle, stateManager, session, restored, resolved };
	}

	test('archives an inactive internal session after an authoritative merged result', async () => {
		const { lifecycle, stateManager, session, restored, resolved } = createHarness({
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
		}, {
			restored: [session.toString()],
			resolved: [session.toString()],
			archived: true,
			actions: [`${session.toString()}:true`],
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
			restored: [session.toString()],
			resolved: [session.toString()],
			archived: false,
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

	test('skips disabled, active, recent, and external sessions before restoring', async () => {
		const harnesses = [
			createHarness({ enabled: false, status: mergedPullRequestStatus() }),
			createHarness({ sessionStatus: SessionStatus.InProgress, status: mergedPullRequestStatus() }),
			createHarness({ modifiedTime: NOW, status: mergedPullRequestStatus() }),
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
			{ restored: [], resolved: [], archived: false },
		]);
	});
});

function mergedPullRequestStatus(): IAgentHostPullRequestStatus {
	return {
		pullRequestId: 'PR_1',
		number: 1,
		url: PULL_REQUEST_URL,
		headSha: 'sha',
		state: 'merged',
		draft: false,
		mergeReady: false,
		viewerCanEnableAutoMerge: false,
		autoMergeEnabled: false,
		allowedMergeMethods: [],
	};
}
