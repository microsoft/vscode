/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { ILocalTranscriptionModelStatus, ILocalTranscriptionResult, ILocalTranscriptionService, LocalTranscriptionModelState } from '../../../../platform/localTranscription/common/localTranscription.js';

/**
 * Web/no-op implementation: on-device transcription requires a utility process,
 * which is not available on web. `isSupported` is false, so dictation is simply
 * unavailable there — there is no cloud fallback (that transport was removed).
 */
export class NullLocalTranscriptionService implements ILocalTranscriptionService {

	declare readonly _serviceBrand: undefined;

	readonly isSupported = false;

	readonly onDidChangeModelStatus: Event<ILocalTranscriptionModelStatus> = Event.None;
	readonly onDidTranscribe: Event<ILocalTranscriptionResult> = Event.None;

	async getModelStatus(): Promise<ILocalTranscriptionModelStatus> {
		return { state: LocalTranscriptionModelState.Error, error: 'unsupported' };
	}

	async start(): Promise<void> {
		throw new Error('On-device transcription is not supported in this environment.');
	}

	async pushAudio(_chunk: VSBuffer): Promise<void> { }

	async stop(): Promise<string> {
		return '';
	}

	async cancel(): Promise<void> { }
}

registerSingleton(ILocalTranscriptionService, NullLocalTranscriptionService, InstantiationType.Delayed);
