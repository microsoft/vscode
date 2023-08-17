/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { MessagePortMain, MessageEvent } from 'vs/base/parts/sandbox/node/electronTypes';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IVoiceRecognitionService } from 'vs/platform/voiceRecognition/common/voiceRecognitionService';

export class VoiceTranscriber extends Disposable {

	constructor(
		private readonly onDidWindowConnectRaw: Event<MessagePortMain>,
		@IVoiceRecognitionService private readonly voiceRecognitionService: IVoiceRecognitionService,
	) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.onDidWindowConnectRaw(port => {
			const portHandler = async (e: MessageEvent) => {
				if (!(e.data instanceof Float32Array)) {
					return;
				}

				const result = await this.voiceRecognitionService.transcribe(e.data);

				port.postMessage(result);
			};

			port.on('message', portHandler);
			this._register(toDisposable(() => port.off('message', portHandler)));

			port.start();
		}));
	}
}
