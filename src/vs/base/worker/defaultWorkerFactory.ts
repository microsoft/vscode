/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { globals } from 'vs/base/common/platform';
import { IWorker, IWorkerCallback, IWorkerFactory, logOnceWebWorkerWarning } from 'vs/base/common/worker/simpleWorker';

function getWorker(workerId: string, label: string): Worker {
	// Option for hosts to overwrite the worker script (used in the standalone editor)
	if (globals.MonacoEnvironment) {
		if (typeof globals.MonacoEnvironment.getWorker === 'function') {
			return globals.MonacoEnvironment.getWorker(workerId, label);
		}
		if (typeof globals.MonacoEnvironment.getWorkerUrl === 'function') {
			return new Worker(globals.MonacoEnvironment.getWorkerUrl(workerId, label));
		}
	}
	// ESM-comment-begin
	if (typeof require === 'function') {
		return new Worker(require.toUrl('./' + workerId) + '#' + label);
	}
	// ESM-comment-end
	throw new Error(`You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker`);
}

/**
 * A worker that uses HTML5 web workers so that is has
 * its own global scope and its own thread.
 */
class WebWorker implements IWorker {

	private id: number;
	private worker: Worker | null;

	constructor(moduleId: string, id: number, label: string, onMessageCallback: IWorkerCallback, onErrorCallback: (err: any) => void) {
		this.id = id;
		this.worker = getWorker('workerMain.js', label);
		this.postMessage(moduleId);
		this.worker.onmessage = function (ev: any) {
			onMessageCallback(ev.data);
		};
		if (typeof this.worker.addEventListener === 'function') {
			this.worker.addEventListener('error', onErrorCallback);
		}
	}

	public getId(): number {
		return this.id;
	}

	public postMessage(msg: string): void {
		if (this.worker) {
			this.worker.postMessage(msg);
		}
	}

	public dispose(): void {
		if (this.worker) {
			this.worker.terminate();
		}
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
		let workerId = (++DefaultWorkerFactory.LAST_WORKER_ID);

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
