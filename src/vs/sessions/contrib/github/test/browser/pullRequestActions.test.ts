/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { defaultAgentMergeConfiguration } from '../../../../../platform/agentHost/common/agentMerge.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { Menus } from '../../../../browser/menus.js';
import { SessionHasPullRequestContext } from '../../../../common/contextkeys.js';
import { IGitHubPullRequestRef, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import '../../browser/pullRequestActions.js';
import { SessionPullRequestPresentationModel } from '../../browser/pullRequestIconStatus.js';
import { IGitHubService } from '../../browser/githubService.js';
import { GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPullRequest } from '../../common/types.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { GitHubPullRequestCIModel } from '../../browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../browser/models/githubPullRequestReviewThreadsModel.js';

function createSessionWithPullRequest(pullRequestUri: URI | undefined, pullRequestRefs?: readonly IGitHubPullRequestRef[]): ISession {
	const workspaceUri = URI.from({ scheme: 'test', path: '/workspace' });
	const workspace: ISessionWorkspace = {
		uri: workspaceUri,
		label: 'workspace',
		icon: Codicon.folder,
		folders: [{
			root: workspaceUri,
			workingDirectory: workspaceUri,
			name: 'workspace',
			description: undefined,
			gitRepository: pullRequestUri ? {
				uri: workspaceUri,
				workTreeUri: undefined,
				baseBranchName: undefined,
				gitHubInfo: constObservable({
					owner: 'owner',
					repo: 'repo',
					pullRequest: { number: 1, uri: pullRequestUri },
					pullRequests: pullRequestRefs,
				}),
			} : undefined,
		}],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
	return new class extends mock<ISession>() {
		override readonly workspace = constObservable<ISessionWorkspace | undefined>(workspace);
	};
}

class TestOpenerService extends mock<IOpenerService>() {
	readonly opened: { readonly resource: URI; readonly openExternal: boolean | undefined; readonly allowContributedOpeners: boolean | string | undefined }[] = [];

	override async open(resource: URI, options?: { readonly openExternal?: boolean; readonly allowContributedOpeners?: boolean | string }): Promise<boolean> {
		this.opened.push({
			resource,
			openExternal: options?.openExternal,
			allowContributedOpeners: options?.allowContributedOpeners,
		});
		return true;
	}
}

suite('Pull Request Actions', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('shared presentation model applies Agent Merge to live pull request status', () => {
		const pullRequest = upcastPartial<IGitHubPullRequest>({
			number: 1,
			title: 'Fix pills',
			state: GitHubPullRequestState.Open,
			headSha: 'abc123',
			isDraft: false,
		});
		const pullRequestModel = upcastPartial<GitHubPullRequestModel>({
			pullRequest: constObservable(pullRequest),
			refresh: async () => { },
			startPolling: () => Disposable.None,
		});
		const ciModel = upcastPartial<GitHubPullRequestCIModel>({
			overallStatus: constObservable(GitHubCIOverallStatus.Failure),
			refresh: async () => { },
			startPolling: () => Disposable.None,
		});
		const reviewThreadsModel = upcastPartial<GitHubPullRequestReviewThreadsModel>({
			reviewThreads: constObservable([]),
			refresh: async () => { },
			startPolling: () => Disposable.None,
		});
		const gitHubService = upcastPartial<IGitHubService>({
			createPullRequestModelReference: () => ({ object: pullRequestModel, dispose: () => { } }),
			createPullRequestCIModelReference: () => ({ object: ciModel, dispose: () => { } }),
			createPullRequestReviewThreadsModelReference: () => ({ object: reviewThreadsModel, dispose: () => { } }),
		});
		const model = store.add(new SessionPullRequestPresentationModel(
			constObservable([{
				owner: 'microsoft',
				repo: 'vscode',
				number: 1,
				uri: URI.parse('https://github.com/microsoft/vscode/pull/1'),
			}]),
			constObservable({
				enabled: true,
				actions: {
					...defaultAgentMergeConfiguration,
					fixCI: true,
					resolveConflicts: false,
					addressReviews: false,
				},
			}),
			gitHubService,
		));

		assert.deepStrictEqual({
			entryIcon: model.pullRequests.get()[0].icon?.id,
			summaryIcon: model.icon.get().id,
		}, {
			entryIcon: Codicon.gitPullRequest.id,
			summaryIcon: Codicon.gitPullRequest.id,
		});
	});

	test('shared presentation model does not own polling', () => {
		let refreshCount = 0;
		let pollingStartCount = 0;
		let pollingStopCount = 0;
		const pullRequestModel = upcastPartial<GitHubPullRequestModel>({
			pullRequest: constObservable(undefined),
			refresh: async () => { refreshCount++; },
			startPolling: () => {
				pollingStartCount++;
				return toDisposable(() => pollingStopCount++);
			},
		});
		const gitHubService = upcastPartial<IGitHubService>({
			createPullRequestModelReference: () => ({ object: pullRequestModel, dispose: () => { } }),
		});
		const pullRequestRefs = observableValue<readonly IGitHubPullRequestRef[]>('pullRequestActions.refs', [{
			owner: 'microsoft',
			repo: 'vscode',
			number: 1,
			uri: URI.parse('https://github.com/microsoft/vscode/pull/1'),
			icon: Codicon.gitPullRequest,
		}]);
		const model = store.add(new SessionPullRequestPresentationModel(pullRequestRefs, constObservable(undefined), gitHubService));

		model.pullRequests.get();
		pullRequestRefs.set([{
			...pullRequestRefs.get()[0],
			icon: Codicon.gitPullRequestDone,
			title: 'Updated title',
		}], undefined);
		model.pullRequests.get();

		assert.deepStrictEqual({
			refreshCount,
			pollingStartCount,
			pollingStopCount,
			entryIcon: model.pullRequests.get()[0].icon?.id,
		}, {
			refreshCount: 0,
			pollingStartCount: 0,
			pollingStopCount: 0,
			entryIcon: Codicon.gitPullRequestDone.id,
		});
	});

	test('Open Pull Request and Copy Pull Request URL are contributed to a dedicated context menu group', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionItemContextMenu)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'workbench.agentSessions.action.openPullRequest' || item.command.id === 'workbench.agentSessions.action.copyPullRequestUrl');

		assert.deepStrictEqual(items.map(item => ({
			id: item.command.id,
			group: item.group,
			order: item.order,
			hasPullRequestGate: (item.when?.serialize() ?? '').includes(SessionHasPullRequestContext.key),
		})).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [
			{ id: 'workbench.agentSessions.action.openPullRequest', group: '2_pullRequest', order: 0, hasPullRequestGate: true },
			{ id: 'workbench.agentSessions.action.copyPullRequestUrl', group: '2_pullRequest', order: 1, hasPullRequestGate: true },
		]);
	});

	test('Copy Pull Request URL writes the pull request URL to the clipboard', async () => {
		const pullRequestUri = URI.parse('https://github.com/owner/repo/pull/1');
		const session = createSessionWithPullRequest(pullRequestUri);

		const instantiationService = new TestInstantiationService();
		const clipboardService = new class extends mock<IClipboardService>() {
			readonly writes: string[] = [];
			override async writeText(text: string): Promise<void> {
				this.writes.push(text);
			}
		};
		instantiationService.stub(IClipboardService, clipboardService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.copyPullRequestUrl')!.handler(accessor, session));

		assert.deepStrictEqual(clipboardService.writes, [pullRequestUri.toString(true)]);
	});

	test('Copy Pull Request URL is a no-op when the session has no pull request', async () => {
		const session = createSessionWithPullRequest(undefined);

		const instantiationService = new TestInstantiationService();
		const clipboardService = new class extends mock<IClipboardService>() {
			readonly writes: string[] = [];
			override async writeText(text: string): Promise<void> {
				this.writes.push(text);
			}
		};
		instantiationService.stub(IClipboardService, clipboardService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.copyPullRequestUrl')!.handler(accessor, session));

		assert.deepStrictEqual(clipboardService.writes, []);
	});

	test('Open Pull Request allows contributed external URI openers', async () => {
		const pullRequestUri = URI.parse('https://github.com/owner/repo/pull/1');
		const session = createSessionWithPullRequest(pullRequestUri);

		const instantiationService = new TestInstantiationService();
		const openerService = new TestOpenerService();
		instantiationService.stub(IOpenerService, openerService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.openPullRequest')!.handler(accessor, session));

		assert.deepStrictEqual(openerService.opened, [{
			resource: pullRequestUri,
			openExternal: true,
			allowContributedOpeners: true,
		}]);
	});

	test('Copy Pull Request URL uses an explicit contextual pull request', async () => {
		const secondPullRequestUri = URI.parse('https://github.com/upstream/project/pull/7');
		const secondPullRequest = { owner: 'upstream', repo: 'project', number: 7, uri: secondPullRequestUri };

		const instantiationService = new TestInstantiationService();
		const clipboardService = new class extends mock<IClipboardService>() {
			readonly writes: string[] = [];
			override async writeText(text: string): Promise<void> {
				this.writes.push(text);
			}
		};
		instantiationService.stub(IClipboardService, clipboardService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.copyPullRequestUrl')!.handler(accessor, { pullRequest: secondPullRequest }));

		assert.deepStrictEqual(clipboardService.writes, [secondPullRequestUri.toString(true)]);
	});

});
