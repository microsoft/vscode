/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { IVoiceModeOnboardingService } from '../../../../agentsVoice/browser/voiceModeOnboarding.js';
import { IDictationOnboardingService } from '../../speechToText/dictationOnboarding.js';
import { ChatInputNoticeHost, ChatInputNoticeLane } from './chatInputNoticeHost.js';

/**
 * Docks the voice and dictation introductions above one chat input. Both claim
 * the onboarding lane directly, so the host arbitrates between them the same way
 * it arbitrates against a notification: the newest claim leads, the other stands
 * down and comes back when the newer one goes away.
 *
 * Kept out of `chatInputNoticeHost` so the arbitration primitive stays unaware of
 * the features competing for the space it hands out.
 */
export function registerChatInputOnboardingHosts(
	host: ChatInputNoticeHost,
	containers: { readonly voice: HTMLElement; readonly dictation: HTMLElement },
	focusRoot: HTMLElement,
	focusInput: () => void,
	voiceModeOnboardingService: IVoiceModeOnboardingService,
	dictationOnboardingService: IDictationOnboardingService,
): IDisposable {
	const claimNotice = (options: Parameters<ChatInputNoticeHost['occupy']>[1]) => host.occupy(ChatInputNoticeLane.Onboarding, options);

	const store = new DisposableStore();
	store.add(voiceModeOnboardingService.registerHost({
		container: containers.voice,
		focusRoot,
		focus: focusInput,
		claimNotice,
	}));
	store.add(dictationOnboardingService.registerHost({
		container: containers.dictation,
		focusRoot,
		focus: focusInput,
		claimNotice,
	}));
	return store;
}
