/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { DisposableStore } from '../../../util/vs/base/common/lifecycle';
import { URI } from '../../../util/vs/base/common/uri';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ConfigKey, IConfigurationService } from '../../configuration/common/configurationService';
import { IVSCodeExtensionContext } from '../../extContext/common/extensionContext';
import { IGitExtensionService } from '../../git/common/gitExtensionService';
import { IReviewService, ReviewComment, ReviewDiagnosticCollection, ReviewSuggestionChange } from '../common/reviewService';

interface InternalComment {
	comment: ReviewComment;
	thread: vscode.CommentThread;
}

const reviewDiffContextKey = 'github.copilot.chat.reviewDiff.enabled';
const reviewDiffReposContextKey = 'github.copilot.chat.reviewDiff.enabledRootUris';
const numberOfReviewCommentsKey = 'github.copilot.chat.review.numberOfComments';

export class ReviewServiceImpl implements IReviewService {
	declare _serviceBrand: undefined;
	private _disposables = new DisposableStore();
	private _repositoryDisposables = new DisposableStore();
	private _reviewDiffReposString: string | undefined;
	private _diagnosticCollection: vscode.DiagnosticCollection | undefined;
	private _commentController = vscode.comments.createCommentController('github-copilot-review', 'Code Review');
	private _comments: InternalComment[] = [];
	private _monitorActiveThread: any | undefined;
	private _activeThread: vscode.CommentThread | undefined;

	constructor(
		@IConfigurationService private _configurationService: IConfigurationService,
		@IAuthenticationService private _authenticationService: IAuthenticationService,
		@IVSCodeExtensionContext private _contextService: IVSCodeExtensionContext,
		@IGitExtensionService private _gitExtensionService: IGitExtensionService,
	) {
		this._disposables.add(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ConfigKey.CodeFeedback.fullyQualifiedId)) {
				vscode.commands.executeCommand('setContext', ConfigKey.CodeFeedback.fullyQualifiedId, this.isCodeFeedbackEnabled());
			}
			if (e.affectsConfiguration('github.copilot.advanced') || e.affectsConfiguration('github.copilot.advanced.review.intent')) {
				vscode.commands.executeCommand('setContext', ConfigKey.Advanced.ReviewIntent.fullyQualifiedId, this.isIntentEnabled());
			}
		}));
		this._disposables.add(this._authenticationService.onDidAuthenticationChange(() => {
			vscode.commands.executeCommand('setContext', reviewDiffContextKey, this.isReviewDiffEnabled());
		}));
		this._disposables.add(this._repositoryDisposables);
		this._disposables.add(this._gitExtensionService.onDidChange(() => {
			this.updateRepositoryListeners();
		}));
		this.updateRepositoryListeners();
		this.updateContextValues();
		vscode.commands.executeCommand('setContext', numberOfReviewCommentsKey, 0);
	}

	private updateRepositoryListeners() {
		this._repositoryDisposables.clear();
		const api = this._gitExtensionService.getExtensionApi();
		if (api) {
			this._repositoryDisposables.add(api.onDidOpenRepository(() => {
				this.updateRepositoryListeners();
			}));
			this._repositoryDisposables.add(api.onDidCloseRepository(() => {
				this.updateRepositoryListeners();
			}));
			api.repositories.forEach(repo => {
				this._repositoryDisposables.add(repo.state.onDidChange(() => {
					this.updateReviewDiffReposContext();
				}));
			});
		}
		this.updateReviewDiffReposContext();
	}

	private updateReviewDiffReposContext() {
		const reviewDiffRepos = this.getRepositoriesWithUncommitedChanges();
		const reviewDiffReposString = reviewDiffRepos.map(uri => uri.toString()).sort().join(',');
		if (reviewDiffReposString !== this._reviewDiffReposString) {
			this._reviewDiffReposString = reviewDiffReposString;
			vscode.commands.executeCommand('setContext', reviewDiffReposContextKey, reviewDiffRepos);
		}
	}

	private getRepositoriesWithUncommitedChanges(): vscode.Uri[] {
		const r = this._gitExtensionService.getExtensionApi()?.repositories
			.filter(({ state }) => state.workingTreeChanges.length || state.indexChanges.length || state.untrackedChanges.length || state.mergeChanges.length)
			.map(repo => repo.rootUri) || [];
		return r;
	}

	updateContextValues(): void {
		vscode.commands.executeCommand('setContext', ConfigKey.CodeFeedback.fullyQualifiedId, this.isCodeFeedbackEnabled());
		vscode.commands.executeCommand('setContext', reviewDiffContextKey, this.isReviewDiffEnabled());
		vscode.commands.executeCommand('setContext', ConfigKey.Advanced.ReviewIntent.fullyQualifiedId, this.isIntentEnabled());
	}

	isCodeFeedbackEnabled() {
		const inspect = this._configurationService.inspectConfig(ConfigKey.CodeFeedback);
		return inspect?.workspaceFolderValue ?? inspect?.workspaceValue ?? inspect?.globalValue ?? this._configurationService.getDefaultValue(ConfigKey.CodeFeedback);
	}

	isReviewDiffEnabled() {
		return this._configurationService.getConfig(ConfigKey.ReviewAgent) && this._authenticationService.copilotToken?.isCopilotCodeReviewEnabled || false;
	}

	isIntentEnabled(): boolean {
		return this._configurationService.getConfig(ConfigKey.Advanced.ReviewIntent);
	}

	getDiagnosticCollection(): ReviewDiagnosticCollection {
		return this._diagnosticCollection || this._disposables.add(this._diagnosticCollection = vscode.languages.createDiagnosticCollection('github.copilot.chat.review'));
	}

	getReviewComments(): ReviewComment[] {
		return this._comments.map(({ comment }) => comment);
	}

	addReviewComments(comments: ReviewComment[]) {
		for (const comment of comments) {
			const thread = this._commentController.createCommentThread(comment.uri, comment.range, this.createUIComments(comment));
			thread.contextValue = 'hasNoSuggestion';
			thread.canReply = false;
			if (!this._comments.find(c => c.comment.uri.toString() === comment.uri.toString())) {
				thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
			}
			this._comments.push({ comment, thread });
			this.updateThreadLabels();
			if (this._comments.length === 1) {
				vscode.commands.executeCommand('github.copilot.chat.review.next');
				this._monitorActiveThread = setInterval(() => {
					const raw = this._commentController.activeCommentThread;
					const active = raw && this._comments.find(c => c.thread.label === raw.label)?.thread; // https://github.com/microsoft/vscode/issues/223025
					if (active !== this._activeThread) {
						this._activeThread = active;
						if (active) {
							vscode.commands.executeCommand('github.copilot.chat.review.current', active);
						}
					}
				}, 500);
			}
		}
		vscode.commands.executeCommand('setContext', numberOfReviewCommentsKey, this._comments.length);
	}

	updateReviewComment(comment: ReviewComment) {
		const thread = this.findCommentThread(comment);
		if (!thread) {
			return;
		}
		thread.comments = this.createUIComments(comment);
	}

	private createUIComments(comment: ReviewComment) {
		const appendText = ''; // `\n\n(Type ${comment.kind}, severity ${comment.severity}.)`;
		const change = comment.suggestion
			? 'edits' in comment.suggestion
				? comment.suggestion.edits.length
					? `\n\n***\n${l10n.t('Suggested change:')}${comment.suggestion.edits.map(e => `\n\`\`\`diff\n${diff(e)}\n\`\`\``).join('')}\n***`
					: `\n\n${l10n.t('No change found to suggest.')}`
				: `\n\n${l10n.t('Looking up change to suggest...')}`
			: '';
		const comments = [
			{
				body: typeof comment.body === 'string' ? `${comment.body}${change}${appendText}` : new vscode.MarkdownString(`${comment.body.value}${change}${appendText}`),
				mode: vscode.CommentMode.Preview,
				author: {
					name: l10n.t('Code Review'),
					iconPath: URI.joinPath(this._contextService.extensionUri, 'assets', 'copilot.png'),
				},
			}
		];
		return comments;
	}

	collapseReviewComment(comment: ReviewComment) {
		const internalComment = this._comments.find(c => c.comment === comment);
		if (!internalComment) {
			return;
		}

		const oldThread = internalComment.thread;
		oldThread.dispose();
		const newThread = this._commentController.createCommentThread(comment.uri, comment.range, oldThread.comments);
		newThread.contextValue = oldThread.contextValue;
		newThread.canReply = false;
		newThread.label = oldThread.label;

		internalComment.thread = newThread;
	}

	removeReviewComments(comments: ReviewComment[]) {
		for (const comment of comments) {
			const index = this._comments.findIndex(c => c.comment === comment);
			if (index !== -1) {
				this._comments[index].thread.dispose();
				this._comments.splice(index, 1);
			}
		}
		this.updateThreadLabels();
		if (this._comments.length === 0 && this._monitorActiveThread) {
			clearInterval(this._monitorActiveThread);
			this._monitorActiveThread = undefined;
		}
		vscode.commands.executeCommand('setContext', numberOfReviewCommentsKey, this._comments.length);
	}

	private updateThreadLabels() {
		this._comments.forEach((comment, i) => {
			comment.thread.label = l10n.t('Comment {0} of {1}', i + 1, this._comments.length);
		});
	}

	findReviewComment(threadOrComment: vscode.CommentThread | vscode.Comment): ReviewComment | undefined {
		const internalComment = this._comments.find(c => c.thread === threadOrComment || c.thread.comments[0] === threadOrComment);
		return internalComment?.comment;
	}

	findCommentThread(comment: ReviewComment): vscode.CommentThread | undefined {
		const internalComment = this._comments.find(c => c.comment === comment);
		return internalComment?.thread;
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

function diff(change: ReviewSuggestionChange): string {
	const oldText = change.oldText.split(/\r?\n/);
	const newText = change.newText.split(/\r?\n/);
	while (oldText.length && newText.length && oldText[0] === newText[0]) {
		oldText.shift();
		newText.shift();
	}
	while (oldText.length && newText.length && oldText[oldText.length - 1] === newText[newText.length - 1]) {
		oldText.pop();
		newText.pop();
	}
	return `${oldText.map(line => `- ${line}`).join('\n')}
${newText.map(line => `+ ${line}`).join('\n')}`;
}
