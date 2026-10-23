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
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Context } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IResourceMultiDiffEditorInput, isResourceMultiDiffEditorInput } from '../../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../../workbench/services/editor/common/editorService.js';
import { Menus, SessionActivityBarGroup } from '../../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { sessionActivityBarChatActionContext, SessionHasPullRequestContext } from '../../../../common/contextkeys.js';
import { SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_SETTING } from '../../../../common/sessionConfig.js';
import { IGitHubPullRequestRef, ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { TOGGLE_SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_COMMAND_ID } from '../../browser/pullRequestActions.js';
import { createPullRequestChangesEditorInput } from '../../browser/pullRequestChangesMultiDiffSourceResolver.js';
import { SessionPullRequestPresentationModel } from '../../browser/pullRequestIconStatus.js';
import { IGitHubService } from '../../browser/githubService.js';
import { GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPullRequest, OPEN_PULL_REQUEST_CHANGES_ACTION_ID } from '../../common/types.js';
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

	test('opts GitHub activity actions in from a checked AI-gated context-menu item', async () => {
		const item = MenuRegistry.getMenuItems(Menus.SessionActivityBarContext).filter(isIMenuItem)
			.find(item => item.command.id === TOGGLE_SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_COMMAND_ID);
		const configurationService = new class extends TestConfigurationService {
			override updateValue(key: string, value: unknown): Promise<void> {
				return this.setUserConfiguration(key, value);
			}
		}();
		store.add(configurationService.onDidChangeConfigurationEmitter);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IConfigurationService, configurationService);
		const run = async () => {
			await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(TOGGLE_SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_COMMAND_ID)!.handler(accessor));
			return configurationService.getValue(SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_SETTING);
		};
		assert.deepStrictEqual({
			title: item?.command.title,
			toggled: item?.command.toggled,
			when: item?.when?.serialize(),
			afterFirstRun: await run(),
			afterSecondRun: await run(),
		}, {
			title: 'Show Pull Request and Issue Actions',
			toggled: ContextKeyExpr.equals(`config.${SESSION_ACTIVITY_BAR_GITHUB_ACTIONS_SETTING}`, true),
			when: 'chatIsEnabled',
			afterFirstRun: true, afterSecondRun: false,
		});
	});

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

	test('Open Pull Request is available in the activity bar only with an associated pull request', () => {
		const items = MenuRegistry.getMenuItems(Menus.SessionActivityBar)
			.filter(isIMenuItem)
			.filter(item => item.command.id === 'workbench.agentSessions.action.openPullRequest');
		const withPullRequest = new Context(1, null);
		withPullRequest.setValue(sessionActivityBarChatActionContext('workbench.agentSessions.action.openPullRequest').key, true);
		const withoutPullRequest = new Context(2, null);

		assert.deepStrictEqual(items.map(item => ({
			group: item.group,
			order: item.order,
			icon: item.command.icon,
			visibleWithPullRequest: item.when?.evaluate(withPullRequest),
			visibleWithoutPullRequest: item.when?.evaluate(withoutPullRequest),
		})), [{
			group: SessionActivityBarGroup.SidePanel,
			order: 100,
			icon: Codicon.gitPullRequest,
			visibleWithPullRequest: true,
			visibleWithoutPullRequest: false,
		}]);
	});

	test('Open Pull Request falls back to the active session without an explicit target', async () => {
		const pullRequestUri = URI.parse('https://github.com/owner/repo/pull/1');
		const session = createSessionWithPullRequest(pullRequestUri);
		const instantiationService = new TestInstantiationService();
		const openerService = new TestOpenerService();
		instantiationService.stub(IOpenerService, openerService);
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(upcastPartial<IActiveSession>({ workspace: session.workspace }));
		});

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand('workbench.agentSessions.action.openPullRequest')!.handler(accessor));

		assert.deepStrictEqual(openerService.opened, [{
			resource: pullRequestUri,
			openExternal: true,
			allowContributedOpeners: true,
		}]);
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

	test('Open Pull Request Changes opens the pull request changes editor input', async () => {
		const pullRequest = { owner: 'upstream', repo: 'project', number: 7, uri: URI.parse('https://github.com/upstream/project/pull/7') };
		const opened: IResourceMultiDiffEditorInput[] = [];
		let revealed = 0;

		const instantiationService = new TestInstantiationService();
		instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
			override readonly activeSession = constObservable(undefined);
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

		await instantiationService.invokeFunction(accessor => CommandsRegistry.getCommand(OPEN_PULL_REQUEST_CHANGES_ACTION_ID)!.handler(accessor, { pullRequest }));

		const expected = createPullRequestChangesEditorInput(pullRequest);
		assert.deepStrictEqual({
			revealed,
			opened: opened.map(editor => ({ multiDiffSource: editor.multiDiffSource?.toString(true), label: editor.label, pinned: editor.options?.pinned, resources: editor.resources })),
		}, {
			revealed: 1,
			opened: [{ multiDiffSource: expected.multiDiffSource?.toString(true), label: '#7', pinned: true, resources: undefined }],
		});
	});

});
