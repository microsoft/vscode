/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRequestHandlerFactory, SimpleWorkerServer } from 'vs/base/common/worker/simpleWorker';

type MessageEvent = {
	data: any;
};

declare const globalThis: {
	postMessage: (message: any) => void;
	onmessage: (event: MessageEvent) => void;
};

let initialized = false;

function initialize(factory: IRequestHandlerFactory) {
	if (initialized) {
		return;
	}
	initialized = true;

	const simpleWorker = new SimpleWorkerServer(
		msg => globalThis.postMessage(msg),
		(workerServer) => factory(workerServer)
	);

	globalThis.onmessage = (e: MessageEvent) => {
		simpleWorker.onmessage(e.data);
	};
}

export function bootstrapSimpleWorker(factory: IRequestHandlerFactory) {
	globalThis.onmessage = (_e: MessageEvent) => {
		// Ignore first message in this case and initialize if not yet initialized
		if (!initialized) {
			initialize(factory);
		}
	};
}
