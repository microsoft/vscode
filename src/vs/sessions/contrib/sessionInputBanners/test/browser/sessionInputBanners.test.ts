/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IManagedHover } from '../../../../../base/browser/ui/hover/hover.js';
import { timeout } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event, Emitter } from '../../../../../base/common/event.js';
import { Disposable, ImmortalReference, IDisposable, IReference } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IAgentHostSessionsProvider, LOCAL_AGENT_HOST_PROVIDER_ID } from '../../../../common/agentHostSessionsProvider.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { IGitHubPullRequestRef, ISessionWorkspace, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { AgentFeedbackKind, AgentFeedbackState, IAgentFeedback, IAgentFeedbackService, ISubmitFeedbackOptions } from '../../../agentFeedback/browser/agentFeedbackService.js';
import { IGitHubService } from '../../../github/browser/githubService.js';
import { GitHubPullRequestCIModel } from '../../../github/browser/models/githubPullRequestCIModel.js';
import { GitHubPullRequestModel } from '../../../github/browser/models/githubPullRequestModel.js';
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubPullRequestState, IGitHubCICheck, IGitHubPullRequest } from '../../../github/common/types.js';
import { SessionInputBanners } from '../../browser/sessionInputBanners.js';

suite('SessionInputBanners', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('groups actionable PRs, scopes the combined request, and dismisses one carousel item', async () => {
		const sessionResource = URI.parse('local-agent-host:/session-1');
		const pullRequests = [pullRequest(42), pullRequest(41)];
		const session = new class extends mock<IActiveSession>() {
			override readonly sessionId = 'session-1';
			override readonly resource = sessionResource;
			override readonly providerId = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly status = observableValue('status', SessionStatus.Completed);
			override readonly workspace = observableValue<ISessionWorkspace | undefined>('workspace', {
				uri: URI.file('/workspace'),
				label: 'workspace',
				icon: Codicon.folder,
				folders: [{
					root: URI.file('/workspace'),
					workingDirectory: URI.file('/workspace'),
					name: 'workspace',
					description: undefined,
					gitRepository: {
						uri: URI.file('/workspace'),
						workTreeUri: undefined,
						baseBranchName: undefined,
						gitHubInfo: observableValue('gitHubInfo', {
							owner: 'owner',
							repo: 'repo',
							pullRequests,
							pullRequest: pullRequests[0],
						}),
					},
				}],
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
			});
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession = observableValue<IActiveSession | undefined>('activeSession', session);
		}();
		let agentMergeEnabled = false;
		const onDidChangeSessionConfig = store.add(new Emitter<string>());
		const agentHostProvider = new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = LOCAL_AGENT_HOST_PROVIDER_ID;
			override readonly onDidChangeSessionConfig = onDidChangeSessionConfig.event;
			override getAgentMergeSessionState() { return { enabled: agentMergeEnabled }; }
		}();
		const sessionsProvidersService = new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(): T | undefined {
				return agentHostProvider as unknown as T;
			}
		}();

		const prModels = new Map([
			[42, pullRequestModel(42, 'Newest pull request')],
			[41, pullRequestModel(41, 'Older pull request')],
		]);
		const ciModels = new Map([
			[42, ciModel([failedCheck(1), failedCheck(2)])],
			[41, ciModel([])],
		]);
		const gitHubService = new class extends mock<IGitHubService>() {
			override createPullRequestModelReference(_owner: string, _repo: string, prNumber: number): IReference<GitHubPullRequestModel> {
				return new ImmortalReference(prModels.get(prNumber)!);
			}
			override createPullRequestCIModelReference(_owner: string, _repo: string, prNumber: number): IReference<GitHubPullRequestCIModel> {
				return new ImmortalReference(ciModels.get(prNumber)!);
			}
		}();

		let feedbackItems: IAgentFeedback[] = [
			prFeedback('pr-42-a', sessionResource, 42),
			prFeedback('pr-42-b', sessionResource, 42),
			prFeedback('pr-41', sessionResource, 41),
			agentFeedback('agent', sessionResource),
		];
		const onDidChangeFeedback = store.add(new Emitter<{ sessionResource: URI; feedbackItems: readonly IAgentFeedback[] }>());
		let submitted: ISubmitFeedbackOptions | undefined;
		const feedbackService = new class extends mock<IAgentFeedbackService>() {
			override readonly onDidChangeFeedback = onDidChangeFeedback.event;
			override getFeedback(): readonly IAgentFeedback[] { return feedbackItems; }
			override acceptFeedback(_sessionResource: URI, feedbackId: string): void {
				feedbackItems = feedbackItems.map(item => item.id === feedbackId ? { ...item, state: AgentFeedbackState.Accepted } : item);
				onDidChangeFeedback.fire({ sessionResource, feedbackItems });
			}
			override async submitFeedback(_sessionResource: URI, options?: ISubmitFeedbackOptions): Promise<boolean> {
				submitted = options;
				options?.onRequestAccepted?.();
				return true;
			}
			override revealFeedback(): Promise<void> { return Promise.resolve(); }
		}();

		const chatWidget = upcastPartial<IChatWidget>({});
		const chatWidgetService = new class extends mock<IChatWidgetService>() {
			override readonly onDidAddWidget = Event.None;
			override getWidgetBySessionResource(): IChatWidget { return chatWidget; }
		}();
		const storageService = store.add(new TestStorageService());
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IHoverService, upcastPartial<IHoverService>({
			setupManagedHover: () => upcastPartial<IManagedHover>({ dispose() { } }),
		}));
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({ showContextMenu() { } }));

		const banners = store.add(new SessionInputBanners(
			sessionsService,
			sessionsProvidersService,
			gitHubService,
			feedbackService,
			new class extends mock<ICommandService>() { }(),
			storageService,
			instantiationService,
			new NullLogService(),
			chatWidgetService,
		));
		banners.setActive(true);

		assert.deepStrictEqual(currentBanner(banners), {
			position: '1/3',
			reference: '#42',
			text: '2 Checks Failing | 2 PR Comments',
			splitButtons: 1,
			actions: ['Fix Checks & Address Comments'],
		});

		agentMergeEnabled = true;
		onDidChangeSessionConfig.fire(session.sessionId);
		assert.deepStrictEqual(currentBanner(banners), {
			position: undefined,
			reference: undefined,
			text: '1 Agent Comment',
			splitButtons: 0,
			actions: ['Address Comments', 'Reveal'],
		});
		agentMergeEnabled = false;
		onDidChangeSessionConfig.fire(session.sessionId);

		banners.domNode.querySelector<HTMLElement>('.session-input-banner-navigation-button.next')?.click();
		assert.deepStrictEqual(currentBanner(banners), {
			position: '1/3',
			reference: '#42',
			text: '2 Checks Failing | 2 PR Comments',
			splitButtons: 1,
			actions: ['Fix Checks & Address Comments'],
		});
		banners.domNode.querySelector<HTMLElement>('.session-input-banner-navigation-button.next')?.click();
		assert.deepStrictEqual(currentBanner(banners), {
			position: '2/3',
			reference: '#41',
			text: '1 PR Comment',
			splitButtons: 0,
			actions: ['Address Comments', 'Reveal'],
		});
		banners.domNode.querySelector<HTMLElement>('.session-input-banner-navigation-button.next')?.click();
		assert.deepStrictEqual(currentBanner(banners), {
			position: '3/3',
			reference: 'Agent Review',
			text: '1 Agent Comment',
			splitButtons: 0,
			actions: ['Address Comments', 'Reveal'],
		});
		banners.domNode.querySelector<HTMLElement>('.session-input-banner-navigation-button.next')?.click();

		banners.domNode.querySelector<HTMLElement>('.session-input-banner-action.monaco-button-dropdown > .monaco-button')?.click();
		await timeout(0);

		assert.deepStrictEqual({
			query: submitted?.query?.split('\n')[0],
			feedbackIds: submitted?.feedbackIds,
			fixRequested: ciModels.get(42)?.fixRequested.get(),
			current: currentBanner(banners),
		}, {
			query: '/fix-ci and /act-on-feedback for #42',
			feedbackIds: ['pr-42-a', 'pr-42-b'],
			fixRequested: true,
			current: {
				position: '1/2',
				reference: '#41',
				text: '1 PR Comment',
				splitButtons: 0,
				actions: ['Address Comments', 'Reveal'],
			},
		});

		banners.domNode.querySelector<HTMLElement>('.session-input-banner-dismiss')?.click();
		assert.deepStrictEqual({
			current: currentBanner(banners),
			dismissed: JSON.parse(storageService.get('sessions.inputBanners.dismissedItems', StorageScope.PROFILE) ?? '[]'),
		}, {
			current: {
				position: undefined,
				reference: undefined,
				text: '1 Agent Comment',
				splitButtons: 0,
				actions: ['Address Comments', 'Reveal'],
			},
			dismissed: ['session-1:pullRequest:owner/repo#41'],
		});
	});
});

function pullRequest(number: number): IGitHubPullRequestRef {
	return {
		owner: 'owner',
		repo: 'repo',
		number,
		uri: URI.parse(`https://github.com/owner/repo/pull/${number}`),
	};
}

function pullRequestModel(number: number, title: string): GitHubPullRequestModel {
	const pullRequest = upcastPartial<IGitHubPullRequest>({
		number,
		title,
		state: GitHubPullRequestState.Open,
		isDraft: false,
		headSha: `sha-${number}`,
	});
	return new class extends mock<GitHubPullRequestModel>() {
		override readonly pullRequest = observableValue<IGitHubPullRequest | undefined>('pullRequest', pullRequest);
		override refresh(): Promise<void> { return Promise.resolve(); }
		override startPolling(): IDisposable { return Disposable.None; }
	}();
}

function ciModel(checks: readonly IGitHubCICheck[]): GitHubPullRequestCIModel {
	return new class extends mock<GitHubPullRequestCIModel>() {
		override readonly checks = observableValue('checks', checks);
		override readonly fixRequested = observableValue('fixRequested', false);
		override refresh(): Promise<void> { return Promise.resolve(); }
		override startPolling(): IDisposable { return Disposable.None; }
		override getCheckRunAnnotations(): Promise<string> { return Promise.resolve('failure details'); }
		override markFixRequested(): void { this.fixRequested.set(true, undefined); }
	}();
}

function failedCheck(id: number): IGitHubCICheck {
	return {
		id,
		name: `Check ${id}`,
		status: GitHubCheckStatus.Completed,
		conclusion: GitHubCheckConclusion.Failure,
		startedAt: undefined,
		completedAt: undefined,
		detailsUrl: undefined,
	};
}

function prFeedback(id: string, sessionResource: URI, number: number): IAgentFeedback {
	return {
		id,
		text: id,
		resourceUri: URI.file(`/workspace/${id}.ts`),
		range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
		sessionResource,
		kind: AgentFeedbackKind.PRReview,
		sourcePRReviewCommentId: `thread-${id}`,
		sourcePullRequest: { owner: 'owner', repo: 'repo', number },
		state: AgentFeedbackState.Created,
	};
}

function agentFeedback(id: string, sessionResource: URI): IAgentFeedback {
	return {
		id,
		text: id,
		resourceUri: URI.file(`/workspace/${id}.ts`),
		range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
		sessionResource,
		kind: AgentFeedbackKind.AgentReview,
		state: AgentFeedbackState.Created,
	};
}

function currentBanner(banners: SessionInputBanners): { position: string | undefined; reference: string | undefined; text: string | undefined; splitButtons: number; actions: string[] } {
	return {
		position: banners.domNode.querySelector('.session-input-banner-position')?.textContent ?? undefined,
		reference: banners.domNode.querySelector('.session-input-banner-reference')?.textContent ?? undefined,
		text: banners.domNode.querySelector('.session-input-banner-text')?.textContent ?? undefined,
		splitButtons: banners.domNode.querySelectorAll('.monaco-button-dropdown').length,
		actions: [...banners.domNode.querySelectorAll<HTMLElement>('.session-input-banner-actions > .session-input-banner-action')].map(action => action.querySelector(':scope > .monaco-button:first-child')?.textContent ?? action.textContent ?? ''),
	};
}
