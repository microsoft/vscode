/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildCheckpointRefName } from '../../common/agentHostCheckpointService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { AgentSession } from '../../common/agentService.js';
import { ISessionDataService, IWillDeleteSessionDataEvent } from '../../common/sessionDataService.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostCheckpointService } from '../../node/agentHostCheckpointService.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

class CheckpointTestDatabase extends TestSessionDatabase {
	private readonly checkpointRefs = new Map<string, string>();

	constructor(private readonly previousCheckpointRef: string | undefined) {
		super();
	}

	override async setTurnCheckpointRef(turnId: string, ref: string): Promise<void> {
		this.checkpointRefs.set(turnId, ref);
	}

	override async getTurnCheckpointRef(turnId: string): Promise<string | undefined> {
		return this.checkpointRefs.get(turnId);
	}

	override async getPreviousCheckpointRef(): Promise<string | undefined> {
		return this.previousCheckpointRef;
	}

	override async getAllCheckpointRefs(): Promise<string[]> {
		return [this.previousCheckpointRef, ...this.checkpointRefs.values()].filter((ref): ref is string => ref !== undefined);
	}
}

class CheckpointTestConfigurationService extends mock<IAgentConfigurationService>() {
	constructor(private readonly workingDirectory: URI) {
		super();
	}

	override getEffectiveWorkingDirectories(): string[] {
		return [this.workingDirectory.toString()];
	}
}

suite('AgentHostCheckpointService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestService(captureWorkingTreeAsTree: () => Promise<string | undefined>, options?: {
		baseline?: boolean;
		previous?: boolean;
		failCommitTree?: (tree: string) => boolean;
		failOpenDatabaseAt?: number;
	}) {
		const session = AgentSession.uri('copilot', 'session');
		const chat = URI.parse('ahp-chat://default/session');
		const workingDirectory = URI.file('/workspace');
		const repositoryRoot = URI.file('/workspace');
		const sanitizedSessionId = AgentSession.id(session);
		const baselineRef = buildCheckpointRefName(sanitizedSessionId, 0);
		const previousRef = buildCheckpointRefName(sanitizedSessionId, 4);
		const hasBaseline = options?.baseline !== false;
		const hasPrevious = options?.previous !== false;
		const database = new CheckpointTestDatabase(hasPrevious ? previousRef : undefined);
		const refs = new Map<string, string>();
		if (hasBaseline) {
			refs.set(baselineRef, 'baseline-commit');
		}
		if (hasPrevious) {
			refs.set(previousRef, 'previous-turn-commit');
		}
		const parents = new Map<string, string>();
		const commitCalls: Array<{ tree: string; parent: string | undefined }> = [];

		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => repositoryRoot,
			captureWorkingTreeAsTree,
			commitTree: async (_root, tree, parent) => {
				commitCalls.push({ tree, parent });
				if (options?.failCommitTree?.(tree)) {
					return undefined;
				}
				const commit = `commit-${commitCalls.length}`;
				if (parent) {
					parents.set(commit, parent);
				}
				return commit;
			},
			updateRef: async (_root, ref, oid) => { refs.set(ref, oid); },
			revParse: async (_root, expression) => {
				if (expression.endsWith('^')) {
					const commit = refs.get(expression.slice(0, -1));
					return commit ? parents.get(commit) : undefined;
				}
				return refs.get(expression);
			},
		};
		const dataService = createSessionDataService(database);
		let openDatabaseCount = 0;
		const service = store.add(new AgentHostCheckpointService(
			{
				...dataService,
				openDatabase: session => {
					openDatabaseCount++;
					if (openDatabaseCount === options?.failOpenDatabaseAt) {
						throw new Error('open failed');
					}
					return dataService.openDatabase(session);
				},
			},
			new CheckpointTestConfigurationService(workingDirectory),
			gitService,
			new NullLogService(),
		));
		return { chat, commitCalls, database, previousRef, session, service, workingDirectory };
	}

	test('turn diff parent is the working tree captured at turn start', async () => {
		const trees = ['tree-before-turn', 'tree-after-turn'];
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());
		const currentRef = buildCheckpointRefName(AgentSession.id(session), 5);

		await service.captureTurnStartCheckpoint(session, chat, 'turn-5', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-5', [workingDirectory]);

		assert.deepStrictEqual({
			commitCalls,
			pair: await service.getTurnCheckpointPair(session, 'turn-5', workingDirectory),
		}, {
			commitCalls: [
				{ tree: 'tree-before-turn', parent: 'previous-turn-commit' },
				{ tree: 'tree-after-turn', parent: 'commit-1' },
			],
			pair: { parent: 'commit-1', current: currentRef },
		});
	});

	test('captures a missing baseline from the pre-turn tree before the agent can edit', async () => {
		const trees = ['tree-before-first-turn', 'tree-after-first-turn'];
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift(), { baseline: false, previous: false });

		await service.captureTurnStartCheckpoint(session, chat, 'turn-1', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-1', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, [
			{ tree: 'tree-before-first-turn', parent: undefined },
			{ tree: 'tree-before-first-turn', parent: 'commit-1' },
			{ tree: 'tree-after-first-turn', parent: 'commit-2' },
		]);
	});

	test('discard waits for an in-flight turn-start capture', async () => {
		const captureStarted = new DeferredPromise<void>();
		const releaseCapture = new DeferredPromise<void>();
		const trees = ['discarded-start-tree', 'tree-after-discard'];
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => {
			if (!captureStarted.isSettled) {
				captureStarted.complete();
				await releaseCapture.p;
			}
			return trees.shift();
		});

		const capture = service.captureTurnStartCheckpoint(session, chat, 'turn-5', [workingDirectory]);
		await captureStarted.p;
		const discard = service.discardTurnStartCheckpoint(session, chat, 'turn-5');
		releaseCapture.complete();
		await Promise.all([capture, discard]);
		await service.captureTurnCheckpoint(session, chat, 'turn-5', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, []);
	});

	test('missing working directories discard the pending turn start', async () => {
		const trees = ['stale-start', 'next-start', 'next-end'];
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());

		await service.captureTurnStartCheckpoint(session, chat, 'turn-5', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-5', undefined);
		await service.captureTurnStartCheckpoint(session, chat, 'turn-6', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-6', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, [
			{ tree: 'next-start', parent: 'previous-turn-commit' },
			{ tree: 'next-end', parent: 'commit-1' },
		]);
	});

	test('database open failure discards the pending turn start', async () => {
		const trees = ['stale-start', 'next-start', 'next-end'];
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift(), { failOpenDatabaseAt: 2 });

		await service.captureTurnStartCheckpoint(session, chat, 'turn-5', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-5', [workingDirectory]);
		await service.captureTurnStartCheckpoint(session, chat, 'turn-6', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-6', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, [
			{ tree: 'next-start', parent: 'previous-turn-commit' },
			{ tree: 'next-end', parent: 'commit-1' },
		]);
	});

	test('turn-start database open failure is best-effort', async () => {
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => 'tree-before-turn', { failOpenDatabaseAt: 1 });

		await service.captureTurnStartCheckpoint(session, chat, 'turn-5', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-5', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, []);
	});

	test('start commit failure skips the repository end checkpoint', async () => {
		const trees = ['tree-before-turn', 'tree-after-turn'];
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift(), {
			failCommitTree: tree => tree === 'tree-before-turn',
		});

		await service.captureTurnStartCheckpoint(session, chat, 'turn-5', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-5', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, [
			{ tree: 'tree-before-turn', parent: 'previous-turn-commit' },
		]);
	});

	test('session deletion waits for capture before clearing turn starts', async () => {
		const captureStarted = new DeferredPromise<void>();
		const releaseCapture = new DeferredPromise<void>();
		const trees = ['turn-start-tree', 'turn-end-tree'];
		const session = AgentSession.uri('copilot', 'session');
		const chat = URI.parse('ahp-chat://default/session');
		const workingDirectory = URI.file('/workspace');
		const repositoryRoot = URI.file('/workspace');
		const baselineRef = buildCheckpointRefName(AgentSession.id(session), 0);
		const database = new CheckpointTestDatabase(undefined);
		const refs = new Map<string, string>();
		const commitCalls: Array<{ tree: string; parent: string | undefined }> = [];
		const onWillDeleteSessionData = new Emitter<IWillDeleteSessionDataEvent>();
		store.add(onWillDeleteSessionData);
		const dataService: ISessionDataService = {
			...createSessionDataService(database),
			onWillDeleteSessionData: onWillDeleteSessionData.event,
		};
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => repositoryRoot,
			captureWorkingTreeAsTree: async () => {
				if (!captureStarted.isSettled) {
					captureStarted.complete();
					await releaseCapture.p;
				}
				return trees.shift();
			},
			commitTree: async (_root, tree, parent) => {
				const commit = `commit-${commitCalls.length + 1}`;
				commitCalls.push({ tree, parent });
				return commit;
			},
			updateRef: async (_root, ref, oid) => { refs.set(ref, oid); },
			deleteRefs: async (_root, deletedRefs) => { deletedRefs.forEach(ref => refs.delete(ref)); },
			revParse: async (_root, ref) => refs.get(ref),
		};
		const service = store.add(new AgentHostCheckpointService(
			dataService,
			new CheckpointTestConfigurationService(workingDirectory),
			gitService,
			new NullLogService(),
		));

		const capture = service.captureTurnStartCheckpoint(session, chat, 'turn-1', [workingDirectory]);
		await captureStarted.p;
		const cleanup: Promise<unknown>[] = [];
		onWillDeleteSessionData.fire({
			session,
			workingDirectories: [workingDirectory.toString()],
			waitUntil: promise => cleanup.push(promise),
		});
		releaseCapture.complete();
		await Promise.all([capture, ...cleanup]);
		await service.captureTurnCheckpoint(session, chat, 'turn-1', [workingDirectory]);

		assert.deepStrictEqual({
			commitCalls,
			baselineExists: refs.has(baselineRef),
		}, {
			commitCalls: [{ tree: 'turn-start-tree', parent: undefined }],
			baselineExists: false,
		});
	});

	test('preserves a reused legacy checkpoint ref as an empty turn', async () => {
		const { database, previousRef, session, service, workingDirectory } = createTestService(async () => undefined);
		await database.setTurnCheckpointRef('turn-5', previousRef);

		assert.deepStrictEqual(await service.getTurnCheckpointPair(session, 'turn-5', workingDirectory), {
			parent: previousRef,
			current: previousRef,
		});
	});

	test('disables Git checkpoints for concurrent chat turns with the same id', async () => {
		const trees = ['tree-a-start', 'tree-b-start', 'tree-b-end', 'tree-a-end'];
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());
		const peerChat = URI.parse('ahp-chat://peer/session');

		await service.captureTurnStartCheckpoint(session, chat, 'turn-1', [workingDirectory]);
		await service.captureTurnStartCheckpoint(session, peerChat, 'turn-1', [workingDirectory]);
		await service.captureTurnCheckpoint(session, peerChat, 'turn-1', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-1', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, []);
	});

	test('failed peer start capture still invalidates an existing turn', async () => {
		const trees = ['tree-a-start', undefined, 'tree-a-end'];
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());
		const peerChat = URI.parse('ahp-chat://peer/session');

		await service.captureTurnStartCheckpoint(session, chat, 'turn-a', [workingDirectory]);
		await service.captureTurnStartCheckpoint(session, peerChat, 'turn-b', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-a', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, []);
	});
});
