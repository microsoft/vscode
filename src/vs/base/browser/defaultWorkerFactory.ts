/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createTrustedTypesPolicy } from 'vs/base/browser/trustedTypes';
import { onUnexpectedError } from 'vs/base/common/errors';
import { COI } from 'vs/base/common/network';
import { IWorker, IWorkerCallback, IWorkerFactory, logOnceWebWorkerWarning } from 'vs/base/common/worker/simpleWorker';

const ttPolicy = createTrustedTypesPolicy('defaultWorkerFactory', { createScriptURL: value => value });

export function createBlobWorker(blobUrl: string, options?: WorkerOptions): Worker {
	if (!blobUrl.startsWith('blob:')) {
		throw new URIError('Not a blob-url: ' + blobUrl);
	}
	return new Worker(ttPolicy ? ttPolicy.createScriptURL(blobUrl) as unknown as string : blobUrl, options);
}

function getWorker(label: string): Worker | Promise<Worker> {
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
			return new Worker(ttPolicy ? ttPolicy.createScriptURL(workerUrl) as unknown as string : workerUrl, { name: label });
		}
	}
	// ESM-comment-begin
	if (typeof require === 'function') {
		// check if the JS lives on a different origin
		const workerMain = require.toUrl('vs/base/worker/workerMain.js'); // explicitly using require.toUrl(), see https://github.com/microsoft/vscode/issues/107440#issuecomment-698982321
		const workerUrl = getWorkerBootstrapUrl(workerMain, label);
		return new Worker(ttPolicy ? ttPolicy.createScriptURL(workerUrl) as unknown as string : workerUrl, { name: label });
	}
	// ESM-comment-end
	throw new Error(`You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker`);
}

// ESM-comment-begin
export function getWorkerBootstrapUrl(scriptPath: string, label: string): string {
	if (/^((http:)|(https:)|(file:))/.test(scriptPath) && scriptPath.substring(0, globalThis.origin.length) !== globalThis.origin) {
		// this is the cross-origin case
		// i.e. the webpage is running at a different origin than where the scripts are loaded from
		const myPath = 'vs/base/worker/defaultWorkerFactory.js';
		const workerBaseUrl = require.toUrl(myPath).slice(0, -myPath.length); // explicitly using require.toUrl(), see https://github.com/microsoft/vscode/issues/107440#issuecomment-698982321
		const js = `/*${label}*/globalThis.MonacoEnvironment={baseUrl: '${workerBaseUrl}'};const ttPolicy = globalThis.trustedTypes?.createPolicy('defaultWorkerFactory', { createScriptURL: value => value });importScripts(ttPolicy?.createScriptURL('${scriptPath}') ?? '${scriptPath}');/*${label}*/`;
		const blob = new Blob([js], { type: 'application/javascript' });
		return URL.createObjectURL(blob);
	}

	const start = scriptPath.lastIndexOf('?');
	const end = scriptPath.lastIndexOf('#', start);
	const params = start > 0
		? new URLSearchParams(scriptPath.substring(start + 1, ~end ? end : undefined))
		: new URLSearchParams();

	COI.addSearchParam(params, true, true);
	const search = params.toString();

	if (!search) {
		return `${scriptPath}#${label}`;
	} else {
		return `${scriptPath}?${params.toString()}#${label}`;
	}
}
// ESM-comment-end

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
class WebWorker implements IWorker {

	private readonly id: number;
	private readonly label: string;
	private worker: Promise<Worker> | null;

	constructor(moduleId: string, id: number, label: string, onMessageCallback: IWorkerCallback, onErrorCallback: (err: any) => void) {
		this.id = id;
		this.label = label;
		const workerOrPromise = getWorker(label);
		if (isPromiseLike(workerOrPromise)) {
			this.worker = workerOrPromise;
		} else {
			this.worker = Promise.resolve(workerOrPromise);
		}
		this.postMessage(moduleId, []);
		this.worker.then((w) => {
			w.onmessage = function (ev) {
				onMessageCallback(ev.data);
			};
			w.onmessageerror = onErrorCallback;
			if (typeof w.addEventListener === 'function') {
				w.addEventListener('error', onErrorCallback);
			}
		});
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

	public dispose(): void {
		this.worker?.then(w => w.terminate());
		this.worker = null;
	}
}

export class DefaultWorkerFactory implements IWorkerFactory {

	private static LAST_WORKER_ID = 0;

	private _label: string | undefined;
	private _webWorkerFailedBeforeError: any;

	constructor(label: string | undefined) {
		this._label = label;
		this._webWorkerFailedBeforeError = false;
	}

	public create(moduleId: string, onMessageCallback: IWorkerCallback, onErrorCallback: (err: any) => void): IWorker {
		const workerId = (++DefaultWorkerFactory.LAST_WORKER_ID);

		if (this._webWorkerFailedBeforeError) {
			throw this._webWorkerFailedBeforeError;
		}

		return new WebWorker(moduleId, workerId, this._label || 'anonymous' + workerId, onMessageCallback, (err) => {
			logOnceWebWorkerWarning(err);
			this._webWorkerFailedBeforeError = err;
			onErrorCallback(err);
		});
	}
}
