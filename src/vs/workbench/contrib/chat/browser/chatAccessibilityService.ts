/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from 'vs/base/browser/ui/aria/aria';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { AudioCue, AudioCueGroupId, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IChatAccessibilityService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';

const CHAT_RESPONSE_PENDING_AUDIO_CUE_LOOP_MS = 5000;
const CHAT_RESPONSE_PENDING_ALLOWANCE_MS = 4000;
export class ChatAccessibilityService extends Disposable implements IChatAccessibilityService {

	declare readonly _serviceBrand: undefined;

	private _responsePendingAudioCue: IDisposable | undefined;
	private _hasReceivedRequest: boolean = false;
	private _runOnceScheduler: RunOnceScheduler;

	constructor(@IAudioCueService private readonly _audioCueService: IAudioCueService) {
		super();
		this._register(this._runOnceScheduler = new RunOnceScheduler(() => {
			if (!this._hasReceivedRequest) {
				this._responsePendingAudioCue = this._audioCueService.playAudioCueLoop(AudioCue.chatResponsePending, CHAT_RESPONSE_PENDING_AUDIO_CUE_LOOP_MS);
			}
		}, CHAT_RESPONSE_PENDING_ALLOWANCE_MS));
	}
	acceptRequest(): void {
		this._audioCueService.playAudioCue(AudioCue.chatRequestSent, true);
		this._runOnceScheduler.schedule();
	}
	acceptResponse(response?: IChatResponseViewModel | string): void {
		this._hasReceivedRequest = true;
		const isPanelChat = typeof response !== 'string';
		this._responsePendingAudioCue?.dispose();
		this._runOnceScheduler?.cancel();
		this._audioCueService.playRandomAudioCue(AudioCueGroupId.chatResponseReceived, true);
		this._hasReceivedRequest = false;
		if (!response) {
			return;
		}
		const errorDetails = isPanelChat && response.errorDetails ? ` ${response.errorDetails.message}` : '';
		const content = isPanelChat ? response.response.value : response;
		status(content + errorDetails);
	}
}
