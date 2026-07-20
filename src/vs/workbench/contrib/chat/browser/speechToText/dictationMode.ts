/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ChatSpeechToTextState, IChatSpeechToTextService } from './chatSpeechToTextService.js';
import { IChatDictationController } from './dictationSession.js';

export const HOLD_TO_TALK_THRESHOLD_MS = 500;
export const DICTATION_MODE_SETTING = 'chat.speechToText.mode';

export type DictationMode = 'auto' | 'toggle' | 'pushToTalk';

export function getDictationMode(configurationService: IConfigurationService): DictationMode {
	const value = configurationService.getValue<DictationMode>(DICTATION_MODE_SETTING);
	return value === 'toggle' || value === 'pushToTalk' ? value : 'auto';
}

export function getSpeechToTextState(service: IChatSpeechToTextService): ChatSpeechToTextState {
	return service.state;
}

export async function startDictationWithHoldMode(options: {
	readonly mode: DictationMode;
	readonly holdMode: Promise<void> | undefined;
	readonly speechToTextService: IChatSpeechToTextService;
	readonly dictationController: IChatDictationController;
	readonly start: () => Promise<void>;
}): Promise<void> {
	const heldFrom = Date.now();
	const start = options.start();
	if (!options.holdMode) {
		await start;
		return;
	}

	await options.holdMode;
	const heldMs = Date.now() - heldFrom;
	if (heldMs < HOLD_TO_TALK_THRESHOLD_MS) {
		if (options.mode === 'pushToTalk') {
			options.dictationController.cancel();
			await start;
		}
		return;
	}
	if (getSpeechToTextState(options.speechToTextService) === ChatSpeechToTextState.Starting) {
		options.dictationController.cancel();
		await start;
		return;
	}
	await start;
	await options.dictationController.stop();
}
