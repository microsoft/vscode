/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from '../../../base/browser/trustedTypes.js';
import { coalesce } from '../../../base/common/arrays.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { COI } from '../../../base/common/network.js';
import { IWebWorker, IWebWorkerClient, Message, WebWorkerClient } from '../../../base/common/worker/webWorker.js';
import { getNLSLanguage, getNLSMessages } from '../../../nls.js';
import { WebWorkerDescriptor } from './webWorkerDescriptor.js';
import { IWebWorkerService } from './webWorkerService.js';

export class WebWorkerService implements IWebWorkerService {
	private static _workerIdPool: number = 0;
	declare readonly _serviceBrand: undefined;

	createWorkerClient<T extends object>(workerDescriptor: WebWorkerDescriptor | Worker | Promise<Worker>): IWebWorkerClient<T> {
		let worker: Worker | Promise<Worker>;
		const id = ++WebWorkerService._workerIdPool;
		if (workerDescriptor instanceof Worker || isPromiseLike<Worker>(workerDescriptor)) {
			worker = Promise.resolve(workerDescriptor);
		} else {
			worker = this._createWorker(workerDescriptor);
		}

		return new WebWorkerClient<T>(new WebWorker(worker, id));
	}

	protected _createWorker(descriptor: WebWorkerDescriptor): Promise<Worker> {
		const workerRunnerUrl = this.getWorkerUrl(descriptor);

		const workerUrlWithNls = getWorkerBootstrapUrl(descriptor.label, workerRunnerUrl);
		const worker = new Worker(ttPolicy ? ttPolicy.createScriptURL(workerUrlWithNls) as unknown as string : workerUrlWithNls, { name: descriptor.label, type: 'module' });
		return whenESMWorkerReady(worker);
	}

	getWorkerUrl(descriptor: WebWorkerDescriptor): string {
		if (!descriptor.esmModuleLocation) {
			throw new Error('Missing esmModuleLocation in WebWorkerDescriptor');
		}
		const uri = typeof descriptor.esmModuleLocation === 'function' ? descriptor.esmModuleLocation() : descriptor.esmModuleLocation;
		const urlStr = uri.toString(true);
		return urlStr;
	}
}

const ttPolicy = ((): ReturnType<typeof createTrustedTypesPolicy> => {
	type WorkerGlobalWithPolicy = typeof globalThis & {
		workerttPolicy?: ReturnType<typeof createTrustedTypesPolicy>;
	};

	// Reuse the trusted types policy defined from worker bootstrap
	// when available.
	// Refs https://github.com/microsoft/vscode/issues/222193
	const workerGlobalThis = globalThis as WorkerGlobalWithPolicy;
	if (typeof self === 'object' && self.constructor && self.constructor.name === 'DedicatedWorkerGlobalScope' && workerGlobalThis.workerttPolicy !== undefined) {
		return workerGlobalThis.workerttPolicy;
	} else {
		return createTrustedTypesPolicy('defaultWorkerFactory', { createScriptURL: value => value });
	}
})();

export function createBlobWorker(blobUrl: string, options?: WorkerOptions): Worker {
	if (!blobUrl.startsWith('blob:')) {
		throw new URIError('Not a blob-url: ' + blobUrl);
	}
	return new Worker(ttPolicy ? ttPolicy.createScriptURL(blobUrl) as unknown as string : blobUrl, { ...options, type: 'module' });
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

function isPromiseLike<T>(obj: unknown): obj is PromiseLike<T> {
	return !!obj && typeof (obj as PromiseLike<T>).then === 'function';
}

export class WebWorker extends Disposable implements IWebWorker {
	private readonly id: number;
	private worker: Promise<Worker> | null;

	private readonly _onMessage = this._register(new Emitter<Message>());
	public readonly onMessage = this._onMessage.event;

	private readonly _onError = this._register(new Emitter<MessageEvent | ErrorEvent>());
	public readonly onError = this._onError.event;

	constructor(worker: Promise<Worker>, id: number) {
		super();
		this.id = id;
		this.worker = worker;
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

	public postMessage(message: unknown, transfer: Transferable[]): void {
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
