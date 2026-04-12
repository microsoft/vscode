"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BetterTokenStorage = void 0;
const logger_1 = __importDefault(require("./logger"));
const vscode_1 = require("vscode");
class BetterTokenStorage {
    keylistKey;
    // set before and after _tokensPromise is set so getTokens can handle multiple operations.
    _operationInProgress = false;
    // the current state. Don't use this directly and call getTokens() so that you ensure you
    // have awaited for all operations.
    _tokensPromise = Promise.resolve(new Map());
    // The vscode SecretStorage instance for this extension.
    _secretStorage;
    _didChangeInOtherWindow = new vscode_1.EventEmitter();
    onDidChangeInOtherWindow = this._didChangeInOtherWindow.event;
    /**
     *
     * @param keylistKey The key in the secret storage that will hold the list of keys associated with this instance of BetterTokenStorage
     * @param context the vscode Context used to register disposables and retreive the vscode.SecretStorage for this instance of VS Code
     */
    constructor(keylistKey, context) {
        this.keylistKey = keylistKey;
        this._secretStorage = context.secrets;
        context.subscriptions.push(context.secrets.onDidChange((e) => this.handleSecretChange(e)));
        this.initialize();
    }
    initialize() {
        this._operationInProgress = true;
        this._tokensPromise = new Promise((resolve, _) => {
            this._secretStorage.get(this.keylistKey).then(keyListStr => {
                if (!keyListStr) {
                    resolve(new Map());
                    return;
                }
                const keyList = JSON.parse(keyListStr);
                // Gather promises that contain key value pairs our of secret storage
                const promises = keyList.map(key => new Promise((res, rej) => {
                    this._secretStorage.get(key).then((value) => {
                        res({ key, value });
                    }, rej);
                }));
                Promise.allSettled(promises).then((results => {
                    const tokens = new Map();
                    results.forEach(p => {
                        if (p.status === 'fulfilled' && p.value.value) {
                            const secret = this.parseSecret(p.value.value);
                            tokens.set(p.value.key, secret);
                        }
                        else if (p.status === 'rejected') {
                            logger_1.default.error(p.reason);
                        }
                        else {
                            logger_1.default.error('Key was not found in SecretStorage.');
                        }
                    });
                    resolve(tokens);
                }));
            }, err => {
                logger_1.default.error(err);
                resolve(new Map());
            });
        });
        this._operationInProgress = false;
    }
    async get(key) {
        const tokens = await this.getTokens();
        return tokens.get(key);
    }
    async getAll(predicate) {
        const tokens = await this.getTokens();
        const values = new Array();
        for (const [_, value] of tokens) {
            if (!predicate || predicate(value)) {
                values.push(value);
            }
        }
        return values;
    }
    async store(key, value) {
        const tokens = await this.getTokens();
        const isAddition = !tokens.has(key);
        tokens.set(key, value);
        const valueStr = this.serializeSecret(value);
        this._operationInProgress = true;
        this._tokensPromise = new Promise((resolve, _) => {
            const promises = [this._secretStorage.store(key, valueStr)];
            // if we are adding a secret we need to update the keylist too
            if (isAddition) {
                promises.push(this.updateKeyList(tokens));
            }
            Promise.allSettled(promises).then(results => {
                results.forEach(r => {
                    if (r.status === 'rejected') {
                        logger_1.default.error(r.reason);
                    }
                });
                resolve(tokens);
            });
        });
        this._operationInProgress = false;
    }
    async delete(key) {
        const tokens = await this.getTokens();
        if (!tokens.has(key)) {
            return;
        }
        tokens.delete(key);
        this._operationInProgress = true;
        this._tokensPromise = new Promise((resolve, _) => {
            Promise.allSettled([
                this._secretStorage.delete(key),
                this.updateKeyList(tokens)
            ]).then(results => {
                results.forEach(r => {
                    if (r.status === 'rejected') {
                        logger_1.default.error(r.reason);
                    }
                });
                resolve(tokens);
            });
        });
        this._operationInProgress = false;
    }
    async deleteAll(predicate) {
        const tokens = await this.getTokens();
        const promises = [];
        for (const [key, value] of tokens) {
            if (!predicate || predicate(value)) {
                promises.push(this.delete(key));
            }
        }
        await Promise.all(promises);
    }
    async updateKeyList(tokens) {
        const keyList = [];
        for (const [key] of tokens) {
            keyList.push(key);
        }
        const keyListStr = JSON.stringify(keyList);
        await this._secretStorage.store(this.keylistKey, keyListStr);
    }
    parseSecret(secret) {
        return JSON.parse(secret);
    }
    serializeSecret(secret) {
        return JSON.stringify(secret);
    }
    // This is the one way to get tokens to ensure all other operations that
    // came before you have been processed.
    async getTokens() {
        let tokens;
        do {
            tokens = await this._tokensPromise;
        } while (this._operationInProgress);
        return tokens;
    }
    // This is a crucial function that handles whether or not the token has changed in
    // a different window of VS Code and sends the necessary event if it has.
    // Scenarios this should cover:
    // * Added in another window
    // * Updated in another window
    // * Deleted in another window
    // * Added in this window
    // * Updated in this window
    // * Deleted in this window
    async handleSecretChange(e) {
        const key = e.key;
        // The KeyList is only a list of keys to aid initial start up of VS Code to know which
        // Keys are associated with this handler.
        if (key === this.keylistKey) {
            return;
        }
        const tokens = await this.getTokens();
        this._operationInProgress = true;
        this._tokensPromise = new Promise((resolve, _) => {
            this._secretStorage.get(key).then(storageSecretStr => {
                if (!storageSecretStr) {
                    // true -> secret was deleted in another window
                    // false -> secret was deleted in this window
                    if (tokens.has(key)) {
                        const value = tokens.get(key);
                        tokens.delete(key);
                        this._didChangeInOtherWindow.fire({ added: [], updated: [], removed: [{ key, value }] });
                    }
                    return tokens;
                }
                const storageSecret = this.parseSecret(storageSecretStr);
                const cachedSecret = tokens.get(key);
                if (!cachedSecret) {
                    // token was added in another window
                    tokens.set(key, storageSecret);
                    this._didChangeInOtherWindow.fire({ added: [key], updated: [], removed: [] });
                    return tokens;
                }
                const cachedSecretStr = this.serializeSecret(cachedSecret);
                if (storageSecretStr !== cachedSecretStr) {
                    // token was updated in another window
                    tokens.set(key, storageSecret);
                    this._didChangeInOtherWindow.fire({ added: [], updated: [key], removed: [] });
                }
                // what's in our token cache and what's in storage must be the same
                // which means this should cover the last two scenarios of
                // Added in this window & Updated in this window.
                return tokens;
            }, err => {
                logger_1.default.error(err);
                return tokens;
            }).then(resolve);
        });
        this._operationInProgress = false;
    }
}
exports.BetterTokenStorage = BetterTokenStorage;
//# sourceMappingURL=betterSecretStorage.js.map