/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IChangesetOperationHandler, IChangesetOperationRegistry } from '../../common/agentHostChangesetOperationService.js';
import { Branch, GitRefType, IAgentHostGitService, IRefQuery } from '../../common/agentHostGitService.js';
import { IAgentHostCredentialSource } from '../../common/agentHostCredentials.js';
import { IAgentHostGitStateService, IRefreshSessionGitStateOptions } from '../../common/agentHostGitStateService.js';
import { IAgentHostSessionStateStore } from '../../common/agentHostSessionStateStore.js';
import { buildBranchChangesetUri, buildUncommittedChangesetUri, ChangesetKind } from '../../common/changesetUri.js';
import { createSetBaseBranchMeta, LIST_BASE_BRANCHES_OPERATION_ID, readBaseBranchCandidatesResult, SET_BASE_BRANCH_OPERATION_ID } from '../../common/meta/agentBaseBranchOperationMeta.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { buildChatUri, buildDefaultChatUri, ChangesetOperationScope, ChangesetOperationStatus, SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostBaseBranchOperationContribution } from '../../node/agentHostBaseBranchOperationProvider.js';
import { resolveBranchChangesetScopeForSource } from '../../node/agentHostBranchChangesetScope.js';
import { AgentHostStateManager, creationTimeChatStorageResource } from '../../node/agentHostStateManager.js';
import { createTestChatOwnershipService } from './chatOwnershipTestUtils.js';

const session = 'agent:/session';
const defaultChat = buildDefaultChatUri(session);
const sameFolderChat = buildChatUri(session, 'same-folder');
const otherFolderChat = buildChatUri(session, 'other-folder');
const repository = URI.file('/repo').toString();
const otherRepository = URI.file('/other').toString();

const branches: Branch[] = [
	{ kind: GitRefType.Head, ref: 'refs/heads/feature', name: 'feature' },
	{ kind: GitRefType.RemoteHead, ref: 'refs/remotes/origin/main', name: 'origin/main', remote: 'origin' },
	{ kind: GitRefType.Head, ref: 'refs/heads/main', name: 'main', upstream: { ref: 'refs/remotes/origin/main', name: 'origin/main', remote: 'origin' } },
	{ kind: GitRefType.RemoteHead, ref: 'refs/remotes/origin/release/1.90', name: 'origin/release/1.90', remote: 'origin' },
	{ kind: GitRefType.RemoteHead, ref: 'refs/remotes/upstream/fix', name: 'upstream/fix', remote: 'upstream' },
	{ kind: GitRefType.Head, ref: 'refs/heads/fix', name: 'fix' },
];

async function errorCode(promise: Promise<unknown>): Promise<number | undefined> {
	try {
		await promise;
	} catch (error) {
		return error instanceof ProtocolError ? error.code : -1;
	}
	return undefined;
}

suite('AgentHostBaseBranchOperationContribution', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createHarness(defaultBranch: Branch | undefined = branches[2]) {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: session,
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: [repository],
			defaultChat,
		});
		stateManager.addChat(session, sameFolderChat, creationTimeChatStorageResource(session, sameFolderChat, defaultChat));
		stateManager.addChat(session, otherFolderChat, creationTimeChatStorageResource(session, otherFolderChat, defaultChat), { workingDirectories: [otherRepository] });

		const gitCalls: string[] = [];
		const gitService = new class extends mock<IAgentHostGitService>() {
			override async getRepositoryRoot(workingDirectory: URI): Promise<URI | undefined> {
				return workingDirectory;
			}
			override async getBranches(workingDirectory: URI, query?: IRefQuery): Promise<Branch[]> {
				gitCalls.push(`getBranches:${workingDirectory.toString()}:${query?.pattern}:${query?.sort}`);
				return branches;
			}
			override async getDefaultBranch2(): Promise<Branch | undefined> {
				return defaultBranch;
			}
		}();
		const chatRefreshes: { sessionKey: string; immediate?: boolean }[] = [];
		const gitStateService = new class extends mock<IAgentHostGitStateService>() {
			override async refreshSessionGitState(sessionKey: string, _source?: IAgentHostCredentialSource, options?: IRefreshSessionGitStateOptions): Promise<void> {
				chatRefreshes.push({ sessionKey, immediate: options?.immediate });
			}
		}();
		const writes: { session: string; target: string; values: Readonly<Record<string, string | null>> }[] = [];
		const sessionStateStore = new class extends mock<IAgentHostSessionStateStore>() {
			override async writeMetadata(session: URI, resource: URI, values: Readonly<Record<string, string | null>>): Promise<void> {
				writes.push({ session: session.toString(), target: resource.toString(), values });
			}
		}();
		const contribution = disposables.add(new AgentHostBaseBranchOperationContribution(
			stateManager,
			createTestChatOwnershipService(stateManager),
			gitService,
			gitStateService,
			sessionStateStore,
			new NullLogService(),
		));

		const handlers = new Map<string, IChangesetOperationHandler>();
		const registry: IChangesetOperationRegistry = {
			registerChangesetOperationHandler: (operationId, handler) => {
				handlers.set(operationId, handler);
				return toDisposable(() => handlers.delete(operationId));
			},
			onDidChangeOperations: () => { },
		};
		disposables.add(contribution.registerHandlers(registry));

		const branchChangeset = (chat: string) => buildBranchChangesetUri(resolveBranchChangesetScopeForSource(stateManager, chat).ownerUri);
		const invoke = (operationId: string, chat: string, meta?: Record<string, unknown>) => handlers.get(operationId)!.invoke({ channel: branchChangeset(chat), operationId, _meta: meta }, CancellationToken.None);
		return { stateManager, contribution, gitCalls, chatRefreshes, writes, handlers, branchChangeset, invoke };
	}

	test('lists the local and remote branch refs of the changeset folder, most recently committed first, with the default ref', async () => {
		const h = createHarness();

		const result = await h.invoke(LIST_BASE_BRANCHES_OPERATION_ID, defaultChat);
		const withUnlistedDefault = await createHarness({ kind: GitRefType.RemoteHead, ref: 'refs/remotes/origin/gone', name: 'origin/gone', remote: 'origin' }).invoke(LIST_BASE_BRANCHES_OPERATION_ID, defaultChat);

		const refs = ['refs/heads/feature', 'refs/remotes/origin/main', 'refs/heads/main', 'refs/remotes/origin/release/1.90', 'refs/remotes/upstream/fix', 'refs/heads/fix'];
		assert.deepStrictEqual({ candidates: readBaseBranchCandidatesResult(result), withUnlistedDefault: readBaseBranchCandidatesResult(withUnlistedDefault), gitCalls: h.gitCalls }, {
			candidates: { refs, defaultRef: 'refs/remotes/origin/main' },
			withUnlistedDefault: { refs },
			gitCalls: [`getBranches:${repository}:refs/heads,refs/remotes:committerdate`],
		});
	});

	test('records the requested ref exactly for the changeset source, and has the Git state of every chat in the folder refreshed', async () => {
		const h = createHarness();

		const results = [
			await h.invoke(SET_BASE_BRANCH_OPERATION_ID, defaultChat, createSetBaseBranchMeta('refs/heads/main')),
			await h.invoke(SET_BASE_BRANCH_OPERATION_ID, otherFolderChat, createSetBaseBranchMeta('refs/remotes/upstream/fix')),
		];
		const errors = [
			await errorCode(h.invoke(SET_BASE_BRANCH_OPERATION_ID, defaultChat)),
			await errorCode(h.invoke(SET_BASE_BRANCH_OPERATION_ID, defaultChat, createSetBaseBranchMeta('main'))),
			await errorCode(h.invoke(SET_BASE_BRANCH_OPERATION_ID, defaultChat, createSetBaseBranchMeta('refs/heads/unknown'))),
		];

		const changesGitState = { list: h.handlers.get(LIST_BASE_BRANCHES_OPERATION_ID)?.changesGitState, set: h.handlers.get(SET_BASE_BRANCH_OPERATION_ID)?.changesGitState };
		assert.deepStrictEqual({ results, errors, writes: h.writes, changesGitState, chatRefreshes: h.chatRefreshes }, {
			results: [{}, {}],
			errors: [JsonRpcErrorCodes.InvalidParams, JsonRpcErrorCodes.InvalidParams, JsonRpcErrorCodes.InvalidParams],
			writes: [
				{ session, target: session, values: { 'agentHost.diffBaseBranch': 'refs/heads/main' } },
				{ session, target: otherFolderChat, values: { 'agentHost.diffBaseBranch': 'refs/remotes/upstream/fix' } },
			],
			// The operation service refreshes the changeset owner itself.
			changesGitState: { list: false, set: true },
			chatRefreshes: [{ sessionKey: sameFolderChat, immediate: true }],
		});
	});

	test('advertises the operations on single-folder Branch Changes only where the diff reads the recorded base', () => {
		const h = createHarness();
		const operationIds = (changesetUri: string, changesetKind: ChangesetKind) =>
			h.contribution.getOperations({ sessionKey: session, changesetUri, changesetKind })?.map(operation => operation.id);

		const branchOperations = h.contribution.getOperations({ sessionKey: session, changesetUri: h.branchChangeset(defaultChat), changesetKind: ChangesetKind.Branch });
		const uncommitted = operationIds(buildUncommittedChangesetUri(defaultChat), ChangesetKind.Uncommitted);
		const multiRootChat = buildChatUri(session, 'multi-root');
		h.stateManager.addChat(session, multiRootChat, creationTimeChatStorageResource(session, multiRootChat, defaultChat), { workingDirectories: [repository, otherRepository] });
		const multiRoot = operationIds(h.branchChangeset(multiRootChat), ChangesetKind.Branch);
		h.stateManager.dispatchServerAction(defaultChat, { type: ActionType.ChatWorkingDirectorySet, directory: URI.file('/worktree').toString() });
		const defaultChatOutsideSessionFolder = operationIds(h.branchChangeset(defaultChat), ChangesetKind.Branch);
		const peerOutsideSessionFolder = operationIds(h.branchChangeset(otherFolderChat), ChangesetKind.Branch);

		assert.deepStrictEqual({ branchOperations, uncommitted, multiRoot, defaultChatOutsideSessionFolder, peerOutsideSessionFolder }, {
			branchOperations: [{
				id: LIST_BASE_BRANCHES_OPERATION_ID,
				label: 'List Base Branches',
				description: 'List the branches that Branch Changes can compare against.',
				group: 'base-branch',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			}, {
				id: SET_BASE_BRANCH_OPERATION_ID,
				label: 'Change Base Branch',
				description: 'Compare Branch Changes against another branch.',
				group: 'base-branch',
				scopes: [ChangesetOperationScope.Changeset],
				status: ChangesetOperationStatus.Idle,
			}],
			uncommitted: undefined,
			multiRoot: undefined,
			defaultChatOutsideSessionFolder: undefined,
			peerOutsideSessionFolder: [LIST_BASE_BRANCHES_OPERATION_ID, SET_BASE_BRANCH_OPERATION_ID],
		});
	});
});
