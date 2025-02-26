/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkerServer, IWorkerClient } from '../../../base/common/worker/simpleWorker.js';

export abstract class EditorWorkerHost {
	public static CHANNEL_NAME = 'editorWorkerHost';
	public static getChannel(workerServer: IWorkerServer): EditorWorkerHost {
		return workerServer.getChannel<EditorWorkerHost>(EditorWorkerHost.CHANNEL_NAME);
	}
	public static setChannel(workerClient: IWorkerClient<any>, obj: EditorWorkerHost): void {
		workerClient.setChannel<EditorWorkerHost>(EditorWorkerHost.CHANNEL_NAME, obj);
	}

	// foreign host request
	abstract $fhr(method: string, args: any[]): Promise<any>;
}
