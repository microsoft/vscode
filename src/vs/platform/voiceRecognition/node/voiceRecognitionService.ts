/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';
import { IVoiceRecognitionService } from 'vs/platform/voiceRecognition/common/voiceRecognitionService';

export class VoiceRecognitionService implements IVoiceRecognitionService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService
	) { }

	async transcribe(channelData: Float32Array, cancellation: CancellationToken): Promise<string> {
		this.logService.info(`[voice] transcribe(${channelData.length}): Begin`);

		const modulePath = process.env.VSCODE_VOICE_MODULE_PATH;
		if (!modulePath) {
			throw new Error('Voice recognition not yet supported!');
		}

		const now = Date.now();

		const voiceModule: { transcribe: (audioBuffer: { channelCount: 1; sampleRate: 16000; sampleSize: 16; channelData: Float32Array }, options: { language: string | 'auto'; suppressNonSpeechTokens: boolean }) => Promise<string> } = require.__$__nodeRequire(modulePath);

		const text = await voiceModule.transcribe({
			sampleRate: 16000,
			sampleSize: 16,
			channelCount: 1,
			channelData
		}, {
			language: 'en',
			suppressNonSpeechTokens: true
		});

		this.logService.info(`[voice] transcribe(${channelData.length}): End (text: "${text}", took: ${Date.now() - now}ms)`);

		return text;
	}
}
