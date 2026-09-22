/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostGitStateService } from '../../common/agentHostGitStateService.js';
import { buildBranchChangesetUri } from '../../common/changesetUri.js';
import { SessionStatus, buildChatUri, withSessionGitState, type ISessionGitState } from '../../common/state/sessionState.js';
import { AgentHostReviewService } from '../../node/agentHostReviewService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { createNoopGitService, createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

suite('AgentHostReviewService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the chat database and Git state for chat-owned review changes', async () => {
		const session = 'mock:/session';
		const chat = buildChatUri(session, 'peer');
		const siblingChat = buildChatUri(session, 'sibling');
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

		await service.setReviewState(buildBranchChangesetUri(chat), ['file:///chat/file.ts'], true);
		await service.getReviewedPaths(siblingChat, URI.parse('file:///chat'), 'chat-main');

		assert.deepStrictEqual({
			openedDatabases,
			baseBranches,
			reviewedRefsAreDistinct: new Set(reviewedRefs).size === reviewedRefs.length,
		}, {
			openedDatabases: [chat],
			baseBranches: ['chat-main', 'chat-main'],
			reviewedRefsAreDistinct: true,
		});
	});
});
