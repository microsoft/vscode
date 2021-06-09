/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NewWorkerMessage, TerminateWorkerMessage } from 'vs/workbench/services/extensions/common/polyfillNestedWorker.protocol';

declare function postMessage(data: any, transferables?: Transferable[]): void;

declare type MessageEventHandler = ((ev: MessageEvent<any>) => any) | null;

const _bootstrapFnSource = (function _bootstrapFn(workerUrl: string) {

	const listener: EventListener = (event: Event): void => {
		// uninstall handler
		self.removeEventListener('message', listener);

		// get data
		const port = <MessagePort>(<MessageEvent>event).data;

		// postMessage
		// onmessage
		Object.defineProperties(self, {
			'postMessage': {
				value(data: any, transferOrOptions?: any) {
					port.postMessage(data, transferOrOptions);
				}
			},
			'onmessage': {
				get() {
					return port.onmessage;
				},
				set(value: MessageEventHandler) {
					port.onmessage = value;
				}
			}
			// todo onerror
		});

		port.addEventListener('message', msg => {
			self.dispatchEvent(new MessageEvent('message', { data: msg.data }));
		});

		port.start();

		// fake recursively nested worker
		self.Worker = <any>class { constructor() { throw new TypeError('Nested workers from within nested worker are NOT supported.'); } };

		// load module
		importScripts(workerUrl);
	};

	self.addEventListener('message', listener);
}).toString();


export class NestedWorker extends EventTarget implements Worker {

	onmessage: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;
	onmessageerror: ((this: Worker, ev: MessageEvent<any>) => any) | null = null;
	onerror: ((this: AbstractWorker, ev: ErrorEvent) => any) | null = null;

	readonly terminate: () => void;
	readonly postMessage: (message: any, options?: any) => void;

	constructor(nativePostMessage: typeof postMessage, stringOrUrl: string | URL, options?: WorkerOptions) {
		super();

		// create bootstrap script
		const bootstrap = `((${_bootstrapFnSource})('${stringOrUrl}'))`;
		const blob = new Blob([bootstrap], { type: 'application/javascript' });
		const blobUrl = URL.createObjectURL(blob);

		const channel = new MessageChannel();
		const id = blobUrl; // works because blob url is unique, needs ID pool otherwise

		const msg: NewWorkerMessage = {
			type: '_newWorker',
			id,
			port: channel.port2,
			url: blobUrl,
			options,
		};
		nativePostMessage(msg, [channel.port2]);

		// worker-impl: functions
		this.postMessage = channel.port1.postMessage.bind(channel.port1);
		this.terminate = () => {
			const msg: TerminateWorkerMessage = {
				type: '_terminateWorker',
				id
			};
			channel.port1.postMessage(msg);
			URL.revokeObjectURL(blobUrl);

			channel.port1.close();
			channel.port2.close();
		};

		// worker-impl: events
		Object.defineProperties(this, {
			'onmessage': {
				get() {
					return channel.port1.onmessage;
				},
				set(value: MessageEventHandler) {
					channel.port1.onmessage = value;
				}
			},
			'onmessageerror': {
				get() {
					return channel.port1.onmessageerror;
				},
				set(value: MessageEventHandler) {
					channel.port1.onmessageerror = value;
				}
			},
			// todo onerror
		});

		channel.port1.addEventListener('messageerror', evt => {
			const msgEvent = new MessageEvent('messageerror', { data: evt.data });
			this.dispatchEvent(msgEvent);
		});

		channel.port1.addEventListener('message', evt => {
			const msgEvent = new MessageEvent('message', { data: evt.data });
			this.dispatchEvent(msgEvent);
		});

		channel.port1.start();
	}
}
