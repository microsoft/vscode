/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildCheckpointRefName } from '../../common/agentHostCheckpointService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { AgentSession } from '../../common/agentService.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostCheckpointService } from '../../node/agentHostCheckpointService.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

class CheckpointTestDatabase extends TestSessionDatabase {
	private readonly checkpointRefs = new Map<string, string>();

	constructor(private readonly previousCheckpointRef: string) {
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
		return [this.previousCheckpointRef, ...this.checkpointRefs.values()];
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

	function createTestService(captureWorkingTreeAsTree: () => Promise<string | undefined>) {
		const session = AgentSession.uri('copilot', 'session');
		const workingDirectory = URI.file('/workspace');
		const repositoryRoot = URI.file('/workspace');
		const sanitizedSessionId = AgentSession.id(session);
		const baselineRef = buildCheckpointRefName(sanitizedSessionId, 0);
		const previousRef = buildCheckpointRefName(sanitizedSessionId, 4);
		const database = new CheckpointTestDatabase(previousRef);
		const refs = new Map<string, string>([
			[baselineRef, 'baseline-commit'],
			[previousRef, 'previous-turn-commit'],
		]);
		const parents = new Map<string, string>();
		const commitCalls: Array<{ tree: string; parent: string | undefined }> = [];

		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => repositoryRoot,
			captureWorkingTreeAsTree,
			commitTree: async (_root, tree, parent) => {
				const commit = `commit-${commitCalls.length + 1}`;
				commitCalls.push({ tree, parent });
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
		const service = store.add(new AgentHostCheckpointService(
			createSessionDataService(database),
			new CheckpointTestConfigurationService(workingDirectory),
			gitService,
			new NullLogService(),
		));
		return { commitCalls, database, previousRef, session, service, workingDirectory };
	}

	test('turn diff parent is the working tree captured at turn start', async () => {
		const trees = ['tree-before-turn', 'tree-after-turn'];
		const { commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());
		const currentRef = buildCheckpointRefName(AgentSession.id(session), 5);

		await service.captureTurnStartCheckpoint(session, 'turn-5', [workingDirectory]);
		await service.captureTurnCheckpoint(session, 'turn-5', [workingDirectory]);

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

	test('discard waits for an in-flight turn-start capture', async () => {
		const captureStarted = new DeferredPromise<void>();
		const releaseCapture = new DeferredPromise<void>();
		const trees = ['discarded-start-tree', 'tree-after-discard'];
		const { commitCalls, session, service, workingDirectory } = createTestService(async () => {
			if (!captureStarted.isSettled) {
				captureStarted.complete();
				await releaseCapture.p;
			}
			return trees.shift();
		});

		const capture = service.captureTurnStartCheckpoint(session, 'turn-5', [workingDirectory]);
		await captureStarted.p;
		const discard = service.discardTurnStartCheckpoint(session, 'turn-5');
		releaseCapture.complete();
		await Promise.all([capture, discard]);
		await service.captureTurnCheckpoint(session, 'turn-5', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, [
			{ tree: 'tree-after-discard', parent: 'previous-turn-commit' },
		]);
	});

	test('preserves a reused legacy checkpoint ref as an empty turn', async () => {
		const { database, previousRef, session, service, workingDirectory } = createTestService(async () => undefined);
		await database.setTurnCheckpointRef('turn-5', previousRef);

		assert.deepStrictEqual(await service.getTurnCheckpointPair(session, 'turn-5', workingDirectory), {
			parent: previousRef,
			current: previousRef,
		});
	});

	test('keeps concurrent chat turns anchored to their own start trees', async () => {
		const trees = ['tree-a-start', 'tree-b-start', 'tree-b-end', 'tree-a-end'];
		const { commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());

		await service.captureTurnStartCheckpoint(session, 'turn-a', [workingDirectory]);
		await service.captureTurnStartCheckpoint(session, 'turn-b', [workingDirectory]);
		await service.captureTurnCheckpoint(session, 'turn-b', [workingDirectory]);
		await service.captureTurnCheckpoint(session, 'turn-a', [workingDirectory]);

		assert.deepStrictEqual(commitCalls, [
			{ tree: 'tree-b-start', parent: 'previous-turn-commit' },
			{ tree: 'tree-b-end', parent: 'commit-1' },
			{ tree: 'tree-a-start', parent: 'previous-turn-commit' },
			{ tree: 'tree-a-end', parent: 'commit-3' },
		]);
	});
});
