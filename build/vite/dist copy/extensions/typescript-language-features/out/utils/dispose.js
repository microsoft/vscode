"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.DisposableStore = exports.Disposable = void 0;
exports.disposeAll = disposeAll;
function disposeAll(disposables) {
    const errors = [];
    for (const disposable of disposables) {
        try {
            disposable.dispose();
        }
        catch (e) {
            errors.push(e);
        }
    }
    if (errors.length === 1) {
        throw errors[0];
    }
    else if (errors.length > 1) {
        throw new AggregateError(errors, 'Encountered errors while disposing of store');
    }
}
class Disposable {
    _isDisposed = false;
    _disposables = [];
    dispose() {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        disposeAll(this._disposables);
    }
    _register(value) {
        if (this._isDisposed) {
            value.dispose();
        }
        else {
            this._disposables.push(value);
        }
        return value;
    }
    get isDisposed() {
        return this._isDisposed;
    }
}
exports.Disposable = Disposable;
class DisposableStore extends Disposable {
    add(disposable) {
        this._register(disposable);
        return disposable;
    }
}
exports.DisposableStore = DisposableStore;
//# sourceMappingURL=dispose.js.map