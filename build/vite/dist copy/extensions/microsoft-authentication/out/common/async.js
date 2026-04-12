"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeferredPromise = exports.IntervalTimer = exports.SequencerByKey = void 0;
exports.raceCancellationAndTimeoutError = raceCancellationAndTimeoutError;
exports.toPromise = toPromise;
const vscode_1 = require("vscode");
class SequencerByKey {
    promiseMap = new Map();
    queue(key, promiseTask) {
        const runningPromise = this.promiseMap.get(key) ?? Promise.resolve();
        const newPromise = runningPromise
            .catch(() => { })
            .then(promiseTask)
            .finally(() => {
            if (this.promiseMap.get(key) === newPromise) {
                this.promiseMap.delete(key);
            }
        });
        this.promiseMap.set(key, newPromise);
        return newPromise;
    }
}
exports.SequencerByKey = SequencerByKey;
class IntervalTimer extends vscode_1.Disposable {
    _token;
    constructor() {
        super(() => this.cancel());
        this._token = -1;
    }
    cancel() {
        if (this._token !== -1) {
            clearInterval(this._token);
            this._token = -1;
        }
    }
    cancelAndSet(runner, interval) {
        this.cancel();
        this._token = setInterval(() => {
            runner();
        }, interval);
    }
}
exports.IntervalTimer = IntervalTimer;
/**
 * Returns a promise that rejects with an {@CancellationError} as soon as the passed token is cancelled.
 * @see {@link raceCancellation}
 */
function raceCancellationError(promise, token) {
    return new Promise((resolve, reject) => {
        const ref = token.onCancellationRequested(() => {
            ref.dispose();
            reject(new vscode_1.CancellationError());
        });
        promise.then(resolve, reject).finally(() => ref.dispose());
    });
}
function raceTimeoutError(promise, timeout) {
    return new Promise((resolve, reject) => {
        const ref = setTimeout(() => {
            reject(new vscode_1.CancellationError());
        }, timeout);
        promise.then(resolve, reject).finally(() => clearTimeout(ref));
    });
}
function raceCancellationAndTimeoutError(promise, token, timeout) {
    return raceCancellationError(raceTimeoutError(promise, timeout), token);
}
/**
 * Given an event, returns another event which only fires once.
 *
 * @param event The event source for the new event.
 */
function once(event) {
    return (listener, thisArgs = null, disposables) => {
        // we need this, in case the event fires during the listener call
        let didFire = false;
        let result = undefined;
        result = event(e => {
            if (didFire) {
                return;
            }
            else if (result) {
                result.dispose();
            }
            else {
                didFire = true;
            }
            return listener.call(thisArgs, e);
        }, null, disposables);
        if (didFire) {
            result.dispose();
        }
        return result;
    };
}
/**
 * Creates a promise out of an event, using the {@link Event.once} helper.
 */
function toPromise(event) {
    return new Promise(resolve => once(event)(resolve));
}
/**
 * Creates a promise whose resolution or rejection can be controlled imperatively.
 */
class DeferredPromise {
    completeCallback;
    errorCallback;
    outcome;
    get isRejected() {
        return this.outcome?.outcome === 1 /* DeferredOutcome.Rejected */;
    }
    get isResolved() {
        return this.outcome?.outcome === 0 /* DeferredOutcome.Resolved */;
    }
    get isSettled() {
        return !!this.outcome;
    }
    get value() {
        return this.outcome?.outcome === 0 /* DeferredOutcome.Resolved */ ? this.outcome?.value : undefined;
    }
    p;
    constructor() {
        this.p = new Promise((c, e) => {
            this.completeCallback = c;
            this.errorCallback = e;
        });
    }
    complete(value) {
        return new Promise(resolve => {
            this.completeCallback(value);
            this.outcome = { outcome: 0 /* DeferredOutcome.Resolved */, value };
            resolve();
        });
    }
    error(err) {
        return new Promise(resolve => {
            this.errorCallback(err);
            this.outcome = { outcome: 1 /* DeferredOutcome.Rejected */, value: err };
            resolve();
        });
    }
    cancel() {
        return this.error(new vscode_1.CancellationError());
    }
}
exports.DeferredPromise = DeferredPromise;
//#endregion
//# sourceMappingURL=async.js.map