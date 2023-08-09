/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSFloat32Array } from 'vs/base/common/buffer';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IVoiceRecognitionService = createDecorator<IVoiceRecognitionService>('voiceRecognitionService');

export interface IAudioBuffer {
	readonly sampleRate: 16000;
	readonly sampleSize: 16;
	readonly channelCount: 1;
	readonly channelData: VSFloat32Array;
}

export interface IVoiceRecognitionService {

	readonly _serviceBrand: undefined;

	/**
	 * Given a buffer of audio data, attempts to
	 * transcribe the spoken words into text.
	 *
	 * @param buffer the audio data obtained from
	 * the microphone as PCM 32-bit float mono in
	 * 16khz.
	 */
	transcribe(buffer: IAudioBuffer): Promise<string>;
}
