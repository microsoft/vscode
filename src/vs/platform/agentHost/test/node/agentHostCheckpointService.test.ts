/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createHash } from 'crypto';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { buildChatCheckpointRefName, buildCheckpointRefName } from '../../common/agentHostCheckpointService.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { IAgentHostChatRowStore, IAgentHostSessionStateStore } from '../../common/agentHostSessionStateStore.js';
import { AgentSession } from '../../common/agentService.js';
import { ISessionDataService, IWillDeleteSessionDataEvent, SESSION_CHECKPOINT_REPOSITORIES_METADATA_KEY } from '../../common/sessionDataService.js';
import { IAgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostCheckpointService } from '../../node/agentHostCheckpointService.js';
import { SessionDatabase } from '../../node/sessionDatabase.js';
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

/**
 * Central chat records: `peers` maps a peer chat to its storage; any other chat is the
 * default chat, stored in the session database.
 */
function createCheckpointStateStore(peers: ReadonlyMap<string, URI> = new Map()): IAgentHostSessionStateStore {
	return new class extends mock<IAgentHostSessionStateStore>() {
		override readonly chatRows = new class extends mock<IAgentHostChatRowStore>() {
			override async storageOf(session: URI, chat: URI) {
				const storage = peers.get(chat.toString());
				return storage ? { storage, isDefault: false } : { storage: session, isDefault: true };
			}
		}();
	}();
}

suite('AgentHostCheckpointService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createTestService(captureWorkingTreeAsTree: (repositoryRoot: URI) => Promise<string | undefined>, options?: {
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
			createCheckpointStateStore(),
		));
		return { chat, commitCalls, database, gitService, previousRef, session, service, workingDirectory };
	}

	test('captures a shared repository once per phase and takes fresh snapshots on later turns', async () => {
		let captures = 0;
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => `tree-${++captures}`);
		const directories = [workingDirectory, URI.joinPath(workingDirectory, 'one'), URI.joinPath(workingDirectory, 'two')];

		for (const turnId of ['turn-5', 'turn-6']) {
			await service.captureTurnStartCheckpoint(session, chat, turnId, directories);
			await service.captureTurnCheckpoint(session, chat, turnId, directories);
		}

		assert.deepStrictEqual({ captures, trees: commitCalls.map(call => call.tree) }, {
			captures: 4,
			trees: ['tree-1', 'tree-2', 'tree-3', 'tree-4'],
		});
	});

	test('checks an existing baseline once per repository in each operation', async () => {
		const { gitService, session, service, workingDirectory } = createTestService(async () => 'tree');
		let lookups = 0;
		const revParse = gitService.revParse;
		gitService.revParse = async (...args) => {
			lookups++;
			return revParse(...args);
		};
		const directories = [workingDirectory, URI.joinPath(workingDirectory, 'one'), URI.joinPath(workingDirectory, 'two')];

		await service.captureBaselineCheckpoint(session, directories);
		await service.captureBaselineCheckpoint(session, directories);

		assert.strictEqual(lookups, 2);
	});

	test('does not merge different repository roots when capturing a turn', async () => {
		const capturedRoots: string[] = [];
		const { chat, gitService, session, service } = createTestService(async root => {
			capturedRoots.push(root.path);
			return `tree-${root.path}`;
		});
		gitService.getRepositoryRoot = async directory => directory;
		const directories = [URI.file('/checkout'), URI.file('/linked-checkout')];

		await service.captureTurnStartCheckpoint(session, chat, 'turn-5', directories);
		await service.captureTurnCheckpoint(session, chat, 'turn-5', directories);

		assert.deepStrictEqual(capturedRoots, ['/checkout', '/linked-checkout', '/checkout', '/linked-checkout']);
	});

	test('preserves case-distinct repository roots in every checkpoint phase', async () => {
		const capturedRoots: string[] = [];
		const writtenRoots: string[] = [];
		const refs = new Map<string, Map<string, string>>();
		const { chat, gitService, session, service } = createTestService(async root => {
			capturedRoots.push(root.path);
			return `tree-${root.path}`;
		}, { baseline: false, previous: false });
		gitService.getRepositoryRoot = async directory => directory;
		gitService.revParse = async (root, expression) => refs.get(root.toString())?.get(expression);
		gitService.updateRef = async (root, ref, oid) => {
			let repositoryRefs = refs.get(root.toString());
			if (!repositoryRefs) {
				repositoryRefs = new Map();
				refs.set(root.toString(), repositoryRefs);
			}
			repositoryRefs.set(ref, oid);
			writtenRoots.push(root.path);
		};
		const directories = [URI.file('/Repo'), URI.file('/repo'), URI.file('/Repo')];

		await service.captureBaselineCheckpoint(session, directories);
		await service.captureTurnStartCheckpoint(session, chat, 'turn-1', directories);
		await service.captureTurnCheckpoint(session, chat, 'turn-1', directories);

		assert.deepStrictEqual({ capturedRoots, writtenRoots }, {
			capturedRoots: ['/Repo', '/repo', '/Repo', '/repo', '/Repo', '/repo'],
			writtenRoots: ['/Repo', '/repo', '/Repo', '/repo'],
		});
	});

	test('retries turn end through a differently cased root when the first root lookup fails', async () => {
		const capturedRoots: string[] = [];
		const writtenRoots: string[] = [];
		const { chat, database, gitService, session, service } = createTestService(async root => {
			capturedRoots.push(root.path);
			return `tree-${root.path}`;
		});
		let ending = false;
		gitService.getRepositoryRoot = async directory => {
			if (ending && directory.path === '/Repo') {
				throw new Error('root lookup failed');
			}
			return directory;
		};
		const updateRef = gitService.updateRef;
		gitService.updateRef = async (root, ref, oid) => {
			await updateRef(root, ref, oid);
			writtenRoots.push(root.path);
		};
		const directories = [URI.file('/Repo'), URI.file('/repo')];

		await service.captureTurnStartCheckpoint(session, chat, 'turn-5', directories);
		ending = true;
		await service.captureTurnCheckpoint(session, chat, 'turn-5', directories);

		assert.deepStrictEqual({
			capturedRoots,
			writtenRoots,
			checkpointPresent: !!await database.getTurnCheckpointRef('turn-5'),
		}, {
			capturedRoots: ['/Repo', '/repo', '/repo'],
			writtenRoots: ['/repo'],
			checkpointPresent: true,
		});
	});

	for (const phase of ['baseline', 'turn start', 'turn end'] as const) {
		for (const failure of ['root error', 'missing tree', 'capture error', 'missing commit', 'ref error'] as const) {
			test(`${phase} retries ${failure} through another folder before deduplicating`, async () => {
				let injectFailure = false;
				let failureInjected = false;
				let successfulWrites = 0;
				const failOnce = () => {
					if (!injectFailure || failureInjected) {
						return false;
					}
					failureInjected = true;
					return true;
				};
				const { chat, database, gitService, session, service, workingDirectory } = createTestService(async () => {
					if ((failure === 'missing tree' || failure === 'capture error') && failOnce()) {
						if (failure === 'capture error') {
							throw new Error('capture failed');
						}
						return undefined;
					}
					return 'tree';
				}, {
					baseline: phase === 'turn end',
					previous: phase === 'turn end',
					failCommitTree: () => failure === 'missing commit' && failOnce(),
				});
				const getRepositoryRoot = gitService.getRepositoryRoot;
				gitService.getRepositoryRoot = async (...args) => {
					if (failure === 'root error' && failOnce()) {
						throw new Error('root lookup failed');
					}
					return getRepositoryRoot(...args);
				};
				const updateRef = gitService.updateRef;
				gitService.updateRef = async (...args) => {
					if (failure === 'ref error' && failOnce()) {
						throw new Error('ref write failed');
					}
					await updateRef(...args);
					successfulWrites++;
				};
				const directories = [workingDirectory, URI.joinPath(workingDirectory, 'one'), URI.joinPath(workingDirectory, 'two')];
				if (phase === 'turn end') {
					await service.captureTurnStartCheckpoint(session, chat, 'turn-5', directories);
				}
				injectFailure = true;
				switch (phase) {
					case 'baseline':
						await service.captureBaselineCheckpoint(session, directories);
						break;
					case 'turn start':
						await service.captureTurnStartCheckpoint(session, chat, 'turn-5', directories);
						break;
					case 'turn end':
						await service.captureTurnCheckpoint(session, chat, 'turn-5', directories);
						break;
				}

				assert.deepStrictEqual({
					failureInjected,
					successfulWrites,
					checkpointPresent: !!(phase === 'turn end'
						? await database.getTurnCheckpointRef('turn-5')
						: await service.getBaselineCheckpoint(session, workingDirectory)),
				}, { failureInjected: true, successfulWrites: 1, checkpointPresent: true });
			});
		}
	}

	test('turn diff parent is the working tree captured at turn start', async () => {
		const trees = ['tree-before-turn', 'tree-after-turn'];
		const { chat, commitCalls, session, service, workingDirectory } = createTestService(async () => trees.shift());
		const currentRef = buildCheckpointRefName(AgentSession.id(session), 5);

		await service.captureTurnStartCheckpoint(session, chat, 'turn-5', [workingDirectory]);
		await service.captureTurnCheckpoint(session, chat, 'turn-5', [workingDirectory]);

		assert.deepStrictEqual({
			commitCalls,
			pair: await service.getTurnCheckpointPair(session, chat, 'turn-5', workingDirectory),
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
			createCheckpointStateStore(),
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

		assert.deepStrictEqual(await service.getTurnCheckpointPair(session, URI.parse('ahp-chat://default/session'), 'turn-5', workingDirectory), {
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

	test('keeps alternating terminal checkpoint ancestry per repository', async () => {
		class OrderedCheckpointDatabase extends TestSessionDatabase {
			private readonly turnOrder: string[] = [];
			private readonly checkpointRefs = new Map<string, string>();

			override async createTurn(turnId: string): Promise<void> {
				await super.createTurn(turnId);
				if (!this.turnOrder.includes(turnId)) {
					this.turnOrder.push(turnId);
				}
			}

			override async setTurnCheckpointRef(turnId: string, ref: string): Promise<void> {
				this.checkpointRefs.set(turnId, ref);
			}

			override async getTurnCheckpointRef(turnId: string): Promise<string | undefined> {
				return this.checkpointRefs.get(turnId);
			}

			override async getPreviousCheckpointRef(turnId: string): Promise<string | undefined> {
				const index = this.turnOrder.indexOf(turnId);
				for (let i = index - 1; i >= 0; i--) {
					const ref = this.checkpointRefs.get(this.turnOrder[i]);
					if (ref) {
						return ref;
					}
				}
				return undefined;
			}

			override async getAllCheckpointRefs(): Promise<string[]> {
				return this.turnOrder.map(turnId => this.checkpointRefs.get(turnId)).filter((ref): ref is string => ref !== undefined);
			}
		}

		const session = AgentSession.uri('copilot', 'session');
		const chatA = URI.parse('ahp-chat://default/session');
		const chatB = URI.parse('ahp-chat://peer/session');
		const repoA = URI.file('/repoA');
		const repoB = URI.file('/repoB');
		const baselineRef = buildCheckpointRefName(AgentSession.id(session), 0);
		const refsByRepo = new Map<string, Map<string, string>>([
			[repoA.toString(), new Map([[baselineRef, 'baseline-A']])],
			[repoB.toString(), new Map([[baselineRef, 'baseline-B']])],
		]);
		const parentsByRepo = new Map<string, Map<string, string>>();
		const treesByRepo = new Map<string, string[]>([
			[repoA.toString(), ['a1-start', 'a1-terminal-end', 'a2-start', 'a2-terminal-end']],
			[repoB.toString(), ['b1-start', 'b1-terminal-end']],
		]);
		const commitCalls: Array<{ repo: string; tree: string; parent: string | undefined }> = [];
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async workingDirectory => workingDirectory,
			captureWorkingTreeAsTree: async repository => treesByRepo.get(repository.toString())?.shift(),
			commitTree: async (repository, tree, parent) => {
				const commit = `${repository.path}:${tree}`;
				commitCalls.push({ repo: repository.path, tree, parent });
				if (parent) {
					let parents = parentsByRepo.get(repository.toString());
					if (!parents) {
						parents = new Map();
						parentsByRepo.set(repository.toString(), parents);
					}
					parents.set(commit, parent);
				}
				return commit;
			},
			updateRef: async (repository, ref, oid) => { refsByRepo.get(repository.toString())?.set(ref, oid); },
			revParse: async (repository, expression) => {
				if (expression.endsWith('^')) {
					const commit = refsByRepo.get(repository.toString())?.get(expression.slice(0, -1));
					return commit ? parentsByRepo.get(repository.toString())?.get(commit) : undefined;
				}
				return refsByRepo.get(repository.toString())?.get(expression);
			},
		};
		const service = store.add(new AgentHostCheckpointService(
			createSessionDataService(new OrderedCheckpointDatabase()),
			new CheckpointTestConfigurationService(repoA),
			gitService,
			new NullLogService(),
			createCheckpointStateStore(),
		));

		await service.captureTurnStartCheckpoint(session, chatA, 'turn-a1', [repoA]);
		await service.captureTurnCheckpoint(session, chatA, 'turn-a1', [repoA]);
		await service.captureTurnStartCheckpoint(session, chatB, 'turn-b1', [repoB]);
		await service.captureTurnCheckpoint(session, chatB, 'turn-b1', [repoB]);
		await service.captureTurnStartCheckpoint(session, chatA, 'turn-a2', [repoA]);
		await service.captureTurnCheckpoint(session, chatA, 'turn-a2', [repoA]);

		assert.deepStrictEqual(commitCalls, [
			{ repo: '/repoA', tree: 'a1-start', parent: 'baseline-A' },
			{ repo: '/repoA', tree: 'a1-terminal-end', parent: '/repoA:a1-start' },
			{ repo: '/repoB', tree: 'b1-start', parent: 'baseline-B' },
			{ repo: '/repoB', tree: 'b1-terminal-end', parent: '/repoB:b1-start' },
			{ repo: '/repoA', tree: 'a2-start', parent: '/repoA:a1-terminal-end' },
			{ repo: '/repoA', tree: 'a2-terminal-end', parent: '/repoA:a2-start' },
		]);
	});

	test('foreign checkpoint rows are numbered and deleted but never a parent of the default chat\'s turns', async () => {
		const session = AgentSession.uri('copilot', 'session');
		const chat = URI.parse('ahp-chat://default/session');
		const repository = URI.file('/repo');
		const sessionId = AgentSession.id(session);
		const turnRef = (turn: number) => buildCheckpointRefName(sessionId, turn);
		const database = store.add(await SessionDatabase.open(':memory:'));
		// An older build recorded the peer's turn `p1` between the default chat's turns.
		await database.createTurn('d1');
		await database.setTurnEventId('d1', 'e1');
		await database.setTurnCheckpointRef('d1', turnRef(1));
		await database.createTurn('p1');
		await database.setTurnCheckpointRef('p1', turnRef(2));
		await database.setForeignRows(chat.toString(), ['p1']);
		// The default chat's own last checkpoint is gone; only the baseline and the peer's resolve.
		const refs = new Map([[turnRef(0), 'baseline-commit'], [turnRef(2), 'peer-commit']]);
		const commitCalls: Array<{ tree: string; parent: string | undefined }> = [];
		const deleted: string[] = [];
		const gitService: IAgentHostGitService = {
			...createNoopGitService(),
			getRepositoryRoot: async () => repository,
			captureWorkingTreeAsTree: async () => `tree-${commitCalls.length + 1}`,
			commitTree: async (_root, tree, parent) => {
				commitCalls.push({ tree, parent });
				return `commit-${commitCalls.length}`;
			},
			updateRef: async (_root, ref, oid) => { refs.set(ref, oid); },
			revParse: async (_root, expression) => refs.get(expression),
			deleteRefs: async (_root, deletedRefs) => { deleted.push(...deletedRefs); },
		};
		const service = store.add(new AgentHostCheckpointService(createSessionDataService(database), new CheckpointTestConfigurationService(repository), gitService, new NullLogService(), createCheckpointStateStore()));

		await service.captureTurnStartCheckpoint(session, chat, 'd2', [repository]);
		await service.captureTurnCheckpoint(session, chat, 'd2', [repository]);
		await service.deleteCheckpoints(session, [repository.toString()]);

		assert.deepStrictEqual({
			parents: commitCalls.map(call => call.parent),
			ref: await database.getTurnCheckpointRef('d2'),
			deleted: deleted.sort(),
		}, {
			parents: ['baseline-commit', 'commit-1'],
			// Numbered above the peer's ref, so older builds reading every row never collide.
			ref: turnRef(3),
			deleted: [turnRef(0), turnRef(1), turnRef(2), turnRef(3)].sort(),
		});
	});

	suite('foreign rows per consumer', () => {
		const session = AgentSession.uri('copilot', 'session');
		const chat = URI.parse('ahp-chat://default/session');
		const peer = URI.parse('ahp-chat://peer/session');
		const repository = URI.file('/repo');
		const sessionId = AgentSession.id(session);
		const turnRef = (turn: number) => buildCheckpointRefName(sessionId, turn);

		/** The session database an older build leaves behind: `p1` is the peer's turn between the default chat's. */
		async function createDatabase() {
			const database = store.add(await SessionDatabase.open(':memory:'));
			await database.createTurn('d1');
			await database.setTurnEventId('d1', 'e1');
			await database.setTurnCheckpointRef('d1', turnRef(1));
			await database.createTurn('p1');
			await database.setTurnCheckpointRef('p1', turnRef(2));
			await database.createTurn('d2');
			await database.setTurnEventId('d2', 'e2');
			await database.setTurnCheckpointRef('d2', turnRef(3));
			await database.setForeignRows(chat.toString(), ['p1']);
			return database;
		}

		function createService(database: SessionDatabase, refs: Map<string, string>, parents: Map<string, string>, stateStore = createCheckpointStateStore(), others: ReadonlyMap<string, SessionDatabase> = new Map()) {
			const gitService: IAgentHostGitService = {
				...createNoopGitService(),
				getRepositoryRoot: async () => repository,
				revParse: async (_root, expression) => expression.endsWith('^') ? parents.get(refs.get(expression.slice(0, -1)) ?? '') : refs.get(expression),
			};
			const dataService = createSessionDataService(database);
			return store.add(new AgentHostCheckpointService({
				...dataService,
				tryOpenDatabase: async storage => others.has(storage.toString()) ? createSessionDataService(others.get(storage.toString())).openDatabase(storage) : dataService.openDatabase(storage),
			}, new CheckpointTestConfigurationService(repository), gitService, new NullLogService(), stateStore));
		}

		test('the default chat\'s diff parent skips the foreign row, and its own turn resolves', async () => {
			const database = await createDatabase();
			const refs = new Map([[turnRef(0), 'baseline'], [turnRef(1), 'c1'], [turnRef(3), 'c3']]);
			const pair = await createService(database, refs, new Map([['c3', 'tree-parent']])).getTurnCheckpointPair(session, chat, 'd2', repository);

			assert.deepStrictEqual({ pair, previous: await database.getPreviousCheckpointRef('d2') }, {
				pair: { current: turnRef(3), parent: 'tree-parent' },
				previous: turnRef(1),
			});
		});

		test('the default chat never resolves a foreign row, and a peer asks its own database only', async () => {
			const database = await createDatabase();
			const refs = new Map([[turnRef(0), 'baseline'], [turnRef(2), 'c2']]);
			const peerDatabase = store.add(await SessionDatabase.open(':memory:'));
			const peerStorage = URI.parse('ahp-chat://peer-storage/session');
			const service = createService(database, refs, new Map([['c2', 'parent-2']]), createCheckpointStateStore(new Map([[peer.toString(), peerStorage]])), new Map([[peerStorage.toString(), peerDatabase]]));

			assert.deepStrictEqual({
				defaultChat: await service.getTurnCheckpointPair(session, chat, 'p1', repository),
				unknownChat: await service.getTurnCheckpointPair(session, undefined, 'p1', repository),
				// Without its copy (the row move copies it at load) the peer has no checkpoint for the turn.
				peerWithoutCopy: await service.getTurnCheckpointPair(session, peer, 'p1', repository),
			}, { defaultChat: undefined, unknownChat: undefined, peerWithoutCopy: undefined });
		});
	});

	suite('checkpoints are chat data', () => {
		const session = AgentSession.uri('copilot', 'session');
		const sessionId = AgentSession.id(session);
		const turnRef = (turn: number) => buildCheckpointRefName(sessionId, turn);
		const defaultChat = URI.parse('ahp-chat://default/session');
		const peerA = URI.parse('ahp-chat://peer-a/session');
		const peerB = URI.parse('ahp-chat://peer-b/session');
		// Recorded storage, deliberately unrelated to the chat URIs.
		const storageA = URI.parse('ahp-storage:/a');
		const storageB = URI.parse('ahp-storage:/b');
		const sessionFolder = URI.file('/main');
		const peerFolder = URI.file('/peer');
		const chatRef = (chat: URI, turn: number) => buildChatCheckpointRefName(createHash('sha1').update(chat.toString()).digest('hex').slice(0, 16), turn);

		/**
		 * A session an older build used: its database holds the default chat's `d1` and peer A's
		 * `p1` (flagged foreign), whose row the row move copied into peer A's database. Each folder
		 * is its own repository.
		 */
		async function createHarness() {
			const databases = new Map<string, SessionDatabase>();
			for (const storage of [session, storageA, storageB]) {
				databases.set(storage.toString(), store.add(await SessionDatabase.open(':memory:')));
			}
			const sessionDb = databases.get(session.toString())!;
			const peerADb = databases.get(storageA.toString())!;
			await sessionDb.createTurn('d1');
			await sessionDb.setTurnEventId('d1', 'e1');
			await sessionDb.setTurnCheckpointRef('d1', turnRef(1));
			await sessionDb.createTurn('p1');
			await sessionDb.setTurnCheckpointRef('p1', turnRef(2));
			await sessionDb.setForeignRows(defaultChat.toString(), ['p1']);
			await peerADb.createTurn('p1');
			await peerADb.setTurnCheckpointRef('p1', turnRef(2));

			const refsByRepository = new Map<string, Map<string, string>>([[sessionFolder.toString(), new Map([[turnRef(0), 'c0'], [turnRef(1), 'c1'], [turnRef(2), 'c2']])]]);
			const refsIn = (root: URI) => {
				let refs = refsByRepository.get(root.toString());
				if (!refs) {
					refs = new Map();
					refsByRepository.set(root.toString(), refs);
				}
				return refs;
			};
			let objects = 0;
			let captureGate: Promise<void> | undefined;
			const gitService: IAgentHostGitService = {
				...createNoopGitService(),
				getRepositoryRoot: async directory => directory,
				captureWorkingTreeAsTree: async () => {
					await captureGate;
					return `tree-${++objects}`;
				},
				commitTree: async () => `commit-${++objects}`,
				updateRef: async (root, ref, oid) => { refsIn(root).set(ref, oid); },
				revParse: async (root, expression) => refsIn(root).get(expression.endsWith('^') ? expression.slice(0, -1) : expression),
				deleteRefs: async (root, refs) => { refs.forEach(ref => refsIn(root).delete(ref)); },
			};
			const onWillDeleteSessionData = store.add(new Emitter<IWillDeleteSessionDataEvent>());
			const open = (storage: URI) => createSessionDataService(databases.get(storage.toString())).openDatabase(storage);
			const dataService: ISessionDataService = {
				...createSessionDataService(),
				openDatabase: open,
				tryOpenDatabase: async storage => databases.has(storage.toString()) ? open(storage) : undefined,
				onWillDeleteSessionData: onWillDeleteSessionData.event,
			};
			const service = store.add(new AgentHostCheckpointService(dataService, new CheckpointTestConfigurationService(sessionFolder), gitService, new NullLogService(),
				createCheckpointStateStore(new Map([[peerA.toString(), storageA], [peerB.toString(), storageB]]))));

			return {
				service,
				/** Holds every working tree capture until `gate` settles. */
				holdCaptures(gate: Promise<void> | undefined) { captureGate = gate; },
				async turn(chat: URI, turnId: string, folder: URI) {
					await service.captureTurnStartCheckpoint(session, chat, turnId, [folder]);
					await service.captureTurnCheckpoint(session, chat, turnId, [folder]);
				},
				/** Deletes a chat's or the session's data directory the way `deleteSessionData` does. */
				async deleteData(storage: URI, workingDirectories?: readonly URI[]) {
					const pending: Promise<unknown>[] = [];
					onWillDeleteSessionData.fire({ session: storage, workingDirectories: workingDirectories?.map(directory => directory.toString()), waitUntil: promise => pending.push(promise) });
					await Promise.all(pending);
				},
				refs: (folder: URI) => [...refsIn(folder).keys()].sort(),
				rows: async (storage: URI) => databases.get(storage.toString())!.getAllCheckpointRefs(),
				repositories: async (storage: URI) => databases.get(storage.toString())!.getMetadata(SESSION_CHECKPOINT_REPOSITORIES_METADATA_KEY),
			};
		}

		async function runTurns(harness: Awaited<ReturnType<typeof createHarness>>): Promise<void> {
			await harness.turn(defaultChat, 'd2', sessionFolder);
			await harness.turn(peerA, 'a1', peerFolder);
			await harness.turn(peerA, 'shared', peerFolder);
			// Fork-inherited turn ids are shared between chats.
			await harness.turn(peerB, 'shared', peerFolder);
		}

		test('peers number per chat under chat-only names; the default chat keeps the session names and numbers over every row of its database', async () => {
			const harness = await createHarness();
			await runTurns(harness);
			const sessionRows = await harness.rows(session);

			assert.deepStrictEqual({
				session: sessionRows,
				// What an older build computes as the next number over the session database.
				oldBuildNext: Math.max(...sessionRows.map(ref => Number(ref.slice(ref.lastIndexOf('/') + 1)))) + 1,
				peerA: await harness.rows(storageA),
				peerB: await harness.rows(storageB),
				repositories: [await harness.repositories(session), await harness.repositories(storageA), await harness.repositories(storageB)],
			}, {
				// Numbered above the legacy peer row, so older builds' numbers stay unique.
				session: [turnRef(1), turnRef(2), turnRef(3)],
				oldBuildNext: 4,
				// The copied legacy row keeps its name and counts for the chat's own numbering.
				peerA: [turnRef(2), chatRef(peerA, 3), chatRef(peerA, 4)],
				peerB: [chatRef(peerB, 1)],
				repositories: [JSON.stringify([sessionFolder.toString()]), JSON.stringify([peerFolder.toString()]), JSON.stringify([peerFolder.toString()])],
			});
		});

		test('a turn resolves from the asking chat\'s own database', async () => {
			const harness = await createHarness();
			await runTurns(harness);
			const current = async (chat: URI | undefined, turnId: string, folder: URI) => (await harness.service.getTurnCheckpointPair(session, chat, turnId, folder))?.current;

			assert.deepStrictEqual({
				peerA: await current(peerA, 'shared', peerFolder),
				peerB: await current(peerB, 'shared', peerFolder),
				peerALegacy: await current(peerA, 'p1', sessionFolder),
				defaultChat: await current(defaultChat, 'd2', sessionFolder),
				defaultChatShared: await current(defaultChat, 'shared', peerFolder),
				defaultChatForeign: await current(undefined, 'p1', sessionFolder),
			}, {
				peerA: chatRef(peerA, 4),
				peerB: chatRef(peerB, 1),
				peerALegacy: turnRef(2),
				defaultChat: turnRef(3),
				defaultChatShared: undefined,
				defaultChatForeign: undefined,
			});
		});

		test('deleting a peer removes its refs in the repositories it recorded, even outside the session\'s folders, and nothing of other chats', async () => {
			const harness = await createHarness();
			await runTurns(harness);

			await harness.deleteData(storageA);

			assert.deepStrictEqual({ peerFolder: harness.refs(peerFolder), sessionFolder: harness.refs(sessionFolder) }, {
				peerFolder: [turnRef(0), chatRef(peerB, 1)].sort(),
				sessionFolder: [turnRef(0), turnRef(1), turnRef(2), turnRef(3)],
			});
		});

		test('deleting a peer waits for its capture in flight, so the ref it creates is deleted too', async () => {
			const harness = await createHarness();
			await harness.turn(peerA, 'a1', peerFolder);
			await harness.service.captureTurnStartCheckpoint(session, peerA, 'a2', [peerFolder]);
			const release = new DeferredPromise<void>();
			harness.holdCaptures(release.p);
			const capture = harness.service.captureTurnCheckpoint(session, peerA, 'a2', [peerFolder]);

			const deletion = harness.deleteData(storageA);
			release.complete();
			await Promise.all([capture, deletion]);

			assert.deepStrictEqual(harness.refs(peerFolder), [turnRef(0)]);
		});

		test('deleting the session after its peers leaves no turn refs; the baseline goes where the session\'s folders resolve', async () => {
			const harness = await createHarness();
			await runTurns(harness);

			await harness.deleteData(storageA);
			await harness.deleteData(storageB);
			await harness.deleteData(session, [sessionFolder]);

			assert.deepStrictEqual({ peerFolder: harness.refs(peerFolder), sessionFolder: harness.refs(sessionFolder) }, {
				// The session baseline keeps main's resolution: only the session's current folders.
				peerFolder: [turnRef(0)],
				sessionFolder: [],
			});
		});
	});
});
