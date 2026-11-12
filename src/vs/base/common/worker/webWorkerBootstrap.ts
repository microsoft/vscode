/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWebWorkerServerRequestHandler, IWebWorkerServerRequestHandlerFactory, WebWorkerServer } from './webWorker.js';

type MessageEvent = {
	data: unknown;
};

declare const globalThis: {
	postMessage: (message: any) => void;
	onmessage: (event: MessageEvent) => void;
};

let initialized = false;

export function initialize<T extends IWebWorkerServerRequestHandler>(factory: IWebWorkerServerRequestHandlerFactory<T>) {
	if (initialized) {
		throw new Error('WebWorker already initialized!');
	}
	initialized = true;

	let webWorkerServer: WebWorkerServer<T>;
	try {
		webWorkerServer = new WebWorkerServer<T>(
			msg => globalThis.postMessage(msg),
			(workerServer) => factory(workerServer)
		);
	} catch (e) {
		initialized = false;
		throw e;
	}

	globalThis.onmessage = (e: MessageEvent) => {
		webWorkerServer.onmessage(e.data);
	};

	return webWorkerServer;
}

export function bootstrapWebWorker(factory: IWebWorkerServerRequestHandlerFactory<any>) {
	globalThis.onmessage = (_e: MessageEvent) => {
		// Ignore first message in this case and initialize if not yet initialized
		if (!initialized) {
			initialize(factory);
		}
	};
}

export function _resetInitializedForTesting(): void {
	initialized = false;
}

