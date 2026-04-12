"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScopedAccountAccess = void 0;
const vscode_1 = require("vscode");
class ScopedAccountAccess {
    _accountAccessSecretStorage;
    _onDidAccountAccessChangeEmitter = new vscode_1.EventEmitter();
    onDidAccountAccessChange = this._onDidAccountAccessChangeEmitter.event;
    value = new Array();
    _disposable;
    constructor(_accountAccessSecretStorage, disposables = []) {
        this._accountAccessSecretStorage = _accountAccessSecretStorage;
        this._disposable = vscode_1.Disposable.from(...disposables, this._onDidAccountAccessChangeEmitter, this._accountAccessSecretStorage.onDidChange(() => this.update()));
    }
    static async create(secretStorage, cloudName, logger, migrations) {
        const storage = await AccountAccessSecretStorage.create(secretStorage, cloudName, logger, migrations);
        const access = new ScopedAccountAccess(storage, [storage]);
        await access.initialize();
        return access;
    }
    dispose() {
        this._disposable.dispose();
    }
    async initialize() {
        await this.update();
    }
    isAllowedAccess(account) {
        return this.value.includes(account.homeAccountId);
    }
    async setAllowedAccess(account, allowed) {
        if (allowed) {
            if (this.value.includes(account.homeAccountId)) {
                return;
            }
            await this._accountAccessSecretStorage.store([...this.value, account.homeAccountId]);
            return;
        }
        await this._accountAccessSecretStorage.store(this.value.filter(id => id !== account.homeAccountId));
    }
    async update() {
        const current = new Set(this.value);
        const value = await this._accountAccessSecretStorage.get();
        this.value = value ?? [];
        if (current.size !== this.value.length || !this.value.every(id => current.has(id))) {
            this._onDidAccountAccessChangeEmitter.fire();
        }
    }
}
exports.ScopedAccountAccess = ScopedAccountAccess;
class AccountAccessSecretStorage {
    _secretStorage;
    _cloudName;
    _logger;
    _migrations;
    _disposable;
    _onDidChangeEmitter = new vscode_1.EventEmitter();
    onDidChange = this._onDidChangeEmitter.event;
    _key;
    constructor(_secretStorage, _cloudName, _logger, _migrations) {
        this._secretStorage = _secretStorage;
        this._cloudName = _cloudName;
        this._logger = _logger;
        this._migrations = _migrations;
        this._key = `accounts-${this._cloudName}`;
        this._disposable = vscode_1.Disposable.from(this._onDidChangeEmitter, this._secretStorage.onDidChange(e => {
            if (e.key === this._key) {
                this._onDidChangeEmitter.fire();
            }
        }));
    }
    static async create(secretStorage, cloudName, logger, migrations) {
        const storage = new AccountAccessSecretStorage(secretStorage, cloudName, logger, migrations);
        await storage.initialize();
        return storage;
    }
    /**
     * TODO: Remove this method after a release with the migration
     */
    async initialize() {
        if (!this._migrations) {
            return;
        }
        const current = await this.get();
        // If the secret storage already has the new key, we have already run the migration
        if (current) {
            return;
        }
        try {
            const allValues = new Set();
            for (const { clientId, authority } of this._migrations) {
                const oldKey = `accounts-${this._cloudName}-${clientId}-${authority}`;
                const value = await this._secretStorage.get(oldKey);
                if (value) {
                    const parsed = JSON.parse(value);
                    parsed.forEach(v => allValues.add(v));
                }
            }
            if (allValues.size > 0) {
                await this.store(Array.from(allValues));
            }
        }
        catch (e) {
            // Migration is best effort
            this._logger.error(`Failed to migrate account access secret storage: ${e}`);
        }
    }
    async get() {
        const value = await this._secretStorage.get(this._key);
        if (!value) {
            return undefined;
        }
        return JSON.parse(value);
    }
    store(value) {
        return this._secretStorage.store(this._key, JSON.stringify(value));
    }
    delete() {
        return this._secretStorage.delete(this._key);
    }
    dispose() {
        this._disposable.dispose();
    }
}
//# sourceMappingURL=accountAccess.js.map