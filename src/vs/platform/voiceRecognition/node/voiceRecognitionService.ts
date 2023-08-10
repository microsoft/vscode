/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { ILogService } from 'vs/platform/log/common/log';
import { IVoiceRecognitionService } from 'vs/platform/voiceRecognition/common/voiceRecognitionService';

export class VoiceRecognitionService implements IVoiceRecognitionService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService
	) { }

	async transcribe(buffer: VSBuffer): Promise<string> {
		this.logService.info(`[voice] transcribe(${buffer.buffer.length / 4}): Begin`);

		const modulePath = process.env.VSCODE_VOICE_MODULE_PATH;
		if (!modulePath) {
			throw new Error('Voice recognition not yet supported!');
		}

		const now = Date.now();
		const channelData = this.toFloat32Array(buffer);
		const conversionTime = Date.now() - now;

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

		this.logService.info(`[voice] transcribe(${buffer.buffer.length / 4}): End (text: "${text}", took: ${Date.now() - now}ms total, ${conversionTime}ms uint8->float32 conversion)`);

		return text;
	}

	private toFloat32Array({ buffer: uint8Array }: VSBuffer): Float32Array {
		const float32Array = new Float32Array(uint8Array.length / 4);
		let offset = 0;

		for (let i = 0; i < float32Array.length; i++) {
			const buffer = new ArrayBuffer(4);
			const view = new DataView(buffer);

			for (let j = 0; j < 4; j++) {
				view.setUint8(j, uint8Array[offset++]);
			}

			float32Array[i] = view.getFloat32(0, true);
		}

		return float32Array;
	}
}
