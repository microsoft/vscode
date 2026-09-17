/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IOnboardingTryout, registerOnboardingTryout } from '../../../onboarding/common/onboardingTryout.js';
import { ICommandTryoutPayload } from '../../../onboarding/common/onboardingTryoutActions.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { APPLY_CODICONS_CHAT_BACKGROUND_TRYOUT_COMMAND_ID, CODICONS_CHAT_BACKGROUND_TRYOUT_ID, SESSIONS_CHAT_BACKGROUND_AVAILABLE_CONTEXT_KEY } from '../../common/onboarding/chatBackgroundTryout.js';

export function createCodiconsChatBackgroundTryout(): IOnboardingTryout<ICommandTryoutPayload> {
	return {
		id: CODICONS_CHAT_BACKGROUND_TRYOUT_ID,
		title: localize('chat.tryout.codiconsBackground.title', "Change the chat background"),
		description: localize('chat.tryout.codiconsBackground.description', "Set the Agents chat background for the current color theme to the built-in, theme-aware Codicons pattern. Use Set Background to change or remove it later."),
		isAI: true,
		targetWindow: 'agents',
		when: ContextKeyExpr.and(
			ChatContextKeys.enabled,
			ContextKeyExpr.has(SESSIONS_CHAT_BACKGROUND_AVAILABLE_CONTEXT_KEY),
		),
		unavailableMessage: localize('chat.tryout.codiconsBackground.unavailable', "Chat backgrounds are unavailable while a high contrast theme is active."),
		presentation: {
			kind: 'command',
			payload: {
				commandId: APPLY_CODICONS_CHAT_BACKGROUND_TRYOUT_COMMAND_ID,
			},
		},
	};
}

class CodiconsChatBackgroundTryoutContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.codiconsChatBackgroundTryout';

	constructor() {
		super();
		this._register(registerOnboardingTryout(createCodiconsChatBackgroundTryout()));
	}
}

registerWorkbenchContribution2(CodiconsChatBackgroundTryoutContribution.ID, CodiconsChatBackgroundTryoutContribution, WorkbenchPhase.BlockRestore);
