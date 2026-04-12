"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.StopWatch = void 0;
exports.filterEvent = filterEvent;
exports.onceEvent = onceEvent;
exports.promiseFromEvent = promiseFromEvent;
exports.arrayEquals = arrayEquals;
const vscode_1 = require("vscode");
function filterEvent(event, filter) {
    return (listener, thisArgs = null, disposables) => event(e => filter(e) && listener.call(thisArgs, e), null, disposables);
}
function onceEvent(event) {
    return (listener, thisArgs = null, disposables) => {
        const result = event(e => {
            result.dispose();
            return listener.call(thisArgs, e);
        }, null, disposables);
        return result;
    };
}
const passthrough = (value, resolve) => resolve(value);
/**
 * Return a promise that resolves with the next emitted event, or with some future
 * event as decided by an adapter.
 *
 * If specified, the adapter is a function that will be called with
 * `(event, resolve, reject)`. It will be called once per event until it resolves or
 * rejects.
 *
 * The default adapter is the passthrough function `(value, resolve) => resolve(value)`.
 *
 * @param event the event
 * @param adapter controls resolution of the returned promise
 * @returns a promise that resolves or rejects as specified by the adapter
 */
function promiseFromEvent(event, adapter = passthrough) {
    let subscription;
    const cancel = new vscode_1.EventEmitter();
    return {
        promise: new Promise((resolve, reject) => {
            cancel.event(_ => reject('Cancelled'));
            subscription = event((value) => {
                try {
                    Promise.resolve(adapter(value, resolve, reject))
                        .catch(reject);
                }
                catch (error) {
                    reject(error);
                }
            });
        }).then((result) => {
            subscription.dispose();
            return result;
        }, error => {
            subscription.dispose();
            throw error;
        }),
        cancel
    };
}
function arrayEquals(one, other, itemEquals = (a, b) => a === b) {
    if (one === other) {
        return true;
    }
    if (!one || !other) {
        return false;
    }
    if (one.length !== other.length) {
        return false;
    }
    for (let i = 0, len = one.length; i < len; i++) {
        if (!itemEquals(one[i], other[i])) {
            return false;
        }
    }
    return true;
}
class StopWatch {
    _startTime = Date.now();
    _stopTime = -1;
    stop() {
        this._stopTime = Date.now();
    }
    elapsed() {
        if (this._stopTime !== -1) {
            return this._stopTime - this._startTime;
        }
        return Date.now() - this._startTime;
    }
}
exports.StopWatch = StopWatch;
//# sourceMappingURL=utils.js.map