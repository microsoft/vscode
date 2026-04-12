"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.CallbackMap = void 0;
const typescriptService_1 = require("../typescriptService");
class CallbackMap {
    _callbacks = new Map();
    _asyncCallbacks = new Map();
    destroy(cause) {
        const cancellation = new typescriptService_1.ServerResponse.Cancelled(cause);
        for (const callback of this._callbacks.values()) {
            callback.onSuccess(cancellation);
        }
        this._callbacks.clear();
        for (const callback of this._asyncCallbacks.values()) {
            callback.onSuccess(cancellation);
        }
        this._asyncCallbacks.clear();
    }
    add(seq, callback, isAsync) {
        if (isAsync) {
            this._asyncCallbacks.set(seq, callback);
        }
        else {
            this._callbacks.set(seq, callback);
        }
    }
    fetch(seq) {
        const callback = this._callbacks.get(seq) || this._asyncCallbacks.get(seq);
        this.delete(seq);
        return callback;
    }
    peek(seq) {
        return this._callbacks.get(seq) ?? this._asyncCallbacks.get(seq);
    }
    delete(seq) {
        if (!this._callbacks.delete(seq)) {
            this._asyncCallbacks.delete(seq);
        }
    }
}
exports.CallbackMap = CallbackMap;
//# sourceMappingURL=callbackMap.js.map