/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMobile, isWeb } from '../../../../base/common/platform.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { observableFromEvent, waitForState } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IGitService } from '../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID } from '../../../browser/workbench.js';
import { ISessionSection, SessionSectionHasNonCloudRepositoryContext, SessionSectionToolbarMenuId, SessionSectionTypeContext } from '../../sessions/browser/views/sessionsList.js';
import { IGitHubService } from './githubService.js';
import { IGitHubPullRequestSummary } from '../common/types.js';
import { createPullRequestBootstrapPrompt, createPullRequestContextAttachment, createPullRequestQuickPickItems, createPullRequestSessionMetadata, getExistingPullRequests, getGitHubRepositoryFromRemotes, hasExistingPullRequest, IPullRequestQuickPickItem, mergePullRequestSummaries, pullRequestMatchesQuery, resolvePullRequestSessionRepository } from './pullRequestPicker.js';
import { createAndOpenPullRequestSession } from './pullRequestSessionCreation.js';

export const CREATE_SESSION_FROM_PULL_REQUEST_COMMAND_ID = 'workbench.agentSessions.createSessionFromPullRequest';

registerAction2(class CreateSessionFromPullRequestAction extends Action2 {
	constructor() {
		super({
			id: CREATE_SESSION_FROM_PULL_REQUEST_COMMAND_ID,
			title: localize2('createSessionFromPullRequest', "Create Session from Pull Request"),
			icon: Codicon.gitPullRequestCreate,
			precondition: ChatContextKeys.enabled,
			menu: {
				id: SessionSectionToolbarMenuId,
				group: 'navigation',
				order: 2,
				when: ContextKeyExpr.and(
					ChatContextKeys.enabled,
					ContextKeyExpr.equals(SessionSectionTypeContext.key, 'workspace'),
					SessionSectionHasNonCloudRepositoryContext,
				),
			},
		});
	}

	override async run(accessor: ServicesAccessor, context?: ISessionSection): Promise<void> {
		if (!context) {
			return;
		}

		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const notificationService = accessor.get(INotificationService);
		const gitService = accessor.get(IGitService);
		const gitHubService = accessor.get(IGitHubService);
		const sessionsService = accessor.get(ISessionsService);
		const sessionsPartService = accessor.get(ISessionsPartService);
		const quickInputService = accessor.get(IQuickInputService);
		const commandService = accessor.get(ICommandService);
		const picker = quickInputService.createQuickPick<IPullRequestQuickPickItem>({ useSeparators: true });
		const store = new DisposableStore();
		const pickerCts = store.add(new CancellationTokenSource());
		let sessionCreated = false;
		picker.title = localize('createSessionFromPullRequest.title', "Create Session from Pull Request");
		picker.placeholder = localize('createSessionFromPullRequest.resolvingRepository', "Resolving GitHub repository...");
		picker.matchOnDescription = true;
		picker.matchOnDetail = true;
		picker.sortByLabel = false;
		picker.enabled = false;
		picker.busy = true;
		store.add(picker.onDidHide(() => {
			if (!sessionCreated) {
				pickerCts.cancel();
			}
			store.dispose();
		}));
		store.add(picker);
		picker.show();

		let repository;
		try {
			repository = await resolvePullRequestSessionRepository(
				context.sessions,
				async folderUri => {
					const gitRepository = await gitService.openRepository(folderUri);
					if (!gitRepository) {
						return undefined;
					}
					const current = getGitHubRepositoryFromRemotes(gitRepository.state.get().remotes);
					if (current) {
						return current;
					}
					const state = await waitForState(
						gitRepository.state,
						state => state.remotes.length > 0,
						undefined,
						pickerCts.token,
					);
					return getGitHubRepositoryFromRemotes(state.remotes);
				},
			);
		} catch (error) {
			picker.hide();
			if (!isCancellationError(error)) {
				notificationService.error(localize('createSessionFromPullRequest.resolveGitHubRepositoryError', "Failed to resolve the GitHub repository: {0}", toErrorMessage(error)));
			}
			return;
		}
		if (store.isDisposed) {
			return;
		}
		if (!repository) {
			picker.hide();
			notificationService.warn(localize('createSessionFromPullRequest.noGitHubRepository', "No GitHub repository could be resolved for this workspace."));
			return;
		}

		const existingPullRequests = getExistingPullRequests(sessionsManagementService.getSessions(), repository.owner, repository.repo, context.sessions);
		picker.placeholder = localize('createSessionFromPullRequest.placeholder', "Choose a pull request");
		picker.enabled = true;

		let pullRequests: IGitHubPullRequestSummary[] = [];
		let cursor: string | undefined;
		let hasNextPage = true;
		let pagePromise: Promise<void> | undefined;
		let searchGeneration = 0;
		let waitingForReview: readonly IGitHubPullRequestSummary[] = [];
		let assignedToViewer: readonly IGitHubPullRequestSummary[] = [];
		let waitingForReviewNumbers = new Set<number>();
		let assignedToViewerNumbers = new Set<number>();

		const updateItems = () => {
			picker.items = createPullRequestQuickPickItems(pullRequests, existingPullRequests);
		};
		const applyViewerGroups = (pullRequest: IGitHubPullRequestSummary): IGitHubPullRequestSummary => ({
			...pullRequest,
			reviewRequestedFromViewer: waitingForReviewNumbers.has(pullRequest.number),
			assignedToViewer: assignedToViewerNumbers.has(pullRequest.number),
		});
		const loadNextPage = (render = true): Promise<void> => {
			if (!hasNextPage) {
				return Promise.resolve();
			}
			if (!pagePromise) {
				picker.busy = true;
				const promise = gitHubService.getPullRequests(repository.owner, repository.repo, cursor).then(page => {
					pullRequests = mergePullRequestSummaries(pullRequests, page.pullRequests.map(applyViewerGroups));
					cursor = page.cursor;
					hasNextPage = page.hasNextPage && page.cursor !== undefined;
					if (render) {
						updateItems();
					}
				}).finally(() => {
					pagePromise = undefined;
					if (render) {
						picker.busy = false;
					}
				});
				pagePromise = promise;
				return promise;
			}
			return pagePromise;
		};
		const appendGroup = (group: readonly IGitHubPullRequestSummary[]): void => {
			const items = createPullRequestQuickPickItems(group, existingPullRequests);
			if (items.length > 0) {
				picker.items = [...picker.items, ...items];
			}
		};
		const loadGroup = async (request: Promise<readonly IGitHubPullRequestSummary[]>, groupLabel: string): Promise<readonly IGitHubPullRequestSummary[]> => {
			try {
				return await request;
			} catch (error) {
				notificationService.warn(localize('createSessionFromPullRequest.groupLoadError', "Pull requests loaded, but the {0} group could not be resolved: {1}", groupLabel, toErrorMessage(error)));
				return [];
			}
		};
		const loadInitialGroups = async (): Promise<void> => {
			const firstPage = loadNextPage(false);
			const waitingForReviewPromise = loadGroup(
				gitHubService.getPullRequestsWaitingForReview(repository.owner, repository.repo),
				localize('pullRequests.waitingForMyReview', "Waiting for My Review"),
			);
			const assignedToViewerPromise = loadGroup(
				gitHubService.getPullRequestsAssignedToViewer(repository.owner, repository.repo),
				localize('pullRequests.assignedToMe', "Assigned to Me"),
			);
			waitingForReview = await waitingForReviewPromise;
			waitingForReviewNumbers = new Set(waitingForReview.map(pullRequest => pullRequest.number));
			pullRequests = mergePullRequestSummaries(pullRequests, waitingForReview.map(applyViewerGroups));
			appendGroup(waitingForReview);

			assignedToViewer = (await assignedToViewerPromise).filter(pullRequest => !waitingForReviewNumbers.has(pullRequest.number));
			assignedToViewerNumbers = new Set(assignedToViewer.map(pullRequest => pullRequest.number));
			pullRequests = mergePullRequestSummaries(pullRequests, assignedToViewer.map(applyViewerGroups));
			appendGroup(assignedToViewer);

			await firstPage;
			pullRequests = pullRequests.map(applyViewerGroups);
			updateItems();
			picker.busy = false;
		};
		const initialGroupsPromise = loadInitialGroups();
		const loadUntilMatch = async (query: string, generation: number): Promise<void> => {
			await initialGroupsPromise;
			while (generation === searchGeneration && query && hasNextPage && !pullRequests.some(pullRequest => !hasExistingPullRequest(pullRequest, existingPullRequests) && pullRequestMatchesQuery(pullRequest, query))) {
				await loadNextPage();
			}
		};

		store.add(picker.onDidChangeValue(value => {
			const generation = ++searchGeneration;
			void loadUntilMatch(value, generation).catch(error => {
				notificationService.error(localize('createSessionFromPullRequest.loadError', "Failed to load pull requests: {0}", toErrorMessage(error)));
			});
		}));
		store.add(picker.onDidAccept(async () => {
			const pullRequest = picker.selectedItems[0]?.pullRequest;
			if (!pullRequest) {
				return;
			}

			picker.enabled = false;
			picker.busy = true;
			try {
				await waitForWorktreeSessionType(sessionsManagementService, repository.folderUri, pickerCts.token);
				if (pickerCts.token.isCancellationRequested) {
					return;
				}
				await createAndOpenPullRequestSession(
					onSessionCreated => sessionsManagementService.createAndSendNewChatRequest(repository.folderUri, {
						kind: 'deferred',
						activity: localize('createSessionFromPullRequest.fetching', "Fetching pull request..."),
						async resolve() {
							const pullRequestContext = await gitHubService.getPullRequestContext(repository.owner, repository.repo, pullRequest.number);
							return {
								query: createPullRequestBootstrapPrompt(pullRequest),
								title: pullRequest.title,
								attachedContext: [createPullRequestContextAttachment(pullRequestContext)],
								hideFromTranscript: true,
							};
						},
					}, {
						isolationMode: 'worktree',
						branch: pullRequest.checkoutRef,
						worktreeBranchTrack: true,
						metadata: createPullRequestSessionMetadata(repository.owner, repository.repo, pullRequest),
						onSessionCreated,
					}, pickerCts.token),
					resource => sessionsService.showSession(resource),
					() => {
						sessionCreated = true;
						if (!store.isDisposed) {
							picker.hide();
						}
					},
				);
				if (isWeb && isMobile) {
					await commandService.executeCommand(CLOSE_MOBILE_SIDEBAR_DRAWER_COMMAND_ID);
				}
				sessionsPartService.focusSession(sessionsService.activeSession.get());
			} catch (error) {
				if (isCancellationError(error)) {
					return;
				}
				if (!store.isDisposed) {
					picker.hide();
				}
				notificationService.error(localize('createSessionFromPullRequest.error', "Failed to create a session from pull request #{0}: {1}", pullRequest.number, toErrorMessage(error)));
				await sessionsService.openNewSession();
			}
		}));
		void initialGroupsPromise.catch(error => {
			picker.busy = false;
			notificationService.error(localize('createSessionFromPullRequest.loadError', "Failed to load pull requests: {0}", toErrorMessage(error)));
		});
	}
});

async function waitForWorktreeSessionType(sessionsManagementService: ISessionsManagementService, folderUri: URI, token: CancellationToken): Promise<void> {
	const isAvailable = () => sessionsManagementService.getSessionTypesForFolder(folderUri)
		.some(candidate => candidate.sessionType.supportsWorktreeConfiguration === true);
	if (isAvailable()) {
		return;
	}
	await waitForState(
		observableFromEvent(sessionsManagementService.onDidChangeSessionTypes, isAvailable),
		available => available,
		undefined,
		token,
	);
}
