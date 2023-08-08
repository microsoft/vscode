/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILogService } from 'vs/platform/log/common/log';
import { IAudioBuffer, IVoiceRecognitionService } from 'vs/platform/voiceRecognition/common/voiceRecognitionService';

export class VoiceRecognitionService implements IVoiceRecognitionService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService
	) { }

	async transcribe(buffer: IAudioBuffer): Promise<string> {
		this.logService.info(`[voice] transcribe(${buffer.length}): Begin`);

		const modulePath = process.env.VSCODE_VOICE_MODULE_PATH;
		if (!modulePath) {
			throw new Error('Voice recognition not yet supported!');
		}

		const voiceModule: { transcribe: (audioBuffer: { channelCount: 1; length: number; sampleRate: 16000; channelData: Float32Array }) => Promise<string> } = require.__$__nodeRequire(modulePath);

		const text = await voiceModule.transcribe({
			channelCount: buffer.channelCount,
			length: buffer.length,
			sampleRate: buffer.sampleRate,
			channelData: buffer.channelData.buffer
		});

		this.logService.info(`[voice] transcribe(${buffer.length}): End (text: "${text}"))`);

		return text;
	}
}
