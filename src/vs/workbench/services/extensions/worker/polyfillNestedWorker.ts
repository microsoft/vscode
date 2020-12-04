/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


declare function postMessage(data: any, transferables?: Transferable[]): void;

const _bootstrapFnSource = (function _bootstrapFn(workerUrl: string) {

	const listener: EventListener = (event: Event): void => {
		// uninstall handler
		self.removeEventListener('message', listener);

		// get data
		const port = (<MessageEvent>event).data;

		// postMessage
		Object.defineProperty(self, 'postMessage', {
			value(data: any, transferOrOptions?: any) {
				port.postMessage(data, transferOrOptions);
			}
		});

		// onmessage
		let onmessage: Function | null = null;
		Object.defineProperty(self, 'onmessage', {
			get() { return onmessage; },
			set(value) { onmessage = value; },
		});
		port.onmessage = function (msg: MessageEvent) {
			self.dispatchEvent(new MessageEvent('message', { data: msg.data }));
			if (typeof onmessage === 'function') {
				onmessage(msg.data);
			}
		};

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

		nativePostMessage({
			type: '_newWorker',
			id,
			port: channel.port2,
			url: blobUrl,
			options,
		}, [channel.port2]);

		// worker-impl: functions
		this.postMessage = channel.port1.postMessage.bind(channel.port1);
		this.terminate = () => {
			channel.port1.postMessage({ type: '_terminateWorker', id });
			URL.revokeObjectURL(blobUrl);
		};

		// worker-impl: events
		let _onmessage: ((ev: MessageEvent<any>) => any) | null = null;
		Object.defineProperties(this, {
			'onmessage': {
				get() {
					return _onmessage;
				},
				set(value: ((ev: MessageEvent<any>) => any) | null) {
					_onmessage = value;
				}
			}
			// TODO - define error, messageerror event
		});

		channel.port1.onmessageerror = evt => this.dispatchEvent(evt);
		channel.port1.onmessage = (evt) => {
			const msgEvent = new MessageEvent('message', { data: evt.data });
			if (_onmessage) {
				_onmessage(msgEvent.data);
			}
			this.dispatchEvent(msgEvent);
		};
	}
}
