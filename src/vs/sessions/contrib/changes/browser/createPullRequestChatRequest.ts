/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ChatInteractivity, effectiveChatInteractivity, ISession } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionPullRequestOptions, SessionPullRequestMergeMethod } from '../common/pullRequestCreation.js';

export class CreatePullRequestChatRequest {
	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly sessionsProvidersService: ISessionsProvidersService,
		@INotificationService private readonly notificationService: INotificationService,
	) { }

	async send(session: ISession, options: ISessionPullRequestOptions): Promise<void> {
		const provider = this.sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider)) {
			throw new Error(localize('createPR.chat.providerUnavailable', "The session's agent host provider is unavailable."));
		}

		const chat = session.mainChat.get();
		if (effectiveChatInteractivity(session.isArchived.get() || chat.isArchived.get(), chat.interactivity.get()) !== ChatInteractivity.Full) {
			throw new Error(localize('createPR.chat.readOnly', "Cannot send a pull request creation message to a read-only chat."));
		}

		await this.sessionsManagementService.sendRequest(session, chat, { query: createPullRequestMessage(options) });

		try {
			const current = provider.getAgentMergeSessionState(session.sessionId);
			if (options.agentMerge && options.agentMergeOptions) {
				await provider.setAgentMergeOverrides(session.sessionId, { ...current?.overrides, ...options.agentMergeOptions });
			}
			if (options.agentMerge !== (current?.enabled ?? false)) {
				await provider.setAgentMergeEnabled(session.sessionId, options.agentMerge);
			}
		} catch (error) {
			// The message was already sent; a retry must not send it again.
			this.notificationService.warn(localize('createPR.chat.agentMergeFailed', "The Create PR message was sent, but the session's Agent Merge settings could not be updated: {0}", toErrorMessage(error)));
		}
	}
}

export function createPullRequestMessage(options: ISessionPullRequestOptions): string {
	const mergeMethods: Record<SessionPullRequestMergeMethod, string> = {
		MERGE: localize('createPR.message.merge', "a merge commit"),
		SQUASH: localize('createPR.message.squash', "squash merging"),
		REBASE: localize('createPR.message.rebase', "rebase merging"),
	};
	return [
		options.draft
			? localize('createPR.message.draft', "Create a draft pull request for this session's changes. Keep it in draft.")
			: localize('createPR.message.ready', "Create a pull request ready for review for this session's changes."),
		localize('createPR.message.push', "Commit any uncommitted changes and push the source branch as needed."),
		localize('createPR.message.details', "Use the following title and description exactly (provided as JSON):\n{0}", JSON.stringify({ title: options.title, description: options.description }, undefined, 2)),
		options.autoMergeMethod
			? localize('createPR.message.autoMerge', "Enable GitHub auto-merge using {0}, so the pull request merges when required checks and approvals pass. Do not bypass these requirements.", mergeMethods[options.autoMergeMethod])
			: localize('createPR.message.manualMerge', "Do not merge the pull request or enable GitHub auto-merge."),
	].join('\n\n');
}
