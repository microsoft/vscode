/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInteractionService } from '../../../platform/chat/common/interactionService';
import { ProgressLocation } from '../../../platform/notification/common/notificationService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { Uri } from '../../../vscodeTypes';
import { ReviewerComments, ReviewerCommentsProvider } from '../../githubPullRequest';
import { ReviewSession } from './doReview';

export class GitHubPullRequestReviewerCommentsProvider implements ReviewerCommentsProvider {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IInteractionService private readonly interactionService: IInteractionService,
	) { }

	async provideReviewerComments(context: { repositoryRoot: string; commitMessages: string[]; patches: { patch: string; fileUri: string; previousFileUri?: string }[] }, token: CancellationToken): Promise<ReviewerComments> {
		this.interactionService.startInteraction();
		const reviewSession = this.instantiationService.createInstance(ReviewSession);
		const reviewResult = await reviewSession.review(context, ProgressLocation.Notification, token);
		const files: Uri[] = [];
		if (reviewResult?.type === 'success') {
			for (const comment of reviewResult.comments) {
				files.push(comment.uri);
			}
		}
		const succeeded = reviewResult?.type === 'success';
		return { files, succeeded };
	}

}