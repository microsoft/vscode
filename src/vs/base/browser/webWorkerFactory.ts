/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from './trustedTypes.js';
import { onUnexpectedError } from '../common/errors.js';
import { COI } from '../common/network.js';
import { URI } from '../common/uri.js';
import { IWebWorker, IWebWorkerClient, Message, WebWorkerClient } from '../common/worker/webWorker.js';
import { Disposable, toDisposable } from '../common/lifecycle.js';
import { coalesce } from '../common/arrays.js';
import { getNLSLanguage, getNLSMessages } from '../../nls.js';
import { Emitter } from '../common/event.js';

// Reuse the trusted types policy defined from worker bootstrap
// when available.
// Refs https://github.com/microsoft/vscode/issues/222193
let ttPolicy: ReturnType<typeof createTrustedTypesPolicy>;
if (typeof self === 'object' && self.constructor && self.constructor.name === 'DedicatedWorkerGlobalScope' && (globalThis as any).workerttPolicy !== undefined) {
	ttPolicy = (globalThis as any).workerttPolicy;
} else {
	ttPolicy = createTrustedTypesPolicy('defaultWorkerFactory', { createScriptURL: value => value });
}

export function createBlobWorker(blobUrl: string, options?: WorkerOptions): Worker {
	if (!blobUrl.startsWith('blob:')) {
		throw new URIError('Not a blob-url: ' + blobUrl);
	}
	return new Worker(ttPolicy ? ttPolicy.createScriptURL(blobUrl) as unknown as string : blobUrl, { ...options, type: 'module' });
}

function getWorker(descriptor: IWebWorkerDescriptor, id: number): Worker | Promise<Worker> {
	const label = descriptor.label || 'anonymous' + id;

	// Option for hosts to overwrite the worker script (used in the standalone editor)
	interface IMonacoEnvironment {
		getWorker?(moduleId: string, label: string): Worker | Promise<Worker>;
		getWorkerUrl?(moduleId: string, label: string): string;
	}
	const monacoEnvironment: IMonacoEnvironment | undefined = (globalThis as any).MonacoEnvironment;
	if (monacoEnvironment) {
		if (typeof monacoEnvironment.getWorker === 'function') {
			return monacoEnvironment.getWorker('workerMain.js', label);
		}
		if (typeof monacoEnvironment.getWorkerUrl === 'function') {
			const workerUrl = monacoEnvironment.getWorkerUrl('workerMain.js', label);
			return new Worker(ttPolicy ? ttPolicy.createScriptURL(workerUrl) as unknown as string : workerUrl, { name: label, type: 'module' });
		}
	}

	const esmWorkerLocation = descriptor.esmModuleLocation;
	if (esmWorkerLocation) {
		const workerUrl = getWorkerBootstrapUrl(label, esmWorkerLocation.toString(true));
		const worker = new Worker(ttPolicy ? ttPolicy.createScriptURL(workerUrl) as unknown as string : workerUrl, { name: label, type: 'module' });
		return whenESMWorkerReady(worker);
	}

	throw new Error(`You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker`);
}

function getWorkerBootstrapUrl(label: string, workerScriptUrl: string): string {
	if (/^((http:)|(https:)|(file:))/.test(workerScriptUrl) && workerScriptUrl.substring(0, globalThis.origin.length) !== globalThis.origin) {
		// this is the cross-origin case
		// i.e. the webpage is running at a different origin than where the scripts are loaded from
	} else {
		const start = workerScriptUrl.lastIndexOf('?');
		const end = workerScriptUrl.lastIndexOf('#', start);
		const params = start > 0
			? new URLSearchParams(workerScriptUrl.substring(start + 1, ~end ? end : undefined))
			: new URLSearchParams();

		COI.addSearchParam(params, true, true);
		const search = params.toString();
		if (!search) {
			workerScriptUrl = `${workerScriptUrl}#${label}`;
		} else {
			workerScriptUrl = `${workerScriptUrl}?${params.toString()}#${label}`;
		}
	}

	// In below blob code, we are using JSON.stringify to ensure the passed
	// in values are not breaking our script. The values may contain string
	// terminating characters (such as ' or ").
	const blob = new Blob([coalesce([
		`/*${label}*/`,
		`globalThis._VSCODE_NLS_MESSAGES = ${JSON.stringify(getNLSMessages())};`,
		`globalThis._VSCODE_NLS_LANGUAGE = ${JSON.stringify(getNLSLanguage())};`,
		`globalThis._VSCODE_FILE_ROOT = ${JSON.stringify(globalThis._VSCODE_FILE_ROOT)};`,
		`const ttPolicy = globalThis.trustedTypes?.createPolicy('defaultWorkerFactory', { createScriptURL: value => value });`,
		`globalThis.workerttPolicy = ttPolicy;`,
		`await import(ttPolicy?.createScriptURL(${JSON.stringify(workerScriptUrl)}) ?? ${JSON.stringify(workerScriptUrl)});`,
		`globalThis.postMessage({ type: 'vscode-worker-ready' });`,
		`/*${label}*/`
	]).join('')], { type: 'application/javascript' });
	return URL.createObjectURL(blob);
}

function whenESMWorkerReady(worker: Worker): Promise<Worker> {
	return new Promise<Worker>((resolve, reject) => {
		worker.onmessage = function (e) {
			if (e.data.type === 'vscode-worker-ready') {
				worker.onmessage = null;
				resolve(worker);
			}
		};
		worker.onerror = reject;
	});
}

function isPromiseLike<T>(obj: any): obj is PromiseLike<T> {
	if (typeof obj.then === 'function') {
		return true;
	}
	return false;
}

/**
 * A worker that uses HTML5 web workers so that is has
 * its own global scope and its own thread.
 */
class WebWorker extends Disposable implements IWebWorker {

	private static LAST_WORKER_ID = 0;

	private readonly id: number;
	private worker: Promise<Worker> | null;

	private readonly _onMessage = this._register(new Emitter<Message>());
	public readonly onMessage = this._onMessage.event;

	private readonly _onError = this._register(new Emitter<any>());
	public readonly onError = this._onError.event;

	constructor(descriptorOrWorker: IWebWorkerDescriptor | Worker) {
		super();
		this.id = ++WebWorker.LAST_WORKER_ID;
		const workerOrPromise = (
			descriptorOrWorker instanceof Worker
				? descriptorOrWorker
				: getWorker(descriptorOrWorker, this.id)
		);
		if (isPromiseLike(workerOrPromise)) {
			this.worker = workerOrPromise;
		} else {
			this.worker = Promise.resolve(workerOrPromise);
		}
		this.postMessage('-please-ignore-', []); // TODO: Eliminate this extra message
		const errorHandler = (ev: ErrorEvent) => {
			this._onError.fire(ev);
		};
		this.worker.then((w) => {
			w.onmessage = (ev) => {
				this._onMessage.fire(ev.data);
			};
			w.onmessageerror = (ev) => {
				this._onError.fire(ev);
			};
			if (typeof w.addEventListener === 'function') {
				w.addEventListener('error', errorHandler);
			}
		});
		this._register(toDisposable(() => {
			this.worker?.then(w => {
				w.onmessage = null;
				w.onmessageerror = null;
				w.removeEventListener('error', errorHandler);
				w.terminate();
			});
			this.worker = null;
		}));
	}

	public getId(): number {
		return this.id;
	}

	public postMessage(message: any, transfer: Transferable[]): void {
		this.worker?.then(w => {
			try {
				w.postMessage(message, transfer);
			} catch (err) {
				onUnexpectedError(err);
				onUnexpectedError(new Error(`FAILED to post message to worker`, { cause: err }));
			}
		});
	}
}

export interface IWebWorkerDescriptor {
	readonly esmModuleLocation: URI | undefined;
	readonly label: string | undefined;
}

export class WebWorkerDescriptor implements IWebWorkerDescriptor {
	constructor(
		public readonly esmModuleLocation: URI,
		public readonly label: string | undefined,
	) { }
}

export function createWebWorker<T extends object>(esmModuleLocation: URI, label: string | undefined): IWebWorkerClient<T>;
export function createWebWorker<T extends object>(workerDescriptor: IWebWorkerDescriptor | Worker): IWebWorkerClient<T>;
export function createWebWorker<T extends object>(arg0: URI | IWebWorkerDescriptor | Worker, arg1?: string | undefined): IWebWorkerClient<T> {
	const workerDescriptorOrWorker = (URI.isUri(arg0) ? new WebWorkerDescriptor(arg0, arg1) : arg0);
	return new WebWorkerClient<T>(new WebWorker(workerDescriptorOrWorker));
}
