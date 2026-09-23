/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { ChatInteractivity, effectiveChatInteractivity, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionPullRequestChatOptions, ISessionPullRequestCreation, SessionPullRequestMergeMethod } from '../common/pullRequestCreation.js';

export class CreatePullRequestChatRequest {
	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
	) { }

	async send(session: ISession, options: ISessionPullRequestChatOptions, creation: ISessionPullRequestCreation): Promise<void> {
		const request = await creation.prepareChatRequest(createPullRequestMessage(options), options);
		const chat = session.mainChat.get();
		if (effectiveChatInteractivity(session.isArchived.get() || chat.isArchived.get(), chat.interactivity.get()) !== ChatInteractivity.Full) {
			throw new Error(localize('createPR.chat.readOnly', "Cannot send a pull request creation message to a read-only chat."));
		}
		await this.sessionsManagementService.sendRequest(session, chat, request);
	}
}

export function createPullRequestMessage(options: ISessionPullRequestChatOptions): string {
	const mergeMethods: Record<SessionPullRequestMergeMethod, string> = {
		MERGE: localize('createPR.message.merge', "a merge commit"),
		SQUASH: localize('createPR.message.squash', "squash merging"),
		REBASE: localize('createPR.message.rebase', "rebase merging"),
	};
	return [
		options.draft
			? localize('createPR.message.draft', "Create a draft pull request for this session's changes. Keep it in draft.")
			: localize('createPR.message.ready', "Create a pull request ready for review for this session's changes."),
		...(options.expectedContext ? [
			localize('createPR.message.context', "The prepared context is repository {0}, current branch {1}, and base branch {2}. If this context has changed, stop and ask me to review it before committing, pushing, or creating the pull request.", options.expectedContext.repository, options.expectedContext.branchName, options.expectedContext.baseBranchName),
			...(options.expectedContext.branchName === options.expectedContext.baseBranchName ? [localize('createPR.message.newBranch', "Create and switch to a new source branch before committing changes.")] : []),
		] : []),
		localize('createPR.message.push', "Commit any uncommitted changes and push the source branch as needed."),
		localize('createPR.message.generateDetails', "Generate a title and description that summarize the changes."),
		options.autoMergeMethod
			? localize('createPR.message.autoMerge', "Enable GitHub auto-merge using {0}, so the pull request merges when required checks and approvals pass. Do not bypass these requirements.", mergeMethods[options.autoMergeMethod])
			: localize('createPR.message.manualMerge', "Do not merge the pull request or enable GitHub auto-merge."),
	].join('\n\n');
}
