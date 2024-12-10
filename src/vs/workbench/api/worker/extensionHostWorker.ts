/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMessagePassingProtocol } from '../../../base/parts/ipc/common/ipc.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter } from '../../../base/common/event.js';
import { isMessageOfType, MessageType, createMessageOfType, IExtensionHostInitData } from '../../services/extensions/common/extensionHostProtocol.js';
import { ExtensionHostMain } from '../common/extensionHostMain.js';
import { IHostUtils } from '../common/extHostExtensionService.js';
import { NestedWorker } from '../../services/extensions/worker/polyfillNestedWorker.js';
import * as path from '../../../base/common/path.js';
import * as performance from '../../../base/common/performance.js';

import '../common/extHost.common.services.js';
import './extHost.worker.services.js';
import { FileAccess } from '../../../base/common/network.js';
import { URI } from '../../../base/common/uri.js';

//#region --- Define, capture, and override some globals

declare function postMessage(data: any, transferables?: Transferable[]): void;
declare const name: string; // https://developer.mozilla.org/en-US/docs/Web/API/DedicatedWorkerGlobalScope/name
declare type _Fetch = typeof fetch;

declare namespace self {
	let close: any;
	let postMessage: any;
	let addEventListener: any;
	let removeEventListener: any;
	let dispatchEvent: any;
	let indexedDB: { open: any;[k: string]: any };
	let caches: { open: any;[k: string]: any };
	let importScripts: any;
	let fetch: _Fetch;
	let XMLHttpRequest: any;
}

const nativeClose = self.close.bind(self);
self.close = () => console.trace(`'close' has been blocked`);

const nativePostMessage = postMessage.bind(self);
self.postMessage = () => console.trace(`'postMessage' has been blocked`);

function shouldTransformUri(uri: string): boolean {
	// In principle, we could convert any URI, but we have concerns
	// that parsing https URIs might end up decoding escape characters
	// and result in an unintended transformation
	return /^(file|vscode-remote):/i.test(uri);
}

const nativeFetch = fetch.bind(self);
function patchFetching(asBrowserUri: (uri: URI) => Promise<URI>) {
	self.fetch = async function (input, init) {
		if (input instanceof Request) {
			// Request object - massage not supported
			return nativeFetch(input, init);
		}
		if (shouldTransformUri(String(input))) {
			input = (await asBrowserUri(URI.parse(String(input)))).toString(true);
		}
		return nativeFetch(input, init);
	};

	self.XMLHttpRequest = class extends XMLHttpRequest {
		override open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
			(async () => {
				if (shouldTransformUri(url.toString())) {
					url = (await asBrowserUri(URI.parse(url.toString()))).toString(true);
				}
				super.open(method, url, async ?? true, username, password);
			})();
		}
	};
}

self.importScripts = () => { throw new Error(`'importScripts' has been blocked`); };

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

	// make sure new Worker(...) always uses blob: (to maintain current origin)
	const _Worker = (<any>self).Worker;
	Worker = <any>function (stringUrl: string | URL, options?: WorkerOptions) {
		if (/^file:/i.test(stringUrl.toString())) {
			stringUrl = FileAccess.uriToBrowserUri(URI.parse(stringUrl.toString())).toString(true);
		} else if (/^vscode-remote:/i.test(stringUrl.toString())) {
			// Supporting transformation of vscode-remote URIs requires an async call to the main thread,
			// but we cannot do this call from within the embedded Worker, and the only way out would be
			// to use templating instead of a function in the web api (`resourceUriProvider`)
			throw new Error(`Creating workers from remote extensions is currently not supported.`);
		}

		// IMPORTANT: bootstrapFn is stringified and injected as worker blob-url. Because of that it CANNOT
		// have dependencies on other functions or variables. Only constant values are supported. Due to
		// that logic of FileAccess.asBrowserUri had to be copied, see `asWorkerBrowserUrl` (below).
		const bootstrapFnSource = (function bootstrapFn(workerUrl: string) {
			function asWorkerBrowserUrl(url: string | URL | TrustedScriptURL): any {
				if (typeof url === 'string' || url instanceof URL) {
					return String(url).replace(/^file:\/\//i, 'vscode-file://vscode-app');
				}
				return url;
			}

			const nativeFetch = fetch.bind(self);
			self.fetch = function (input, init) {
				if (input instanceof Request) {
					// Request object - massage not supported
					return nativeFetch(input, init);
				}
				return nativeFetch(asWorkerBrowserUrl(input), init);
			};
			self.XMLHttpRequest = class extends XMLHttpRequest {
				override open(method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null): void {
					return super.open(method, asWorkerBrowserUrl(url), async ?? true, username, password);
				}
			};
			const nativeImportScripts = importScripts.bind(self);
			self.importScripts = (...urls: string[]) => {
				nativeImportScripts(...urls.map(asWorkerBrowserUrl));
			};

			nativeImportScripts(workerUrl);
		}).toString();

		const js = `(${bootstrapFnSource}('${stringUrl}'))`;
		options = options || {};
		options.name = `${name} -> ${options.name || path.basename(stringUrl.toString())}`;
		const blob = new Blob([js], { type: 'application/javascript' });
		const blobUrl = URL.createObjectURL(blob);
		return new _Worker(blobUrl, options);
	};

} else {
	(<any>self).Worker = class extends NestedWorker {
		constructor(stringOrUrl: string | URL, options?: WorkerOptions) {
			super(nativePostMessage, stringOrUrl, { name: path.basename(stringOrUrl.toString()), ...options });
		}
	};
}

//#endregion ---

const hostUtil = new class implements IHostUtils {
	declare readonly _serviceBrand: undefined;
	public readonly pid = undefined;
	exit(_code?: number | undefined): void {
		nativeClose();
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
				onTerminate('received terminate message from renderer');
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
	initData: IExtensionHostInitData;
}
function connectToRenderer(protocol: IMessagePassingProtocol): Promise<IRendererConnection> {
	return new Promise<IRendererConnection>(resolve => {
		const once = protocol.onMessage(raw => {
			once.dispose();
			const initData = <IExtensionHostInitData>JSON.parse(raw.toString());
			protocol.send(createMessageOfType(MessageType.Initialized));
			resolve({ protocol, initData });
		});
		protocol.send(createMessageOfType(MessageType.Ready));
	});
}

let onTerminate = (reason: string) => nativeClose();

interface IInitMessage {
	readonly type: 'vscode.init';
	readonly data: ReadonlyMap<string, MessagePort>;
}

function isInitMessage(a: any): a is IInitMessage {
	return !!a && typeof a === 'object' && a.type === 'vscode.init' && a.data instanceof Map;
}

/**
 * Defines the worker entry point. Must be exported and named `create`.
 * @skipMangle
 */
export function create(): { onmessage: (message: any) => void } {
	performance.mark(`code/extHost/willConnectToRenderer`);
	const res = new ExtensionWorker();

	return {
		onmessage(message: any) {
			if (!isInitMessage(message)) {
				return; // silently ignore foreign messages
			}

			connectToRenderer(res.protocol).then(data => {
				performance.mark(`code/extHost/didWaitForInitData`);
				const extHostMain = new ExtensionHostMain(
					data.protocol,
					data.initData,
					hostUtil,
					null,
					message.data
				);

				patchFetching(uri => extHostMain.asBrowserUri(uri));

				onTerminate = (reason: string) => extHostMain.terminate(reason);
			});
		}
	};
}
