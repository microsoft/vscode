"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Delayer = void 0;
class Delayer {
    defaultDelay;
    #timeout; // Timer
    #cancelTimeout;
    #onSuccess;
    #task;
    constructor(defaultDelay) {
        this.defaultDelay = defaultDelay;
        this.#timeout = null;
        this.#cancelTimeout = null;
        this.#onSuccess = null;
        this.#task = null;
    }
    dispose() {
        this.#doCancelTimeout();
    }
    trigger(task, delay = this.defaultDelay) {
        this.#task = task;
        if (delay >= 0) {
            this.#doCancelTimeout();
        }
        if (!this.#cancelTimeout) {
            this.#cancelTimeout = new Promise((resolve) => {
                this.#onSuccess = resolve;
            }).then(() => {
                this.#cancelTimeout = null;
                this.#onSuccess = null;
                const result = this.#task?.() ?? null;
                this.#task = null;
                return result;
            });
        }
        if (delay >= 0 || this.#timeout === null) {
            this.#timeout = setTimeout(() => {
                this.#timeout = null;
                this.#onSuccess?.(undefined);
            }, delay >= 0 ? delay : this.defaultDelay);
        }
        return this.#cancelTimeout;
    }
    #doCancelTimeout() {
        if (this.#timeout !== null) {
            clearTimeout(this.#timeout);
            this.#timeout = null;
        }
    }
}
exports.Delayer = Delayer;
//# sourceMappingURL=async.js.map