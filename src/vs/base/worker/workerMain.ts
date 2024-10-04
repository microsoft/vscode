/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(function () {

	function loadCode(moduleId: string): Promise<SimpleWorkerModule> {
		const moduleUrl = new URL(`${moduleId}.js`, globalThis._VSCODE_FILE_ROOT);
		return import(moduleUrl.href);
	}

	interface MessageHandler {
		onmessage(msg: any, ports: readonly MessagePort[]): void;
	}

	// shape of vs/base/common/worker/simpleWorker.ts
	interface SimpleWorkerModule {
		create(postMessage: (msg: any, transfer?: Transferable[]) => void): MessageHandler;
	}

	function setupWorkerServer(ws: SimpleWorkerModule) {
		setTimeout(function () {
			const messageHandler = ws.create((msg: any, transfer?: Transferable[]) => {
				(<any>globalThis).postMessage(msg, transfer);
			});

			self.onmessage = (e: MessageEvent) => messageHandler.onmessage(e.data, e.ports);
			while (beforeReadyMessages.length > 0) {
				self.onmessage(beforeReadyMessages.shift()!);
			}
		}, 0);
	}

	let isFirstMessage = true;
	const beforeReadyMessages: MessageEvent[] = [];
	globalThis.onmessage = (message: MessageEvent) => {
		if (!isFirstMessage) {
			beforeReadyMessages.push(message);
			return;
		}

		isFirstMessage = false;
		loadCode(message.data).then((ws) => {
			setupWorkerServer(ws);
		}, (err) => {
			console.error(err);
		});
	};
})();
