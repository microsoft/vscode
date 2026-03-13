/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriComponents } from '../../../../../../base/common/uri.js';
import { IWebWorkerServer, IWebWorkerClient } from '../../../../../../base/common/worker/webWorker.js';
import { ISerializedAnnotation } from '../../../../../../editor/common/model/tokens/annotations.js';
import { IFontTokenOption } from '../../../../../../editor/common/textModelEvents.js';
import { StateDeltas } from './textMateTokenizationWorker.worker.js';

export abstract class TextMateWorkerHost {
	public static CHANNEL_NAME = 'textMateWorkerHost';
	public static getChannel(workerServer: IWebWorkerServer): TextMateWorkerHost {
		return workerServer.getChannel<TextMateWorkerHost>(TextMateWorkerHost.CHANNEL_NAME);
	}
	public static setChannel(workerClient: IWebWorkerClient<unknown>, obj: TextMateWorkerHost): void {
		workerClient.setChannel<TextMateWorkerHost>(TextMateWorkerHost.CHANNEL_NAME, obj);
	}

	abstract $readFile(_resource: UriComponents): Promise<string>;
	abstract $setTokensAndStates(controllerId: number, versionId: number, tokens: Uint8Array, fontTokens: ISerializedAnnotation<IFontTokenOption>[], lineEndStateDeltas: StateDeltas[]): Promise<void>;
	abstract $reportTokenizationTime(timeMs: number, languageId: string, sourceExtensionId: string | undefined, lineLength: number, isRandomSample: boolean): void;
}
