/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const IVoiceRecognitionService = createDecorator<IVoiceRecognitionService>('voiceRecognitionService');

export interface IVoiceRecognitionService {

	readonly _serviceBrand: undefined;

	/**
	 * Given a buffer of audio data, attempts to
	 * transcribe the spoken words into text.
	 *
	 * @param buffer the audio data obtained from
	 * the microphone as uncompressed PCM data:
	 * - 1 channel (mono)
	 * - 16khz sampling rate
	 * - 16bit sample size
	 */
	transcribe(buffer: VSBuffer): Promise<string>;
}
