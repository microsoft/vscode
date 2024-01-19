/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from 'vs/base/browser/ui/aria/aria';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable, DisposableMap, IDisposable } from 'vs/base/common/lifecycle';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatAccessibilityService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';

export class ChatAccessibilityService extends Disposable implements IChatAccessibilityService {

	declare readonly _serviceBrand: undefined;

	private _pendingCueMap: DisposableMap<number, AudioCueScheduler> = this._register(new DisposableMap());

	private _requestId: number = 0;

	constructor(@IAudioCueService private readonly _audioCueService: IAudioCueService, @IInstantiationService private readonly _instantiationService: IInstantiationService) {
		super();
	}
	acceptRequest(): number {
		this._requestId++;
		this._audioCueService.playAudioCue(AudioCue.chatRequestSent, { allowManyInParallel: true });
		this._pendingCueMap.set(this._requestId, this._instantiationService.createInstance(AudioCueScheduler));
		return this._requestId;
	}
	acceptResponse(response: IChatResponseViewModel | string | undefined, requestId: number): void {
		this._pendingCueMap.deleteAndDispose(requestId);
		const isPanelChat = typeof response !== 'string';
		const responseContent = typeof response === 'string' ? response : response?.response.asString();
		this._audioCueService.playAudioCue(AudioCue.chatResponseReceived, { allowManyInParallel: true });
		if (!response) {
			return;
		}
		const errorDetails = isPanelChat && response.errorDetails ? ` ${response.errorDetails.message}` : '';
		status(responseContent + errorDetails);
	}
}

const CHAT_RESPONSE_PENDING_AUDIO_CUE_LOOP_MS = 5000;
const CHAT_RESPONSE_PENDING_ALLOWANCE_MS = 4000;
/**
 * Schedules an audio cue to play when a chat response is pending for too long.
 */
class AudioCueScheduler extends Disposable {
	private _scheduler: RunOnceScheduler;
	private _audioCueLoop: IDisposable | undefined;
	constructor(@IAudioCueService private readonly _audioCueService: IAudioCueService) {
		super();
		this._scheduler = new RunOnceScheduler(() => {
			this._audioCueLoop = this._audioCueService.playAudioCueLoop(AudioCue.chatResponsePending, CHAT_RESPONSE_PENDING_AUDIO_CUE_LOOP_MS);
		}, CHAT_RESPONSE_PENDING_ALLOWANCE_MS);
		this._scheduler.schedule();
	}
	override dispose(): void {
		super.dispose();
		this._audioCueLoop?.dispose();
		this._scheduler.cancel();
		this._scheduler.dispose();
	}
}
