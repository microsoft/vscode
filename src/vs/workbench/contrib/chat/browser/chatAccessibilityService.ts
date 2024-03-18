/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from 'vs/base/browser/ui/aria/aria';
import { RunOnceScheduler } from 'vs/base/common/async';
import { Disposable, DisposableMap, IDisposable } from 'vs/base/common/lifecycle';
import { AccessibilitySignal, IAccessibilitySignalService } from 'vs/platform/accessibilitySignal/browser/accessibilitySignalService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IChatAccessibilityService } from 'vs/workbench/contrib/chat/browser/chat';
import { IChatResponseViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';

export class ChatAccessibilityService extends Disposable implements IChatAccessibilityService {

	declare readonly _serviceBrand: undefined;

	private _pendingSignalMap: DisposableMap<number, AccessibilitySignalScheduler> = this._register(new DisposableMap());

	private _requestId: number = 0;

	constructor(@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService, @IInstantiationService private readonly _instantiationService: IInstantiationService) {
		super();
	}
	acceptRequest(): number {
		this._requestId++;
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatRequestSent, { allowManyInParallel: true });
		this._pendingSignalMap.set(this._requestId, this._instantiationService.createInstance(AccessibilitySignalScheduler));
		return this._requestId;
	}
	acceptResponse(response: IChatResponseViewModel | string | undefined, requestId: number): void {
		this._pendingSignalMap.deleteAndDispose(requestId);
		const isPanelChat = typeof response !== 'string';
		const responseContent = typeof response === 'string' ? response : response?.response.asString();
		this._accessibilitySignalService.playSignal(AccessibilitySignal.chatResponseReceived, { allowManyInParallel: true });
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
class AccessibilitySignalScheduler extends Disposable {
	private _scheduler: RunOnceScheduler;
	private _signalLoop: IDisposable | undefined;
	constructor(@IAccessibilitySignalService private readonly _accessibilitySignalService: IAccessibilitySignalService) {
		super();
		this._scheduler = new RunOnceScheduler(() => {
			this._signalLoop = this._accessibilitySignalService.playSignalLoop(AccessibilitySignal.chatResponsePending, CHAT_RESPONSE_PENDING_AUDIO_CUE_LOOP_MS);
		}, CHAT_RESPONSE_PENDING_ALLOWANCE_MS);
		this._scheduler.schedule();
	}
	override dispose(): void {
		super.dispose();
		this._signalLoop?.dispose();
		this._scheduler.cancel();
		this._scheduler.dispose();
	}
}
