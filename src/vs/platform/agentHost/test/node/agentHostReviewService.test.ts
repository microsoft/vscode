/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agent.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { buildBranchChangesetUri, buildFolderChangesetOwnerUri } from '../../common/changesetUri.js';
import { buildReviewedRefName } from '../../common/agentHostReviewService.js';
import { SessionStatus, buildChatUri, withSessionGitState, type ISessionGitState } from '../../common/state/sessionState.js';
import { AgentHostReviewService } from '../../node/agentHostReviewService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

function createNoopGitStateService(): IAgentHostGitStateService {
	return {
		_serviceBrand: undefined,
		onDidRefreshSessionGitState: Event.None,
		onDidChangeSessionGitHubState: Event.None,
		refreshSessionGitState: async () => { },
		getSessionGitState: () => undefined,
		getMaterializedWorktreeMeta: () => undefined,
		resolveSessionBaseBranchName: async () => undefined,
		setSessionGitHubState: async () => { },
		recordSessionMerge: async () => { },
		attachSessionGitHubPullRequest: async () => { },
	};
}

suite('AgentHostReviewService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the source chat database and Git state for folder review changes', async () => {
		const session = 'mock:/session';
		const chat = buildChatUri(session, 'peer');
		const folderOwner = buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId(['file:///chat']));
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		stateManager.createSession({
			resource: session,
			provider: 'mock',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: ['file:///session'],
		});
		stateManager.setSessionMeta(session, withSessionGitState(undefined, {
			branchName: 'session-feature',
			baseBranchName: 'session-main',
		}));
		stateManager.addChat(session, chat, { workingDirectories: ['file:///chat'] });

		const openedDatabases: string[] = [];
		const sessionDataService = createSessionDataService(new TestSessionDatabase());
		const dataService = {
			...sessionDataService,
			openDatabase: (resource: URI) => {
				openedDatabases.push(resource.toString());
				return sessionDataService.openDatabase(resource);
			},
		};
		const chatGitState: ISessionGitState = {
			branchName: 'chat-feature',
			baseBranchName: 'chat-main',
		};
		const gitStateService: IAgentHostGitStateService = {
			_serviceBrand: undefined,
			onDidRefreshSessionGitState: Event.None,
			onDidChangeSessionGitHubState: Event.None,
			refreshSessionGitState: async () => { },
			getSessionGitState: owner => owner === chat ? chatGitState : undefined,
			getMaterializedWorktreeMeta: () => undefined,
			resolveSessionBaseBranchName: async () => undefined,
			setSessionGitHubState: async () => { },
			recordSessionMerge: async () => { },
			attachSessionGitHubPullRequest: async () => { },
		};
		const baseBranches: (string | undefined)[] = [];
		const reviewedRefs: string[] = [];
		const gitService = createNoopGitService();
		gitService.getRepositoryRoot = async workingDirectory => workingDirectory;
		gitService.resolveBranchBaselineCommit = async (_workingDirectory, baseBranch) => {
			baseBranches.push(baseBranch);
			return 'baseline';
		};
		gitService.revParse = async (_repositoryRoot, expression) => {
			if (expression === 'baseline^{tree}') {
				return 'baseline-tree';
			}
			if (expression.endsWith('/reviewed')) {
				reviewedRefs.push(expression);
			}
			return undefined;
		};
		const service = disposables.add(new AgentHostReviewService(
			stateManager,
			gitService,
			dataService,
			gitStateService,
			logService,
		));

		await service.setReviewState(buildBranchChangesetUri(folderOwner), ['file:///chat/file.ts'], true);
		await service.getReviewedPaths(folderOwner, URI.parse('file:///chat'), 'chat-main');

		assert.deepStrictEqual({
			openedDatabases,
			baseBranches,
			reviewedRefsAreShared: new Set(reviewedRefs).size === 1,
		}, {
			openedDatabases: [chat],
			baseBranches: ['chat-main', 'chat-main'],
			reviewedRefsAreShared: false,
		});
	});

	test('migrates a legacy session review ref into the folder scope', async () => {
		const session = 'mock:/session';
		const workingDirectory = URI.file('/workspace');
		const folderOwner = buildFolderChangesetOwnerUri(session, getWorkingDirectoryScopeId([workingDirectory.toString()]));
		const legacyRef = buildReviewedRefName(AgentSession.id(session));
		const updates: Array<{ ref: string; commit: string }> = [];
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: session,
			provider: 'mock',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [workingDirectory.toString()],
		});
		const gitService = createNoopGitService();
		gitService.getRepositoryRoot = async resource => resource;
		gitService.resolveBranchBaselineCommit = async () => 'baseline';
		gitService.revParse = async (_root, expression) => {
			if (expression === 'baseline^{tree}') {
				return 'baseline-tree';
			}
			if (expression === legacyRef) {
				return 'legacy-commit';
			}
			if (expression === 'legacy-commit^{tree}') {
				return 'reviewed-tree';
			}
			return undefined;
		};
		gitService.captureWorkingTreeAsTree = async () => 'working-tree';
		gitService.diffTreePaths = async () => [];
		gitService.updateRef = async (_root, ref, commit) => { updates.push({ ref, commit }); };
		const service = disposables.add(new AgentHostReviewService(
			stateManager,
			gitService,
			createSessionDataService(new TestSessionDatabase()),
			createNoopGitStateService(),
			new NullLogService(),
		));

		await service.getReviewedPaths(folderOwner, workingDirectory, 'main');

		assert.deepStrictEqual(updates, [{
			ref: buildReviewedRefName(`${AgentSession.id(session)}-workspace-${getWorkingDirectoryScopeId([workingDirectory.toString()])}`),
			commit: 'legacy-commit',
		}]);
	});

	test('copies multi-root folder-scoped review refs without loaded source state', async () => {
		const sourceSession = 'mock:/source';
		const targetSession = 'mock:/target';
		const workingDirectories = [URI.file('/workspace-a'), URI.file('/workspace-b')];
		const updates: Array<{ root: string; ref: string; commit: string }> = [];
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const scopeId = getWorkingDirectoryScopeId(workingDirectories.map(directory => directory.toString()));
		const sourceRef = buildReviewedRefName(`${AgentSession.id(sourceSession)}-workspace-${scopeId}`);
		const targetRef = buildReviewedRefName(`${AgentSession.id(targetSession)}-workspace-${scopeId}`);
		const gitService = createNoopGitService();
		gitService.getRepositoryRoot = async resource => resource;
		gitService.revParse = async (_root, expression) => expression === sourceRef ? 'source-commit' : undefined;
		gitService.updateRef = async (root, ref, commit) => { updates.push({ root: root.toString(), ref, commit }); };
		const service = disposables.add(new AgentHostReviewService(
			stateManager,
			gitService,
			createSessionDataService(new TestSessionDatabase()),
			createNoopGitStateService(),
			new NullLogService(),
		));

		await service.copyReviewedRef(sourceSession, targetSession, workingDirectories, workingDirectories);

		assert.deepStrictEqual(updates, [
			{ root: 'file:///workspace-a', ref: targetRef, commit: 'source-commit' },
			{ root: 'file:///workspace-b', ref: targetRef, commit: 'source-commit' },
		]);
	});

	test('deletes stale folder and chat review refs during session cleanup', async () => {
		const session = 'mock:/session';
		const workingDirectory = URI.file('/workspace');
		const staleFolderRef = `refs/agents/${AgentSession.id(session)}-workspace-stale/reviewed`;
		const staleChatRef = `refs/agents/${AgentSession.id(session)}-chat-stale/reviewed`;
		const deletedRefs: string[][] = [];
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: session,
			provider: 'mock',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(0).toISOString(),
			modifiedAt: new Date(0).toISOString(),
			workingDirectories: [workingDirectory.toString()],
		});
		const gitService = createNoopGitService();
		gitService.getRepositoryRoot = async resource => resource;
		gitService.listRefNamesWithOids = async () => [
			{ ref: staleFolderRef, oid: 'folder-commit' },
			{ ref: staleChatRef, oid: 'chat-commit' },
		];
		gitService.deleteRefs = async (_root, refs) => { deletedRefs.push([...refs]); };
		const service = disposables.add(new AgentHostReviewService(
			stateManager,
			gitService,
			createSessionDataService(new TestSessionDatabase()),
			createNoopGitStateService(),
			new NullLogService(),
		));

		await service.disposeSessionData(session, [workingDirectory.toString()]);

		assert.deepStrictEqual(deletedRefs, [[staleFolderRef, staleChatRef]]);
	});

	test('does not delete refs when the session has no reviewed refs', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const calls: string[] = [];
		const gitService = createNoopGitService();
		gitService.getRepositoryRoot = async resource => resource;
		gitService.listRefNamesWithOids = async (_root, pattern) => {
			calls.push(pattern);
			return [];
		};
		gitService.deleteRefs = async () => { calls.push('deleteRefs'); };
		const service = disposables.add(new AgentHostReviewService(
			stateManager,
			gitService,
			createSessionDataService(new TestSessionDatabase()),
			createNoopGitStateService(),
			new NullLogService(),
		));

		await service.disposeSessionData('mock:/session', ['file:///workspace']);

		assert.deepStrictEqual(calls, ['refs/agents/session*/reviewed']);
	});

	test('deletes only existing session review refs in each repository', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionRef = buildReviewedRefName('session');
		const folderRef = buildReviewedRefName('session-workspace-stale');
		const chatRef = buildReviewedRefName('session-chat-stale');
		const deletedRefs: Array<{ root: string; refs: readonly string[] }> = [];
		const gitService = createNoopGitService();
		gitService.getRepositoryRoot = async resource => resource;
		gitService.listRefNamesWithOids = async root => (root.path === '/workspace-a'
			? [sessionRef, folderRef, 'refs/agents/session2/reviewed', 'refs/agents/session-chat-stale/checkpoints/turn/0']
			: [chatRef]
		).map(ref => ({ ref, oid: 'commit' }));
		gitService.deleteRefs = async (root, refs) => { deletedRefs.push({ root: root.toString(), refs }); };
		const service = disposables.add(new AgentHostReviewService(
			stateManager,
			gitService,
			createSessionDataService(new TestSessionDatabase()),
			createNoopGitStateService(),
			new NullLogService(),
		));

		await service.disposeSessionData('mock:/session', ['file:///workspace-a', 'file:///workspace-b']);

		assert.deepStrictEqual(deletedRefs, [
			{ root: 'file:///workspace-a', refs: [sessionRef, folderRef] },
			{ root: 'file:///workspace-b', refs: [chatRef] },
		]);
	});

	for (const enumeration of ['unavailable', 'failed']) {
		test(`retains known-ref cleanup when enumeration is ${enumeration}`, async () => {
			const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const workingDirectories = ['file:///workspace'];
			const deletedRefs: string[][] = [];
			const gitService = createNoopGitService();
			gitService.getRepositoryRoot = async resource => resource;
			gitService.listRefNamesWithOids = enumeration === 'unavailable' ? undefined : async () => { throw new Error('Git enumeration failed'); };
			gitService.deleteRefs = async (_root, refs) => { deletedRefs.push([...refs]); };
			const service = disposables.add(new AgentHostReviewService(
				stateManager,
				gitService,
				createSessionDataService(new TestSessionDatabase()),
				createNoopGitStateService(),
				new NullLogService(),
			));

			await service.disposeSessionData('mock:/session', workingDirectories);

			assert.deepStrictEqual(deletedRefs, [[
				buildReviewedRefName('session'),
				buildReviewedRefName(`session-workspace-${getWorkingDirectoryScopeId(workingDirectories)}`),
			]]);
		});
	}
});
