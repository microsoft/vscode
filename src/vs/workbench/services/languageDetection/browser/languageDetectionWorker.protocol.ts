/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkerClient, IWorkerServer } from '../../../../base/common/worker/simpleWorker.js';

export abstract class LanguageDetectionWorkerHost {
	public static CHANNEL_NAME = 'languageDetectionWorkerHost';
	public static getChannel(workerServer: IWorkerServer): LanguageDetectionWorkerHost {
		return workerServer.getChannel<LanguageDetectionWorkerHost>(LanguageDetectionWorkerHost.CHANNEL_NAME);
	}
	public static setChannel(workerClient: IWorkerClient<any>, obj: LanguageDetectionWorkerHost): void {
		workerClient.setChannel<LanguageDetectionWorkerHost>(LanguageDetectionWorkerHost.CHANNEL_NAME, obj);
	}

	abstract $getIndexJsUri(): Promise<string>;
	abstract $getLanguageId(languageIdOrExt: string | undefined): Promise<string | undefined>;
	abstract $sendTelemetryEvent(languages: string[], confidences: number[], timeSpent: number): Promise<void>;
	abstract $getRegexpModelUri(): Promise<string>;
	abstract $getModelJsonUri(): Promise<string>;
	abstract $getWeightsUri(): Promise<string>;
}

export interface ILanguageDetectionWorker {
	$detectLanguage(uri: string, langBiases: Record<string, number> | undefined, preferHistory: boolean, supportedLangs?: string[]): Promise<string | undefined>;
}
