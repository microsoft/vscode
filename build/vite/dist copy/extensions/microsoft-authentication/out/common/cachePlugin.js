"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecretStorageCachePlugin = void 0;
const vscode_1 = require("vscode");
class SecretStorageCachePlugin {
    _secretStorage;
    _key;
    _onDidChange = new vscode_1.EventEmitter();
    onDidChange = this._onDidChange.event;
    _disposable;
    _value;
    constructor(_secretStorage, _key) {
        this._secretStorage = _secretStorage;
        this._key = _key;
        this._disposable = vscode_1.Disposable.from(this._onDidChange, this._registerChangeHandler());
    }
    _registerChangeHandler() {
        return this._secretStorage.onDidChange(e => {
            if (e.key === this._key) {
                this._onDidChange.fire();
            }
        });
    }
    async beforeCacheAccess(tokenCacheContext) {
        const data = await this._secretStorage.get(this._key);
        this._value = data;
        if (data) {
            tokenCacheContext.tokenCache.deserialize(data);
        }
    }
    async afterCacheAccess(tokenCacheContext) {
        if (tokenCacheContext.cacheHasChanged) {
            const value = tokenCacheContext.tokenCache.serialize();
            if (value !== this._value) {
                await this._secretStorage.store(this._key, value);
            }
        }
    }
    dispose() {
        this._disposable.dispose();
    }
}
exports.SecretStorageCachePlugin = SecretStorageCachePlugin;
//# sourceMappingURL=cachePlugin.js.map