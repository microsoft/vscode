/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { onUnexpectedError } from 'vs/base/common/errors';
import { AppResourcePath, COI, FileAccess } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { IWorker, IWorkerCallback, IWorkerClient, IWorkerDescriptor, IWorkerFactory, logOnceWebWorkerWarning, SimpleWorkerClient } from 'vs/base/common/worker/simpleWorker';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { coalesce } from 'vs/base/common/arrays';
import { getNLSLanguage, getNLSMessages } from 'vs/nls';

// ESM-comment-begin
const isESM = false;
// ESM-comment-end
// ESM-uncomment-begin
// const isESM = true;
// ESM-uncomment-end

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
	return new Worker(ttPolicy ? ttPolicy.createScriptURL(blobUrl) as unknown as string : blobUrl, { ...options, type: isESM ? 'module' : undefined });
}

function getWorker(esmWorkerLocation: URI | undefined, label: string): Worker | Promise<Worker> {
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
			return new Worker(ttPolicy ? ttPolicy.createScriptURL(workerUrl) as unknown as string : workerUrl, { name: label, type: isESM ? 'module' : undefined });
		}
	}
	// ESM-comment-begin
	if (typeof require === 'function') {
		const workerMainLocation = require.toUrl('vs/base/worker/workerMain.js'); // explicitly using require.toUrl(), see https://github.com/microsoft/vscode/issues/107440#issuecomment-698982321
		const factoryModuleId = 'vs/base/worker/defaultWorkerFactory.js';
		const workerBaseUrl = require.toUrl(factoryModuleId).slice(0, -factoryModuleId.length); // explicitly using require.toUrl(), see https://github.com/microsoft/vscode/issues/107440#issuecomment-698982321
		const workerUrl = getWorkerBootstrapUrl(label, workerMainLocation, workerBaseUrl);
		return new Worker(ttPolicy ? ttPolicy.createScriptURL(workerUrl) as unknown as string : workerUrl, { name: label, type: isESM ? 'module' : undefined });
	}
	// ESM-comment-end
	if (esmWorkerLocation) {
		const workerUrl = getWorkerBootstrapUrl(label, esmWorkerLocation.toString(true));
		const worker = new Worker(ttPolicy ? ttPolicy.createScriptURL(workerUrl) as unknown as string : workerUrl, { name: label, type: isESM ? 'module' : undefined });
		if (isESM) {
			return whenESMWorkerReady(worker);
		} else {
			return worker;
		}
	}
	throw new Error(`You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker`);
}

function getWorkerBootstrapUrl(label: string, workerScriptUrl: string, workerBaseUrl?: string): string {
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

	const blob = new Blob([coalesce([
		`/*${label}*/`,
		workerBaseUrl ? `globalThis.MonacoEnvironment = { baseUrl: ${JSON.stringify(workerBaseUrl)} };` : undefined,
		`globalThis._VSCODE_NLS_MESSAGES = ${JSON.stringify(getNLSMessages())};`,
		`globalThis._VSCODE_NLS_LANGUAGE = ${JSON.stringify(getNLSLanguage())};`,
		`globalThis._VSCODE_FILE_ROOT = ${JSON.stringify(globalThis._VSCODE_FILE_ROOT)};`,
		`const ttPolicy = globalThis.trustedTypes?.createPolicy('defaultWorkerFactory', { createScriptURL: value => value });`,
		`globalThis.workerttPolicy = ttPolicy;`,
		isESM ? `await import(ttPolicy?.createScriptURL(${JSON.stringify(workerScriptUrl)}) ?? ${JSON.stringify(workerScriptUrl)});` : `importScripts(ttPolicy?.createScriptURL(${JSON.stringify(workerScriptUrl)}) ?? ${JSON.stringify(workerScriptUrl)});`,
		isESM ? `globalThis.postMessage({ type: 'vscode-worker-ready' });` : undefined, // in ESM signal we are ready after the async import
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
class WebWorker extends Disposable implements IWorker {

	private readonly id: number;
	private readonly label: string;
	private worker: Promise<Worker> | null;

	constructor(esmWorkerLocation: URI | undefined, amdModuleId: string, id: number, label: string, onMessageCallback: IWorkerCallback, onErrorCallback: (err: any) => void) {
		super();
		this.id = id;
		this.label = label;
		const workerOrPromise = getWorker(esmWorkerLocation, label);
		if (isPromiseLike(workerOrPromise)) {
			this.worker = workerOrPromise;
		} else {
			this.worker = Promise.resolve(workerOrPromise);
		}
		this.postMessage(amdModuleId, []);
		this.worker.then((w) => {
			w.onmessage = function (ev) {
				onMessageCallback(ev.data);
			};
			w.onmessageerror = onErrorCallback;
			if (typeof w.addEventListener === 'function') {
				w.addEventListener('error', onErrorCallback);
			}
		});
		this._register(toDisposable(() => {
			this.worker?.then(w => {
				w.onmessage = null;
				w.onmessageerror = null;
				w.removeEventListener('error', onErrorCallback);
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
				onUnexpectedError(new Error(`FAILED to post message to '${this.label}'-worker`, { cause: err }));
			}
		});
	}
}

export class WorkerDescriptor implements IWorkerDescriptor {

	public readonly esmModuleLocation: URI | undefined;

	constructor(
		public readonly amdModuleId: string,
		readonly label: string | undefined,
	) {
		this.esmModuleLocation = (isESM ? FileAccess.asBrowserUri(`${amdModuleId}.esm.js` as AppResourcePath) : undefined);
	}
}

class DefaultWorkerFactory implements IWorkerFactory {

	private static LAST_WORKER_ID = 0;
	private _webWorkerFailedBeforeError: any;

	constructor() {
		this._webWorkerFailedBeforeError = false;
	}

	public create(desc: IWorkerDescriptor, onMessageCallback: IWorkerCallback, onErrorCallback: (err: any) => void): IWorker {
		const workerId = (++DefaultWorkerFactory.LAST_WORKER_ID);

		if (this._webWorkerFailedBeforeError) {
			throw this._webWorkerFailedBeforeError;
		}

		return new WebWorker(desc.esmModuleLocation, desc.amdModuleId, workerId, desc.label || 'anonymous' + workerId, onMessageCallback, (err) => {
			logOnceWebWorkerWarning(err);
			this._webWorkerFailedBeforeError = err;
			onErrorCallback(err);
		});
	}
}

export function createWebWorker<T extends object>(amdModuleId: string, label: string | undefined): IWorkerClient<T>;
export function createWebWorker<T extends object>(workerDescriptor: IWorkerDescriptor): IWorkerClient<T>;
export function createWebWorker<T extends object>(arg0: string | IWorkerDescriptor, arg1?: string | undefined): IWorkerClient<T> {
	const workerDescriptor = (typeof arg0 === 'string' ? new WorkerDescriptor(arg0, arg1) : arg0);
	return new SimpleWorkerClient<T>(new DefaultWorkerFactory(), workerDescriptor);
}
