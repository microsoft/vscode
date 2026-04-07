/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as pathLib from 'path';
import * as vscode from 'vscode';
import { Repository } from './api/api';
import { GitErrorCodes } from './api/api1';
import { CommentReply, resolveCommentHandler } from './commentHandlerResolver';
import { IComment } from './common/comment';
import Logger from './common/logger';
import { ITelemetry } from './common/telemetry';
import { Schemes, asImageDataURI, fromReviewUri } from './common/uri';
import { formatError } from './common/utils';
import { EXTENSION_ID } from './constants';
import { FolderRepositoryManager } from './github/folderRepositoryManager';
import { GitHubRepository } from './github/githubRepository';
import { PullRequest } from './github/interface';
import { NotificationProvider } from './github/notifications';
import { GHPRComment, GHPRCommentThread, TemporaryComment } from './github/prComment';
import { PullRequestModel } from './github/pullRequestModel';
import { PullRequestOverviewPanel } from './github/pullRequestOverview';
import { RepositoriesManager } from './github/repositoriesManager';
import { getIssuesUrl, getPullsUrl, isInCodespaces, vscodeDevPrLink } from './github/utils';
import { PullRequestsTreeDataProvider } from './view/prsTreeDataProvider';
import { ReviewCommentController } from './view/reviewCommentController';
import { ReviewManager } from './view/reviewManager';
import { CategoryTreeNode } from './view/treeNodes/categoryNode';
import { CommitNode } from './view/treeNodes/commitNode';
import { DescriptionNode } from './view/treeNodes/descriptionNode';
import {
	FileChangeNode,
	GitFileChangeNode,
	InMemFileChangeNode,
	RemoteFileChangeNode,
	openFileCommand,
} from './view/treeNodes/fileChangeNode';
import { PRNode } from './view/treeNodes/pullRequestNode';

const _onDidUpdatePR = new vscode.EventEmitter<PullRequest | void>();
export const onDidUpdatePR: vscode.Event<PullRequest | void> = _onDidUpdatePR.event;

function ensurePR(folderRepoManager: FolderRepositoryManager, pr?: PRNode | PullRequestModel): PullRequestModel {
	// If the command is called from the command palette, no arguments are passed.
	if (!pr) {
		if (!folderRepoManager.activePullRequest) {
			vscode.window.showErrorMessage(vscode.l10n.t('Unable to find current pull request.'));
			throw new Error('Unable to find current pull request.');
		}

		return folderRepoManager.activePullRequest;
	} else {
		return pr instanceof PRNode ? pr.pullRequestModel : pr;
	}
}

export async function openDescription(
	context: vscode.ExtensionContext,
	telemetry: ITelemetry,
	pullRequestModel: PullRequestModel,
	descriptionNode: DescriptionNode | undefined,
	folderManager: FolderRepositoryManager,
	notificationProvider?: NotificationProvider
) {
	const pullRequest = ensurePR(folderManager, pullRequestModel);
	descriptionNode?.reveal(descriptionNode, { select: true, focus: true });
	// Create and show a new webview
	await PullRequestOverviewPanel.createOrShow(context.extensionUri, folderManager, pullRequest);

	if (notificationProvider?.hasNotification(pullRequest)) {
		notificationProvider.markPrNotificationsAsRead(pullRequest);
	}
}

async function chooseItem<T>(
	activePullRequests: T[],
	propertyGetter: (itemValue: T) => string,
	options?: vscode.QuickPickOptions,
): Promise<T | undefined> {
	if (activePullRequests.length === 1) {
		return activePullRequests[0];
	}
	interface Item extends vscode.QuickPickItem {
		itemValue: T;
	}
	const items: Item[] = activePullRequests.map(currentItem => {
		return {
			label: propertyGetter(currentItem),
			itemValue: currentItem,
		};
	});
	return (await vscode.window.showQuickPick(items, options))?.itemValue;
}

export async function openPullRequestOnGitHub(e: PRNode | DescriptionNode | PullRequestModel, telemetry: ITelemetry) {
	if (e instanceof PRNode || e instanceof DescriptionNode) {
		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.pullRequestModel.html_url));
	} else {
		vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.html_url));
	}
}

export function registerCommands(
	context: vscode.ExtensionContext,
	reposManager: RepositoriesManager,
	reviewManagers: ReviewManager[],
	telemetry: ITelemetry,
	tree: PullRequestsTreeDataProvider
) {
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'pr.openPullRequestOnGitHub',
			async (e: PRNode | DescriptionNode | PullRequestModel | undefined) => {
				if (!e) {
					const activePullRequests: PullRequestModel[] = reposManager.folderManagers
						.map(folderManager => folderManager.activePullRequest!)
						.filter(activePR => !!activePR);

					if (activePullRequests.length >= 1) {
						const result = await chooseItem<PullRequestModel>(
							activePullRequests,
							itemValue => itemValue.html_url,
						);
						if (result) {
							openPullRequestOnGitHub(result, telemetry);
						}
					}
				} else {
					openPullRequestOnGitHub(e, telemetry);
				}
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'pr.openAllDiffs',
			async () => {
				const activePullRequestsWithFolderManager = reposManager.folderManagers
					.filter(folderManager => folderManager.activePullRequest)
					.map(folderManager => {
						return (({ activePr: folderManager.activePullRequest!, folderManager }));
					});

				const activePullRequestAndFolderManager = activePullRequestsWithFolderManager.length >= 1
					? (
						await chooseItem(
							activePullRequestsWithFolderManager,
							itemValue => itemValue.activePr.html_url,
						)
					)
					: activePullRequestsWithFolderManager[0];

				if (!activePullRequestAndFolderManager) {
					return;
				}

				const { folderManager } = activePullRequestAndFolderManager;
				const reviewManager = ReviewManager.getReviewManagerForFolderManager(reviewManagers, folderManager);

				if (!reviewManager) {
					return;
				}

				reviewManager.reviewModel.localFileChanges
					.forEach(localFileChange => localFileChange.openDiff(folderManager, { preview: false }));
			}
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('review.suggestDiff', async e => {
			try {
				const folderManager = await chooseItem<FolderRepositoryManager>(
					reposManager.folderManagers,
					itemValue => pathLib.basename(itemValue.repository.rootUri.fsPath),
				);
				if (!folderManager || !folderManager.activePullRequest) {
					return;
				}

				const { indexChanges, workingTreeChanges } = folderManager.repository.state;

				if (!indexChanges.length) {
					if (workingTreeChanges.length) {
						const yes = vscode.l10n.t('Yes');
						const stageAll = await vscode.window.showWarningMessage(
							vscode.l10n.t('There are no staged changes to suggest.\n\nWould you like to automatically stage all your of changes and suggest them?'),
							{ modal: true },
							yes,
						);
						if (stageAll === yes) {
							await vscode.commands.executeCommand('git.stageAll');
						} else {
							return;
						}
					} else {
						vscode.window.showInformationMessage(vscode.l10n.t('There are no changes to suggest.'));
						return;
					}
				}

				const diff = await folderManager.repository.diff(true);

				let suggestEditMessage = vscode.l10n.t('Suggested edit:\n');
				if (e && e.inputBox && e.inputBox.value) {
					suggestEditMessage = `${e.inputBox.value}\n`;
					e.inputBox.value = '';
				}

				const suggestEditText = `${suggestEditMessage}\`\`\`diff\n${diff}\n\`\`\``;
				await folderManager.activePullRequest.createIssueComment(suggestEditText);

				// Reset HEAD and then apply reverse diff
				await vscode.commands.executeCommand('git.unstageAll');

				const tempFilePath = pathLib.join(
					folderManager.repository.rootUri.fsPath,
					'.git',
					`${folderManager.activePullRequest.number}.diff`,
				);
				const encoder = new TextEncoder();
				const tempUri = vscode.Uri.file(tempFilePath);

				await vscode.workspace.fs.writeFile(tempUri, encoder.encode(diff));
				await folderManager.repository.apply(tempFilePath, true);
				await vscode.workspace.fs.delete(tempUri);
			} catch (err) {
				const moreError = `${err}${err.stderr ? `\n${err.stderr}` : ''}`;
				Logger.error(`Applying patch failed: ${moreError}`);
				vscode.window.showErrorMessage(vscode.l10n.t('Applying patch failed: {0}', formatError(err)));
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.openFileOnGitHub', async (e: GitFileChangeNode | RemoteFileChangeNode) => {
			if (e instanceof RemoteFileChangeNode) {
				const choice = await vscode.window.showInformationMessage(
					vscode.l10n.t('{0} can\'t be opened locally. Do you want to open it on GitHub?', e.changeModel.fileName),
					vscode.l10n.t('Open'),
				);
				if (!choice) {
					return;
				}
			}
			if (e.changeModel.blobUrl) {
				return vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(e.changeModel.blobUrl));
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.copyCommitHash', (e: CommitNode) => {
			vscode.env.clipboard.writeText(e.sha);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.openOriginalFile', async (e: GitFileChangeNode) => {
			// if this is an image, encode it as a base64 data URI
			const folderManager = reposManager.getManagerForIssueModel(e.pullRequest);
			if (folderManager) {
				const imageDataURI = await asImageDataURI(e.changeModel.parentFilePath, folderManager.repository);
				vscode.commands.executeCommand('vscode.open', imageDataURI || e.changeModel.parentFilePath);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.openModifiedFile', (e: GitFileChangeNode | undefined) => {
			let uri: vscode.Uri | undefined;
			const tab = vscode.window.tabGroups.activeTabGroup.activeTab;

			if (e) {
				uri = e.changeModel.filePath;
			} else {
				if (tab?.input instanceof vscode.TabInputTextDiff) {
					uri = tab.input.modified;
				}
			}
			if (uri) {
				vscode.commands.executeCommand('vscode.open', uri, tab?.group.viewColumn);
			}
		}),
	);

	async function openDiffView(fileChangeNode: GitFileChangeNode | InMemFileChangeNode | vscode.Uri | undefined) {
		if (fileChangeNode && !(fileChangeNode instanceof vscode.Uri)) {
			const folderManager = reposManager.getManagerForIssueModel(fileChangeNode.pullRequest);
			if (!folderManager) {
				return;
			}
			return fileChangeNode.openDiff(folderManager);
		} else if (fileChangeNode || vscode.window.activeTextEditor) {
			const editor = fileChangeNode ? vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === fileChangeNode.toString())! : vscode.window.activeTextEditor!;
			const visibleRanges = editor.visibleRanges;
			const folderManager = reposManager.getManagerForFile(editor.document.uri);
			if (!folderManager?.activePullRequest) {
				return;
			}
			const reviewManager = ReviewManager.getReviewManagerForFolderManager(reviewManagers, folderManager);
			if (!reviewManager) {
				return;
			}
			const change = reviewManager.reviewModel.localFileChanges.find(change => change.resourceUri.with({ query: '' }).toString() === editor.document.uri.toString());
			await change?.openDiff(folderManager);
			const tabInput = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
			const diffEditor = (tabInput instanceof vscode.TabInputTextDiff && tabInput.modified.toString() === editor.document.uri.toString()) ? vscode.window.activeTextEditor : undefined;
			if (diffEditor) {
				diffEditor.revealRange(visibleRanges[0]);
			}
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'pr.openDiffView',
			(fileChangeNode: GitFileChangeNode | InMemFileChangeNode | undefined) => {
				return openDiffView(fileChangeNode);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'pr.openDiffViewFromEditor',
			(uri: vscode.Uri) => {
				return openDiffView(uri);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.deleteLocalBranch', async (e: PRNode) => {
			const folderManager = reposManager.getManagerForIssueModel(e.pullRequestModel);
			if (!folderManager) {
				return;
			}
			const pullRequestModel = ensurePR(folderManager, e);
			const DELETE_BRANCH_FORCE = 'Delete Unmerged Branch';
			let error = null;

			try {
				await folderManager.deleteLocalPullRequest(pullRequestModel);
			} catch (e) {
				if (e.gitErrorCode === GitErrorCodes.BranchNotFullyMerged) {
					const action = await vscode.window.showErrorMessage(
						vscode.l10n.t('The local branch \'{0}\' is not fully merged. Are you sure you want to delete it?', pullRequestModel.localBranchName ?? 'unknown branch'),
						DELETE_BRANCH_FORCE,
					);

					if (action !== DELETE_BRANCH_FORCE) {
						return;
					}

					try {
						await folderManager.deleteLocalPullRequest(pullRequestModel, true);
					} catch (e) {
						error = e;
					}
				} else {
					error = e;
				}
			}

			if (error) {
				await vscode.window.showErrorMessage(`Deleting local pull request branch failed: ${error}`);
			} else {
				// fire and forget
				vscode.commands.executeCommand('pr.refreshList');
			}
		}),
	);

	function chooseReviewManager(repoPath?: string) {
		if (repoPath) {
			const uri = vscode.Uri.file(repoPath).toString();
			for (const mgr of reviewManagers) {
				if (mgr.repository.rootUri.toString() === uri) {
					return mgr;
				}
			}
		}
		return chooseItem<ReviewManager>(
			reviewManagers,
			itemValue => pathLib.basename(itemValue.repository.rootUri.fsPath),
			{ placeHolder: vscode.l10n.t('Choose a repository to create a pull request in'), ignoreFocusOut: true },
		);
	}

	function isSourceControl(x: any): x is Repository {
		return !!x?.rootUri;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'pr.create',
			async (args?: { repoPath: string; compareBranch: string } | Repository) => {
				// The arguments this is called with are either from the SCM view, or manually passed.
				if (isSourceControl(args)) {
					(await chooseReviewManager(args.rootUri.fsPath))?.createPullRequest();
				} else {
					(await chooseReviewManager(args?.repoPath))?.createPullRequest(args?.compareBranch);
				}
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'pr.pushAndCreate',
			async (args?: any | Repository) => {
				if (isSourceControl(args)) {
					const reviewManager = await chooseReviewManager(args.rootUri.fsPath);
					if (reviewManager) {
						if (args.state.HEAD?.upstream) {
							await args.push();
						}
						reviewManager.createPullRequest();
					}
				}
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.pick', async (pr: PRNode | DescriptionNode | PullRequestModel) => {
			if (pr === undefined) {
				// This is unexpected, but has happened a few times.
				Logger.error('Unexpectedly received undefined when picking a PR.');
				return vscode.window.showErrorMessage(vscode.l10n.t('No pull request was selected to checkout, please try again.'));
			}

			let pullRequestModel: PullRequestModel;
			let repository: Repository | undefined;

			if (pr instanceof PRNode || pr instanceof DescriptionNode) {
				pullRequestModel = pr.pullRequestModel;
				repository = pr.repository;
			} else {
				pullRequestModel = pr;
			}

			const fromDescriptionPage = pr instanceof PullRequestModel;

			return vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.SourceControl,
					title: vscode.l10n.t('Switching to Pull Request #{0}', pullRequestModel.number),
				},
				async () => {
					await ReviewManager.getReviewManagerForRepository(
						reviewManagers,
						pullRequestModel.githubRepository,
						repository
					)?.switch(pullRequestModel);
				},
			);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.pickOnVscodeDev', async (pr: PRNode | DescriptionNode | PullRequestModel) => {
			if (pr === undefined) {
				// This is unexpected, but has happened a few times.
				Logger.error('Unexpectedly received undefined when picking a PR.');
				return vscode.window.showErrorMessage(vscode.l10n.t('No pull request was selected to checkout, please try again.'));
			}

			let pullRequestModel: PullRequestModel;

			if (pr instanceof PRNode || pr instanceof DescriptionNode) {
				pullRequestModel = pr.pullRequestModel;
			} else {
				pullRequestModel = pr;
			}

			return vscode.env.openExternal(vscode.Uri.parse(vscodeDevPrLink(pullRequestModel)));
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.exit', async (pr: PRNode | DescriptionNode | PullRequestModel | undefined) => {
			let pullRequestModel: PullRequestModel | undefined;

			if (pr instanceof PRNode || pr instanceof DescriptionNode) {
				pullRequestModel = pr.pullRequestModel;
			} else if (pr === undefined) {
				pullRequestModel = await chooseItem<PullRequestModel>(reposManager.folderManagers
					.map(folderManager => folderManager.activePullRequest!)
					.filter(activePR => !!activePR),
					itemValue => `${itemValue.number}: ${itemValue.title}`,
					{ placeHolder: vscode.l10n.t('Choose the pull request to exit') });
			} else {
				pullRequestModel = pr;
			}

			if (!pullRequestModel) {
				return;
			}

			const fromDescriptionPage = pr instanceof PullRequestModel;

			return vscode.window.withProgress(
				{
					location: vscode.ProgressLocation.SourceControl,
					title: vscode.l10n.t('Exiting Pull Request'),
				},
				async () => {
					const branch = await pullRequestModel!.githubRepository.getDefaultBranch();
					const manager = reposManager.getManagerForIssueModel(pullRequestModel);
					if (manager) {
						const prBranch = manager.repository.state.HEAD?.name;
						await manager.checkoutDefaultBranch(branch);
						if (prBranch) {
							await manager.cleanupAfterPullRequest(prBranch, pullRequestModel!);
						}
					}
				},
			);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.merge', async (pr?: PRNode) => {
			const folderManager = reposManager.getManagerForIssueModel(pr?.pullRequestModel);
			if (!folderManager) {
				return;
			}
			const pullRequest = ensurePR(folderManager, pr);
			// TODO check is codespaces

			const isCrossRepository =
				pullRequest.base &&
				pullRequest.head &&
				!pullRequest.base.repositoryCloneUrl.equals(pullRequest.head.repositoryCloneUrl);

			const showMergeOnGitHub = isCrossRepository && isInCodespaces();
			if (showMergeOnGitHub) {
				return openPullRequestOnGitHub(pullRequest, telemetry);
			}

			const yes = vscode.l10n.t('Yes');
			return vscode.window
				.showWarningMessage(
					vscode.l10n.t('Are you sure you want to merge this pull request on GitHub?'),
					{ modal: true },
					yes,
				)
				.then(async value => {
					let newPR;
					if (value === yes) {
						try {
							newPR = await folderManager.mergePullRequest(pullRequest);
							return newPR;
						} catch (e) {
							vscode.window.showErrorMessage(`Unable to merge pull request. ${formatError(e)}`);
							return newPR;
						}
					}
				});
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.readyForReview', async (pr?: PRNode) => {
			const folderManager = reposManager.getManagerForIssueModel(pr?.pullRequestModel);
			if (!folderManager) {
				return;
			}
			const pullRequest = ensurePR(folderManager, pr);
			const yes = vscode.l10n.t('Yes');
			return vscode.window
				.showWarningMessage(
					vscode.l10n.t('Are you sure you want to mark this pull request as ready to review on GitHub?'),
					{ modal: true },
					yes,
				)
				.then(async value => {
					let isDraft;
					if (value === yes) {
						try {
							isDraft = await pullRequest.setReadyForReview();
							vscode.commands.executeCommand('pr.refreshList');
							return isDraft;
						} catch (e) {
							vscode.window.showErrorMessage(
								`Unable to mark pull request as ready to review. ${formatError(e)}`,
							);
							return isDraft;
						}
					}
				});
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.close', async (pr?: PRNode | PullRequestModel, message?: string) => {
			let pullRequestModel: PullRequestModel | undefined;
			if (pr) {
				pullRequestModel = pr instanceof PullRequestModel ? pr : pr.pullRequestModel;
			} else {
				const activePullRequests: PullRequestModel[] = reposManager.folderManagers
					.map(folderManager => folderManager.activePullRequest!)
					.filter(activePR => !!activePR);
				pullRequestModel = await chooseItem<PullRequestModel>(
					activePullRequests,
					itemValue => `${itemValue.number}: ${itemValue.title}`,
					{ placeHolder: vscode.l10n.t('Pull request to close') },
				);
			}
			if (!pullRequestModel) {
				return;
			}
			const pullRequest: PullRequestModel = pullRequestModel;
			const yes = vscode.l10n.t('Yes');
			return vscode.window
				.showWarningMessage(
					vscode.l10n.t('Are you sure you want to close this pull request on GitHub? This will close the pull request without merging.'),
					{ modal: true },
					yes,
					vscode.l10n.t('No'),
				)
				.then(async value => {
					if (value === yes) {
						try {
							let newComment: IComment | undefined = undefined;
							if (message) {
								newComment = await pullRequest.createIssueComment(message);
							}

							const newPR = await pullRequest.close();
							vscode.commands.executeCommand('pr.refreshList');
							_onDidUpdatePR.fire(newPR);
							return newComment;
						} catch (e) {
							vscode.window.showErrorMessage(`Unable to close pull request. ${formatError(e)}`);
							_onDidUpdatePR.fire();
						}
					}

					_onDidUpdatePR.fire();
				});
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.dismissNotification', node => {
			if (node instanceof PRNode) {
				tree.notificationProvider.markPrNotificationsAsRead(node.pullRequestModel).then(
					() => tree.refresh(node)
				);

			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'pr.openDescription',
			async (argument: DescriptionNode | PullRequestModel | undefined) => {
				let pullRequestModel: PullRequestModel | undefined;
				if (!argument) {
					const activePullRequests: PullRequestModel[] = reposManager.folderManagers
						.map(manager => manager.activePullRequest!)
						.filter(activePR => !!activePR);
					if (activePullRequests.length >= 1) {
						pullRequestModel = await chooseItem<PullRequestModel>(
							activePullRequests,
							itemValue => itemValue.title,
						);
					}
				} else {
					pullRequestModel = argument instanceof DescriptionNode ? argument.pullRequestModel : argument;
				}

				if (!pullRequestModel) {
					Logger.appendLine('No pull request found.');
					return;
				}

				const folderManager = reposManager.getManagerForIssueModel(pullRequestModel);
				if (!folderManager) {
					return;
				}

				let descriptionNode: DescriptionNode | undefined;
				if (argument instanceof DescriptionNode) {
					descriptionNode = argument;
				} else {
					const reviewManager = ReviewManager.getReviewManagerForFolderManager(reviewManagers, folderManager);
					if (!reviewManager) {
						return;
					}

					descriptionNode = reviewManager.changesInPrDataProvider.getDescriptionNode(folderManager);
				}

				await openDescription(context, telemetry, pullRequestModel, descriptionNode, folderManager, tree.notificationProvider);
			},
		),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.refreshDescription', async () => {
			if (PullRequestOverviewPanel.currentPanel) {
				PullRequestOverviewPanel.refresh();
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.openDescriptionToTheSide', async (descriptionNode: DescriptionNode) => {
			const folderManager = reposManager.getManagerForIssueModel(descriptionNode.pullRequestModel);
			if (!folderManager) {
				return;
			}
			const pr = descriptionNode.pullRequestModel;
			const pullRequest = ensurePR(folderManager, pr);
			descriptionNode.reveal(descriptionNode, { select: true, focus: true });
			// Create and show a new webview
			PullRequestOverviewPanel.createOrShow(context.extensionUri, folderManager, pullRequest, true);

		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.showDiffSinceLastReview', async (descriptionNode: DescriptionNode) => {
			descriptionNode.pullRequestModel.showChangesSinceReview = true;
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.showDiffAll', async (descriptionNode: DescriptionNode) => {
			descriptionNode.pullRequestModel.showChangesSinceReview = false;
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.signin', async () => {
			await reposManager.authenticate();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.signinNoEnterprise', async () => {
			await reposManager.authenticate(false);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.signinenterprise', async () => {
			await reposManager.authenticate(true);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.deleteLocalBranchesNRemotes', async () => {
			for (const folderManager of reposManager.folderManagers) {
				await folderManager.deleteLocalBranchesNRemotes();
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.signinAndRefreshList', async () => {
			if (await reposManager.authenticate()) {
				vscode.commands.executeCommand('pr.refreshList');
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.configureRemotes', async () => {
			return vscode.commands.executeCommand('workbench.action.openSettings', `@ext:${EXTENSION_ID} remotes`);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.startReview', async (reply: CommentReply) => {
			const handler = resolveCommentHandler(reply.thread);

			if (handler) {
				handler.startReview(reply.thread, reply.text);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.openReview', async (thread: GHPRCommentThread) => {
			const handler = resolveCommentHandler(thread);

			if (handler) {
				await handler.openReview(thread);
			}
		}),
	);

	function threadAndText(commentLike: CommentReply | GHPRCommentThread | GHPRComment | any): { thread: GHPRCommentThread, text: string } {
		let thread: GHPRCommentThread;
		let text: string = '';
		if (commentLike instanceof GHPRComment) {
			thread = commentLike.parent;
		} else if (CommentReply.is(commentLike)) {
			thread = commentLike.thread;
		} else if (GHPRCommentThread.is(commentLike?.thread)) {
			thread = commentLike.thread;
		} else {
			thread = commentLike;
		}
		return { thread, text };
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.resolveReviewThread', async (commentLike: CommentReply | GHPRCommentThread | GHPRComment) => {
			const { thread, text } = threadAndText(commentLike);
			const handler = resolveCommentHandler(thread);

			if (handler) {
				await handler.resolveReviewThread(thread, text);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.unresolveReviewThread', async (commentLike: CommentReply | GHPRCommentThread | GHPRComment) => {
			const { thread, text } = threadAndText(commentLike);

			const handler = resolveCommentHandler(thread);

			if (handler) {
				await handler.unresolveReviewThread(thread, text);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.createComment', async (reply: CommentReply) => {
			const handler = resolveCommentHandler(reply.thread);

			if (handler) {
				handler.createOrReplyComment(reply.thread, reply.text, false);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.createSingleComment', async (reply: CommentReply) => {
			const handler = resolveCommentHandler(reply.thread);

			if (handler) {
				handler.createOrReplyComment(reply.thread, reply.text, true);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.makeSuggestion', async (reply: CommentReply | GHPRComment) => {
			const thread = reply instanceof GHPRComment ? reply.parent : reply.thread;
			const commentEditor = vscode.window.activeTextEditor?.document.uri.scheme === Schemes.Comment ? vscode.window.activeTextEditor
				: vscode.window.visibleTextEditors.find(visible => (visible.document.uri.scheme === Schemes.Comment) && (visible.document.uri.query === ''));
			if (!commentEditor) {
				Logger.error('No comment editor visible for making a suggestion.');
				vscode.window.showErrorMessage(vscode.l10n.t('No available comment editor to make a suggestion in.'));
				return;
			}
			const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === thread.uri.toString());
			const contents = editor?.document.getText(new vscode.Range(thread.range.start.line, 0, thread.range.end.line, editor.document.lineAt(thread.range.end.line).text.length));
			return commentEditor.edit((editBuilder) => {
				editBuilder.insert(commentEditor.selection.end, `
\`\`\`suggestion
${contents}
\`\`\``);
			});
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.editComment', async (comment: GHPRComment | TemporaryComment) => {
			comment.startEdit();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.editQuery', (query: CategoryTreeNode) => {
			return query.editQuery();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.cancelEditComment', async (comment: GHPRComment | TemporaryComment) => {
			comment.cancelEdit();
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.saveComment', async (comment: GHPRComment | TemporaryComment) => {
			const handler = resolveCommentHandler(comment.parent);

			if (handler) {
				await handler.editComment(comment.parent, comment);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.deleteComment', async (comment: GHPRComment | TemporaryComment) => {
			const deleteOption = vscode.l10n.t('Delete');
			const shouldDelete = await vscode.window.showWarningMessage(vscode.l10n.t('Delete comment?'), { modal: true }, deleteOption);

			if (shouldDelete === deleteOption) {
				const handler = resolveCommentHandler(comment.parent);

				if (handler) {
					await handler.deleteComment(comment.parent, comment);
				}
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('review.openFile', (value: GitFileChangeNode | vscode.Uri) => {
			const command = value instanceof GitFileChangeNode ? value.openFileCommand() : openFileCommand(value);
			vscode.commands.executeCommand(command.command, ...(command.arguments ?? []));
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('review.openLocalFile', (value: vscode.Uri) => {
			const { path, rootPath } = fromReviewUri(value.query);
			const localUri = vscode.Uri.joinPath(vscode.Uri.file(rootPath), path);
			const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === value.toString());
			const command = openFileCommand(localUri, editor ? { selection: editor.selection } : undefined);
			vscode.commands.executeCommand(command.command, ...(command.arguments ?? []));
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.refreshChanges', _ => {
			reviewManagers.forEach(reviewManager => {
				reviewManager.updateComments();
				PullRequestOverviewPanel.refresh();
				reviewManager.changesInPrDataProvider.refresh();
			});
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.setFileListLayoutAsTree', _ => {
			vscode.workspace.getConfiguration('githubPullRequests').update('fileListLayout', 'tree', true);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.setFileListLayoutAsFlat', _ => {
			vscode.workspace.getConfiguration('githubPullRequests').update('fileListLayout', 'flat', true);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.refreshPullRequest', (prNode: PRNode) => {
			const folderManager = reposManager.getManagerForIssueModel(prNode.pullRequestModel);
			if (folderManager && prNode.pullRequestModel.equals(folderManager?.activePullRequest)) {
				ReviewManager.getReviewManagerForFolderManager(reviewManagers, folderManager)?.updateComments();
			}

			PullRequestOverviewPanel.refresh();
			tree.refresh(prNode);
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.markFileAsViewed', async (treeNode: FileChangeNode | vscode.Uri | undefined) => {
			try {
				if (treeNode === undefined) {
					// Use the active editor to enable keybindings
					treeNode = vscode.window.activeTextEditor?.document.uri;
				}

				if (treeNode instanceof FileChangeNode) {
					await treeNode.markFileAsViewed();
				} else if (treeNode) {
					// When the argument is a uri it came from the editor menu and we should also close the file
					// Do the close first to improve perceived performance of marking as viewed.
					const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
					if (tab) {
						let compareUri: vscode.Uri | undefined = undefined;
						if (tab.input instanceof vscode.TabInputTextDiff) {
							compareUri = tab.input.modified;
						} else if (tab.input instanceof vscode.TabInputText) {
							compareUri = tab.input.uri;
						}
						if (compareUri && treeNode.toString() === compareUri.toString()) {
							vscode.window.tabGroups.close(tab);
						}
					}
					const manager = reposManager.getManagerForFile(treeNode);
					await manager?.activePullRequest?.markFileAsViewed(treeNode.path);
					manager?.setFileViewedContext();
				}
			} catch (e) {
				vscode.window.showErrorMessage(`Marked file as viewed failed: ${e}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.unmarkFileAsViewed', async (treeNode: FileChangeNode | vscode.Uri | undefined) => {
			try {
				if (treeNode === undefined) {
					// Use the active editor to enable keybindings
					treeNode = vscode.window.activeTextEditor?.document.uri;
				}

				if (treeNode instanceof FileChangeNode) {
					treeNode.unmarkFileAsViewed();
				} else if (treeNode) {
					const manager = reposManager.getManagerForFile(treeNode);
					await manager?.activePullRequest?.unmarkFileAsViewed(treeNode.path);
					manager?.setFileViewedContext();
				}
			} catch (e) {
				vscode.window.showErrorMessage(`Marked file as not viewed failed: ${e}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.resetViewedFiles', async () => {
			try {
				return reposManager.folderManagers.map(async (manager) => {
					await manager.activePullRequest?.unmarkAllFilesAsViewed();
					manager.setFileViewedContext();
				});
			} catch (e) {
				vscode.window.showErrorMessage(`Marked file as not viewed failed: ${e}`);
			}
		}),
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.collapseAllComments', () => {
			return vscode.commands.executeCommand('workbench.action.collapseAllComments');
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.copyCommentLink', (comment) => {
			if (comment instanceof GHPRComment) {
				return vscode.env.clipboard.writeText(comment.rawComment.htmlUrl);
			}
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.copyVscodeDevPrLink', async () => {
			const activePullRequests: PullRequestModel[] = reposManager.folderManagers
				.map(folderManager => folderManager.activePullRequest!)
				.filter(activePR => !!activePR);
			const pr = await chooseItem<PullRequestModel>(
				activePullRequests,
				itemValue => `${itemValue.number}: ${itemValue.title}`,
				{ placeHolder: vscode.l10n.t('Pull request to create a link for') },
			);
			if (pr) {
				return vscode.env.clipboard.writeText(vscodeDevPrLink(pr));
			}
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.checkoutByNumber', async () => {

			const githubRepositories: { manager: FolderRepositoryManager, repo: GitHubRepository }[] = [];
			reposManager.folderManagers.forEach(manager => {
				githubRepositories.push(...(manager.gitHubRepositories.map(repo => { return { manager, repo }; })));
			});
			const githubRepo = await chooseItem<{ manager: FolderRepositoryManager, repo: GitHubRepository }>(
				githubRepositories,
				itemValue => `${itemValue.repo.remote.owner}/${itemValue.repo.remote.repositoryName}`,
				{ placeHolder: vscode.l10n.t('Which GitHub repository do you want to checkout the pull request from?') }
			);
			if (!githubRepo) {
				return;
			}
			const prNumberMatcher = /^#?(\d*)$/;
			const prNumber = await vscode.window.showInputBox({
				ignoreFocusOut: true, prompt: vscode.l10n.t('Enter the pull request number'),
				validateInput: (input: string) => {
					const matches = input.match(prNumberMatcher);
					if (!matches || (matches.length !== 2) || Number.isNaN(Number(matches[1]))) {
						return vscode.l10n.t('Value must be a number');
					}
					return undefined;
				}
			});
			if ((prNumber === undefined) || prNumber === '#') {
				return;
			}
			const prModel = await githubRepo.manager.fetchById(githubRepo.repo, Number(prNumber.match(prNumberMatcher)![1]));
			if (prModel) {
				return ReviewManager.getReviewManagerForFolderManager(reviewManagers, githubRepo.manager)?.switch(prModel);
			}
		}));

	function chooseRepoToOpen() {
		const githubRepositories: GitHubRepository[] = [];
		reposManager.folderManagers.forEach(manager => {
			githubRepositories.push(...(manager.gitHubRepositories));
		});
		return chooseItem<GitHubRepository>(
			githubRepositories,
			itemValue => `${itemValue.remote.owner}/${itemValue.remote.repositoryName}`,
			{ placeHolder: vscode.l10n.t('Which GitHub repository do you want to open?') }
		);
	}
	context.subscriptions.push(
		vscode.commands.registerCommand('pr.openPullsWebsite', async () => {
			const githubRepo = await chooseRepoToOpen();
			if (githubRepo) {
				vscode.env.openExternal(getPullsUrl(githubRepo));
			}
		}));
	context.subscriptions.push(
		vscode.commands.registerCommand('issues.openIssuesWebsite', async () => {
			const githubRepo = await chooseRepoToOpen();
			if (githubRepo) {
				vscode.env.openExternal(getIssuesUrl(githubRepo));
			}
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('pr.applySuggestion', async (comment: GHPRComment) => {

			const handler = resolveCommentHandler(comment.parent);

			if (handler instanceof ReviewCommentController) {
				handler.applySuggestion(comment);
			}
		}));

	function goToNextPrevDiff(diffs: vscode.LineChange[], next: boolean) {
		const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
		const input = tab?.input;
		if (!(input instanceof vscode.TabInputTextDiff)) {
			return vscode.window.showErrorMessage(vscode.l10n.t('Current editor isn\'t a diff editor.'));
		}

		const editor = vscode.window.visibleTextEditors.find(editor => editor.document.uri.toString() === input.modified.toString());
		if (!editor) {
			return vscode.window.showErrorMessage(vscode.l10n.t('Unexpectedly unable to find the current modified editor.'));
		}

		const editorUri = editor.document.uri;
		if (input.original.scheme !== Schemes.Review) {
			return vscode.window.showErrorMessage(vscode.l10n.t('Current file isn\'t a pull request diff.'));
		}

		// Find the next diff in the current file to scroll to
		const visibleRange = editor.visibleRanges[0];
		const iterateThroughDiffs = next ? diffs : diffs.reverse();
		for (const diff of iterateThroughDiffs) {
			const practicalModifiedEndLineNumber = (diff.modifiedEndLineNumber > diff.modifiedStartLineNumber) ? diff.modifiedEndLineNumber : diff.modifiedStartLineNumber as number + 1;
			const diffRange = new vscode.Range(diff.modifiedStartLineNumber ? diff.modifiedStartLineNumber - 1 : diff.modifiedStartLineNumber, 0, practicalModifiedEndLineNumber, 0);
			if (next && (visibleRange.end.line < practicalModifiedEndLineNumber) && (visibleRange.end.line !== (editor.document.lineCount - 1))) {
				editor.revealRange(diffRange);
				return;
			} else if (!next && (visibleRange.start.line > diff.modifiedStartLineNumber) && (visibleRange.start.line !== 0)) {
				editor.revealRange(diffRange);
				return;
			}
		}

		// There is no new range to reveal, time to go to the next file.
		const folderManager = reposManager.getManagerForFile(editorUri);
		if (!folderManager) {
			return vscode.window.showErrorMessage(vscode.l10n.t('Unable to find a repository for pull request.'));
		}

		const reviewManager = ReviewManager.getReviewManagerForFolderManager(reviewManagers, folderManager);
		if (!reviewManager) {
			return vscode.window.showErrorMessage(vscode.l10n.t('Cannot find active pull request.'));
		}

		if (!reviewManager.reviewModel.hasLocalFileChanges || (reviewManager.reviewModel.localFileChanges.length === 0)) {
			return vscode.window.showWarningMessage(vscode.l10n.t('Pull request data is not yet complete, please try again in a moment.'));
		}

		for (let i = 0; i < reviewManager.reviewModel.localFileChanges.length; i++) {
			const index = next ? i : reviewManager.reviewModel.localFileChanges.length - 1;
			const localFileChange = reviewManager.reviewModel.localFileChanges[index];
			if (localFileChange.changeModel.filePath.toString() === editorUri.toString()) {
				const nextIndex = next ? index + 1 : index - 1;
				if (reviewManager.reviewModel.localFileChanges.length > nextIndex) {
					return reviewManager.reviewModel.localFileChanges[nextIndex].openDiff(folderManager);
				}
			}
		}
		// No further files in PR.
		const goInCircle = next ? vscode.l10n.t('Go to first diff') : vscode.l10n.t('Go to last diff');
		return vscode.window.showInformationMessage(vscode.l10n.t('There are no more diffs in this pull request.'), goInCircle).then(result => {
			if (result === goInCircle) {
				return reviewManager.reviewModel.localFileChanges[next ? 0 : reviewManager.reviewModel.localFileChanges.length - 1].openDiff(folderManager);
			}
		});
	}

	context.subscriptions.push(
		vscode.commands.registerDiffInformationCommand('pr.goToNextDiffInPr', async (diffs: vscode.LineChange[]) => {
			goToNextPrevDiff(diffs, true);
		}));
	context.subscriptions.push(
		vscode.commands.registerDiffInformationCommand('pr.goToPreviousDiffInPr', async (diffs: vscode.LineChange[]) => {
			goToNextPrevDiff(diffs, false);
		}));
}
