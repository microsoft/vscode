/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

import { ICodeReviewService, type CodeReviewCommentLocation } from '../../../platform/languageContextProvider/common/codeReviewService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import type { IExtensionContribution } from '../../common/contributions';

export const changedEntitiesCommentControllerId = 'github-copilot-changed-entities';
export const saveChangedEntitiesCommentCommand = 'github.copilot.changedEntities.comments.save';
export const discardChangedEntitiesCommentCommand = 'github.copilot.changedEntities.comments.discard';
export const sendChangedEntitiesCommentsCommand = 'github.copilot.changedEntities.comments.sendAll';
export const pendingChangedEntitiesCommentsContext = 'github.copilot.changedEntities.pendingCommentCount';

const pendingCommentThreadContext = 'copilotChangedEntitiesPendingComment';

interface PendingReviewComment {
	readonly reviewId: string;
	readonly location: CodeReviewCommentLocation;
	readonly text: string;
}

export class ChangedEntitiesCommentControllerContribution extends Disposable implements IExtensionContribution {
	readonly id = 'changedEntitiesCommentController';

	private readonly commentController: vscode.CommentController;
	private readonly pendingComments = new Map<vscode.CommentThread, PendingReviewComment>();

	constructor(
		@ICodeReviewService private readonly codeReviewService: ICodeReviewService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.commentController = this._register(vscode.comments.createCommentController(
			changedEntitiesCommentControllerId,
			l10n.t('Changed Entities Review'),
		));
		this.commentController.options = {
			prompt: l10n.t('Add a comment for Copilot'),
			placeHolder: l10n.t('Describe what Copilot should change'),
		};
		this.commentController.commentingRangeProvider = {
			provideCommentingRanges: document => [...this.codeReviewService.getCommentingRanges(document.uri)],
		};
		this._register(this.codeReviewService.onDidInvalidateReview(reviewId => this.removeReviewComments(reviewId)));
		this._register(vscode.commands.registerCommand(saveChangedEntitiesCommentCommand, (reply: vscode.CommentReply) => this.saveComment(reply)));
		this._register(vscode.commands.registerCommand(discardChangedEntitiesCommentCommand, (thread: vscode.CommentThread) => this.discardComment(thread)));
		this._register(vscode.commands.registerCommand(sendChangedEntitiesCommentsCommand, () => this.openCommentsInChat()));
		this.updatePendingCommentContext();
	}

	private async saveComment(reply: vscode.CommentReply): Promise<void> {
		const text = reply.text.trim();
		if (text.length === 0) {
			await vscode.window.showWarningMessage(l10n.t('Enter a review comment before saving it.'));
			return;
		}
		const range = reply.thread.range;
		const location = range === undefined ? undefined : this.codeReviewService.resolveCommentLocation(reply.thread.uri, range);
		if (location === undefined) {
			reply.thread.dispose();
			await vscode.window.showWarningMessage(l10n.t('This code review location is no longer available. Reopen the entity diff and try again.'));
			return;
		}

		reply.thread.comments = [{
			body: text,
			mode: vscode.CommentMode.Preview,
			author: { name: l10n.t('You') },
		}];
		reply.thread.canReply = false;
		reply.thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
		reply.thread.contextValue = pendingCommentThreadContext;
		reply.thread.label = l10n.t('Pending Copilot comment');
		reply.thread.state = vscode.CommentThreadState.Unresolved;
		this.pendingComments.set(reply.thread, {
			reviewId: location.reviewId,
			location,
			text,
		});
		this.updatePendingCommentContext();
	}

	private discardComment(thread: vscode.CommentThread): void {
		if (this.pendingComments.delete(thread)) {
			thread.dispose();
			this.updatePendingCommentContext();
		}
	}

	private removeReviewComments(reviewId: string): void {
		let didChange = false;
		for (const [thread, comment] of this.pendingComments) {
			if (comment.reviewId === reviewId) {
				this.pendingComments.delete(thread);
				thread.dispose();
				didChange = true;
			}
		}
		if (didChange) {
			this.updatePendingCommentContext();
		}
	}

	private async openCommentsInChat(): Promise<void> {
		const comments = Array.from(this.pendingComments.values());
		if (comments.length === 0) {
			await vscode.window.showWarningMessage(l10n.t('There are no pending review comments to send to Copilot.'));
			return;
		}

		const attachments: { uri: vscode.Uri; range: vscode.Range }[] = [];
		const attachmentKeys = new Set<string>();
		const promptEntries = comments.map(comment => {
			const { uri, range } = comment.location;
			const key = `${uri.toString()}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
			if (!attachmentKeys.has(key)) {
				attachmentKeys.add(key);
				attachments.push({ uri, range });
			}
			return {
				file: vscode.workspace.asRelativePath(uri, false),
				startLine: range.start.line + 1,
				endLine: ChangedEntitiesCommentControllerContribution.getEndLine(range),
				comment: comment.text,
			};
		});
		const query = l10n.t(
			'Address all of these code review comments together before making changes.\n\n{0}',
			JSON.stringify(promptEntries, undefined, 2),
		);
		await vscode.commands.executeCommand('workbench.action.chat.open', {
			query,
			isPartialQuery: true,
			mode: 'agent',
			attachFiles: attachments,
		});
	}

	private updatePendingCommentContext(): void {
		void vscode.commands.executeCommand('setContext', pendingChangedEntitiesCommentsContext, this.pendingComments.size).then(undefined, error => {
			this.logService.error(error, 'Failed to update the pending Changed Entities comment count');
		});
	}

	private static getEndLine(range: vscode.Range): number {
		const endLine = range.end.line + (range.end.character > 0 ? 1 : 0);
		return Math.max(range.start.line + 1, endLine);
	}

	override dispose(): void {
		this.pendingComments.clear();
		void vscode.commands.executeCommand('setContext', pendingChangedEntitiesCommentsContext, 0).then(undefined, error => {
			this.logService.error(error, 'Failed to clear the pending Changed Entities comment count');
		});
		super.dispose();
	}
}
