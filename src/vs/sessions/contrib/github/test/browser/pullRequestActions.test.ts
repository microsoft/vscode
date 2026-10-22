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
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { isIMenuItem, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { INotificationService, NotificationMessage } from '../../../../../platform/notification/common/notification.js';
import { IResourceMultiDiffEditorInput, isResourceMultiDiffEditorInput } from '../../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { SessionHasPullRequestContext } from '../../../../common/contextkeys.js';
import { IGitHubPullRequestRef, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import '../../browser/pullRequestActions.js';
import { SessionPullRequestPresentationModel } from '../../browser/pullRequestIconStatus.js';
import { IGitHubService } from '../../browser/githubService.js';
import { GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPullRequest, IGitHubPullRequestChanges, OPEN_PULL_REQUEST_CHANGES_ACTION_ID } from '../../common/types.js';
import { parsePRContentUri } from '../../common/utils.js';
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

	test('shared presentation model preserves live pull request status icons', () => {
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
			constObservable([
				{
					owner: 'microsoft',
					repo: 'vscode',
					number: 1,
					uri: URI.parse('https://github.com/microsoft/vscode/pull/1'),
				},
				{
					owner: 'other',
					repo: 'project',
					number: 2,
					uri: URI.parse('https://github.com/other/project/pull/2'),
				},
			]),
			gitHubService,
		));

		assert.deepStrictEqual({
			entryIcons: model.pullRequests.get().map(entry => entry.icon?.id),
			ciStatuses: model.pullRequests.get().map(entry => entry.ciStatus),
			summaryIcon: model.icon.get().id,
		}, {
			entryIcons: [Codicon.gitPullRequestError.id, Codicon.gitPullRequestError.id],
			ciStatuses: [GitHubCIOverallStatus.Failure, GitHubCIOverallStatus.Failure],
			summaryIcon: Codicon.gitPullRequestError.id,
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
		const model = store.add(new SessionPullRequestPresentationModel(pullRequestRefs, gitHubService));

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

	test('Open and Copy Pull Request actions support multiple selected sessions', async () => {
		const firstPullRequestUri = URI.parse('https://github.com/owner/repo/pull/1');
		const secondPullRequestUri = URI.parse('https://github.com/owner/repo/pull/2');
		const sessions = [
			createSessionWithPullRequest(firstPullRequestUri),
			createSessionWithPullRequest(undefined),
			createSessionWithPullRequest(secondPullRequestUri),
		];

		const instantiationService = new TestInstantiationService();
		const openerService = new TestOpenerService();
		const clipboardService = new class extends mock<IClipboardService>() {
			readonly writes: string[] = [];
			override async writeText(text: string): Promise<void> {
				this.writes.push(text);
			}
		};
		instantiationService.stub(IOpenerService, openerService);
		instantiationService.stub(IClipboardService, clipboardService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.openPullRequest')!.handler(accessor, sessions));
		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.copyPullRequestUrl')!.handler(accessor, sessions));

		assert.deepStrictEqual({
			opened: openerService.opened,
			copied: clipboardService.writes,
		}, {
			opened: [{
				resource: firstPullRequestUri,
				openExternal: true,
				allowContributedOpeners: true,
			}, {
				resource: secondPullRequestUri,
				openExternal: true,
				allowContributedOpeners: true,
			}],
			copied: [`${firstPullRequestUri.toString(true)}\n${secondPullRequestUri.toString(true)}`],
		});
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

	test('Open Pull Request Changes opens the pull request diff in a multi-file diff editor', async () => {
		const pullRequest = { owner: 'upstream', repo: 'project', number: 7, uri: URI.parse('https://github.com/upstream/project/pull/7') };
		const titles = ['Open pull request changes in a multi diff editor', 'Fix typo'];
		const changes: Omit<IGitHubPullRequestChanges, 'title'> = {
			baseSha: 'merge-base',
			headSha: 'head',
			files: [
				{ filename: 'added.ts', previous_filename: undefined, status: 'added', additions: 1, deletions: 0 },
				{ filename: 'new-name.ts', previous_filename: 'old-name.ts', status: 'renamed', additions: 1, deletions: 1 },
				{ filename: 'removed.ts', previous_filename: undefined, status: 'removed', additions: 0, deletions: 1 },
			],
		};
		const requested: unknown[][] = [];
		const opened: IResourceMultiDiffEditorInput[] = [];
		let revealed = 0;

		const instantiationService = new TestInstantiationService();
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});
		instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() {
			override async getPullRequestChanges(...args: unknown[]): Promise<IGitHubPullRequestChanges> {
				requested.push(args);
				return { ...changes, title: titles[requested.length - 1] };
			}
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(...args: unknown[]): Promise<undefined> {
				if (isResourceMultiDiffEditorInput(args[0])) {
					opened.push(args[0]);
				}
				return undefined;
			}
		});
		instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() {
			override revealEditorPartExplicitly(): void {
				revealed++;
			}
		});
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() { });

		for (let run = 0; run < titles.length; run++) {
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(OPEN_PULL_REQUEST_CHANGES_ACTION_ID)!.handler(accessor, { pullRequest }));
		}

		const side = (resource: URI | undefined) => {
			const content = resource && parsePRContentUri(resource);
			return content && `${content.fileName}@${content.commitSha}`;
		};
		assert.deepStrictEqual({
			requested,
			revealed,
			labels: opened.map(editor => editor.label),
			pinned: opened.map(editor => editor.options?.pinned),
			multiDiffSource: opened[0]?.multiDiffSource?.toString(true),
			resources: opened[0]?.resources?.map(resource => [side(resource.original.resource), side(resource.modified.resource)]),
		}, {
			requested: [['upstream', 'project', 7], ['upstream', 'project', 7]],
			revealed: 2,
			labels: ['#7 Open pull request...', '#7 Fix typo'],
			pinned: [true, true],
			multiDiffSource: 'multi-diff-editor:/upstream/project/pull/7/merge-base...head',
			resources: [
				[undefined, 'added.ts@head'],
				['old-name.ts@merge-base', 'new-name.ts@head'],
				['removed.ts@merge-base', undefined],
			],
		});
	});

	test('Open Pull Request Changes reports a failure to load the pull request changes', async () => {
		const pullRequest = { owner: 'upstream', repo: 'project', number: 7, uri: URI.parse('https://github.com/upstream/project/pull/7') };
		const errors: string[] = [];
		let opened = 0;

		const instantiationService = new TestInstantiationService();
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
		});
		instantiationService.stub(IGitHubService, new class extends mock<IGitHubService>() {
			override async getPullRequestChanges(): Promise<IGitHubPullRequestChanges> {
				throw new Error('Not found');
			}
		});
		instantiationService.stub(IEditorService, new class extends mock<IEditorService>() {
			override async openEditor(): Promise<undefined> {
				opened++;
				return undefined;
			}
		});
		instantiationService.stub(IAgentWorkbenchLayoutService, new class extends mock<IAgentWorkbenchLayoutService>() { });
		instantiationService.stub(INotificationService, new class extends mock<INotificationService>() {
			override error(message: NotificationMessage): void {
				errors.push(String(message));
			}
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(OPEN_PULL_REQUEST_CHANGES_ACTION_ID)!.handler(accessor, { pullRequest }));

		assert.deepStrictEqual({ errors, opened }, {
			errors: ['Could not load the changes of pull request #7: Not found'],
			opened: 0,
		});
	});

});
