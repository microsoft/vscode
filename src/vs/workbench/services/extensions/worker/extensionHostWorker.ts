/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMessagePassingProtocol } from 'vs/base/parts/ipc/common/ipc';
import { VSBuffer } from 'vs/base/common/buffer';
import { Emitter } from 'vs/base/common/event';
import { isMessageOfType, MessageType, createMessageOfType } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { IInitData } from 'vs/workbench/api/common/extHost.protocol';
import { ExtensionHostMain } from 'vs/workbench/services/extensions/common/extensionHostMain';
import { IHostUtils } from 'vs/workbench/api/common/extHostExtensionService';
import * as path from 'vs/base/common/path';

import 'vs/workbench/api/common/extHost.common.services';
import 'vs/workbench/api/worker/extHost.worker.services';

//#region --- Define, capture, and override some globals

declare function postMessage(data: any, transferables?: Transferable[]): void;

declare namespace self {
	let close: any;
	let postMessage: any;
	let addEventListener: any;
	let indexedDB: { open: any, [k: string]: any };
	let caches: { open: any, [k: string]: any };
}

const nativeClose = self.close.bind(self);
self.close = () => console.trace(`'close' has been blocked`);

const nativePostMessage = postMessage.bind(self);
self.postMessage = () => console.trace(`'postMessage' has been blocked`);

// const nativeAddEventListener = addEventListener.bind(self);
self.addEventListener = () => console.trace(`'addEventListener' has been blocked`);

(<any>self)['AMDLoader'] = undefined;
(<any>self)['NLSLoaderPlugin'] = undefined;
(<any>self)['define'] = undefined;
(<any>self)['require'] = undefined;
(<any>self)['webkitRequestFileSystem'] = undefined;
(<any>self)['webkitRequestFileSystemSync'] = undefined;
(<any>self)['webkitResolveLocalFileSystemSyncURL'] = undefined;
(<any>self)['webkitResolveLocalFileSystemURL'] = undefined;

if ((<any>self).Worker) {
	// make sure new Worker(...) always uses data:
	const _Worker = (<any>self).Worker;
	Worker = <any>function (stringUrl: string | URL, options?: WorkerOptions) {
		const js = `importScripts('${stringUrl}');`;
		options = options || {};
		options.name = options.name || path.basename(stringUrl.toString());
		return new _Worker(`data:text/javascript;charset=utf-8,${encodeURIComponent(js)}`, options);
	};

} else {

	let idWorkerPool = 0;

	// NO support for workers from worker
	(<any>self).Worker = class extends EventTarget implements Worker {

		readonly #port: MessagePort;
		readonly #id = ++idWorkerPool;

		#onmessage: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;

		onmessageerror: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;
		onerror: ((this: AbstractWorker, ev: ErrorEvent) => any) | null = null;

		constructor(stringUrl: string | URL, options?: WorkerOptions) {
			super();

			const channel = new MessageChannel();
			this.#port = channel.port1;

			const bootstrap = `
self.onmessage = function (event) {

	// uninstall handler
	self.onmessage = null;

	const msgPort = event.data;

	// postMessage
	Object.defineProperty(self, 'postMessage', {
		value(data, transferOrOptions) {
			msgPort.postMessage(data, transferOrOptions);
		}
	});

	// onmessage
	let onmessage = null;
	Object.defineProperty(self, 'onmessage', {
		get() { return onmessage },
		set(value) { onmessage = value },
	});
	msgPort.onmessage = function (msg) {
		self.dispatchEvent(new MessageEvent('message', { data: msg.data }))
		if (typeof onmessage === 'function') {
			onmessage(msg.data);
		}
	}

	importScripts('${stringUrl}');
};
			`;

			const blob = new Blob([bootstrap], { type: 'application/javascript' });

			nativePostMessage({
				type: '_newWorker',
				id: this.#id,
				port: channel.port2,
				url: URL.createObjectURL(blob),
				options: { name: path.basename(String(stringUrl)), ...options },
			}, [channel.port2]);

			this.#port.onmessageerror = evt => this.dispatchEvent(evt);
			this.#port.onmessage = evt => {
				const msgEvent = new MessageEvent('message', { data: evt.data });
				if (this.#onmessage) {
					this.#onmessage(msgEvent.data);
				}
				this.dispatchEvent(msgEvent);
			};
		}


		get onmessage() {
			return this.#onmessage;
		}
		set onmessage(value) {
			this.#onmessage = value;
		}

		postMessage(message: any, options?: any) {
			this.#port.postMessage(message, options);
		}
		terminate(): void {
			nativePostMessage({ type: '_terminateWorker', id: this.#id });
		}
	};
}

//#endregion ---

const hostUtil = new class implements IHostUtils {
	declare readonly _serviceBrand: undefined;
	exit(_code?: number | undefined): void {
		nativeClose();
	}
	async exists(_path: string): Promise<boolean> {
		return true;
	}
	async realpath(path: string): Promise<string> {
		return path;
	}
};


class ExtensionWorker {

	// protocol
	readonly protocol: IMessagePassingProtocol;

	constructor() {

		const channel = new MessageChannel();
		const emitter = new Emitter<VSBuffer>();
		let terminating = false;

		// send over port2, keep port1
		nativePostMessage(channel.port2, [channel.port2]);

		channel.port1.onmessage = event => {
			const { data } = event;
			if (!(data instanceof ArrayBuffer)) {
				console.warn('UNKNOWN data received', data);
				return;
			}

			const msg = VSBuffer.wrap(new Uint8Array(data, 0, data.byteLength));
			if (isMessageOfType(msg, MessageType.Terminate)) {
				// handle terminate-message right here
				terminating = true;
				onTerminate();
				return;
			}

			// emit non-terminate messages to the outside
			emitter.fire(msg);
		};

		this.protocol = {
			onMessage: emitter.event,
			send: vsbuf => {
				if (!terminating) {
					const data = vsbuf.buffer.buffer.slice(vsbuf.buffer.byteOffset, vsbuf.buffer.byteOffset + vsbuf.buffer.byteLength);
					channel.port1.postMessage(data, [data]);
				}
			}
		};
	}
}

interface IRendererConnection {
	protocol: IMessagePassingProtocol;
	initData: IInitData;
}
function connectToRenderer(protocol: IMessagePassingProtocol): Promise<IRendererConnection> {
	return new Promise<IRendererConnection>(resolve => {
		const once = protocol.onMessage(raw => {
			once.dispose();
			const initData = <IInitData>JSON.parse(raw.toString());
			protocol.send(createMessageOfType(MessageType.Initialized));
			resolve({ protocol, initData });
		});
		protocol.send(createMessageOfType(MessageType.Ready));
	});
}

let onTerminate = nativeClose;

(function create(): void {
	const res = new ExtensionWorker();

	connectToRenderer(res.protocol).then(data => {

		const extHostMain = new ExtensionHostMain(
			data.protocol,
			data.initData,
			hostUtil,
			null,
		);

		onTerminate = () => extHostMain.terminate();
	});
})();
