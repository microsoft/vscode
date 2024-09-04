/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from '../../../../../../base/common/uri.js';
import { IWorkerServer, IWorkerClient } from '../../../../../../base/common/worker/simpleWorker.js';
import { StateDeltas } from './textMateTokenizationWorker.worker.js';

export abstract class TextMateWorkerHost {
	public static CHANNEL_NAME = 'textMateWorkerHost';
	public static getChannel(workerServer: IWorkerServer): TextMateWorkerHost {
		return workerServer.getChannel<TextMateWorkerHost>(TextMateWorkerHost.CHANNEL_NAME);
	}
	public static setChannel(workerClient: IWorkerClient<any>, obj: TextMateWorkerHost): void {
		workerClient.setChannel<TextMateWorkerHost>(TextMateWorkerHost.CHANNEL_NAME, obj);
	}

	abstract $readFile(_resource: UriComponents): Promise<string>;
	abstract $setTokensAndStates(controllerId: number, versionId: number, tokens: Uint8Array, lineEndStateDeltas: StateDeltas[]): Promise<void>;
	abstract $reportTokenizationTime(timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, isRandomSample: boolean): void;
}
