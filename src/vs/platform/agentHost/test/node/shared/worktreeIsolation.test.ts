/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import * as sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { join } from '../../../../../base/common/path.js';
import { basename, getComparisonKey } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { GitRefType, IAgentHostGitService, META_DIFF_BASE_BRANCH, type IAddWorktreeOptions, type IBranch } from '../../../common/agentHostGitService.js';
import { SessionConfigKey } from '../../../common/sessionConfigKeys.js';
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, MessageKind, ResponsePartKind, TurnState, type ISessionGitState, type Turn } from '../../../common/state/sessionState.js';
import { AgentBranchNameGenerator, IAgentBranchNameGenerator } from '../../../node/shared/agentBranchNameGenerator.js';
import { ICopilotApiService } from '../../../node/shared/copilotApiService.js';
import type { IAgentHostPullRequestResolver, IResolvedPullRequest } from '../../../node/shared/pullRequestResolver.js';
import { buildWorktreeFailureNotification, detachedWorktreeRecordUri, normalizeWorktreeFailureDiagnostic, NullAgentHostWorktreeIsolation, SessionWorkingDirectoryMissingError, WorktreeIsolation, getWorktreeName, getWorktreesRoot } from '../../../node/shared/worktreeIsolation.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY } from '../../../node/shared/sessionAdditionalWorktrees.js';
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from '../../common/sessionTestHelpers.js';
import type { Database } from '@vscode/sqlite3';
import { AgentHostDatabase } from '../../../node/agentHostDatabase.js';
import { createTestSessionStateStore, createTestWorktreeCleanupService, readTestSessionAdditionalWorktrees } from '../chatMetadataTestHelpers.js';
import { AgentHostWorktreeCleanupService } from '../../../node/agentHostWorktreeCleanupService.js';
import type { AgentHostSessionStateStore } from '../../../node/agentHostSessionStateStore.js';
import { SessionStateMirrorFlush, SessionStateNotASessionError } from '../../../common/agentHostSessionStateStore.js';
import type { ISessionDataService } from '../../../common/sessionDataService.js';

function createNullCopilotApiService(): ICopilotApiService {
	return {
		_serviceBrand: undefined,
		messages: (..._args: unknown[]): never => { throw new Error('not implemented'); },
		countTokens: async () => { throw new Error('not implemented'); },
		models: async () => [],
		responses: async () => { throw new Error('not implemented'); },
		utilityChatCompletion: async () => { throw new Error('not implemented'); },
		resolveRestrictedTelemetryContext: async () => { throw new Error('not implemented'); },
		resolveApiEndpoint: async () => undefined,
	};
}

const nullPullRequestResolver: IAgentHostPullRequestResolver = {
	_serviceBrand: undefined,
	captureSessionCredentialSource: (_session, source) => source,
	resolve: async () => { throw new Error('Pull request resolution is not expected.'); },
};

class TestLogService extends NullLogService {
	readonly warnings: string[] = [];

	override warn(message: string): void {
		this.warnings.push(message);
	}
}

suite('WorktreeIsolation', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('null implementation preserves folder-only behavior', async () => {
		const isolation = new NullAgentHostWorktreeIsolation();
		const session = URI.parse('copilot:/session');
		const workingDirectory = URI.file('/workspace');
		const turns: Turn[] = [];

		assert.deepStrictEqual({
			supported: isolation.supported,
			pending: isolation.isWorkingDirectoryPending('session'),
			resolved: await isolation.resolveOnFirstSend({ sessionUri: session, sessionId: 'session', workingDirectory, config: undefined }),
			config: await isolation.resolveIsolationConfig({ workingDirectory, config: undefined }),
			branches: await isolation.branchCompletions(workingDirectory),
			resumed: await isolation.resolveWorkingDirectoryForResume(session, 'session', workingDirectory),
			restoredTurnsSame: await isolation.applyRestoreAnnouncement(session, turns) === turns,
			deletion: await isolation.prepareSessionDeletion(session, 'session'),
			adopted: await isolation.adoptExistingWorktreeMetadata(session, workingDirectory),
			externalProject: await isolation.resolveExternalWorktreeProject(workingDirectory),
			project: await isolation.resolveWorktreeProject(session),
		}, {
			supported: false,
			pending: false,
			resolved: undefined,
			config: undefined,
			branches: { items: [] },
			resumed: workingDirectory,
			restoredTurnsSame: true,
			deletion: undefined,
			adopted: false,
			externalProject: undefined,
			project: undefined,
		});
	});

	let repoRoot: URI;
	let worktreesRoot: URI;
	let db: TestSessionDatabase;
	let addWorktreeCalls: IAddWorktreeOptions[];
	let addExistingCalls: { worktree: URI; branchName: string }[];
	let removeCalls: { worktree: URI; force: boolean }[];
	let commitCalls: { worktree: URI; message: string }[];
	let commitError: Error | undefined;
	let copyIncludeCalls: { repositoryRoot: URI; worktree: URI; globs: readonly string[]; sessionId: string; excludedFolders: readonly string[] }[];
	let copyIncludeError: Error | undefined;
	let symlinkFolderCalls: { repositoryRoot: URI; worktree: URI; patterns: readonly string[]; sessionId: string }[];
	let symlinkFolderError: Error | undefined;
	let worktreeSetupCalls: string[];
	let branchName: string;
	let hasUncommittedChanges: boolean;
	let branchExists: boolean;
	let headCommit: string | undefined;
	let sessionGitState: ISessionGitState | undefined;

	const sessionUri = URI.parse('agent-session://test/s1');
	const sessionId = 's1';

	function localBranch(name: string, upstreamName?: string): IBranch {
		return {
			ref: `refs/heads/${name}`,
			name,
			kind: GitRefType.Head,
			upstream: upstreamName ? {
				ref: `refs/remotes/${upstreamName}`,
				name: upstreamName,
				remote: upstreamName.split('/')[0],
			} : undefined,
		};
	}

	function createGitService(): IAgentHostGitService {
		return {
			...createNoopGitService(),
			getRepositoryRoot: async () => repoRoot,
			revParse: async (_root, expr) => expr === 'HEAD' ? headCommit : undefined,
			getCurrentBranch: async () => 'feature',
			getHEAD: async () => localBranch('feature'),
			getDefaultBranch: async () => ({ name: 'main', startPoint: 'main' }),
			getDefaultBranch2: async () => localBranch('main'),
			getBranches: async () => [
				{ ref: 'refs/heads/main', name: 'main', kind: GitRefType.Head },
				{ ref: 'refs/heads/feature', name: 'feature', kind: GitRefType.Head },
			],
			branchExists: async () => branchExists,
			hasUncommittedChanges: async () => hasUncommittedChanges,
			commitAll: async (worktree, message) => {
				commitCalls.push({ worktree, message });
				if (commitError) {
					throw commitError;
				}
			},
			getSessionGitState: async () => sessionGitState,
			addWorktree: async (_root, options) => {
				addWorktreeCalls.push(options);
				mkdirSync(options.path.fsPath, { recursive: true });
			},
			copyWorktreeIncludeFiles: async (repositoryRoot, worktree, globs, sessionId, _onProgress, excludedFolders = []) => {
				worktreeSetupCalls.push('includeFiles');
				copyIncludeCalls.push({ repositoryRoot, worktree, globs: [...globs], sessionId, excludedFolders: [...excludedFolders] });
				if (copyIncludeError) {
					throw copyIncludeError;
				}
			},
			symlinkWorktreeFolders: async (repositoryRoot, worktree, patterns, sessionId) => {
				worktreeSetupCalls.push('symlinkFolders');
				symlinkFolderCalls.push({ repositoryRoot, worktree, patterns: [...patterns], sessionId });
				if (symlinkFolderError) {
					throw symlinkFolderError;
				}
				return patterns.map(pattern => pattern.endsWith('/**') ? pattern.slice(0, -3) : pattern);
			},
			addExistingWorktree: async (_root, worktree, branch) => {
				addExistingCalls.push({ worktree, branchName: branch });
				mkdirSync(worktree.fsPath, { recursive: true });
			},
			removeWorktree: async (_root, worktree, options) => {
				removeCalls.push({ worktree, force: options?.force === true });
				rmSync(worktree.fsPath, { recursive: true, force: true });
			},
		};
	}

	function createIsolation(disposableStore: Pick<DisposableStore, 'add'>, options?: { readonly branchNameGenerator?: IAgentBranchNameGenerator; readonly gitService?: IAgentHostGitService; readonly pullRequestResolver?: IAgentHostPullRequestResolver; readonly sessionDataService?: ISessionDataService; readonly logService?: NullLogService; readonly centralDatabase?: AgentHostDatabase; readonly stores?: AgentHostSessionStateStore[] }): WorktreeIsolation {
		const branchNameGenerator = options?.branchNameGenerator ?? {
			_serviceBrand: undefined,
			generateBranchName: async () => branchName,
		};
		const sessionDataService = options?.sessionDataService ?? createSessionDataService(db);
		const stateStore = disposableStore.add(createTestSessionStateStore(options?.centralDatabase ?? disposableStore.add(new AgentHostDatabase(':memory:')), sessionDataService));
		options?.stores?.push(stateStore);
		return disposableStore.add(new WorktreeIsolation(
			branchNameGenerator,
			options?.gitService ?? createGitService(),
			options?.pullRequestResolver ?? nullPullRequestResolver,
			sessionDataService,
			stateStore,
			options?.logService ?? new NullLogService(),
		));
	}

	/** Archives `sessionUri` the way the host does: records the removal, then runs the clean-up pass. */
	async function archiveThroughCleanup(isolation: WorktreeIsolation, mode: 'commit' | 'synced'): Promise<AgentHostWorktreeCleanupService> {
		const cleanup = createTestWorktreeCleanupService(disposables, isolation);
		await cleanup.requestSessionWorktreeRemoval(sessionUri, mode);
		await cleanup.runPass();
		return cleanup;
	}

	function createTrackedSessionDataService(): { readonly service: ISessionDataService; readonly dataIds: Set<string> } {
		const dataIds = new Set<string>();
		const base = createSessionDataService(db);
		return {
			dataIds,
			service: {
				...base,
				openDatabase: resource => {
					dataIds.add(resource.path.substring(1));
					return base.openDatabase(resource);
				},
				listSessionDataIds: async prefix => [...dataIds].filter(id => id.startsWith(prefix)),
				deleteSessionData: async resource => {
					dataIds.delete(resource.path.substring(1));
				},
			},
		};
	}

	setup(() => {
		repoRoot = URI.file(mkdtempSync(join(tmpdir(), 'wt-iso-')));
		worktreesRoot = getWorktreesRoot(repoRoot);
		db = new TestSessionDatabase();
		addWorktreeCalls = [];
		addExistingCalls = [];
		removeCalls = [];
		commitCalls = [];
		commitError = undefined;
		copyIncludeCalls = [];
		copyIncludeError = undefined;
		symlinkFolderCalls = [];
		symlinkFolderError = undefined;
		worktreeSetupCalls = [];
		branchName = 'agents/my-feature';
		hasUncommittedChanges = false;
		branchExists = true;
		headCommit = 'abc123';
		sessionGitState = {
			branchName: 'feature',
			defaultBranchName: 'main',
			upstreamBranchName: 'origin/agents/my-feature',
			outgoingChanges: 0,
			uncommittedChanges: 0,
		};
	});

	teardown(() => {
		rmSync(repoRoot.fsPath, { recursive: true, force: true });
		rmSync(worktreesRoot.fsPath, { recursive: true, force: true });
	});

	test('getWorktreesRoot / getWorktreeName derive sibling paths and strip the agents/ prefix', () => {
		assert.deepStrictEqual({
			root: getWorktreesRoot(URI.file('/src/vscode')).fsPath,
			named: getWorktreeName('agents/add-config'),
			namedFlattened: getWorktreeName('agents/feature/sub-topic'),
			namedNoPrefix: getWorktreeName('plain-branch'),
			namedWithBranchPrefix: getWorktreeName('users/alice/agents/add-config', 'users/alice/'),
		}, {
			root: URI.file('/src/vscode.worktrees').fsPath,
			named: 'add-config',
			namedFlattened: 'feature-sub-topic',
			namedNoPrefix: 'plain-branch',
			namedWithBranchPrefix: 'add-config',
		});
	});

	for (const fail of [false, true]) {
		test(`retains the previous owned worktree when changing workspace (persistence failure: ${fail})`, async () => {
			db = new class extends TestSessionDatabase {
				override async applyMetadataChanges(set: Readonly<Record<string, string>>, remove: readonly string[]): Promise<void> {
					if (fail && set[ADDITIONAL_WORKTREES_METADATA_KEY]) {
						throw new Error('Retention persistence failed');
					}
					// The session.db mirror never receives the custom base branch: retention must read it from central state.
					const { [META_DIFF_BASE_BRANCH]: baseBranch, ...rest } = set;
					await super.applyMetadataChanges(baseBranch === 'origin/custom-base' ? rest : set, remove);
				}
			}();
			const detached = new TestSessionDatabase();
			const sessionDb = db;
			const service: ISessionDataService = {
				...createSessionDataService(sessionDb),
				openDatabase: resource => createSessionDataService(resource.toString() === sessionUri.toString() ? sessionDb : detached).openDatabase(resource),
				tryOpenDatabase: async resource => createSessionDataService(resource.toString() === sessionUri.toString() ? sessionDb : detached).openDatabase(resource),
			};
			const stores: AgentHostSessionStateStore[] = [];
			const isolation = createIsolation(disposables, { sessionDataService: service, stores });
			const request = { sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } };
			const original = await isolation.resolveForWorkspaceConversion(request);
			assert.ok(original);
			await stores[0].writeMetadata(sessionUri, sessionUri, { [META_DIFF_BASE_BRANCH]: 'origin/custom-base' }, SessionStateMirrorFlush.Coalesced);
			if (fail) {
				await assert.rejects(isolation.retainSessionWorktree(sessionUri, sessionId), /Retention persistence failed/);
				assert.deepStrictEqual({
					owned: (await isolation.prepareSessionDeletion(sessionUri, sessionId))?.worktree.toString(),
					retained: await readTestSessionAdditionalWorktrees(service, sessionUri), removed: removeCalls,
				}, { owned: original.toString(), retained: [], removed: [] });
				return;
			}
			await isolation.retainSessionWorktree(sessionUri, sessionId);
			const retained = await readTestSessionAdditionalWorktrees(service, sessionUri);
			const restored = createIsolation(disposables, { sessionDataService: service });
			assert.deepStrictEqual({
				retained: retained.map(record => ({ directory: record.workingDirectory, repository: record.repositoryRoot })),
				primary: await restored.prepareSessionDeletion(sessionUri, sessionId),
				detached: (await restored.readWorktreeMetadata(detachedWorktreeRecordUri(retained[0].handle)))?.worktreePath?.toString(),
				diffBase: await detached.getMetadata(META_DIFF_BASE_BRANCH),
				exists: existsSync(original.fsPath), removed: removeCalls,
			}, {
				retained: [{ directory: original.toString(), repository: repoRoot.toString() }],
				primary: undefined, detached: original.toString(), diffBase: 'origin/custom-base', exists: true, removed: [],
			});
			branchName = 'agents/next-worktree';
			const next = await isolation.resolveForWorkspaceConversion(request);
			assert.notStrictEqual(next?.toString(), original.toString(), 'A later conversion must not reuse the previous checkout');
			const cleanup = createTestWorktreeCleanupService(disposables, restored);
			await cleanup.deleteDetachedWorktree(retained[0].handle);
			await cleanup.runPass();
			assert.deepStrictEqual(removeCalls.map(call => call.worktree.toString()), [original.toString()]);
		});
	}

	test('retention refuses to drop live ownership after creation metadata persistence fails', async () => {
		// The creation metadata is session state: its central write is what persists it.
		const centralDatabase = disposables.add(new class extends AgentHostDatabase {
			override async writeSessionState(...args: Parameters<AgentHostDatabase['writeSessionState']>) {
				if (JSON.stringify(args[2]).includes('copilot.worktree.branchName')) {
					throw new Error('Creation metadata persistence failed');
				}
				return super.writeSessionState(...args);
			}
		}(':memory:'));
		const isolation = createIsolation(disposables, { centralDatabase });
		const worktree = await isolation.resolveForWorkspaceConversion({
			sessionUri, sessionId, workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
		});
		assert.ok(worktree);
		await assert.rejects(isolation.retainSessionWorktree(sessionUri, sessionId), /without its persisted ownership metadata/);
		const owned = await isolation.prepareSessionDeletion(sessionUri, sessionId);
		assert.deepStrictEqual({
			live: isolation.getResolvedWorktree(sessionId)?.toString(),
			deletion: owned?.worktree.toString(),
			additional: await readTestSessionAdditionalWorktrees(createSessionDataService(db), sessionUri),
			exists: existsSync(worktree.fsPath),
		}, { live: worktree.toString(), deletion: worktree.toString(), additional: [], exists: true });
		await isolation.removeSessionWorktree(sessionId, owned);
		assert.strictEqual(existsSync(worktree.fsPath), false);
	});

	test('a session whose worktree metadata never persisted has its worktree removed on deletion but kept on archive', async () => {
		const sessionDataService = createSessionDataService(db);
		const store = disposables.add(createTestSessionStateStore(disposables.add(new AgentHostDatabase(':memory:')), sessionDataService));
		// Reads see nothing persisted, as when the metadata write failed.
		const unpersisted = new Proxy(store, {
			get: (target, property, receiver) => property === 'readWithoutImport' ? async () => new Map() : Reflect.get(target, property, receiver),
		});
		const isolation = disposables.add(new WorktreeIsolation(
			{ _serviceBrand: undefined, generateBranchName: async () => branchName },
			createGitService(),
			nullPullRequestResolver,
			sessionDataService,
			unpersisted,
			new NullLogService(),
		));
		const worktree = await isolation.resolveForWorkspaceConversion({
			sessionUri, sessionId, workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
		});
		assert.ok(worktree);

		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const cleanup = createTestWorktreeCleanupService(disposables, isolation, database);
		await cleanup.requestSessionWorktreeRemoval(sessionUri, 'commit');
		const archived = await cleanup.prepareSessionDeletion(sessionUri, [], 'delete');

		assert.deepStrictEqual({
			// Unarchive could not recreate it, so an archive leaves it alone.
			archiveRequests: (await database.listPendingWorktreeRemovals()).length,
			deletion: archived.map(request => ({ worktree: request.worktreePath, repositoryRoot: request.repositoryRoot, branch: request.branch })),
		}, {
			archiveRequests: 0,
			deletion: [{ worktree: worktree.toString(), repositoryRoot: repoRoot.toString(), branch: branchName }],
		});
	});

	for (const interruption of ['registration', 'claim'] as const) {
		for (const retryBeforeRestart of [false, true, 'delete owner'] as const) {
			test(`retention recovers interrupted ${interruption} (retry before restart: ${retryBeforeRestart})`, async () => {
				let interrupt = true;
				db = new TestSessionDatabase();
				// A restart keeps the central database, so the registration is interrupted there.
				const centralDatabase = disposables.add(new class extends AgentHostDatabase {
					override async writeSessionState(...args: Parameters<AgentHostDatabase['writeSessionState']>) {
						if (interrupt && interruption === 'registration' && JSON.stringify(args[2]).includes(ADDITIONAL_WORKTREES_METADATA_KEY)) {
							throw new Error('Interrupted before owner registration');
						}
						return super.writeSessionState(...args);
					}
				}(':memory:'));
				const databases = new Map<string, TestSessionDatabase>([[sessionUri.toString(), db]]);
				const service: ISessionDataService = {
					...createSessionDataService(db),
					openDatabase: resource => {
						let database = databases.get(resource.toString());
						if (!database) {
							database = new class extends TestSessionDatabase {
								override async setMetadataValues(values: Readonly<Record<string, string>>): Promise<void> {
									if (interrupt && interruption === 'claim' && values['vscode.devContainerWorktree.claimed'] === 'true') {
										throw new Error('Interrupted before claim finalization');
									}
									await super.setMetadataValues(values);
								}
							}();
							databases.set(resource.toString(), database);
						}
						return createSessionDataService(database).openDatabase(resource);
					},
					tryOpenDatabase: async resource => {
						const database = databases.get(resource.toString());
						return database ? createSessionDataService(database).openDatabase(resource) : undefined;
					},
					listSessionDataIds: async prefix => [...databases.keys()].map(key => URI.parse(key).path.substring(1)).filter(id => id.startsWith(prefix)),
					deleteSessionData: async resource => { databases.delete(resource.toString()); },
				};
				const logService = new TestLogService();
				const stores: AgentHostSessionStateStore[] = [];
				// Deleting the owner as a session delete does: its state is dropped and tombstoned centrally, then its data.
				const deleteOwner = async () => {
					for (const store of stores) {
						const deletion = store.beginDeletion(sessionUri);
						await deletion.whenDrained;
						deletion.dispose();
					}
					await centralDatabase.tombstoneAndUnregisterSession(sessionUri.toString());
					await service.deleteSessionData(sessionUri);
				};
				const first = createIsolation(disposables, { sessionDataService: service, logService, centralDatabase, stores });
				const worktree = await first.resolveForWorkspaceConversion({
					sessionUri, sessionId, workingDirectory: repoRoot,
					config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
				});
				assert.ok(worktree);
				if (interruption === 'registration') {
					await assert.rejects(first.retainSessionWorktree(sessionUri, sessionId), /Interrupted before owner registration/);
				} else {
					await first.retainSessionWorktree(sessionUri, sessionId);
					assert.ok(logService.warnings.some(warning => warning.includes('reconciliation will retry')));
				}
				const provisional = [...databases.entries()].find(([key]) => key !== sessionUri.toString());
				assert.ok(provisional);
				assert.deepStrictEqual({
					claimed: await provisional[1].getMetadata('vscode.devContainerWorktree.claimed'),
					owned: (await first.prepareSessionDeletion(sessionUri, sessionId))?.worktree.toString(),
					retained: (await readTestSessionAdditionalWorktrees(service, sessionUri)).length,
					exists: existsSync(worktree.fsPath), removed: removeCalls,
				}, {
					claimed: 'false',
					owned: interruption === 'registration' ? worktree.toString() : undefined,
					retained: interruption === 'registration' ? 0 : 1,
					exists: true, removed: [],
				});

				interrupt = false;
				if (retryBeforeRestart === 'delete owner') {
					await provisional[1].setMetadata('vscode.devContainerWorktree.createdAt', '0');
					await deleteOwner();
					const restored = createIsolation(disposables, { sessionDataService: service, centralDatabase, stores });
					await timeout(20);
					await restored.reconcileDetachedWorktrees('unrelated-scope', []);
					assert.deepStrictEqual({
						exists: existsSync(worktree.fsPath), records: databases.size,
						removed: removeCalls.map(call => ({ path: call.worktree.toString(), force: call.force })),
					}, { exists: false, records: 0, removed: [{ path: worktree.toString(), force: false }] });
					return;
				}
				if (retryBeforeRestart) {
					await first.retainSessionWorktree(sessionUri, sessionId);
				}
				const restored = createIsolation(disposables, { sessionDataService: service, centralDatabase, stores });
				await timeout(20);
				await restored.reconcileDetachedWorktrees('unrelated-scope', []);
				assert.deepStrictEqual({
					exists: existsSync(worktree.fsPath), removed: removeCalls,
					records: databases.size - 1,
					original: (await restored.prepareSessionDeletion(sessionUri, sessionId))?.worktree.toString(),
				}, {
					exists: true, removed: [],
					records: interruption === 'registration' && !retryBeforeRestart ? 0 : 1,
					original: interruption === 'registration' && !retryBeforeRestart ? worktree.toString() : undefined,
				});

				await restored.retainSessionWorktree(sessionUri, sessionId);
				const retained = await readTestSessionAdditionalWorktrees(service, sessionUri);
				assert.strictEqual(retained.length, 1);
				const handle = retained[0].handle;
				await restored.recordAdoptedWorktreeMetadata(sessionUri, {
					branchName, baseBranch: 'main', worktreePath: worktree, repositoryRoot: repoRoot,
				});
				await restored.retainSessionWorktree(sessionUri, sessionId);
				assert.deepStrictEqual((await readTestSessionAdditionalWorktrees(service, sessionUri)).map(record => record.handle), [handle]);
				const record = databases.get(detachedWorktreeRecordUri(handle).toString());
				assert.ok(record);
				await record.setMetadata('vscode.devContainerWorktree.createdAt', '0');
				await deleteOwner();
				hasUncommittedChanges = true;
				createIsolation(disposables, { sessionDataService: service, centralDatabase, stores });
				await timeout(20);
				assert.deepStrictEqual({ exists: existsSync(worktree.fsPath), records: databases.size, removed: removeCalls }, {
					exists: true, records: 1, removed: [],
				});
				hasUncommittedChanges = false;
				await restored.reconcileDetachedWorktrees('unrelated-scope', []);
				await restored.reconcileDetachedWorktrees('unrelated-scope', []);
				assert.deepStrictEqual({
					exists: existsSync(worktree.fsPath), records: databases.size,
					removed: removeCalls.map(call => ({ path: call.worktree.toString(), force: call.force })),
				}, { exists: false, records: 0, removed: [{ path: worktree.toString(), force: false }] });
			});
		}
	}

	test('concurrent config resolutions share Git reads but later calls see changed branches', async () => {
		let rootReads = 0;
		let currentBranch = 'first';
		const isolation = createIsolation(disposables, {
			gitService: {
				...createGitService(),
				getRepositoryRoot: async () => { rootReads++; return repoRoot; },
				getHEAD: async () => localBranch(currentBranch),
			}
		});
		const request = { workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder' } };
		const first = await Promise.all([isolation.resolveIsolationConfig(request), isolation.resolveIsolationConfig(request)]);
		assert.deepStrictEqual(first.map(result => result.branchValue), ['first', 'first']);
		assert.strictEqual(rootReads, 1);
		currentBranch = 'second';
		assert.strictEqual((await isolation.resolveIsolationConfig(request)).branchValue, 'second');
		assert.strictEqual(rootReads, 2);
	});

	test('reads HEAD and the default branch concurrently after validating the commit', async () => {
		const finishHEAD = new DeferredPromise<IBranch>();
		const calls: string[] = [];
		const isolation = createIsolation(disposables, {
			gitService: {
				...createGitService(),
				revParse: async () => { calls.push('HEAD'); return headCommit; },
				getHEAD: () => { calls.push('head'); return finishHEAD.p; },
				getDefaultBranch2: async () => { calls.push('default'); return undefined; },
			}
		});
		const resolution = isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder' } });
		let callsBeforeCompletingHEAD: string[];
		try {
			await timeout(0);
			callsBeforeCompletingHEAD = [...calls];
		} finally {
			finishHEAD.complete(localBranch('feature'));
		}
		const result = await resolution;
		assert.deepStrictEqual({ callsBeforeCompletingHEAD, branch: result.branchValue }, {
			callsBeforeCompletingHEAD: ['HEAD', 'head', 'default'],
			branch: 'feature',
		});
	});

	test('skips branch reads for an unborn HEAD', async () => {
		const calls: string[] = [];
		const isolation = createIsolation(disposables, {
			gitService: {
				...createGitService(),
				revParse: async () => undefined,
				getHEAD: async () => { calls.push('head'); return localBranch('feature'); },
				getDefaultBranch2: async () => { calls.push('default'); return undefined; },
			}
		});
		const result = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: undefined });
		assert.deepStrictEqual({ calls, isolation: result.isolationValue, branch: result.branchValue }, {
			calls: [], isolation: 'folder', branch: undefined,
		});
	});

	test('detached checkout offers worktree isolation from HEAD without a default branch', async () => {
		const isolation = createIsolation(disposables, {
			gitService: {
				...createGitService(),
				getHEAD: async () => ({ name: headCommit!, kind: GitRefType.DetachedHead }),
				getDefaultBranch2: async () => undefined,
			}
		});
		const result = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: undefined });
		assert.deepStrictEqual({ isolation: result.isolationValue, isolationValues: result.isolationProperty.protocol.enum, branch: result.branchValue }, {
			isolation: 'worktree', isolationValues: ['folder', 'worktree'], branch: headCommit,
		});
	});

	test('failed shared Git reads do not poison subsequent config resolutions', async () => {
		let rootReads = 0;
		const failure = new Error('Git unavailable');
		const isolation = createIsolation(disposables, {
			gitService: {
				...createGitService(),
				getRepositoryRoot: async () => { if (++rootReads === 1) { throw failure; } return repoRoot; },
			}
		});
		const request = { workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder' } };
		const results = await Promise.allSettled([isolation.resolveIsolationConfig(request), isolation.resolveIsolationConfig(request)]);
		assert.ok(results.every(result => result.status === 'rejected' && result.reason === failure));
		assert.strictEqual(rootReads, 1);
		assert.strictEqual((await isolation.resolveIsolationConfig(request)).branchValue, 'feature');
		assert.strictEqual(rootReads, 2);
	});

	for (const failingRead of ['HEAD', 'default branch'] as const) {
		test(`a failed ${failingRead} read is surfaced and retried`, async () => {
			const failure = new Error('Git unavailable');
			let fail = true;
			const isolation = createIsolation(disposables, {
				gitService: {
					...createGitService(),
					getHEAD: async () => {
						if (fail && failingRead === 'HEAD') {
							throw failure;
						}
						return localBranch('feature');
					},
					getDefaultBranch2: async () => {
						if (fail && failingRead === 'default branch') {
							throw failure;
						}
						return undefined;
					},
				}
			});
			const request = { workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder' } };
			const failed = await Promise.allSettled([isolation.resolveIsolationConfig(request)]);
			fail = false;
			const recovered = await isolation.resolveIsolationConfig(request);
			assert.deepStrictEqual({ failed, branch: recovered.branchValue }, {
				failed: [{ status: 'rejected', reason: failure }],
				branch: 'feature',
			});
		});
	}

	test('a branch switch during an in-flight read is visible on the next fresh config read', async () => {
		const branchRead = new DeferredPromise<void>();
		const finishRead = new DeferredPromise<void>();
		let currentBranch = 'before-switch';
		const isolation = createIsolation(disposables, {
			gitService: {
				...createGitService(),
				getHEAD: async () => { branchRead.complete(); return localBranch(currentBranch); },
				getDefaultBranch2: async () => { await finishRead.p; return localBranch('main'); },
			}
		});
		const request = { workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder' } };
		const first = isolation.resolveIsolationConfig(request);
		await branchRead.p;
		currentBranch = 'after-switch';
		const overlapping = isolation.resolveIsolationConfig(request);
		finishRead.complete();
		const results = await Promise.all([first, overlapping]);
		assert.deepStrictEqual({
			overlappingBranches: results.map(result => result.branchValue),
			freshBranch: (await isolation.resolveIsolationConfig(request)).branchValue,
		}, { overlappingBranches: ['before-switch', 'before-switch'], freshBranch: 'after-switch' });
	});

	test('isolation configuration refreshes a cached non-repository after external git init', async () => {
		let repositoryInitialized = false;
		let cachedRoot: URI | undefined;
		const gitService: IAgentHostGitService = {
			...createGitService(),
			getRepositoryRoot: async (_directory, options) => {
				if (options?.refreshIfNone) {
					cachedRoot = repositoryInitialized ? repoRoot : undefined;
				}
				return cachedRoot;
			},
		};
		const isolation = createIsolation(disposables, { gitService });
		const before = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: undefined });
		repositoryInitialized = true;
		const after = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: undefined });

		assert.deepStrictEqual({
			before: before.isolationProperty.protocol.enum,
			after: after.isolationProperty.protocol.enum,
		}, {
			before: ['folder'],
			after: ['folder', 'worktree'],
		});
	});

	test('resolveIsolationConfig advertises folder/worktree + branch based on git state', async () => {
		const isolation = createIsolation(disposables);

		const noRepo = await isolation.resolveIsolationConfig({ workingDirectory: undefined, config: undefined });
		const repoWorktree = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: undefined });
		const repoWorktreeSelected = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'feature' } });
		const repoFolder = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder' } });
		const repoFolderSelected = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder', [SessionConfigKey.Branch]: 'main' } });
		const repoPullRequest = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder', [SessionConfigKey.PullRequestUrl]: 'https://github.com/microsoft/vscode/pull/1' } });
		const noRepoPullRequest = await isolation.resolveIsolationConfig({ workingDirectory: undefined, config: { [SessionConfigKey.PullRequestUrl]: 'https://github.com/microsoft/vscode/pull/1' } });
		headCommit = undefined; // unborn HEAD (no commits)
		const noCommits = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: undefined });

		assert.deepStrictEqual({
			noRepo: { enum: noRepo.isolationProperty.protocol.enum, value: noRepo.isolationValue, branch: noRepo.branchProperty, prefix: noRepo.worktreeBranchPrefixProperty, includeFiles: noRepo.worktreeIncludeFilesProperty, symlinkFolders: noRepo.worktreeSymlinkFoldersProperty, pullRequestUrlReadOnly: noRepo.pullRequestUrlProperty.protocol.readOnly },
			repoWorktree: { enum: repoWorktree.isolationProperty.protocol.enum, value: repoWorktree.isolationValue, branchDefault: repoWorktree.branchDefault, branchDynamic: repoWorktree.branchProperty?.protocol.enumDynamic, branchReadOnly: repoWorktree.branchProperty?.protocol.readOnly, prefixReadOnly: repoWorktree.worktreeBranchPrefixProperty?.protocol.readOnly, includeFilesReadOnly: repoWorktree.worktreeIncludeFilesProperty?.protocol.readOnly, symlinkFoldersReadOnly: repoWorktree.worktreeSymlinkFoldersProperty?.protocol.readOnly, pullRequestUrlReadOnly: repoWorktree.pullRequestUrlProperty.protocol.readOnly },
			repoWorktreeSelected: { branchDefault: repoWorktreeSelected.branchDefault, branchValue: repoWorktreeSelected.branchValue, branchEnum: repoWorktreeSelected.branchProperty?.protocol.enum },
			repoFolder: { value: repoFolder.isolationValue, branchDefault: repoFolder.branchDefault, branchDynamic: repoFolder.branchProperty?.protocol.enumDynamic, branchReadOnly: repoFolder.branchProperty?.protocol.readOnly, hasPrefix: !!repoFolder.worktreeBranchPrefixProperty, hasIncludeFiles: !!repoFolder.worktreeIncludeFilesProperty, hasSymlinkFolders: !!repoFolder.worktreeSymlinkFoldersProperty },
			repoFolderSelected: { branchDefault: repoFolderSelected.branchDefault, branchValue: repoFolderSelected.branchValue },
			repoPullRequest: repoPullRequest.isolationValue,
			noRepoPullRequest: noRepoPullRequest.isolationValue,
			noCommits: { enum: noCommits.isolationProperty.protocol.enum, value: noCommits.isolationValue, branch: noCommits.branchProperty, prefix: noCommits.worktreeBranchPrefixProperty, includeFiles: noCommits.worktreeIncludeFilesProperty, symlinkFolders: noCommits.worktreeSymlinkFoldersProperty, pullRequestUrlReadOnly: noCommits.pullRequestUrlProperty.protocol.readOnly },
		}, {
			noRepo: { enum: ['folder'], value: 'folder', branch: undefined, prefix: undefined, includeFiles: undefined, symlinkFolders: undefined, pullRequestUrlReadOnly: true },
			repoWorktree: { enum: ['folder', 'worktree'], value: 'worktree', branchDefault: 'main', branchDynamic: true, branchReadOnly: false, prefixReadOnly: true, includeFilesReadOnly: true, symlinkFoldersReadOnly: true, pullRequestUrlReadOnly: true },
			repoWorktreeSelected: { branchDefault: 'main', branchValue: 'feature', branchEnum: ['main'] },
			repoFolder: { value: 'folder', branchDefault: 'feature', branchDynamic: true, branchReadOnly: false, hasPrefix: true, hasIncludeFiles: true, hasSymlinkFolders: true },
			repoFolderSelected: { branchDefault: 'feature', branchValue: 'main' },
			repoPullRequest: 'worktree',
			noRepoPullRequest: 'folder',
			noCommits: { enum: ['folder'], value: 'folder', branch: undefined, prefix: undefined, includeFiles: undefined, symlinkFolders: undefined, pullRequestUrlReadOnly: true },
		});
	});

	test('branchCompletions returns current then default then recent git branches, empty without a working directory', async () => {
		const isolation = createIsolation(disposables);
		assert.deepStrictEqual({
			withDir: await isolation.branchCompletions(repoRoot),
			noDir: await isolation.branchCompletions(undefined),
		}, {
			withDir: { items: [{ value: 'feature', label: 'feature' }, { value: 'main', label: 'main' }] },
			noDir: { items: [] },
		});
	});

	test('defaults worktree isolation to the default branch start point', async () => {
		const gitService = createGitService();
		let defaultBranch = localBranch('main', 'origin/main');
		gitService.getDefaultBranch2 = async () => defaultBranch;
		const isolation = createIsolation(disposables, { gitService });
		const checked = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree' } });
		const folder = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder' } });
		const explicit = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'feature' } });
		defaultBranch = localBranch('main');
		const localFallback = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree' } });

		assert.deepStrictEqual({
			checked: { value: checked.branchValue, default: checked.branchProperty?.protocol.default, enum: checked.branchProperty?.protocol.enum },
			folder: { value: folder.branchValue, default: folder.branchProperty?.protocol.default },
			explicit: { value: explicit.branchValue, default: explicit.branchProperty?.protocol.default },
			localFallback: localFallback.branchValue,
		}, {
			checked: { value: 'origin/main', default: 'origin/main', enum: ['origin/main'] },
			folder: { value: 'feature', default: 'feature' },
			explicit: { value: 'feature', default: 'origin/main' },
			localFallback: 'main',
		});
	});

	test('branchCompletions returns all branches in priority order', async () => {
		const gitService = createGitService();
		gitService.getBranches = async () => [
			...Array.from({ length: 35 }, (_, index) => ({
				ref: `refs/heads/branch-${index}`,
				name: `branch-${index}`,
				kind: GitRefType.Head as const,
			})),
			{ ref: 'refs/heads/main', name: 'main', kind: GitRefType.Head },
			{ ref: 'refs/heads/feature', name: 'feature', kind: GitRefType.Head },
		];
		const isolation = createIsolation(disposables, { gitService });

		const all = await isolation.branchCompletions(repoRoot);

		assert.deepStrictEqual(all.items.map(item => item.value), ['feature', 'main', ...Array.from({ length: 35 }, (_, index) => `branch-${index}`)]);
	});

	test('uses the selected local default branch as the worktree start point', async () => {
		const gitService = createGitService();
		gitService.getDefaultBranch2 = async () => localBranch('main');
		const isolation = createIsolation(disposables, { gitService });

		const config = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: undefined });
		await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: repoRoot,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'main',
			},
			prompt: 'do a thing',
		});

		assert.deepStrictEqual({
			branchDefault: config.branchDefault,
			branchEnum: config.branchProperty?.protocol.enum,
			startPoint: addWorktreeCalls[0]?.commitish,
			diffBaseBranch: await db.getMetadata('agentHost.diffBaseBranch'),
		}, {
			branchDefault: 'main',
			branchEnum: ['main'],
			startPoint: 'main',
			diffBaseBranch: 'main',
		});
	});

	test('uses an explicitly selected remote branch as the worktree start point', async () => {
		const gitService = createGitService();
		const operations: string[] = [];
		gitService.getBranch = async (_root, name) => {
			operations.push(`resolve:${name}`);
			return {
				ref: `refs/remotes/${name}`,
				name,
				remote: 'origin',
				kind: GitRefType.RemoteHead,
			};
		};
		gitService.fetch = async (_root, branch) => {
			operations.push(`fetch:${branch.remote}:${branch.ref}`);
		};
		gitService.addWorktree = async (_root, options) => {
			operations.push(`add:${options.commitish}`);
			addWorktreeCalls.push(options);
			mkdirSync(options.path.fsPath, { recursive: true });
		};
		const isolation = createIsolation(disposables, { gitService });
		await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: repoRoot,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'origin/main',
			},
			prompt: 'do a thing',
		});

		assert.deepStrictEqual({
			startPoint: addWorktreeCalls[0]?.commitish,
			diffBaseBranch: await db.getMetadata('agentHost.diffBaseBranch'),
			operations,
		}, {
			startPoint: 'origin/main',
			diffBaseBranch: 'main',
			operations: ['resolve:origin/main', 'fetch:origin:refs/remotes/origin/main', 'add:origin/main'],
		});
	});

	test('continues creating the worktree when fetching the selected remote fails', async () => {
		const gitService = createGitService();
		const logService = new TestLogService();
		const operations: string[] = [];
		const fetchTimeouts: (number | undefined)[] = [];
		gitService.getBranch = async (_root, name) => ({
			ref: `refs/remotes/${name}`,
			name,
			remote: 'origin',
			kind: GitRefType.RemoteHead,
		});
		gitService.fetch = async (_root, branch, options) => {
			fetchTimeouts.push(options?.timeout);
			operations.push(`fetch:${branch.remote}:${branch.ref}`);
			throw new Error('network unavailable');
		};
		gitService.addWorktree = async (_root, options) => {
			operations.push(`add:${options.commitish}`);
			addWorktreeCalls.push(options);
			mkdirSync(options.path.fsPath, { recursive: true });
		};
		const isolation = createIsolation(disposables, { gitService, logService });

		const worktree = await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: repoRoot,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'origin/main',
			},
			prompt: 'do a thing',
		});

		assert.deepStrictEqual({
			worktree: worktree?.toString(),
			operations,
			fetchTimeouts,
			warnings: logService.warnings,
		}, {
			worktree: URI.joinPath(worktreesRoot, 'my-feature').toString(),
			operations: ['fetch:origin:refs/remotes/origin/main', 'add:origin/main'],
			fetchTimeouts: [undefined],
			warnings: [`[AgentHost:s1] Failed to fetch remote 'origin' before creating worktree: network unavailable`],
		});
	});

	function createPullRequestResolver(overrides?: Partial<IResolvedPullRequest>): IAgentHostPullRequestResolver {
		return {
			_serviceBrand: undefined,
			captureSessionCredentialSource: (_session, source) => source,
			resolve: async url => ({ url, webHost: 'github.com', owner: 'microsoft', repo: 'vscode', number: 42, headRef: 'feature/pr', baseRef: 'main', ...overrides }),
		};
	}

	for (const kind of ['branch', 'pullRequest'] as const) {
		test(`${kind} worktree creation refreshes a cached non-repository after external git init`, async () => {
			let repositoryInitialized = false;
			let cachedRoot: URI | undefined;
			const refreshes: (boolean | undefined)[] = [];
			const gitService: IAgentHostGitService = {
				...createGitService(),
				getRepositoryRoot: async (_directory, options) => {
					refreshes.push(options?.refreshIfNone);
					if (options?.refreshIfNone) {
						cachedRoot = repositoryInitialized ? repoRoot : undefined;
					}
					return cachedRoot;
				},
				getFetchRemotes: async () => [{ name: 'origin', url: 'git@github.com:microsoft/vscode.git' }],
				fetch: async () => { },
			};
			await gitService.getRepositoryRoot(repoRoot);
			repositoryInitialized = true;
			const isolation = createIsolation(disposables, { gitService, pullRequestResolver: createPullRequestResolver() });

			const worktree = await isolation.resolveWorkingDirectory({
				sessionUri,
				sessionId,
				workingDirectory: repoRoot,
				config: {
					[SessionConfigKey.Isolation]: 'worktree',
					[SessionConfigKey.Branch]: 'main',
					...(kind === 'pullRequest' ? { [SessionConfigKey.PullRequestUrl]: 'https://github.com/microsoft/vscode/pull/42' } : {}),
				},
			});

			assert.deepStrictEqual({ worktree: worktree?.toString(), refreshes }, {
				worktree: URI.joinPath(worktreesRoot, kind === 'pullRequest' ? 'pr-42-s1' : 'my-feature').toString(),
				refreshes: [undefined, true],
			});
		});
	}

	test('checks out a pull request on a new session branch tracking its head and diffs against its base', async () => {
		// A local branch named after the pull request is never touched.
		branchExists = true;
		const fetched: { branch: string; timeout: number | undefined }[] = [];
		const gitService: IAgentHostGitService = {
			...createGitService(),
			getFetchRemotes: async () => [
				// A fork workflow: the pull request's repository is not `origin`.
				{ name: 'origin', url: 'git@github.com:someone/vscode.git' },
				{ name: 'upstream', url: 'ssh://git@ssh.github.com:443/Microsoft/VSCode.git' },
			],
			fetch: async (_root, branch, options) => { fetched.push({ branch: branch.name, timeout: options?.timeout }); },
		};
		const isolation = createIsolation(disposables, {
			gitService,
			pullRequestResolver: createPullRequestResolver(),
			branchNameGenerator: { _serviceBrand: undefined, generateBranchName: async () => { throw new Error('should not generate a branch'); } },
		});

		const request = {
			sessionUri,
			sessionId,
			workingDirectory: repoRoot,
			// The pull request wins over a stale folder isolation selection.
			config: { [SessionConfigKey.Isolation]: 'folder', [SessionConfigKey.PullRequestUrl]: 'https://github.com/microsoft/vscode/pull/42' },
		};
		const worktree = await isolation.resolveWorkingDirectory(request);
		const again = await isolation.resolveWorkingDirectory(request);

		assert.deepStrictEqual({
			worktree: worktree?.toString(),
			again: again?.toString(),
			fetched,
			addWorktreeArgs: addWorktreeCalls.map(call => ({ commitish: call.commitish, newBranchName: call.newBranchName, track: call.track })),
			branchName: await db.getMetadata('copilot.worktree.branchName'),
			diffBaseBranch: await db.getMetadata(META_DIFF_BASE_BRANCH),
		}, {
			worktree: URI.joinPath(worktreesRoot, 'pr-42-s1').toString(),
			again: URI.joinPath(worktreesRoot, 'pr-42-s1').toString(),
			fetched: [{ branch: 'upstream/feature/pr', timeout: 60_000 }, { branch: 'upstream/main', timeout: 60_000 }],
			addWorktreeArgs: [{ commitish: 'upstream/feature/pr', newBranchName: 'agents/pr-42-s1', track: true }],
			branchName: 'agents/pr-42-s1',
			diffBaseBranch: 'upstream/main',
		});
	});

	test('names the pull request session branch with the client branch prefix', async () => {
		const isolation = createIsolation(disposables, {
			gitService: {
				...createGitService(),
				getFetchRemotes: async () => [{ name: 'origin', url: 'git@github.com:microsoft/vscode.git' }],
				fetch: async () => { },
			},
			pullRequestResolver: createPullRequestResolver(),
		});

		const worktree = await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.PullRequestUrl]: 'https://github.com/microsoft/vscode/pull/42', [SessionConfigKey.WorktreeBranchPrefix]: 'user/' },
		});

		assert.deepStrictEqual({
			worktree: worktree?.toString(),
			newBranchNames: addWorktreeCalls.map(call => call.newBranchName),
		}, {
			worktree: URI.joinPath(worktreesRoot, 'pr-42-s1').toString(),
			newBranchNames: ['user/agents/pr-42-s1'],
		});
	});

	test('pull request checkout failures reject instead of falling back to the folder', async () => {
		const config = { [SessionConfigKey.PullRequestUrl]: 'https://github.com/microsoft/vscode/pull/42' };
		const failureOf = async (options: { readonly gitService?: Partial<IAgentHostGitService>; readonly workingDirectory?: URI; readonly resolver?: IAgentHostPullRequestResolver; readonly pullRequestUrl?: string }): Promise<string> => {
			const store = new DisposableStore();
			try {
				const isolation = createIsolation(store, {
					gitService: {
						...createGitService(),
						getFetchRemotes: async () => [{ name: 'origin', url: 'git@github.com:microsoft/vscode.git' }],
						fetch: async () => { },
						...options.gitService,
					},
					pullRequestResolver: options.resolver ?? createPullRequestResolver(),
				});
				await isolation.resolveWorkingDirectory({
					sessionUri,
					sessionId,
					workingDirectory: options.workingDirectory ?? repoRoot,
					config: options.pullRequestUrl === undefined ? config : { [SessionConfigKey.PullRequestUrl]: options.pullRequestUrl },
				});
				return 'resolved';
			} catch (error) {
				return (error as Error).message;
			} finally {
				store.dispose();
			}
		};

		assert.deepStrictEqual({
			notRepository: await failureOf({ gitService: { getRepositoryRoot: async () => undefined }, workingDirectory: URI.file('/plain') }),
			emptyUrl: await failureOf({ pullRequestUrl: '', resolver: { ...nullPullRequestResolver, resolve: async url => { throw new Error(`Invalid pull request URL: '${url}'`); } } }),
			resolveFailure: await failureOf({ resolver: { ...nullPullRequestResolver, resolve: async () => { throw new Error('Pull request #42 has already been merged.'); } } }),
			noMatchingRemote: await failureOf({ gitService: { getFetchRemotes: async () => [{ name: 'origin', url: 'https://github.com/someone/vscode.git' }] } }),
			wrongHost: await failureOf({ gitService: { getFetchRemotes: async () => [{ name: 'origin', url: 'https://example.com/microsoft/vscode.git' }] } }),
			fetchFailure: await failureOf({ gitService: { fetch: async () => { throw new Error('couldn\'t find remote ref'); } } }),
		}, {
			notRepository: `The workspace folder '${URI.file('/plain').fsPath}' is not a Git repository.`,
			emptyUrl: 'Invalid pull request URL: \'\'',
			resolveFailure: 'Pull request #42 has already been merged.',
			noMatchingRemote: 'Pull request #42 belongs to microsoft/vscode, but the workspace repository has no remote for it.',
			wrongHost: 'Pull request #42 belongs to microsoft/vscode, but the workspace repository has no remote for it.',
			fetchFailure: 'Couldn\'t fetch branch \'feature/pr\' of pull request #42 from remote \'origin\': couldn\'t find remote ref',
		});
	});

	test('resolveWorkingDirectory creates a worktree, persists metadata, queues the announcement, and is idempotent', async () => {
		const isolation = createIsolation(disposables);
		const config = { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' };

		isolation.notePending(sessionId);
		const first = await isolation.resolveOnFirstSend({ sessionUri, sessionId, workingDirectory: repoRoot, config, prompt: 'do a thing' });
		const meta = await isolation.readWorktreeMetadata(sessionUri);
		const announcement = isolation.takePendingAnnouncement(sessionId);
		const second = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config, prompt: 'do a thing' });

		const expectedWorktree = URI.joinPath(worktreesRoot, getWorktreeName(branchName));
		assert.deepStrictEqual({
			returnedWorktree: first!.toString(),
			addWorktreeCallCount: addWorktreeCalls.length,
			addWorktreeArgs: addWorktreeCalls.map(c => ({ worktree: c.path.toString(), branchName: c.newBranchName, startPoint: c.commitish })),
			metaBranch: meta?.branchName,
			metaWorktree: meta?.worktreePath?.toString(),
			metaRepo: meta?.repositoryRoot?.toString(),
			announcementHasBranch: announcement?.includes(branchName) ?? false,
			secondTakeAnnouncement: isolation.takePendingAnnouncement(sessionId),
			idempotentReturn: second!.toString(),
			resolvedWorktree: isolation.getResolvedWorktree(sessionId)?.toString(),
			pending: isolation.isWorkingDirectoryPending(sessionId),
			creationError: isolation.getCreationError(sessionId),
		}, {
			returnedWorktree: expectedWorktree.toString(),
			addWorktreeCallCount: 1,
			addWorktreeArgs: [{ worktree: expectedWorktree.toString(), branchName, startPoint: 'main' }],
			metaBranch: branchName,
			metaWorktree: expectedWorktree.toString(),
			metaRepo: repoRoot.toString(),
			announcementHasBranch: true,
			secondTakeAnnouncement: undefined,
			idempotentReturn: expectedWorktree.toString(),
			resolvedWorktree: expectedWorktree.toString(),
			pending: false,
			creationError: undefined,
		});
	});

	test('resolveOnFirstSend serializes and latches concurrent creation failures', async () => {
		const gitService = createGitService();
		gitService.addWorktree = async (_root, options) => {
			addWorktreeCalls.push(options);
			throw new Error('git-lfs: command not found');
		};
		const isolation = createIsolation(disposables, { gitService });
		const request = { sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } };
		isolation.notePending(sessionId);
		let firstError: Error | undefined;
		let secondError: Error | undefined;

		await Promise.all([
			assert.rejects(isolation.resolveOnFirstSend(request), (error: Error) => {
				firstError = error;
				return /git-lfs: command not found/.test(error.message);
			}),
			assert.rejects(isolation.resolveOnFirstSend(request), (error: Error) => {
				secondError = error;
				return /git-lfs: command not found/.test(error.message);
			}),
		]);

		assert.deepStrictEqual({
			addWorktreeCalls: addWorktreeCalls.length,
			sameError: firstError === secondError,
			latchedError: isolation.getCreationError(sessionId) === firstError,
			pending: isolation.isWorkingDirectoryPending(sessionId),
			message: firstError?.message,
		}, {
			addWorktreeCalls: 1,
			sameError: true,
			latchedError: true,
			pending: true,
			message: 'Couldn\'t create the isolated worktree. This session cannot continue. Start a new session to try again.\n\ngit-lfs: command not found',
		});
	});

	test('session deletion clears a latched worktree creation failure', async () => {
		const gitService = createGitService();
		gitService.addWorktree = async () => { throw new Error('creation failed'); };
		const isolation = createIsolation(disposables, { gitService });
		const request = { sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } };
		isolation.notePending(sessionId);

		await assert.rejects(isolation.resolveOnFirstSend(request), /creation failed/);
		const errorBeforeDeletion = isolation.getCreationError(sessionId);
		await isolation.removeSessionWorktree(sessionId, undefined);

		assert.deepStrictEqual({
			errorBeforeDeletion: errorBeforeDeletion?.message,
			errorAfterDeletion: isolation.getCreationError(sessionId),
			pending: isolation.isWorkingDirectoryPending(sessionId),
		}, {
			errorBeforeDeletion: 'Couldn\'t create the isolated worktree. This session cannot continue. Start a new session to try again.\n\ncreation failed',
			errorAfterDeletion: undefined,
			pending: false,
		});
	});

	test('resolveForWorkspaceConversion does not latch creation failures', async () => {
		const gitService = createGitService();
		gitService.addWorktree = async (_root, options) => {
			addWorktreeCalls.push(options);
			if (addWorktreeCalls.length === 1) {
				throw new Error('transient git failure');
			}
		};
		const isolation = createIsolation(disposables, { gitService });
		const request = { sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } };

		await assert.rejects(isolation.resolveForWorkspaceConversion(request), /transient git failure/);
		const errorAfterFailure = isolation.getCreationError(sessionId);
		const resolved = await isolation.resolveForWorkspaceConversion(request);

		assert.deepStrictEqual({
			addWorktreeCalls: addWorktreeCalls.length,
			errorAfterFailure,
			resolved: resolved?.toString(),
			creationError: isolation.getCreationError(sessionId),
		}, {
			addWorktreeCalls: 2,
			errorAfterFailure: undefined,
			resolved: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
			creationError: undefined,
		});
	});

	test('detached worktree lifecycle is addressed by an opaque handle', async () => {
		const isolation = createIsolation(disposables);
		const created = await isolation.createDetachedWorktree({
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'do a thing',
		});
		await isolation.claimDetachedWorktree(created.handle);
		const cleanup = createTestWorktreeCleanupService(disposables, isolation);

		await cleanup.setDetachedWorktreeArchived(created.handle, true);
		await cleanup.runPass();
		const existsAfterArchive = existsSync(created.worktree.fsPath);
		await cleanup.setDetachedWorktreeArchived(created.handle, false);
		const existsAfterUnarchive = existsSync(created.worktree.fsPath);
		await cleanup.deleteDetachedWorktree(created.handle);
		await cleanup.runPass();

		assert.deepStrictEqual({
			handleIsUuid: /^[0-9a-f-]{36}$/.test(created.handle),
			worktree: created.worktree.toString(),
			existsAfterArchive,
			existsAfterUnarchive,
			addExistingCalls: addExistingCalls.map(call => ({ worktree: call.worktree.toString(), branchName: call.branchName })),
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
		}, {
			handleIsUuid: true,
			worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
			existsAfterArchive: false,
			existsAfterUnarchive: true,
			addExistingCalls: [{ worktree: created.worktree.toString(), branchName }],
			removeCalls: [
				{ worktree: created.worktree.toString(), force: true },
				{ worktree: created.worktree.toString(), force: true },
			],
		});
	});

	test('detached worktree persists the default diff base before creation completes', async () => {
		let diffBaseWrites = 0;
		db = new class extends TestSessionDatabase {
			override async setMetadata(key: string, value: string): Promise<void> {
				if (key === META_DIFF_BASE_BRANCH && ++diffBaseWrites === 2) {
					throw new Error('Late metadata persistence failed');
				}
				await super.setMetadata(key, value);
			}
		}();
		const gitService = createGitService();
		gitService.getDefaultBranch2 = async () => ({ ref: 'refs/remotes/origin/main', name: 'origin/main', remote: 'origin', kind: GitRefType.RemoteHead });
		const isolation = createIsolation(disposables, { gitService });

		await isolation.createDetachedWorktree({
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'feature' },
			prompt: 'do a thing',
		});

		assert.deepStrictEqual({
			startPoint: addWorktreeCalls[0]?.commitish,
			diffBaseBranch: await db.getMetadata(META_DIFF_BASE_BRANCH),
		}, {
			startPoint: 'feature',
			diffBaseBranch: 'origin/main',
		});
	});

	test('a detached worktree record keeps its metadata in its own database, never as session state', async () => {
		const centralDatabase = disposables.add(new AgentHostDatabase(':memory:'));
		const stores: AgentHostSessionStateStore[] = [];
		const isolation = createIsolation(disposables, { centralDatabase, stores });
		const created = await isolation.createDetachedWorktree({
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'do a thing',
		});
		const record = detachedWorktreeRecordUri(created.handle);

		assert.deepStrictEqual({
			worktree: (await isolation.readWorktreeMetadata(record))?.worktreePath?.toString(),
			centralState: await centralDatabase.readSessionState(record.toString()),
			load: await stores[0].load(record).then(() => 'loaded', error => error instanceof SessionStateNotASessionError ? 'rejected' : String(error)),
		}, {
			worktree: created.worktree.toString(),
			centralState: undefined,
			load: 'rejected',
		});
		const cleanup = createTestWorktreeCleanupService(disposables, isolation);
		await cleanup.deleteDetachedWorktree(created.handle);
		await cleanup.runPass();
	});

	test('persists session worktree creation failure in central state and the mirror', async () => {
		const sessionDataService = createSessionDataService(db);
		const stateStore = disposables.add(createTestSessionStateStore(disposables.add(new AgentHostDatabase(':memory:')), sessionDataService));
		const isolation = disposables.add(new WorktreeIsolation(
			{ _serviceBrand: undefined, generateBranchName: async () => branchName },
			createGitService(),
			nullPullRequestResolver,
			sessionDataService,
			stateStore,
			new NullLogService(),
		));

		await stateStore.load(sessionUri);
		await isolation.persistCreationFailure(sessionUri, sessionId, 'boom');
		await stateStore.whenIdle(undefined);
		const key = 'copilot.worktree.creationFailure';
		assert.deepStrictEqual({
			central: stateStore.legacyMetadata(sessionUri, [key]).values[key],
			mirror: await db.getMetadata(key),
		}, {
			central: JSON.stringify({ sessionId, diagnostic: 'boom' }),
			mirror: JSON.stringify({ sessionId, diagnostic: 'boom' }),
		});
	});

	test('missing detached worktree records do not block remote session lifecycle', async () => {
		const sessionDataService = {
			...createSessionDataService(),
			tryOpenDatabase: async () => undefined,
		};
		const isolation = disposables.add(new WorktreeIsolation(
			{ _serviceBrand: undefined, generateBranchName: async () => branchName },
			createGitService(),
			nullPullRequestResolver,
			sessionDataService,
			disposables.add(createTestSessionStateStore(disposables.add(new AgentHostDatabase(':memory:')), sessionDataService)),
			new NullLogService(),
		));

		const cleanup = createTestWorktreeCleanupService(disposables, isolation);
		await assert.doesNotReject(cleanup.setDetachedWorktreeArchived('00000000-0000-4000-8000-000000000001', true));
		await assert.doesNotReject(cleanup.deleteDetachedWorktree('00000000-0000-4000-8000-000000000001'));
		await assert.doesNotReject(cleanup.runPass());
	});

	test('reconcileDetachedWorktrees prunes only old clean records missing from the remote scope', async () => {
		const { service: sessionDataService, dataIds } = createTrackedSessionDataService();
		const isolation = createIsolation(disposables, { sessionDataService });
		const created = await isolation.createDetachedWorktree({
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'do a thing',
		});
		await isolation.claimDetachedWorktree(created.handle);
		const scope = getComparisonKey(created.worktree);
		await db.setMetadata('vscode.devContainerWorktree.createdAt', '0');

		await isolation.reconcileDetachedWorktrees(scope, [created.handle]);
		await isolation.reconcileDetachedWorktrees('file:///another-repository', []);
		const beforeMissing = [...removeCalls];
		await db.setMetadata('vscode.devContainerWorktree.lastSeenAt', '0');
		await isolation.reconcileDetachedWorktrees(scope, []);

		assert.deepStrictEqual({
			beforeMissing,
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
			dataIds: [...dataIds],
		}, {
			beforeMissing: [],
			removeCalls: [{ worktree: created.worktree.toString(), force: false }],
			dataIds: [],
		});
	});

	test('old unclaimed detached worktrees are reclaimed after restart', async () => {
		const { service: sessionDataService, dataIds } = createTrackedSessionDataService();
		const first = createIsolation(disposables, { sessionDataService });
		const created = await first.createDetachedWorktree({
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'do a thing',
		});
		await db.setMetadata('vscode.devContainerWorktree.createdAt', '0');

		await createIsolation(disposables, { sessionDataService }).cleanupUnclaimedDetachedWorktrees();

		assert.deepStrictEqual({
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
			dataIds: [...dataIds],
		}, {
			removeCalls: [{ worktree: created.worktree.toString(), force: false }],
			dataIds: [],
		});
	});

	test('reconciliation keeps an unclaimed detached worktree its guard reports in use', async () => {
		const { service: sessionDataService, dataIds } = createTrackedSessionDataService();
		const created = await createIsolation(disposables, { sessionDataService }).createDetachedWorktree({
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'do a thing',
		});
		await db.setMetadata('vscode.devContainerWorktree.createdAt', '0');
		const asked: string[] = [];

		await createIsolation(disposables, { sessionDataService }).cleanupUnclaimedDetachedWorktrees(async (handle, worktree) => {
			asked.push(`${handle}:${worktree.toString()}`);
			return false;
		});

		assert.deepStrictEqual({ asked, removeCalls, records: dataIds.size, stillExists: existsSync(created.worktree.fsPath) }, {
			asked: [`${created.handle}:${created.worktree.toString()}`],
			removeCalls: [],
			records: 1,
			stillExists: true,
		});
	});

	test('failed detached worktree deletions are retried after restart', async () => {
		const { service: sessionDataService, dataIds } = createTrackedSessionDataService();
		const gitService = createGitService();
		let deletionAttempts = 0;
		gitService.removeWorktree = async (_root, worktree, options) => {
			removeCalls.push({ worktree, force: options?.force === true });
			deletionAttempts++;
			if (deletionAttempts === 1) {
				throw new Error('transient removal failure');
			}
			rmSync(worktree.fsPath, { recursive: true, force: true });
		};
		const first = createIsolation(disposables, { gitService, sessionDataService });
		const created = await first.createDetachedWorktree({
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'do a thing',
		});
		await first.claimDetachedWorktree(created.handle);
		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const firstCleanup = createTestWorktreeCleanupService(disposables, first, database);
		await firstCleanup.deleteDetachedWorktree(created.handle);
		await firstCleanup.runPass();
		const afterFailure = { deletionAttempts, attempts: (await database.readPendingWorktreeRemoval('detached', created.handle))?.attempts };

		// After a restart, the removal is retried once its backoff elapsed.
		const restarted = disposables.add(new AgentHostWorktreeCleanupService({ now: () => Date.now() + 60 * 60 * 1000 }, database, createIsolation(disposables, { gitService, sessionDataService }), new NullLogService()));
		await restarted.runPass();

		assert.deepStrictEqual({
			afterFailure,
			deletionAttempts,
			dataIds: [...dataIds],
			pending: await database.listPendingWorktreeRemovals(),
		}, {
			afterFailure: { deletionAttempts: 1, attempts: 1 },
			deletionAttempts: 2,
			dataIds: [],
			pending: [],
		});
	});

	test('reconcileDetachedWorktrees drops records whose worktree directory is already gone', async () => {
		const { service: sessionDataService, dataIds } = createTrackedSessionDataService();
		const isolation = createIsolation(disposables, { sessionDataService });
		const created = await isolation.createDetachedWorktree({
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'do a thing',
		});
		await isolation.claimDetachedWorktree(created.handle);
		await db.setMetadata('vscode.devContainerWorktree.lastSeenAt', '0');
		rmSync(created.worktree.fsPath, { recursive: true, force: true });

		await isolation.reconcileDetachedWorktrees(getComparisonKey(created.worktree), []);

		assert.deepStrictEqual({ dataIds: [...dataIds], removeCalls }, { dataIds: [], removeCalls: [] });
	});

	function createOwnedRecordsHarness(unopenable: Set<string> = new Set(), centralDatabase?: AgentHostDatabase) {
		const databases = new Map<string, TestSessionDatabase>();
		const base = createSessionDataService(db);
		const service: ISessionDataService = {
			...base,
			openDatabase: resource => {
				let database = databases.get(resource.toString());
				if (!database) {
					database = new TestSessionDatabase();
					databases.set(resource.toString(), database);
				}
				return createSessionDataService(database).openDatabase(resource);
			},
			tryOpenDatabase: async resource => {
				if (unopenable.has(resource.toString())) {
					throw new Error('database disk image is malformed');
				}
				const database = databases.get(resource.toString());
				return database ? createSessionDataService(database).openDatabase(resource) : undefined;
			},
			listSessionDataIds: async prefix => [...databases.keys()].map(key => URI.parse(key).path.substring(1)).filter(id => id.startsWith(prefix)),
			deleteSessionData: async resource => { databases.delete(resource.toString()); },
		};
		const isolation = createIsolation(disposables, { sessionDataService: service, centralDatabase });
		const create = async (prompt: string) => {
			branchName = `agents/${prompt}`;
			const created = await isolation.createDetachedWorktree({
				workingDirectory: repoRoot,
				config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
				prompt,
			});
			await isolation.claimDetachedWorktree(created.handle);
			await databases.get(detachedWorktreeRecordUri(created.handle).toString())!.setMetadata('vscode.devContainerWorktree.lastSeenAt', '0');
			return created;
		};
		const setOwner = (handle: string, ownerUri: URI) => databases.get(detachedWorktreeRecordUri(handle).toString())!.setMetadata('vscode.devContainerWorktree.owner', ownerUri.toString());
		return { databases, service, isolation, create, setOwner };
	}

	test('reconciliation re-owns a transferred worktree whose record still names its source to the session whose central list names it (Block 5)', async () => {
		const central = disposables.add(new AgentHostDatabase(':memory:'));
		const { databases, isolation, create, setOwner } = createOwnedRecordsHarness(new Set(), central);
		const moved = await create('moved');
		const target = URI.parse('copilotcli:/target');
		// A crash after the move committed: the target lists it centrally, its record still names the source; both long ago.
		await setOwner(moved.handle, URI.parse('copilotcli:/source'));
		await databases.get(detachedWorktreeRecordUri(moved.handle).toString())!.setMetadata('vscode.devContainerWorktree.createdAt', '0');
		await central.registerSessionV2(target.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
		await central.importSessionState(target.toString(), {
			importVersion: 1, importedAt: 1, folders: [], chats: [], legacyMirrorBase: '{"v":2,"entries":{}}', launchDirsBackfilled: true,
			values: { [ADDITIONAL_WORKTREES_METADATA_KEY]: JSON.stringify([{ handle: moved.handle, workingDirectory: moved.worktree.toString(), repositoryRoot: repoRoot.toString() }]) },
		});

		await isolation.cleanupUnclaimedDetachedWorktrees();
		const record = await databases.get(detachedWorktreeRecordUri(moved.handle).toString())!.getMetadataObject({ 'vscode.devContainerWorktree.owner': true, 'vscode.devContainerWorktree.claimed': true });

		assert.deepStrictEqual({ record, exists: existsSync(moved.worktree.fsPath), removed: removeCalls }, {
			record: { 'vscode.devContainerWorktree.owner': target.toString(), 'vscode.devContainerWorktree.claimed': 'true' },
			exists: true,
			removed: [],
		});
	});

	test('reconciliation re-owns a session move\'s transferred worktree to the target that lists it, though the ended source\'s stale database still lists it too (L1, Block 5)', async () => {
		const central = disposables.add(new AgentHostDatabase(':memory:'));
		const { databases, service, isolation, create, setOwner } = createOwnedRecordsHarness(new Set(), central);
		const moved = await create('session-moved');
		const source = URI.parse('copilotcli:/ended-source');
		const target = URI.parse('copilotcli:/session-move-target');
		const list = JSON.stringify([{ handle: moved.handle, workingDirectory: moved.worktree.toString(), repositoryRoot: repoRoot.toString() }]);
		await setOwner(moved.handle, source);
		await databases.get(detachedWorktreeRecordUri(moved.handle).toString())!.setMetadata('vscode.devContainerWorktree.createdAt', '0');
		// The source listed it, then ended by the move: its central state is tombstoned, its own database is never rewritten.
		await service.openDatabase(source).object.setMetadata(ADDITIONAL_WORKTREES_METADATA_KEY, list);
		for (const session of [source, target]) {
			await central.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await central.importSessionState(session.toString(), { importVersion: 1, importedAt: 1, folders: [], chats: [], legacyMirrorBase: '{"v":2,"entries":{}}', launchDirsBackfilled: true, values: { [ADDITIONAL_WORKTREES_METADATA_KEY]: list } });
		}
		await central.tombstoneAndUnregisterSession(source.toString());

		await isolation.cleanupUnclaimedDetachedWorktrees();

		assert.deepStrictEqual(await databases.get(detachedWorktreeRecordUri(moved.handle).toString())!.getMetadataObject({ 'vscode.devContainerWorktree.owner': true }), { 'vscode.devContainerWorktree.owner': target.toString() });
	});

	test('reconciliation re-owns a transferred worktree in the order older builds rely on: the target\'s copy lists it, the record names the target, the live source\'s copy drops it (PR review)', async () => {
		const central = disposables.add(new AgentHostDatabase(':memory:'));
		const { databases, service, isolation, create, setOwner } = createOwnedRecordsHarness(new Set(), central);
		const moved = await create('repaired');
		const source = URI.parse('copilotcli:/live-source');
		const target = URI.parse('copilotcli:/repair-target');
		const list = JSON.stringify([{ handle: moved.handle, workingDirectory: moved.worktree.toString(), repositoryRoot: repoRoot.toString() }]);
		await setOwner(moved.handle, source);
		const record = databases.get(detachedWorktreeRecordUri(moved.handle).toString())!;
		await record.setMetadata('vscode.devContainerWorktree.createdAt', '0');
		// A crash right after the move committed: central lists moved the handle; neither older-build copy followed.
		await service.openDatabase(source).object.setMetadata(ADDITIONAL_WORKTREES_METADATA_KEY, list);
		// The source's copy was written before the move (its merge base records it), so it is no older build's edit.
		const mirrored = JSON.stringify({ v: 2, entries: { [JSON.stringify(['value', ADDITIONAL_WORKTREES_METADATA_KEY])]: list } });
		for (const [session, value, base] of [[source, '[]', mirrored], [target, list, '{"v":2,"entries":{}}']] as const) {
			await central.registerSessionV2(session.toString(), { provider: 'copilotcli', startTime: 1, source: 'explicit' }, { checkTombstone: false });
			await central.importSessionState(session.toString(), { importVersion: 1, importedAt: 1, folders: [], chats: [], legacyMirrorBase: base, launchDirsBackfilled: true, values: { [ADDITIONAL_WORKTREES_METADATA_KEY]: value } });
		}
		const olderBuildList = async (session: URI) => (JSON.parse(await service.openDatabase(session).object.getMetadata(ADDITIONAL_WORKTREES_METADATA_KEY) ?? '[]') as { handle: string }[]).map(entry => entry.handle === moved.handle ? 'handle' : entry.handle);
		let targetListedWhenOwned: string[] | undefined;
		const setValues = record.setMetadataValues.bind(record);
		record.setMetadataValues = async values => {
			if (values['vscode.devContainerWorktree.owner'] === target.toString()) {
				targetListedWhenOwned = await olderBuildList(target);
			}
			return setValues(values);
		};

		await isolation.cleanupUnclaimedDetachedWorktrees();

		assert.deepStrictEqual({
			targetListedWhenOwned,
			owner: (await record.getMetadataObject({ 'vscode.devContainerWorktree.owner': true }))['vscode.devContainerWorktree.owner'],
			sourceLists: await olderBuildList(source),
		}, { targetListedWhenOwned: ['handle'], owner: target.toString(), sourceLists: [] });
	});

	test('resolveWorkingDirectoryForResume recreates a missing shared worktree from the branch its co-owners recorded (Block 5)', async () => {
		const central = disposables.add(new AgentHostDatabase(':memory:'));
		const isolation = createIsolation(disposables, { centralDatabase: central });
		const missing = URI.joinPath(worktreesRoot, 'shared-missing');
		const raw = await (central as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		await new Promise<void>((resolve, reject) => raw.run('INSERT INTO worktree_co_owners (worktree_path, session_uri, repository_root, branch) VALUES (?, ?, ?, ?)', [missing.toString(), 'copilotcli:/origin', repoRoot.toString(), 'agents/shared'], error => error ? reject(error) : resolve()));

		const resolved = await isolation.resolveWorkingDirectoryForResume(URI.parse('copilotcli:/co-owner'), 'co-owner', missing);

		assert.deepStrictEqual({ resolved: resolved.toString(), recreated: addExistingCalls.map(call => ({ worktree: call.worktree.toString(), branchName: call.branchName })) }, {
			resolved: missing.toString(),
			recreated: [{ worktree: missing.toString(), branchName: 'agents/shared' }],
		});
	});

	test('resolveWorkingDirectoryForResume recreates a missing shared worktree for a chat working in a subfolder of it, and resumes it in that subfolder (PR review)', async () => {
		const central = disposables.add(new AgentHostDatabase(':memory:'));
		const isolation = createIsolation(disposables, { centralDatabase: central });
		const missing = URI.joinPath(worktreesRoot, 'shared-missing');
		const raw = await (central as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		await new Promise<void>((resolve, reject) => raw.run('INSERT INTO worktree_co_owners (worktree_path, session_uri, repository_root, branch) VALUES (?, ?, ?, ?)', [missing.toString(), 'copilotcli:/origin', repoRoot.toString(), 'agents/shared'], error => error ? reject(error) : resolve()));
		const subfolder = URI.joinPath(missing, 'src');

		const resolved = await isolation.resolveWorkingDirectoryForResume(URI.parse('copilotcli:/co-owner'), 'co-owner', subfolder);

		assert.deepStrictEqual({ resolved: resolved.toString(), recreated: addExistingCalls.map(call => ({ worktree: call.worktree.toString(), branchName: call.branchName })) }, {
			resolved: subfolder.toString(),
			recreated: [{ worktree: missing.toString(), branchName: 'agents/shared' }],
		});
	});

	test('resolveWorkingDirectoryForResume resumes an archived session that only co-owns a removed shared worktree against its recorded repository, for history (PR review)', async () => {
		const central = disposables.add(new AgentHostDatabase(':memory:'));
		const isolation = createIsolation(disposables, { centralDatabase: central });
		const missing = URI.joinPath(worktreesRoot, 'shared-archived');
		const raw = await (central as unknown as { _ensureDatabase(): Promise<Database> })._ensureDatabase();
		await new Promise<void>((resolve, reject) => raw.run('INSERT INTO worktree_co_owners (worktree_path, session_uri, repository_root, branch) VALUES (?, ?, ?, ?)', [missing.toString(), 'copilotcli:/origin', repoRoot.toString(), 'agents/shared'], error => error ? reject(error) : resolve()));
		// The promoted session records no worktree of its own; it is archived, like every co-owner, and the checkout removed.
		await db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, 'true');

		const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, URI.joinPath(missing, 'src'));

		assert.deepStrictEqual({ resolved: resolved.toString(), recreated: addExistingCalls.length }, { resolved: repoRoot.toString(), recreated: 0 });
	});

	test('reconcileDetachedWorktrees retains records whose owner metadata is unreadable and still prunes the others', async () => {
		const { databases, service, isolation, create, setOwner } = createOwnedRecordsHarness();
		const corruptOwner = await create('corrupt-owner');
		const gone = await create('gone');
		const ownerUri = URI.parse('agent-session://test/corrupt-owner');
		await service.openDatabase(ownerUri).object.setMetadata(ADDITIONAL_WORKTREES_METADATA_KEY, '{bad');
		await setOwner(corruptOwner.handle, ownerUri);
		rmSync(gone.worktree.fsPath, { recursive: true, force: true });

		await isolation.reconcileDetachedWorktrees(getComparisonKey(gone.worktree), []);

		assert.deepStrictEqual({
			records: [...databases.keys()].filter(key => key.includes('worktree')).sort(),
			exists: existsSync(corruptOwner.worktree.fsPath),
			removed: removeCalls,
		}, {
			records: [detachedWorktreeRecordUri(corruptOwner.handle).toString()],
			exists: true,
			removed: [],
		});
	});

	test('reconcileDetachedWorktrees retains records whose owner database cannot be opened and still prunes the others', async () => {
		const ownerUri = URI.parse('agent-session://test/malformed-owner');
		const { databases, isolation, create, setOwner } = createOwnedRecordsHarness(new Set([ownerUri.toString()]));
		const malformedOwner = await create('malformed-owner');
		const gone = await create('gone');
		await setOwner(malformedOwner.handle, ownerUri);
		rmSync(gone.worktree.fsPath, { recursive: true, force: true });

		await isolation.reconcileDetachedWorktrees(getComparisonKey(gone.worktree), []);

		assert.deepStrictEqual({
			records: [...databases.keys()].filter(key => key.includes('worktree')).sort(),
			exists: existsSync(malformedOwner.worktree.fsPath),
			removed: removeCalls,
		}, {
			records: [detachedWorktreeRecordUri(malformedOwner.handle).toString()],
			exists: true,
			removed: [],
		});
	});

	test('resolveWorkingDirectory creates from the primary worktree while setting up files from the selected checkout', async () => {
		const checkoutRoot = URI.joinPath(repoRoot, 'linked-checkout');
		const gitService = createGitService();
		let addWorktreeRoot: URI | undefined;
		gitService.getRepositoryRoot = async () => checkoutRoot;
		gitService.getWorktreeRoots = async () => [repoRoot, checkoutRoot];
		gitService.addWorktree = async (repositoryRoot, options) => {
			addWorktreeRoot = repositoryRoot;
			addWorktreeCalls.push(options);
			mkdirSync(options.path.fsPath, { recursive: true });
		};
		const isolation = createIsolation(disposables, { gitService });
		const includeFiles = ['.env'];
		const symlinkFolders = ['node_modules/**'];

		const worktree = await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: checkoutRoot,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'main',
				[SessionConfigKey.WorktreeIncludeFiles]: includeFiles,
				[SessionConfigKey.WorktreeSymlinkFolders]: symlinkFolders,
			},
		});
		const meta = await isolation.readWorktreeMetadata(sessionUri);
		const worktreeInfo = isolation.sessionWorktreeInfo(sessionId);

		assert.deepStrictEqual({
			worktree: worktree?.toString(),
			addWorktreeRoot: addWorktreeRoot?.toString(),
			includeFileRoot: copyIncludeCalls[0]?.repositoryRoot.toString(),
			includeExcludedFolders: copyIncludeCalls[0]?.excludedFolders,
			symlinkFolderRoot: symlinkFolderCalls[0]?.repositoryRoot.toString(),
			metaRepositoryRoot: meta?.repositoryRoot?.toString(),
			metaSymlinkSourceRoot: meta?.symlinkSourceRoot?.toString(),
			metaSymlinkPatterns: meta?.symlinkPatterns,
			project: worktreeInfo && { uri: worktreeInfo.project.uri.toString(), displayName: worktreeInfo.project.displayName },
			branchName: worktreeInfo?.branchName,
		}, {
			worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
			addWorktreeRoot: repoRoot.toString(),
			includeFileRoot: checkoutRoot.toString(),
			includeExcludedFolders: ['node_modules'],
			symlinkFolderRoot: checkoutRoot.toString(),
			metaRepositoryRoot: repoRoot.toString(),
			metaSymlinkSourceRoot: checkoutRoot.toString(),
			metaSymlinkPatterns: symlinkFolders,
			project: { uri: repoRoot.toString(), displayName: basename(repoRoot) },
			branchName,
		});
	});

	test('replays persisted symlink setup after missing-worktree recovery and unarchive', async () => {
		const checkoutRoot = URI.joinPath(repoRoot, 'linked-checkout');
		const gitService = createGitService();
		gitService.getRepositoryRoot = async () => checkoutRoot;
		gitService.getWorktreeRoots = async () => [repoRoot, checkoutRoot];
		const isolation = createIsolation(disposables, { gitService });
		const symlinkPatterns = ['node_modules/**'];
		const worktree = await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: checkoutRoot,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'main',
				[SessionConfigKey.WorktreeSymlinkFolders]: symlinkPatterns,
			},
		});
		assert.ok(worktree);
		rmSync(worktree.fsPath, { recursive: true, force: true });
		symlinkFolderCalls = [];

		const restoredIsolation = createIsolation(disposables, { gitService });
		await restoredIsolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, worktree);
		await archiveThroughCleanup(restoredIsolation, 'synced');
		await restoredIsolation.recreateWorktreeOnUnarchive(sessionUri, sessionId);

		assert.deepStrictEqual(symlinkFolderCalls.map(call => ({
			repositoryRoot: call.repositoryRoot.toString(),
			worktree: call.worktree.toString(),
			patterns: call.patterns,
			sessionId: call.sessionId,
		})), [
			{ repositoryRoot: checkoutRoot.toString(), worktree: worktree.toString(), patterns: symlinkPatterns, sessionId },
			{ repositoryRoot: checkoutRoot.toString(), worktree: worktree.toString(), patterns: symlinkPatterns, sessionId },
		]);
	});

	test('resolveWorkingDirectory falls back to the selected checkout when primary worktree resolution fails', async () => {
		const checkoutRoot = URI.joinPath(repoRoot, 'linked-checkout');
		const gitService = createGitService();
		gitService.getRepositoryRoot = async () => checkoutRoot;
		gitService.getWorktreeRoots = async () => { throw new Error('worktree enumeration failed'); };
		const isolation = createIsolation(disposables, { gitService });

		const worktree = await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: checkoutRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
		});
		const meta = await isolation.readWorktreeMetadata(sessionUri);
		const fallbackWorktreesRoot = getWorktreesRoot(checkoutRoot);

		assert.deepStrictEqual({
			worktree: worktree?.toString(),
			metaRepositoryRoot: meta?.repositoryRoot?.toString(),
		}, {
			worktree: URI.joinPath(fallbackWorktreesRoot, getWorktreeName(branchName)).toString(),
			metaRepositoryRoot: checkoutRoot.toString(),
		});
	});

	test('resolveWorkingDirectory names each creation phase, rounding percentages down and debouncing updates', async () => {
		const gitService = createGitService();
		gitService.addWorktree = async (_root, options) => {
			addWorktreeCalls.push(options);
			mkdirSync(options.path.fsPath, { recursive: true });
			options.onProgress?.({ filesDone: 7, filesTotal: 800 });
			options.onProgress?.({ filesDone: 96, filesTotal: 800 });
			options.onProgress?.({ filesDone: 100, filesTotal: 800 });
			await timeout(50);
			options.onProgress?.({ filesDone: 800, filesTotal: 800 });
		};
		gitService.copyWorktreeIncludeFiles = async (_root, _worktree, _globs, _sessionId, onProgress) => {
			onProgress?.({ filesDone: 1, filesTotal: 4 });
			onProgress?.({ filesDone: 4, filesTotal: 4 });
		};
		const isolation = createIsolation(disposables, { gitService });
		const activities: string[] = [];

		await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: repoRoot,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'main',
				[SessionConfigKey.WorktreeIncludeFiles]: ['.env'],
				[SessionConfigKey.WorktreeSymlinkFolders]: ['node_modules/**'],
			},
			prompt: 'do a thing',
			onProgress: activity => activities.push(activity),
		});

		assert.deepStrictEqual(activities, [
			'Creating isolated worktree',
			'Creating isolated worktree (naming branch)',
			'Creating isolated worktree (checking out files)',
			'Creating isolated worktree (checking out files, 12%)',
			'Creating isolated worktree (checking out files, 100%)',
			'Creating isolated worktree (symlinking folders)',
			'Creating isolated worktree (copying additional files)',
			'Creating isolated worktree (copying additional files, 100%)',
		]);
	});

	test('resolveWorkingDirectory avoids an existing worktree directory', async () => {
		const collisionSessionId = '12345678-aaaa-bbbb-cccc-123456789abc';
		const collisionSessionUri = URI.parse(`agent-session://test/${collisionSessionId}`);
		const existingWorktree = URI.joinPath(worktreesRoot, 'add-feature');
		mkdirSync(existingWorktree.fsPath, { recursive: true });
		branchExists = false;
		const isolation = createIsolation(disposables, {
			branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
		});

		const resolved = await isolation.resolveWorkingDirectory({
			sessionUri: collisionSessionUri,
			sessionId: collisionSessionId,
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'Add feature',
		});

		assert.deepStrictEqual({
			branchName: addWorktreeCalls[0]?.newBranchName,
			worktree: resolved?.toString(),
		}, {
			branchName: 'agents/add-feature-12345678',
			worktree: URI.joinPath(worktreesRoot, 'add-feature-12345678').toString(),
		});
	});

	test('resolveWorkingDirectory treats a failed branch check as a collision', async () => {
		const collisionSessionId = '12345678-aaaa-bbbb-cccc-123456789abc';
		const collisionSessionUri = URI.parse(`agent-session://test/${collisionSessionId}`);
		const gitService = createGitService();
		let branchExistsCalls = 0;
		gitService.branchExists = async () => {
			if (branchExistsCalls++ === 0) {
				throw new Error('transient failure');
			}
			return false;
		};
		const isolation = createIsolation(disposables, {
			branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
			gitService,
		});

		const resolved = await isolation.resolveWorkingDirectory({
			sessionUri: collisionSessionUri,
			sessionId: collisionSessionId,
			workingDirectory: repoRoot,
			config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' },
			prompt: 'Add feature',
		});

		assert.deepStrictEqual({
			branchExistsCalls,
			branchName: addWorktreeCalls[0]?.newBranchName,
			worktree: resolved?.toString(),
		}, {
			branchExistsCalls: 2,
			branchName: 'agents/add-feature-12345678',
			worktree: URI.joinPath(worktreesRoot, 'add-feature-12345678').toString(),
		});
	});

	test('resolveWorkingDirectory serializes concurrent creation in the same repository', async () => {
		const gitService = createGitService();
		const checkoutRootA = URI.joinPath(repoRoot, 'linked-checkout-a');
		const checkoutRootB = URI.joinPath(repoRoot, 'linked-checkout-b');
		const existingBranches = new Set<string>();
		let activeAddWorktrees = 0;
		let maxActiveAddWorktrees = 0;
		gitService.getRepositoryRoot = async workingDirectory => workingDirectory;
		gitService.getWorktreeRoots = async () => [repoRoot, checkoutRootA, checkoutRootB];
		gitService.branchExists = async (_repositoryRoot, candidate) => existingBranches.has(candidate);
		gitService.addWorktree = async (_repositoryRoot, options) => {
			activeAddWorktrees++;
			maxActiveAddWorktrees = Math.max(maxActiveAddWorktrees, activeAddWorktrees);
			await timeout(10);
			addWorktreeCalls.push(options);
			if (options.newBranchName) {
				existingBranches.add(options.newBranchName);
			}
			mkdirSync(options.path.fsPath, { recursive: true });
			activeAddWorktrees--;
		};
		const isolation = createIsolation(disposables, {
			branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
			gitService,
		});
		const config = { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' };

		const worktrees = await Promise.all([
			isolation.resolveWorkingDirectory({ sessionUri: URI.parse('agent-session://test/12345678-aaaa-bbbb-cccc-123456789abc'), sessionId: '12345678-aaaa-bbbb-cccc-123456789abc', workingDirectory: checkoutRootA, config, prompt: 'Add feature' }),
			isolation.resolveWorkingDirectory({ sessionUri: URI.parse('agent-session://test/87654321-aaaa-bbbb-cccc-123456789abc'), sessionId: '87654321-aaaa-bbbb-cccc-123456789abc', workingDirectory: checkoutRootB, config, prompt: 'Add feature' }),
		]);

		assert.deepStrictEqual({
			maxActiveAddWorktrees,
			branchNames: addWorktreeCalls.map(call => call.newBranchName),
			worktrees: worktrees.map(worktree => worktree?.toString()),
		}, {
			maxActiveAddWorktrees: 1,
			branchNames: ['agents/add-feature', 'agents/add-feature-87654321'],
			worktrees: [
				URI.joinPath(worktreesRoot, 'add-feature').toString(),
				URI.joinPath(worktreesRoot, 'add-feature-87654321').toString(),
			],
		});
	});

	test('resolveWorkingDirectory is a no-op for folder isolation or a missing branch', async () => {
		const isolation = createIsolation(disposables);

		const folder = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'folder', [SessionConfigKey.Branch]: 'main' } });
		const noBranch = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree' } });

		assert.deepStrictEqual({
			folder: folder?.toString(),
			noBranch: noBranch?.toString(),
			addWorktreeCallCount: addWorktreeCalls.length,
			resolvedWorktree: isolation.getResolvedWorktree(sessionId),
		}, {
			folder: repoRoot.toString(),
			noBranch: repoRoot.toString(),
			addWorktreeCallCount: 0,
			resolvedWorktree: undefined,
		});
	});

	test('resolveWorkingDirectory sets up configured symlinks and include files in order and tolerates failures', async () => {
		const isolation = createIsolation(disposables);
		const includeFiles = ['.env', '.env.local', 'config/**'];
		const symlinkFolders = ['node_modules/**', '.cache/**'];
		copyIncludeError = new Error('copy failed');
		symlinkFolderError = new Error('symlink failed');

		const worktree = await isolation.resolveWorkingDirectory({
			sessionUri,
			sessionId,
			workingDirectory: repoRoot,
			config: {
				[SessionConfigKey.Isolation]: 'worktree',
				[SessionConfigKey.Branch]: 'main',
				[SessionConfigKey.WorktreeIncludeFiles]: includeFiles,
				[SessionConfigKey.WorktreeSymlinkFolders]: symlinkFolders,
			},
		});

		assert.deepStrictEqual({
			worktree: worktree?.toString(),
			copyIncludeCalls: copyIncludeCalls.map(call => ({
				repositoryRoot: call.repositoryRoot.toString(),
				worktree: call.worktree.toString(),
				globs: call.globs,
				sessionId: call.sessionId,
				excludedFolders: call.excludedFolders,
			})),
			symlinkFolderCalls: symlinkFolderCalls.map(call => ({
				repositoryRoot: call.repositoryRoot.toString(),
				worktree: call.worktree.toString(),
				patterns: call.patterns,
				sessionId: call.sessionId,
			})),
			worktreeSetupCalls,
			resolvedWorktree: isolation.getResolvedWorktree(sessionId)?.toString(),
		}, {
			worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
			copyIncludeCalls: [{
				repositoryRoot: repoRoot.toString(),
				worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
				globs: includeFiles,
				sessionId,
				excludedFolders: [],
			}],
			symlinkFolderCalls: [{
				repositoryRoot: repoRoot.toString(),
				worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
				patterns: symlinkFolders,
				sessionId,
			}],
			worktreeSetupCalls: ['symlinkFolders', 'includeFiles'],
			resolvedWorktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
		});
	});

	test('resolveWorkingDirectoryForResume recreates a missing live worktree and preserves an existing directory', async () => {
		const isolation = createIsolation(disposables);
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-live-worktree');
		const existingWorktree = URI.joinPath(worktreesRoot, 'existing-live-worktree');
		mkdirSync(existingWorktree.fsPath, { recursive: true });
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
		]);

		const outcomes = {
			missingWorktreeRecreated: (await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree)).toString(),
			existingWorktreeUsedUnchanged: (await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, existingWorktree)).toString(),
			recreatedWorktrees: addExistingCalls.map(call => ({ worktree: call.worktree.toString(), branchName: call.branchName })),
		};

		assert.deepStrictEqual(outcomes, {
			missingWorktreeRecreated: missingWorktree.toString(),
			existingWorktreeUsedUnchanged: existingWorktree.toString(),
			recreatedWorktrees: [{ worktree: missingWorktree.toString(), branchName: 'feature/x' }],
		});
	});

	test('resolveWorkingDirectoryForResume recreates a missing live worktree from legacy metadata', async () => {
		const isolation = createIsolation(disposables);
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-legacy-live-worktree');
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.workingDirectory', missingWorktree.toString()),
		]);

		const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);

		assert.deepStrictEqual({
			resolved: resolved.toString(),
			recreatedWorktrees: addExistingCalls.map(call => ({ worktree: call.worktree.toString(), branchName: call.branchName })),
		}, {
			resolved: missingWorktree.toString(),
			recreatedWorktrees: [{ worktree: missingWorktree.toString(), branchName: 'feature/x' }],
		});
	});

	test('resolveWorkingDirectoryForResume uses the repository root for archived history', async () => {
		const isolation = createIsolation(disposables);
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-archived-worktree');
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
			db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, 'true'),
		]);

		const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);

		assert.deepStrictEqual({ resolved: resolved.toString(), worktreesRecreated: addExistingCalls.length }, {
			resolved: repoRoot.toString(),
			worktreesRecreated: 0,
		});
	});

	test('resolveWorkingDirectoryForResume reads the archive state from central session state', async () => {
		// The session.db mirror never receives the archive flag (a mirror that has not caught up).
		db = new class extends TestSessionDatabase {
			override applyMetadataChanges(set: Readonly<Record<string, string>>, remove: readonly string[]): Promise<void> {
				const { [AH_META_IS_ARCHIVED_DB_KEY]: _archived, ...rest } = set;
				return super.applyMetadataChanges(rest, remove);
			}
		}();
		const stores: AgentHostSessionStateStore[] = [];
		const isolation = createIsolation(disposables, { stores });
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-central-archived-worktree');
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
		]);
		// Archived centrally only.
		await stores[0].writeMetadata(sessionUri, sessionUri, { [AH_META_IS_ARCHIVED_DB_KEY]: 'true' }, SessionStateMirrorFlush.Coalesced);

		const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);

		assert.deepStrictEqual({ resolved: resolved.toString(), mirrored: await db.getMetadata(AH_META_IS_ARCHIVED_DB_KEY), worktreesRecreated: addExistingCalls.length }, {
			resolved: repoRoot.toString(),
			mirrored: undefined,
			worktreesRecreated: 0,
		});
	});

	test('resolveWorkingDirectoryForResume falls back to legacy isDone archived metadata', async () => {
		const isolation = createIsolation(disposables);
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-legacy-archived-worktree');
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
			db.setMetadata(AH_META_IS_DONE_DB_KEY, 'true'),
		]);

		const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);

		assert.strictEqual(resolved.toString(), repoRoot.toString());
	});

	test('resolveWorkingDirectoryForResume reports a missing preserved branch', async () => {
		const isolation = createIsolation(disposables);
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-branch-worktree');
		branchExists = false;
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
		]);

		await assert.rejects(
			() => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree),
			(error: Error) => error instanceof SessionWorkingDirectoryMissingError
				&& error.reason !== undefined
				&& /branch 'feature\/x' no longer exists/.test(error.message),
		);
		assert.strictEqual(addExistingCalls.length, 0);
	});

	test('resolveWorkingDirectoryForResume reports a missing live directory without worktree metadata', async () => {
		const isolation = createIsolation(disposables);
		const missingDirectory = URI.joinPath(repoRoot, 'missing-directory');

		await assert.rejects(
			() => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingDirectory),
			(error: Error) => error instanceof SessionWorkingDirectoryMissingError,
		);
	});

	test('resolveWorkingDirectoryForResume reports a missing directory when worktree metadata is unreadable', async () => {
		const isolation = createIsolation(disposables);
		const missingDirectory = URI.joinPath(repoRoot, 'missing-directory');
		const getMetadata = db.getMetadata.bind(db);
		db.getMetadata = async key => {
			if (key === 'copilot.worktree.branchName') {
				throw new Error('unreadable worktree metadata');
			}
			return getMetadata(key);
		};

		await assert.rejects(
			() => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingDirectory),
			(error: Error) => error instanceof SessionWorkingDirectoryMissingError,
		);
	});

	for (const archived of [false, true]) {
		test(`resume never substitutes a different owned worktree (archived: ${archived})`, async () => {
			const isolation = createIsolation(disposables);
			await db.setMetadataValues({
				'copilot.worktree.branchName': 'feature/owner',
				'copilot.worktree.path': URI.joinPath(worktreesRoot, 'owner').toString(),
				'copilot.worktree.repositoryRoot': repoRoot.toString(),
				[AH_META_IS_ARCHIVED_DB_KEY]: String(archived),
			});
			await assert.rejects(
				isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, URI.joinPath(worktreesRoot, 'peer')),
				SessionWorkingDirectoryMissingError,
			);
			assert.deepStrictEqual(addExistingCalls, []);
		});
	}

	test('resolveWorkingDirectoryForResume reports an archived session when its repository root is also missing', async () => {
		const isolation = createIsolation(disposables);
		const missingRepositoryRoot = URI.joinPath(repoRoot, 'missing-repository');
		const missingWorktree = URI.joinPath(worktreesRoot, 'missing-archived-no-root-worktree');
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', missingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', missingRepositoryRoot.toString()),
			db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, 'true'),
		]);

		await assert.rejects(
			() => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree),
			(error: Error) => error instanceof SessionWorkingDirectoryMissingError,
		);
	});

	test('resolveWorktreeProject / sessionWorktreeInfo expose the repository as the session project', async () => {
		// The worktree lives at `<repo>.worktrees/<name>`, but a worktree session
		// must group under the repository in the sessions UI. Both accessors return
		// the repo root as the project so agents can merge it into the reported
		// `IAgentSessionMetadata` / materialize event. Folder (non-worktree)
		// sessions have no worktree metadata and get `undefined`.
		const isolation = createIsolation(disposables);
		const expectedDisplayName = basename(repoRoot);

		const beforeAsync = await isolation.resolveWorktreeProject(sessionUri);
		const beforeSync = isolation.sessionWorktreeInfo(sessionId)?.project;

		await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });

		const afterAsync = await isolation.resolveWorktreeProject(sessionUri);
		const afterSync = isolation.sessionWorktreeInfo(sessionId)?.project;

		assert.deepStrictEqual({
			beforeAsync,
			beforeSync,
			afterAsync: { uri: afterAsync?.uri.toString(), displayName: afterAsync?.displayName },
			afterSync: { uri: afterSync?.uri.toString(), displayName: afterSync?.displayName },
			unknownSession: isolation.sessionWorktreeInfo('does-not-exist'),
		}, {
			beforeAsync: undefined,
			beforeSync: undefined,
			afterAsync: { uri: repoRoot.toString(), displayName: expectedDisplayName },
			afterSync: { uri: repoRoot.toString(), displayName: expectedDisplayName },
			unknownSession: undefined,
		});
	});

	test('resolveWorktreeProject normalizes persisted linked-checkout metadata', async () => {
		const checkoutRoot = URI.joinPath(repoRoot, 'linked-checkout');
		const existingWorktree = URI.joinPath(repoRoot, 'existing-worktree');
		mkdirSync(existingWorktree.fsPath, { recursive: true });
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', existingWorktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', checkoutRoot.toString()),
		]);
		const gitService = createGitService();
		let resolvedFrom: URI | undefined;
		let resolutionCount = 0;
		gitService.getWorktreeRoots = async workingDirectory => {
			resolvedFrom = workingDirectory;
			resolutionCount++;
			return [repoRoot, checkoutRoot, existingWorktree];
		};
		const isolation = createIsolation(disposables, { gitService });

		const project = await isolation.resolveWorktreeProject(sessionUri);
		await isolation.resolveWorktreeProject(sessionUri);

		assert.deepStrictEqual({
			resolutionCount,
			resolvedFrom: resolvedFrom?.toString(),
			project: project && { uri: project.uri.toString(), displayName: project.displayName },
			persistedRepositoryRoot: await db.getMetadata('copilot.worktree.repositoryRoot'),
		}, {
			resolutionCount: 1,
			resolvedFrom: existingWorktree.toString(),
			project: { uri: repoRoot.toString(), displayName: basename(repoRoot) },
			persistedRepositoryRoot: repoRoot.toString(),
		});
	});

	test('adoptExistingWorktreeMetadata bridges a linked worktree into worktree metadata', async () => {
		const worktreeCheckout = URI.joinPath(worktreesRoot, 'adopted');
		const gitService = createGitService();
		gitService.getRepositoryRoot = async () => worktreeCheckout;
		gitService.getWorktreeRoots = async () => [repoRoot, worktreeCheckout];
		gitService.getCurrentBranch = async () => 'agents/adopted';
		gitService.getDefaultBranch = async () => ({ name: 'main', startPoint: 'main' });
		const isolation = createIsolation(disposables, { gitService });

		const recorded = await isolation.adoptExistingWorktreeMetadata(sessionUri, worktreeCheckout);
		const project = await isolation.resolveWorktreeProject(sessionUri);

		assert.deepStrictEqual({
			recorded,
			branchName: await db.getMetadata('copilot.worktree.branchName'),
			path: await db.getMetadata('copilot.worktree.path'),
			repositoryRoot: await db.getMetadata('copilot.worktree.repositoryRoot'),
			diffBaseBranch: await db.getMetadata('agentHost.diffBaseBranch'),
			project: project && { uri: project.uri.toString(), displayName: project.displayName },
		}, {
			recorded: true,
			branchName: 'agents/adopted',
			path: worktreeCheckout.toString(),
			repositoryRoot: repoRoot.toString(),
			diffBaseBranch: 'main',
			project: { uri: repoRoot.toString(), displayName: basename(repoRoot) },
		});
	});

	test('adoptExistingWorktreeMetadata is a no-op for a primary checkout', async () => {
		const gitService = createGitService();
		gitService.getRepositoryRoot = async () => repoRoot;
		gitService.getWorktreeRoots = async () => [repoRoot];
		const isolation = createIsolation(disposables, { gitService });

		const recorded = await isolation.adoptExistingWorktreeMetadata(sessionUri, repoRoot);

		assert.deepStrictEqual({
			recorded,
			branchName: await db.getMetadata('copilot.worktree.branchName'),
			repositoryRoot: await db.getMetadata('copilot.worktree.repositoryRoot'),
		}, {
			recorded: false,
			branchName: undefined,
			repositoryRoot: undefined,
		});
	});

	test('applyRestoreAnnouncement prepends a markdown part when worktree metadata exists', async () => {
		const isolation = createIsolation(disposables);
		const turn: Turn = {
			id: 't1',
			message: { text: 'hi', origin: { kind: MessageKind.User } },
			responseParts: [],
			usage: undefined,
			state: TurnState.Complete,
		};

		const withoutMeta = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
		await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });
		const withMeta = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
		const firstPart = withMeta[0].responseParts[0];

		assert.deepStrictEqual({
			unchangedWhenNoMeta: withoutMeta[0].responseParts.length,
			firstPartKind: firstPart?.kind,
			firstPartHasBranch: firstPart?.kind === ResponsePartKind.Markdown ? firstPart.content.includes(branchName) : false,
		}, {
			unchangedWhenNoMeta: 0,
			firstPartKind: ResponsePartKind.Markdown,
			firstPartHasBranch: true,
		});
	});

	test('worktree failure notification bounds and escapes diagnostics', () => {
		const diagnostic = `git-lfs \`filter\`\n${'x'.repeat(250)}`;
		const notification = buildWorktreeFailureNotification(diagnostic);

		assert.deepStrictEqual({
			normalizedLength: normalizeWorktreeFailureDiagnostic(diagnostic)?.length,
			kind: notification.kind,
			content: notification.content,
			meta: notification._meta,
		}, {
			normalizedLength: 200,
			kind: ResponsePartKind.SystemNotification,
			content: `Couldn't create the isolated worktree. This session is continuing in the original folder.\n\n\`\`git-lfs \`filter\` ${'x'.repeat(180)}...\`\``,
			meta: { kind: 'worktreeCreationFailure', severity: 'warning' },
		});
	});

	test('applyRestoreAnnouncement restores a worktree failure only for its originating session', async () => {
		const isolation = createIsolation(disposables);
		const turn: Turn = {
			id: 't1',
			message: { text: 'hi', origin: { kind: MessageKind.User } },
			responseParts: [],
			usage: undefined,
			state: TurnState.Complete,
		};
		await isolation.persistCreationFailure(sessionUri, sessionId, 'git worktree exited with code 128');

		const matching = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
		const copied = await isolation.applyRestoreAnnouncement(URI.parse('agent-session://test/copied'), [turn]);
		const empty = await isolation.applyRestoreAnnouncement(sessionUri, []);

		assert.deepStrictEqual({
			matching: matching[0].responseParts[0],
			copiedPartCount: copied[0].responseParts.length,
			emptyTurnCount: empty.length,
		}, {
			matching: {
				kind: ResponsePartKind.SystemNotification,
				content: 'Couldn\'t create the isolated worktree. This session is continuing in the original folder.\n\n`git worktree exited with code 128`',
				_meta: { kind: 'worktreeCreationFailure', severity: 'warning' },
			},
			copiedPartCount: 0,
			emptyTurnCount: 0,
		});
	});

	test('automatic cleanup removes a clean worktree and unarchive recreates it', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });

		await archiveThroughCleanup(isolation, 'synced');
		const removedDuringArchive = worktree ? !existsSync(worktree.fsPath) : false;
		await isolation.recreateWorktreeOnUnarchive(sessionUri, sessionId);
		const restoredDuringUnarchive = worktree ? existsSync(worktree.fsPath) : false;

		assert.deepStrictEqual({
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
			removedDuringArchive,
			addExistingCalls: addExistingCalls.map(c => ({ worktree: c.worktree.toString(), branchName: c.branchName })),
			restoredDuringUnarchive,
		}, {
			removeCalls: [{ worktree: worktree!.toString(), force: false }],
			removedDuringArchive: true,
			addExistingCalls: [{ worktree: worktree!.toString(), branchName }],
			restoredDuringUnarchive: true,
		});
	});

	test('unarchive recreates a worktree a co-owner\'s removal is removing: it waits for the folder\'s lock, then finds it gone (PR review)', async () => {
		const isolation = createIsolation(disposables);
		const worktree = (await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } }))!;
		const removing = new DeferredPromise<void>();
		// A co-owner's removal holds the folder's lock past its last in-use check, then removes the folder.
		const removal = isolation.runExclusive(worktree.toString(), async () => {
			await removing.p;
			rmSync(worktree.fsPath, { recursive: true, force: true });
		});

		let settled = false;
		// Unarchive asks for the folder's lock after reading the session's metadata; one that did not wait for it would settle instead.
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Observe the moment unarchive requests the folder's lock without a test-only API.
		const sequencer = isolation['_sequencer'];
		const folderLockRequested = new DeferredPromise<void>();
		const queue = sinon.stub(sequencer, 'queue').callsFake((key, task) => {
			if (key === worktree.toString()) {
				folderLockRequested.complete();
			}
			return queue.wrappedMethod.call(sequencer, key, task);
		});
		const unarchive = isolation.recreateWorktreeOnUnarchive(sessionUri, sessionId).then(() => { settled = true; });
		await Promise.race([folderLockRequested.p, unarchive]);
		queue.restore();
		const settledWhileRemoving = settled;
		removing.complete();
		await Promise.all([removal, unarchive]);

		assert.deepStrictEqual({ settledWhileRemoving, exists: existsSync(worktree.fsPath), recreated: addExistingCalls.map(call => call.worktree.toString()) }, { settledWhileRemoving: false, exists: true, recreated: [worktree.toString()] });
	});

	test('manual archive commits uncommitted changes and removes the worktree', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });
		hasUncommittedChanges = true;

		await archiveThroughCleanup(isolation, 'commit');

		assert.deepStrictEqual({
			commitCalls: commitCalls.map(call => ({ worktree: call.worktree.toString(), message: call.message })),
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
			stillExists: worktree ? existsSync(worktree.fsPath) : false,
		}, {
			commitCalls: [{ worktree: worktree!.toString(), message: 'Saving uncommitted changes before archiving session' }],
			removeCalls: [{ worktree: worktree!.toString(), force: true }],
			stillExists: false,
		});
	});

	test('manual archive keeps the worktree when committing uncommitted changes fails', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });
		hasUncommittedChanges = true;
		commitError = new Error('commit failed');

		const database = disposables.add(new AgentHostDatabase(':memory:'));
		const cleanup = createTestWorktreeCleanupService(disposables, isolation, database);
		await cleanup.requestSessionWorktreeRemoval(sessionUri, 'commit');
		await cleanup.runPass();

		// The failed commit is retried later rather than losing the changes.
		assert.deepStrictEqual({
			commitCalls: commitCalls.length,
			removeCalls: removeCalls.length,
			stillExists: worktree ? existsSync(worktree.fsPath) : false,
			attempts: (await database.readPendingWorktreeRemoval('session', sessionUri.toString()))?.attempts,
		}, {
			commitCalls: 1,
			removeCalls: 0,
			stillExists: true,
			attempts: 1,
		});
	});

	test('cleanup keeps the worktree unless the branch is synced with its remote', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });

		const outcomes: { readonly reason: string; readonly removed: boolean }[] = [];
		for (const [reason, state] of [
			['no upstream', { outgoingChanges: 0, uncommittedChanges: 0 }],
			['unknown outgoing changes', { upstreamBranchName: 'origin/agents/my-feature', uncommittedChanges: 0 }],
			['unknown uncommitted changes', { upstreamBranchName: 'origin/agents/my-feature', outgoingChanges: 0 }],
			['unpushed commits', { upstreamBranchName: 'origin/agents/my-feature', outgoingChanges: 2, uncommittedChanges: 0 }],
			['uncommitted changes', { upstreamBranchName: 'origin/agents/my-feature', outgoingChanges: 0, uncommittedChanges: 1 }],
			['unknown git state', undefined],
		] as const) {
			sessionGitState = state;
			await archiveThroughCleanup(isolation, 'synced');
			outcomes.push({ reason, removed: worktree ? !existsSync(worktree.fsPath) : true });
		}

		assert.deepStrictEqual({ removeCalls, outcomes }, {
			removeCalls: [],
			outcomes: [
				{ reason: 'no upstream', removed: false },
				{ reason: 'unknown outgoing changes', removed: false },
				{ reason: 'unknown uncommitted changes', removed: false },
				{ reason: 'unpushed commits', removed: false },
				{ reason: 'uncommitted changes', removed: false },
				{ reason: 'unknown git state', removed: false },
			],
		});
	});

	test('automatic deletion keeps work: the worktree must be gone, or exist with its branch synced', async () => {
		const outcomes: Record<string, boolean> = {};
		outcomes['no worktree'] = await createIsolation(disposables).canAutomaticallyDeleteArchivedSession(sessionUri);
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });
		assert.ok(worktree);
		outcomes['branch synced'] = await isolation.canAutomaticallyDeleteArchivedSession(sessionUri);
		sessionGitState = { upstreamBranchName: 'origin/agents/my-feature', outgoingChanges: 1, uncommittedChanges: 0 };
		outcomes['unpushed commits'] = await isolation.canAutomaticallyDeleteArchivedSession(sessionUri);
		sessionGitState = { upstreamBranchName: 'origin/agents/my-feature', outgoingChanges: 0, uncommittedChanges: 0 };
		branchExists = false;
		outcomes['branch missing'] = await isolation.canAutomaticallyDeleteArchivedSession(sessionUri);
		rmSync(worktree.fsPath, { recursive: true, force: true });
		outcomes['folder gone'] = await isolation.canAutomaticallyDeleteArchivedSession(sessionUri);

		assert.deepStrictEqual({ outcomes, removeCalls }, {
			outcomes: { 'no worktree': true, 'branch synced': true, 'unpushed commits': false, 'branch missing': false, 'folder gone': true },
			// Only checks: the folder is removed later by the clean-up service.
			removeCalls: [],
		});
	});

	test('a deletion force-removes the worktree without needing its branch, and prunes a folder that is already gone', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });
		assert.ok(worktree);
		branchExists = false;
		hasUncommittedChanges = true;
		const recorded = { worktree, repositoryRoot: repoRoot, branchName };

		await isolation.removeRecordedWorktree(sessionId, recorded, 'delete');
		const removedExisting = !existsSync(worktree.fsPath);
		await isolation.removeRecordedWorktree(sessionId, recorded, 'delete');

		assert.deepStrictEqual({
			removedExisting,
			commitCalls: commitCalls.length,
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
		}, {
			removedExisting: true,
			commitCalls: 0,
			removeCalls: [{ worktree: worktree.toString(), force: true }, { worktree: worktree.toString(), force: true }],
		});
	});

	test('a removal reports what it did, asks its guard last, and prunes a folder that is already gone in every mode', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });
		assert.ok(worktree);
		const recorded = { worktree, repositoryRoot: repoRoot, branchName };
		hasUncommittedChanges = true;
		const outcomes: Record<string, string> = {};

		sessionGitState = { upstreamBranchName: 'origin/agents/my-feature', outgoingChanges: 1, uncommittedChanges: 0 };
		outcomes['synced, unpushed commits'] = await isolation.removeRecordedWorktree(sessionId, recorded, 'synced');
		branchExists = false;
		outcomes['commit, branch missing'] = await isolation.removeRecordedWorktree(sessionId, recorded, 'commit');
		branchExists = true;
		outcomes['commit, came into use'] = await isolation.removeRecordedWorktree(sessionId, recorded, 'commit', async () => false);
		const stillExists = existsSync(worktree.fsPath);
		rmSync(worktree.fsPath, { recursive: true, force: true });
		outcomes['synced, folder gone'] = await isolation.removeRecordedWorktree(sessionId, recorded, 'synced');
		outcomes['commit, folder gone'] = await isolation.removeRecordedWorktree(sessionId, recorded, 'commit');

		assert.deepStrictEqual({
			outcomes,
			stillExists,
			// The commit before the guard runs, so the folder's changes are kept either way.
			commitCalls: commitCalls.length,
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
		}, {
			outcomes: {
				'synced, unpushed commits': 'skipped',
				'commit, branch missing': 'skipped',
				'commit, came into use': 'inUse',
				'synced, folder gone': 'removed',
				'commit, folder gone': 'removed',
			},
			stillExists: true,
			commitCalls: 1,
			removeCalls: [{ worktree: worktree.toString(), force: true }, { worktree: worktree.toString(), force: true }],
		});
	});

	test('removeSessionWorktree force-removes a worktree for explicit session deletion', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });

		await isolation.removeSessionWorktree(sessionId, await isolation.prepareSessionDeletion(sessionUri, sessionId));

		assert.deepStrictEqual({
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
			resolvedWorktree: isolation.getResolvedWorktree(sessionId),
		}, {
			removeCalls: [{ worktree: worktree!.toString(), force: true }],
			resolvedWorktree: undefined,
		});
	});

	test('discardSessionWorktree removes provisional worktree metadata', async () => {
		const isolation = createIsolation(disposables);
		const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });

		await isolation.discardSessionWorktree(sessionUri, sessionId, await isolation.prepareSessionDeletion(sessionUri, sessionId));

		assert.deepStrictEqual({
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
			metadata: await db.getMetadataObject({
				'copilot.worktree.branchName': true,
				'copilot.worktree.path': true,
				'copilot.worktree.repositoryRoot': true,
				'copilot.worktree.symlinkPatterns': true,
				'copilot.worktree.symlinkSourceRoot': true,
				[META_DIFF_BASE_BRANCH]: true,
			}),
		}, {
			removeCalls: [{ worktree: worktree!.toString(), force: true }],
			metadata: {
				'copilot.worktree.branchName': undefined,
				'copilot.worktree.path': undefined,
				'copilot.worktree.repositoryRoot': undefined,
				'copilot.worktree.symlinkPatterns': undefined,
				'copilot.worktree.symlinkSourceRoot': undefined,
				[META_DIFF_BASE_BRANCH]: undefined,
			},
		});
	});

	test('discardSessionWorktree preserves restored folder metadata after failed isolation', async () => {
		const isolation = createIsolation(disposables);
		await db.setMetadata('copilot.workingDirectory', repoRoot.toString());
		await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: 'worktree', [SessionConfigKey.Branch]: 'main' } });
		await isolation.discardSessionWorktree(sessionUri, sessionId, await isolation.prepareSessionDeletion(sessionUri, sessionId), { preserveWorkingDirectory: true });
		assert.deepStrictEqual(await db.getMetadataObject({
			'copilot.workingDirectory': true,
			'copilot.worktree.path': true,
		}), {
			'copilot.workingDirectory': repoRoot.toString(),
			'copilot.worktree.path': undefined,
		});
	});

	test('session deletion removes a persisted worktree after a process restart', async () => {
		const worktree = URI.joinPath(worktreesRoot, 'persisted-worktree');
		mkdirSync(worktree.fsPath, { recursive: true });
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', worktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
		]);
		const isolation = createIsolation(disposables);

		const worktreeToRemove = await isolation.prepareSessionDeletion(sessionUri, sessionId);
		await isolation.removeSessionWorktree(sessionId, worktreeToRemove);

		assert.deepStrictEqual({
			removeCalls: removeCalls.map(call => ({ worktree: call.worktree.toString(), force: call.force })),
			resolvedWorktree: isolation.getResolvedWorktree(sessionId),
		}, {
			removeCalls: [{ worktree: worktree.toString(), force: true }],
			resolvedWorktree: undefined,
		});
	});

	test('failed worktree removal rejects and remains available for retry', async () => {
		const gitService = createGitService();
		gitService.removeWorktree = async () => { throw new Error('remove failed'); };
		const isolation = createIsolation(disposables, { gitService });
		const worktree = URI.joinPath(worktreesRoot, 'persisted-worktree');
		await Promise.all([
			db.setMetadata('copilot.worktree.branchName', 'feature/x'),
			db.setMetadata('copilot.worktree.path', worktree.toString()),
			db.setMetadata('copilot.worktree.repositoryRoot', repoRoot.toString()),
		]);

		const worktreeToRemove = await isolation.prepareSessionDeletion(sessionUri, sessionId);
		await assert.rejects(() => isolation.removeSessionWorktree(sessionId, worktreeToRemove), /remove failed/);
		const retry = await isolation.prepareSessionDeletion(sessionUri, sessionId);

		assert.deepStrictEqual({
			retryRepositoryRoot: retry?.repositoryRoot.toString(),
			retryWorktree: retry?.worktree.toString(),
		}, {
			retryRepositoryRoot: repoRoot.toString(),
			retryWorktree: worktree.toString(),
		});
	});
});
