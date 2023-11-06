/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from 'vs/base/browser/ui/aria/aria';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IChatAccessibilityService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';

const CHAT_RESPONSE_PENDING_AUDIO_CUE_LOOP_MS = 5000;
const CHAT_RESPONSE_PENDING_ALLOWANCE_MS = 4000;
export class ChatAccessibilityService extends Disposable implements IChatAccessibilityService {

	declare readonly _serviceBrand: undefined;

	private _pendingCueMap: Map<number, IDisposable | undefined> = new Map();

	private _runOnceScheduler: RunOnceScheduler;
	private _lastResponse: string | undefined;
	private _requestId: number = 0;

	constructor(@IAudioCueService private readonly _audioCueService: IAudioCueService) {
		super();
		this._register(this._runOnceScheduler = new RunOnceScheduler(() => {
			this._pendingCueMap.set(this._requestId, this._audioCueService.playAudioCueLoop(AudioCue.chatResponsePending, CHAT_RESPONSE_PENDING_AUDIO_CUE_LOOP_MS));
		}, CHAT_RESPONSE_PENDING_ALLOWANCE_MS));
	}
	acceptRequest(): number {
		this._requestId++;
		this._audioCueService.playAudioCue(AudioCue.chatRequestSent, { allowManyInParallel: true });
		this._runOnceScheduler.schedule();
		return this._requestId;
	}
	acceptResponse(response: IChatResponseViewModel | string | undefined, requestId: number): void {
		this._pendingCueMap.get(requestId)?.dispose();
		this._pendingCueMap.delete(requestId);
		const isPanelChat = typeof response !== 'string';
		this._runOnceScheduler?.cancel();
		const responseContent = typeof response === 'string' ? response : response?.response.asString();
		if (this._lastResponse === responseContent) {
			return;
		}
		this._audioCueService.playAudioCue(AudioCue.chatResponseReceived, { allowManyInParallel: true });
		if (!response) {
			return;
		}
		const errorDetails = isPanelChat && response.errorDetails ? ` ${response.errorDetails.message}` : '';
		this._lastResponse = responseContent;
		status(responseContent + errorDetails);
	}
}
