/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestHandler, IRequestHandlerFactory, SimpleWorkerServer } from './simpleWorker.js';

type MessageEvent = {
	data: any;
};

declare const globalThis: {
	postMessage: (message: any) => void;
	onmessage: (event: MessageEvent) => void;
};

let initialized = false;

export function initialize<T extends IRequestHandler>(factory: IRequestHandlerFactory<T>) {
	if (initialized) {
		throw new Error('SimpleWorker already initialized!');
	}
	initialized = true;

	const simpleWorker = new SimpleWorkerServer<T>(
		msg => globalThis.postMessage(msg),
		(workerServer) => factory(workerServer)
	);

	globalThis.onmessage = (e: MessageEvent) => {
		simpleWorker.onmessage(e.data);
	};

	return simpleWorker;
}

export function bootstrapSimpleWorker(factory: IRequestHandlerFactory<any>) {
	globalThis.onmessage = (_e: MessageEvent) => {
		// Ignore first message in this case and initialize if not yet initialized
		if (!initialized) {
			initialize(factory);
		}
	};
}
