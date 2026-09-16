/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { registerOnboardingTryout, registerOnboardingTryoutPresentation } from '../../../onboarding/common/onboardingTryout.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatModeKind } from '../../common/constants.js';
import { CHAT_DRAFT_TRYOUT_PRESENTATION, IChatDraftTryoutPayload } from '../../common/onboarding/chatDraftTryout.js';
import { CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';
import { OPEN_GITHUB_ISSUE_COMMAND, OPEN_GITHUB_PULL_REQUEST_COMMAND } from '../actions/chatContext.js';
import { ChatDraftTryoutPresentation } from './chatDraftTryoutPresentation.js';
import './modelPickerTryout.contribution.js';

class ChatTryoutsContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatTryouts';

	constructor(@IInstantiationService instantiationService: IInstantiationService) {
		super();
		const presentation = this._register(instantiationService.createInstance(ChatDraftTryoutPresentation));
		this._register(registerOnboardingTryoutPresentation(presentation));
		this._register(registerOnboardingTryout<IChatDraftTryoutPayload>({
			id: 'chat.github-attachments',
			title: localize('chat.tryout.github.title', "Try GitHub Attachments"),
			description: localize('chat.tryout.github.description', "Open a separate Chat draft and choose a GitHub issue or pull request to attach. Nothing is sent."),
			isAI: true,
			// targetWindow: 'agents',
			when: ChatContextKeys.enabled,
			setup: {
				label: localize('chat.tryout.github.setup', "Set Up Chat"),
				command: { id: CHAT_SETUP_ACTION_ID },
			},
			presentation: {
				kind: CHAT_DRAFT_TRYOUT_PRESENTATION,
				payload: {
					sessionType: localChatSessionType,
					mode: ChatModeKind.Agent,
					attachContext: {
						commandIds: [OPEN_GITHUB_ISSUE_COMMAND, OPEN_GITHUB_PULL_REQUEST_COMMAND],
						extensionId: 'GitHub.copilot-chat',
						placeholder: localize('chat.tryout.github.placeholder', "Attach a GitHub issue or pull request to this draft"),
					},
				},
			},
		}));
	}
}

registerWorkbenchContribution2(ChatTryoutsContribution.ID, ChatTryoutsContribution, WorkbenchPhase.AfterRestored);
