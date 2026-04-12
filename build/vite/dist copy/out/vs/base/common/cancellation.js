/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Emitter, Event } from './event.js';
import { DisposableStore } from './lifecycle.js';
const shortcutEvent = Object.freeze(function (callback, context) {
    const handle = setTimeout(callback.bind(context), 0);
    return { dispose() { clearTimeout(handle); } };
});
export var CancellationToken;
(function (CancellationToken) {
    function isCancellationToken(thing) {
        if (thing === CancellationToken.None || thing === CancellationToken.Cancelled) {
            return true;
        }
        if (thing instanceof MutableToken) {
            return true;
        }
        if (!thing || typeof thing !== 'object') {
            return false;
        }
        return typeof thing.isCancellationRequested === 'boolean'
            && typeof thing.onCancellationRequested === 'function';
    }
    CancellationToken.isCancellationToken = isCancellationToken;
    CancellationToken.None = Object.freeze({
        isCancellationRequested: false,
        onCancellationRequested: Event.None
    });
    CancellationToken.Cancelled = Object.freeze({
        isCancellationRequested: true,
        onCancellationRequested: shortcutEvent
    });
})(CancellationToken || (CancellationToken = {}));
class MutableToken {
    constructor() {
        this._isCancelled = false;
        this._emitter = null;
    }
    cancel() {
        if (!this._isCancelled) {
            this._isCancelled = true;
            if (this._emitter) {
                this._emitter.fire(undefined);
                this.dispose();
            }
        }
    }
    get isCancellationRequested() {
        return this._isCancelled;
    }
    get onCancellationRequested() {
        if (this._isCancelled) {
            return shortcutEvent;
        }
        if (!this._emitter) {
            this._emitter = new Emitter();
        }
        return this._emitter.event;
    }
    dispose() {
        if (this._emitter) {
            this._emitter.dispose();
            this._emitter = null;
        }
    }
}
export class CancellationTokenSource {
    constructor(parent) {
        this._token = undefined;
        this._parentListener = undefined;
        this._parentListener = parent && parent.onCancellationRequested(this.cancel, this);
    }
    get token() {
        if (!this._token) {
            // be lazy and create the token only when
            // actually needed
            this._token = new MutableToken();
        }
        return this._token;
    }
    cancel() {
        if (!this._token) {
            // save an object by returning the default
            // cancelled token when cancellation happens
            // before someone asks for the token
            this._token = CancellationToken.Cancelled;
        }
        else if (this._token instanceof MutableToken) {
            // actually cancel
            this._token.cancel();
        }
    }
    dispose(cancel = false) {
        if (cancel) {
            this.cancel();
        }
        this._parentListener?.dispose();
        if (!this._token) {
            // ensure to initialize with an empty token if we had none
            this._token = CancellationToken.None;
        }
        else if (this._token instanceof MutableToken) {
            // actually dispose
            this._token.dispose();
        }
    }
}
export function cancelOnDispose(store) {
    const source = new CancellationTokenSource();
    store.add({ dispose() { source.cancel(); } });
    return source.token;
}
/**
 * A pool that aggregates multiple cancellation tokens. The pool's own token
 * (accessible via `pool.token`) is cancelled only after every token added
 * to the pool has been cancelled. Adding tokens after the pool token has
 * been cancelled has no effect.
 */
export class CancellationTokenPool {
    constructor() {
        this._source = new CancellationTokenSource();
        this._listeners = new DisposableStore();
        this._total = 0;
        this._cancelled = 0;
        this._isDone = false;
    }
    get token() {
        return this._source.token;
    }
    /**
     * Add a token to the pool. If the token is already cancelled it is counted
     * immediately. Tokens added after the pool token has been cancelled are ignored.
     */
    add(token) {
        if (this._isDone) {
            return;
        }
        this._total++;
        if (token.isCancellationRequested) {
            this._cancelled++;
            this._check();
            return;
        }
        const d = token.onCancellationRequested(() => {
            d.dispose();
            this._cancelled++;
            this._check();
        });
        this._listeners.add(d);
    }
    _check() {
        if (!this._isDone && this._total > 0 && this._total === this._cancelled) {
            this._isDone = true;
            this._listeners.dispose();
            this._source.cancel();
        }
    }
    dispose() {
        this._listeners.dispose();
        this._source.dispose();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2FuY2VsbGF0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sWUFBWSxDQUFDO0FBQzVDLE9BQU8sRUFBRSxlQUFlLEVBQWUsTUFBTSxnQkFBZ0IsQ0FBQztBQW9COUQsTUFBTSxhQUFhLEdBQWdCLE1BQU0sQ0FBQyxNQUFNLENBQUMsVUFBVSxRQUFRLEVBQUUsT0FBUTtJQUM1RSxNQUFNLE1BQU0sR0FBRyxVQUFVLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUNyRCxPQUFPLEVBQUUsT0FBTyxLQUFLLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0FBQ2hELENBQUMsQ0FBQyxDQUFDO0FBRUgsTUFBTSxLQUFXLGlCQUFpQixDQTBCakM7QUExQkQsV0FBaUIsaUJBQWlCO0lBRWpDLFNBQWdCLG1CQUFtQixDQUFDLEtBQWM7UUFDakQsSUFBSSxLQUFLLEtBQUssaUJBQWlCLENBQUMsSUFBSSxJQUFJLEtBQUssS0FBSyxpQkFBaUIsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMvRSxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxJQUFJLEtBQUssWUFBWSxZQUFZLEVBQUUsQ0FBQztZQUNuQyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxJQUFJLENBQUMsS0FBSyxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3pDLE9BQU8sS0FBSyxDQUFDO1FBQ2QsQ0FBQztRQUNELE9BQU8sT0FBUSxLQUEyQixDQUFDLHVCQUF1QixLQUFLLFNBQVM7ZUFDNUUsT0FBUSxL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