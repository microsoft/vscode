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
import { WebWorkerClient } from '../../../base/common/worker/webWorker.js';
import { getNLSLanguage, getNLSMessages } from '../../../nls.js';
export class WebWorkerService {
    static { this._workerIdPool = 0; }
    createWorkerClient(workerDescriptor) {
        let worker;
        const id = ++WebWorkerService._workerIdPool;
        if (workerDescriptor instanceof Worker || isPromiseLike(workerDescriptor)) {
            worker = Promise.resolve(workerDescriptor);
        }
        else {
            worker = this._createWorker(workerDescriptor);
        }
        return new WebWorkerClient(new WebWorker(worker, id));
    }
    _createWorker(descriptor) {
        const workerRunnerUrl = this.getWorkerUrl(descriptor);
        const workerUrlWithNls = getWorkerBootstrapUrl(descriptor.label, workerRunnerUrl, this._getWorkerLoadingFailedErrorMessage(descriptor));
        const worker = new Worker(ttPolicy ? ttPolicy.createScriptURL(workerUrlWithNls) : workerUrlWithNls, { name: descriptor.label, type: 'module' });
        return whenESMWorkerReady(worker);
    }
    _getWorkerLoadingFailedErrorMessage(_descriptor) {
        return undefined;
    }
    getWorkerUrl(descriptor) {
        if (!descriptor.esmModuleLocation) {
            throw new Error('Missing esmModuleLocation in WebWorkerDescriptor');
        }
        const uri = typeof descriptor.esmModuleLocation === 'function' ? descriptor.esmModuleLocation() : descriptor.esmModuleLocation;
        const urlStr = uri.toString(true);
        return urlStr;
    }
}
const ttPolicy = (() => {
    // Reuse the trusted types policy defined from worker bootstrap
    // when available.
    // Refs https://github.com/microsoft/vscode/issues/222193
    const workerGlobalThis = globalThis;
    if (typeof self === 'object' && self.constructor && self.constructor.name === 'DedicatedWorkerGlobalScope' && workerGlobalThis.workerttPolicy !== undefined) {
        return workerGlobalThis.workerttPolicy;
    }
    else {
        return createTrustedTypesPolicy('defaultWorkerFactory', { createScriptURL: value => value });
    }
})();
export function createBlobWorker(blobUrl, options) {
    if (!blobUrl.startsWith('blob:')) {
        throw new URIError('Not a blob-url: ' + blobUrl);
    }
    return new Worker(ttPolicy ? ttPolicy.createScriptURL(blobUrl) : blobUrl, { ...options, type: 'module' });
}
function getWorkerBootstrapUrl(label, workerScriptUrl, workerLoadingFailedErrorMessage) {
    if (/^((http:)|(https:)|(file:))/.test(workerScriptUrl) && workerScriptUrl.substring(0, globalThis.origin.length) !== globalThis.origin) {
        // this is the cross-origin case
        // i.e. the webpage is running at a different origin than where the scripts are loaded from
    }
    else {
        const start = workerScriptUrl.lastIndexOf('?');
        const end = workerScriptUrl.lastIndexOf('#', start);
        const params = start > 0
            ? new URLSearchParams(workerScriptUrl.substring(start + 1, ~end ? end : undefined))
            : new URLSearchParams();
        COI.addSearchParam(params, true, true);
        const search = params.toString();
        if (!search) {
            workerScriptUrl = `${workerScriptUrl}#${label}`;
        }
        else {
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
            workerLoadingFailedErrorMessage ? 'try {' : '',
            `await import(ttPolicy?.createScriptURL(${JSON.stringify(workerScriptUrl)}) ?? ${JSON.stringify(workerScriptUrl)});`,
            workerLoadingFailedErrorMessage ? `} catch (err) { console.error(${JSON.stringify(workerLoadingFailedErrorMessage)}, err); throw err; }` : '',
            `globalThis.postMessage({ type: 'vscode-worker-ready' });`,
            `/*${label}*/`
        ]).join('')], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
}
function whenESMWorkerReady(worker) {
    return new Promise((resolve, reject) => {
        worker.onmessage = function (e) {
            if (e.data.type === 'vscode-worker-ready') {
                worker.onmessage = null;
                resolve(worker);
            }
        };
        worker.onerror = reject;
    });
}
function isPromiseLike(obj) {
    return !!obj && typeof obj.then === 'function';
}
export class WebWorker extends Disposable {
    constructor(worker, id) {
        super();
        this._onMessage = this._register(new Emitter());
        this.onMessage = this._onMessage.event;
        this._onError = this._register(new Emitter());
        this.onError = this._onError.event;
        this.id = id;
        this.worker = worker;
        this.postMessage('-please-ignore-', []); // TODO: Eliminate this extra message
        const errorHandler = (ev) => {
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
    getId() {
        return this.id;
    }
    postMessage(message, transfer) {
        this.worker?.then(w => {
            try {
                w.postMessage(message, transfer);
            }
            catch (err) {
                onUnexpectedError(err);
                onUnexpectedError(new Error(`FAILED to post message to worker`, { cause: err }));
            }
        });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViV29ya2VyU2VydmljZUltcGwuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS93ZWJXb3JrZXIvYnJvd3Nlci93ZWJXb3JrZXJTZXJ2aWNlSW1wbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNqRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDbkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3RELE9BQU8sRUFBeUMsZUFBZSxFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDbEgsT0FBTyxFQUFFLGNBQWMsRUFBRSxjQUFjLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUlqRSxNQUFNLE9BQU8sZ0JBQWdCO2FBQ2Isa0JBQWEsR0FBVyxDQUFDLENBQUM7SUFHekMsa0JBQWtCLENBQW1CLGdCQUFnRTtRQUNwRyxJQUFJLE1BQWdDLENBQUM7UUFDckMsTUFBTSxFQUFFLEdBQUcsRUFBRSxnQkFBZ0IsQ0FBQyxhQUFhLENBQUM7UUFDNUMsSUFBSSxnQkFBZ0IsWUFBWSxNQUFNLElBQUksYUFBYSxDQUFTLGdCQUFnQixDQUFDLEVBQUUsQ0FBQztZQUNuRixNQUFNLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQzVDLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsZ0JBQWdC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