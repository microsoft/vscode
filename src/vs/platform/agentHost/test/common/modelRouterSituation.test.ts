/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { ContextSizeConfigKey, createContextSizeConfigSchemaPropertyFromLimits } from '../../common/agentModelConfiguration.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../../common/agentHostWorkingDirectories.js';
import { describeModelRouterModel, describeModelRouterSituation, modelRouterWorkspaceSituation, summarizeModelRouterAttachments } from '../../common/modelRouterSituation.js';
import { MessageAttachmentKind, withFolderGitHubState, withFolderScopeGitState, withSessionGitHubState, withSessionGitState, type MessageAttachment } from '../../common/state/sessionState.js';

suite('modelRouterSituation', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('counts attachments by kind and adds up selected lines, without their content', () => {
		const selection = (startLine: number, endLine: number, endCharacter = 4) => ({ range: { start: { line: startLine, character: 0 }, end: { line: endLine, character: endCharacter } } });
		const attachments: MessageAttachment[] = [
			{ type: MessageAttachmentKind.Resource, label: 'cart.js', uri: 'file:///repo/src/cart.js', displayKind: 'document' },
			{ type: MessageAttachmentKind.Resource, label: 'checkout.js', uri: 'file:///repo/src/checkout.js' },
			{ type: MessageAttachmentKind.Resource, label: 'cart.js:10-49', uri: 'file:///repo/src/cart.js', selection: selection(10, 49) },
			// Called a document by its client, and still a selection for its lines.
			{ type: MessageAttachmentKind.Resource, label: 'pay.js:1-2', uri: 'file:///repo/src/pay.js', displayKind: 'document', selection: selection(1, 2) },
			// Whole lines end at the start of the next line, which is not selected.
			{ type: MessageAttachmentKind.Resource, label: 'pay.js:1-2', uri: 'file:///repo/src/pay.js', selection: selection(0, 2, 0) },
			{ type: MessageAttachmentKind.Resource, label: 'pay.js:6-8', uri: 'file:///repo/src/pay.js', selection: selection(5, 8, 0) },
			{ type: MessageAttachmentKind.Resource, label: 'pay.js:5', uri: 'file:///repo/src/pay.js', selection: selection(4, 4, 0) },
			{ type: MessageAttachmentKind.EmbeddedResource, label: 'screenshot.png', data: 'AAAA', contentType: 'image/png' },
			{ type: MessageAttachmentKind.Resource, label: 'src', uri: 'file:///repo/src', displayKind: 'directory' },
			{ type: MessageAttachmentKind.Annotations, label: 'Review comments', resource: 'annotations:/1' },
			{ type: MessageAttachmentKind.Simple, label: 'Something else', modelRepresentation: 'secret text' },
		];
		assert.deepStrictEqual({ summary: summarizeModelRouterAttachments(attachments), none: summarizeModelRouterAttachments(undefined) }, {
			summary: [
				{ kind: 'attachment', count: 1 },
				{ kind: 'directory', count: 1 },
				{ kind: 'document', count: 2 },
				{ kind: 'image', count: 1 },
				{ kind: 'selection', count: 5, lines: 48 },
				{ kind: 'set of review comments', count: 1 },
			],
			none: [],
		});
	});

	test('reads the workspace, repository, changed files and pull request of the chat\'s own folder', () => {
		const folder = 'file:///Users/dev/shop-checkout';
		const other = 'file:///Users/dev/shop-docs';
		const pullRequestUrl = 'https://github.com/contoso/shop/pull/7';
		const session = (pullRequestBranchName: string | undefined, pullRequestStateUrl = pullRequestUrl, uncommittedChanges = 12, pullRequestState: 'open' | 'merged' = 'open') => ({
			_meta: withSessionGitHubState(withSessionGitState(undefined, { branchName: 'feature', uncommittedChanges }), folder, { owner: 'contoso', repo: 'shop', pullRequestUrls: [pullRequestUrl], pullRequestBranchName, pullRequestState, pullRequestStateUrl }),
			workingDirectories: [folder],
		});
		const withPeerFolder = withFolderScopeGitState(withFolderGitHubState(session('feature')._meta, getWorkingDirectoryKey(other), { owner: 'contoso', repo: 'docs' }, other), getWorkingDirectoryScopeId([other]), { branchName: 'main', uncommittedChanges: 25 }, [other]);
		// A snapshot stored for the session's folder by a peer, which is not the session's current state.
		const withPeerSnapshot = { ...session('feature'), _meta: withFolderScopeGitState(session('feature')._meta, getWorkingDirectoryScopeId([folder]), { branchName: 'old-feature', uncommittedChanges: 40 }, [folder]) };
		assert.deepStrictEqual({
			full: modelRouterWorkspaceSituation(session('feature'), [folder], true),
			fewChangedFilesAndMergedPullRequest: modelRouterWorkspaceSituation(session('feature', pullRequestUrl, 9, 'merged'), [folder], true),
			pullRequestOfAnotherBranch: modelRouterWorkspaceSituation(session('old-feature'), [folder], true),
			pullRequestWithoutBranch: modelRouterWorkspaceSituation(session(undefined), [folder], true),
			stateOfAnotherPullRequest: modelRouterWorkspaceSituation(session('feature', 'https://github.com/contoso/shop/pull/3'), [folder], true),
			defaultChatKeepsSessionState: modelRouterWorkspaceSituation(withPeerSnapshot, [folder], true),
			peerChatInSessionFolder: modelRouterWorkspaceSituation(withPeerSnapshot, [folder], false),
			peerChatFolder: modelRouterWorkspaceSituation({ _meta: withPeerFolder, workingDirectories: [folder] }, [other], false),
			folderWithoutState: modelRouterWorkspaceSituation(session('feature'), ['file:///Users/dev/elsewhere'], false),
			noFolder: modelRouterWorkspaceSituation(session('feature'), undefined, true),
			noSession: modelRouterWorkspaceSituation(undefined, [folder], true),
		}, {
			full: { workspace: 'shop-checkout', repository: 'contoso/shop', uncommittedFiles: 12, pullRequest: 'open' },
			fewChangedFilesAndMergedPullRequest: { workspace: 'shop-checkout', repository: 'contoso/shop' },
			pullRequestOfAnotherBranch: { workspace: 'shop-checkout', repository: 'contoso/shop', uncommittedFiles: 12 },
			pullRequestWithoutBranch: { workspace: 'shop-checkout', repository: 'contoso/shop', uncommittedFiles: 12 },
			stateOfAnotherPullRequest: { workspace: 'shop-checkout', repository: 'contoso/shop', uncommittedFiles: 12 },
			defaultChatKeepsSessionState: { workspace: 'shop-checkout', repository: 'contoso/shop', uncommittedFiles: 12, pullRequest: 'open' },
			peerChatInSessionFolder: { workspace: 'shop-checkout', repository: 'contoso/shop', uncommittedFiles: 40 },
			peerChatFolder: { workspace: 'shop-docs', repository: 'contoso/docs', uncommittedFiles: 25 },
			folderWithoutState: { workspace: 'elsewhere' },
			noFolder: {},
			noSession: {},
		});
	});

	test('describes a turn in a few lines, and says nothing when nothing is known', () => {
		assert.deepStrictEqual({
			full: describeModelRouterSituation({
				attachments: [{ kind: 'document', count: 2 }, { kind: 'selection', count: 1, lines: 40 }, { kind: 'image', count: 1 }],
				mode: 'plan',
				agent: 'Reviewer',
				workspace: 'shop-checkout',
				repository: 'contoso/shop',
				uncommittedFiles: 12,
				pullRequest: 'open',
			}),
			plurals: describeModelRouterSituation({ attachments: [{ kind: 'directory', count: 2 }, { kind: 'set of review comments', count: 2 }, { kind: 'sketch', count: 3 }] }),
			longNames: describeModelRouterSituation({ attachments: [{ kind: 'image\n- Workspace: other', count: 1 }], agent: `Reviewer\n- Plan mode${' x'.repeat(100)}`, workspace: ' \n ' }),
			autopilot: describeModelRouterSituation({ mode: 'autopilot', repository: 'contoso/shop' }),
			empty: describeModelRouterSituation({}),
			none: describeModelRouterSituation(undefined),
		}, {
			full: [
				'Attached: 2 documents, 1 selection (40 lines), 1 image',
				'Plan mode: the agent plans first and carries the plan out when the user is ready',
				'Custom agent chosen by the user: Reviewer',
				'Workspace: shop-checkout (contoso/shop); 12 files with uncommitted changes; the branch has an open pull request',
			],
			// A kind a client names itself is not given a plural.
			plurals: ['Attached: 2 directories, 2 sets of review comments, 3 sketch'],
			longNames: ['Attached: 1 image - Workspace: other', `Custom agent chosen by the user: ${`Reviewer - Plan mode${' x'.repeat(100)}`.slice(0, 80)}`],
			autopilot: ['Autopilot mode: the agent works on its own until the task is done', 'Workspace: contoso/shop'],
			empty: [],
			none: [],
		});
	});

	test('says what a model costs and how much it can read', () => {
		const model = (extra: Partial<IAgentModelInfo>): IAgentModelInfo => ({ provider: 'copilotcli', id: 'm', name: 'M', supportsVision: true, ...extra });
		const windows = (...limits: [number, number]) => ({ type: 'object' as const, properties: { [ContextSizeConfigKey]: createContextSizeConfigSchemaPropertyFromLimits(...limits)! } });
		assert.deepStrictEqual([
			describeModelRouterModel(model({ _meta: { priceCategory: 'very_high' }, configSchema: windows(200_000, 1_000_000) })),
			describeModelRouterModel(model({ _meta: { priceCategory: 'low' } })),
			describeModelRouterModel(model({ configSchema: windows(128_000, 272_000) })),
			describeModelRouterModel(model({ maxContextWindow: 128_000 })),
			describeModelRouterModel(model({})),
		], [
			'very high cost, context window 200K or 1M',
			'low cost',
			'context window 128K or 272K',
			'context window 128K',
			undefined,
		]);
	});
});
