/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { META_CHANGES_SUMMARY } from '../../common/agentHostChangesetService.js';
import { IAgentHostChangesetOperationService } from '../../common/agentHostChangesetOperationService.js';
import { IAgentHostChangesetSubscriptionService } from '../../common/agentHostChangesetSubscriptionService.js';
import { NULL_CHECKPOINT_SERVICE } from '../../common/agentHostCheckpointService.js';
import { NULL_REVIEW_SERVICE } from '../../common/agentHostReviewService.js';
import { buildBranchChangesetUri, buildTurnChangesetUri } from '../../common/changesetUri.js';
import { type ChangesSummary } from '../../common/state/protocol/state.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ChangesetStatus, SessionStatus, type ISessionFileDiff } from '../../common/state/sessionState.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostChangesetService } from '../../node/agentHostChangesetService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

const SEEDED_SUMMARY: ChangesSummary = { additions: 11, deletions: 4, files: 2 };
const DEFAULT_WORKING_DIRECTORIES = ['file:///primary', 'file:///secondary'];

class CapturingLogService extends NullLogService {
	readonly debugMessages: string[] = [];

	override debug(message: string, ..._args: unknown[]): void {
		this.debugMessages.push(message);
	}
}

function fileDiff(uri: string, added: number, removed: number): ISessionFileDiff {
	return { after: { uri, content: { uri: `content:${uri}` } }, diff: { added, removed } };
}

function createOperationService(): IAgentHostChangesetOperationService {
	return {
		_serviceBrand: undefined,
		registerContribution: () => toDisposable(() => { }),
		updateOperations: () => { },
		getOperations: () => undefined,
		invokeChangesetOperation: async () => { throw new Error('not implemented'); },
		dispose: () => { },
	};
}

function createSubscriptionService(): IAgentHostChangesetSubscriptionService {
	const subscriptions = new Set<string>();
	return {
		_serviceBrand: undefined,
		getSessionSubscriptions: () => subscriptions,
		addSubscription: (_session, changeset) => { subscriptions.add(changeset); },
		removeSubscription: (_session, changeset) => { subscriptions.delete(changeset); },
		clearSessionSubscriptions: () => { subscriptions.clear(); },
	};
}

interface ISummaryRigOptions {
	readonly workingDirectories?: readonly string[];
	readonly computeGitDiff?: (workingDirectory: URI) => Promise<readonly ISessionFileDiff[] | undefined>;
	readonly failFallback?: boolean;
}

interface ISummaryRig {
	readonly stateManager: AgentHostStateManager;
	readonly service: AgentHostChangesetService;
	readonly database: TestSessionDatabase;
	readonly logService: CapturingLogService;
	readonly session: string;
	readonly branchUri: string;
	readonly cachedBranchDiff: ISessionFileDiff;
}

interface IChangesetObservation {
	readonly completed: Promise<void>;
	readonly statuses: ChangesetStatus[];
	readonly contentFileIds: string[][];
}

suite('AgentHostChangesetService summary outcomes', () => {
	let disposables: DisposableStore;
	let sessionCounter = 0;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createSummaryRig(options: ISummaryRigOptions = {}): Promise<ISummaryRig> {
		const database = new TestSessionDatabase();
		if (options.failFallback) {
			database.getAllFileEdits = async () => { throw new Error('fallback failed'); };
			database.getFileEditsByTurn = async () => { throw new Error('turn fallback failed'); };
		}

		const logService = new CapturingLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const gitService = createNoopGitService();
		const computeGitDiff = options.computeGitDiff ?? (async () => undefined);
		gitService.getRepositoryRoot = async workingDirectory => workingDirectory;
		gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'origin/main' });
		gitService.computeSessionFileDiffs = workingDirectory => computeGitDiff(workingDirectory);

		const service = disposables.add(new AgentHostChangesetService(
			stateManager,
			logService,
			createSessionDataService(database),
			gitService,
			NULL_CHECKPOINT_SERVICE,
			disposables.add(new AgentConfigurationService(stateManager, logService)),
			createOperationService(),
			createSubscriptionService(),
			NULL_REVIEW_SERVICE,
		));

		const session = AgentSession.uri('copilotcli', `summary-outcome-${++sessionCounter}`).toString();
		const workingDirectories = [...(options.workingDirectories ?? DEFAULT_WORKING_DIRECTORIES)];
		stateManager.createSession({
			resource: session,
			provider: 'copilotcli',
			title: 'Summary outcome test',
			status: SessionStatus.Idle,
			createdAt: '2026-01-01T00:00:00.000Z',
			modifiedAt: '2026-01-01T00:00:00.000Z',
			workingDirectories,
			changes: SEEDED_SUMMARY,
		});
		stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });

		service.registerStaticChangesets(session);
		const cachedBranchDiff = fileDiff('file:///primary/cached.ts', 7, 3);
		service.restoreStaticChangeset(session, 'branch', [cachedBranchDiff]);
		await database.setMetadata(META_CHANGES_SUMMARY, JSON.stringify(SEEDED_SUMMARY));
		database.setMetadataCalls.length = 0;

		return {
			stateManager,
			service,
			database,
			logService,
			session,
			branchUri: buildBranchChangesetUri(session),
			cachedBranchDiff,
		};
	}

	function observeStatusCycle(stateManager: AgentHostStateManager, changesetUri: string): IChangesetObservation {
		const completed = new DeferredPromise<void>();
		const statuses: ChangesetStatus[] = [];
		const contentFileIds: string[][] = [];
		disposables.add(stateManager.onDidEmitEnvelope(envelope => {
			if (envelope.channel !== changesetUri) {
				return;
			}
			if (envelope.action.type === ActionType.ChangesetContentChanged) {
				contentFileIds.push(envelope.action.files.map(file => file.id));
			} else if (envelope.action.type === ActionType.ChangesetStatusChanged) {
				statuses.push(envelope.action.status);
				if (statuses.includes(ChangesetStatus.Computing) && envelope.action.status !== ChangesetStatus.Computing) {
					completed.complete();
				}
			}
		}));
		return { completed: completed.p, statuses, contentFileIds };
	}

	async function refreshBranch(rig: ISummaryRig): Promise<IChangesetObservation> {
		const observation = observeStatusCycle(rig.stateManager, rig.branchUri);
		rig.service.refreshBranchChangeset(rig.session);
		await observation.completed;
		assert.deepStrictEqual(observation.statuses, [ChangesetStatus.Computing, ChangesetStatus.Ready]);
		return observation;
	}

	function summaryMetadataWrites(database: TestSessionDatabase): Array<{ key: string; value: string }> {
		return database.setMetadataCalls.filter(call => call.key === META_CHANGES_SUMMARY);
	}

	test('total multi-root failure preserves the in-memory summary', async () => {
		const rig = await createSummaryRig({ failFallback: true });

		await refreshBranch(rig);

		assert.deepStrictEqual(rig.stateManager.getSessionSummary(rig.session)?.changes, SEEDED_SUMMARY);
		assert.ok(rig.logService.debugMessages.some(message => message.includes('preserving cached summary data')));
	});

	test('total multi-root failure preserves persisted summary metadata', async () => {
		const rig = await createSummaryRig({ failFallback: true });

		await refreshBranch(rig);

		assert.deepStrictEqual({
			persisted: await rig.database.getMetadata(META_CHANGES_SUMMARY),
			summaryWrites: summaryMetadataWrites(rig.database),
		}, {
			persisted: JSON.stringify(SEEDED_SUMMARY),
			summaryWrites: [],
		});
	});

	test('successful empty multi-root computation replaces the seeded summary with zero', async () => {
		const zeroSummary: ChangesSummary = { additions: 0, deletions: 0, files: 0 };
		const rig = await createSummaryRig({ computeGitDiff: async () => [] });

		await refreshBranch(rig);

		assert.deepStrictEqual({
			inMemory: rig.stateManager.getSessionSummary(rig.session)?.changes,
			persisted: await rig.database.getMetadata(META_CHANGES_SUMMARY),
			branchFiles: rig.stateManager.getChangesetState(rig.branchUri)?.files.map(file => file.id),
			summaryWrites: summaryMetadataWrites(rig.database),
		}, {
			inMemory: zeroSummary,
			persisted: JSON.stringify(zeroSummary),
			branchFiles: [],
			summaryWrites: [{ key: META_CHANGES_SUMMARY, value: JSON.stringify(zeroSummary) }],
		});
	});

	test('partial multi-root success replaces the seeded summary with the partial aggregate', async () => {
		const primaryDiff = fileDiff('file:///primary/changed.ts', 3, 1);
		const partialSummary: ChangesSummary = { additions: 3, deletions: 1, files: 1 };
		const rig = await createSummaryRig({
			failFallback: true,
			computeGitDiff: async workingDirectory => workingDirectory.path === '/primary' ? [primaryDiff] : undefined,
		});

		await refreshBranch(rig);

		assert.deepStrictEqual({
			inMemory: rig.stateManager.getSessionSummary(rig.session)?.changes,
			persisted: await rig.database.getMetadata(META_CHANGES_SUMMARY),
			summaryWrites: summaryMetadataWrites(rig.database),
		}, {
			inMemory: partialSummary,
			persisted: JSON.stringify(partialSummary),
			summaryWrites: [{ key: META_CHANGES_SUMMARY, value: JSON.stringify(partialSummary) }],
		});
	});

	test('primary git failure preserves the primary Branch file cache', async () => {
		const secondaryDiff = fileDiff('file:///secondary/changed.ts', 4, 2);
		const rig = await createSummaryRig({
			failFallback: true,
			computeGitDiff: async workingDirectory => workingDirectory.path === '/secondary' ? [secondaryDiff] : undefined,
		});

		await refreshBranch(rig);

		assert.deepStrictEqual({
			status: rig.stateManager.getChangesetState(rig.branchUri)?.status,
			branchFiles: rig.stateManager.getChangesetState(rig.branchUri)?.files.map(file => file.id),
			summary: rig.stateManager.getSessionSummary(rig.session)?.changes,
		}, {
			status: ChangesetStatus.Ready,
			branchFiles: [rig.cachedBranchDiff.after?.uri],
			summary: { additions: 4, deletions: 2, files: 1 },
		});
	});

	test('single-folder branch failure retains its existing cached state and summary', async () => {
		const rig = await createSummaryRig({
			workingDirectories: [DEFAULT_WORKING_DIRECTORIES[0]],
			computeGitDiff: async () => undefined,
		});

		await refreshBranch(rig);

		assert.deepStrictEqual({
			status: rig.stateManager.getChangesetState(rig.branchUri)?.status,
			branchFiles: rig.stateManager.getChangesetState(rig.branchUri)?.files.map(file => file.id),
			summary: rig.stateManager.getSessionSummary(rig.session)?.changes,
			summaryWrites: summaryMetadataWrites(rig.database),
		}, {
			status: ChangesetStatus.Ready,
			branchFiles: [rig.cachedBranchDiff.after?.uri],
			summary: SEEDED_SUMMARY,
			summaryWrites: [],
		});
	});

	test('total multi-root Turn failure publishes an empty Ready changeset', async () => {
		const rig = await createSummaryRig({ failFallback: true });
		const turnUri = buildTurnChangesetUri(rig.session, 'turn-1');
		const cachedTurnDiff = fileDiff('file:///primary/old-turn.ts', 2, 1);
		rig.stateManager.registerChangeset(turnUri);
		rig.stateManager.dispatchServerAction(turnUri, {
			type: ActionType.ChangesetContentChanged,
			files: [{ id: cachedTurnDiff.after!.uri, edit: cachedTurnDiff }],
		});
		rig.stateManager.dispatchServerAction(turnUri, {
			type: ActionType.ChangesetStatusChanged,
			status: ChangesetStatus.Ready,
		});

		const observation = observeStatusCycle(rig.stateManager, turnUri);
		rig.stateManager.dispatchServerAction(turnUri, {
			type: ActionType.ChangesetStatusChanged,
			status: ChangesetStatus.Computing,
		});
		const returnedUri = await rig.service.computeTurnChangeset(rig.session, 'turn-1');
		await observation.completed;

		assert.deepStrictEqual({
			returnedUri,
			statuses: observation.statuses,
			contentFileIds: observation.contentFileIds,
			status: rig.stateManager.getChangesetState(turnUri)?.status,
			files: rig.stateManager.getChangesetState(turnUri)?.files,
		}, {
			returnedUri: turnUri,
			statuses: [ChangesetStatus.Computing, ChangesetStatus.Ready],
			contentFileIds: [[]],
			status: ChangesetStatus.Ready,
			files: [],
		});
	});
});
