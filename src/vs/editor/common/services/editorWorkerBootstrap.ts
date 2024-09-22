/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkerServer, SimpleWorkerServer } from '../../../base/common/worker/simpleWorker.js';
import { EditorSimpleWorker } from './editorSimpleWorker.js';
import { EditorWorkerHost } from './editorWorkerHost.js';

type MessageEvent = {
	data: any;
};

declare const globalThis: {
	postMessage: (message: any) => void;
	onmessage: (event: MessageEvent) => void;
};

let initialized = false;

export function initialize(factory: any) {
	if (initialized) {
		return;
	}
	initialized = true;

	const simpleWorker = new SimpleWorkerServer((msg) => {
		globalThis.postMessage(msg);
	}, (workerServer: IWorkerServer) => new EditorSimpleWorker(EditorWorkerHost.getChannel(workerServer), null));

	globalThis.onmessage = (e: MessageEvent) => {
		simpleWorker.onmessage(e.data);
	};
}

globalThis.onmessage = (e: MessageEvent) => {
	// Ignore first message in this case and initialize if not yet initialized
	if (!initialized) {
		initialize(null);
	}
};

type CreateFunction<C, D, R = any> = (ctx: C, data: D) => R;

export function bootstrapSimpleEditorWorker<C, D, R>(createFn: CreateFunction<C, D, R>) {
	globalThis.onmessage = () => {
		initialize((ctx: C, createData: D) => {
			return createFn.call(self, ctx, createData);
		});
	};
}
