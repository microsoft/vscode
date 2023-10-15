/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { ILogService } from 'vs/platform/log/common/log';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProductService } from 'vs/platform/product/common/productService';

export const IVoiceRecognitionService = createDecorator<IVoiceRecognitionService>('voiceRecognitionService');

export interface IVoiceRecognitionService {

	readonly _serviceBrand: undefined;

	/**
	 * Given a buffer of audio data, attempts to
	 * transcribe the spoken words into text.
	 *
	 * @param channelData the raw audio data obtained
	 * from the microphone as uncompressed PCM data:
	 * - 1 channel (mono)
	 * - 16khz sampling rate
	 * - 16bit sample size
	 */
	transcribe(channelData: Float32Array, cancellation: CancellationToken): Promise<string>;
}

export class VoiceRecognitionService implements IVoiceRecognitionService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService
	) { }

	async transcribe(channelData: Float32Array, cancellation: CancellationToken): Promise<string> {
		const modulePath = process.env.VSCODE_VOICE_MODULE_PATH; // TODO@bpasero package
		if (!modulePath || this.productService.quality === 'stable') {
			this.logService.error(`[voice] transcribe(${channelData.length}): Voice recognition not yet supported`);
			throw new Error('Voice recognition not yet supported!');
		}

		const now = Date.now();

		try {
			const voiceModule: {
				transcribe: (
					audioBuffer: { channelCount: 1; samplingRate: 16000; bitDepth: 16; channelData: Float32Array },
					options: {
						language: string | 'auto';
						signal: AbortSignal;
					}
				) => Promise<string>;
			} = require.__$__nodeRequire(modulePath);

			const abortController = new AbortController();
			cancellation.onCancellationRequested(() => abortController.abort());

			const text = await voiceModule.transcribe({
				samplingRate: 16000,
				bitDepth: 16,
				channelCount: 1,
				channelData
			}, {
				language: 'en',
				signal: abortController.signal
			});

			this.logService.info(`[voice] transcribe(${channelData.length}): Text "${text}", took ${Date.now() - now}ms)`);

			return text;
		} catch (error) {
			this.logService.error(`[voice] transcribe(${channelData.length}): Failed width "${error}", took ${Date.now() - now}ms)`);

			throw error;
		}
	}
}
