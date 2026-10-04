/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IOnboardingTryout } from '../../../onboarding/common/onboardingTryout.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { DEV_CONTAINER_SAMPLES_TRYOUT_ID, DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND } from '../../common/onboarding/devContainerSamplesTryout.js';
import { CHAT_SETUP_ACTION_ID } from '../actions/chatActions.js';

export function createDevContainerSamplesTryout(): IOnboardingTryout<undefined> {
	return {
		id: DEV_CONTAINER_SAMPLES_TRYOUT_ID,
		title: localize('chat.tryout.devContainerSamples.title', "Explore Dev Container Samples"),
		description: localize('chat.tryout.devContainerSamples.description', "Open Dev Container samples in the Agents window. Docker must be installed and running. If required settings are disabled, you will be asked to enable them. Choose a sample and send a prompt to start its container."),
		isAI: true,
		targetWindow: 'agents',
		when: ChatContextKeys.enabled,
		unavailableMessage: localize('chat.tryout.devContainerSamples.unavailable', "Dev Container samples require the desktop Agents window with Chat enabled."),
		setup: {
			label: localize('chat.tryout.devContainerSamples.setup', "Set Up Chat"),
			command: { id: CHAT_SETUP_ACTION_ID },
		},
		presentation: { kind: DEV_CONTAINER_SAMPLES_TRYOUT_PRESENTATION_KIND, payload: undefined },
	};
}
