"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Keychain = void 0;
class Keychain {
    context;
    serviceId;
    Logger;
    constructor(context, serviceId, Logger) {
        this.context = context;
        this.serviceId = serviceId;
        this.Logger = Logger;
    }
    async setToken(token) {
        try {
            return await this.context.secrets.store(this.serviceId, token);
        }
        catch (e) {
            // Ignore
            this.Logger.error(`Setting token failed: ${e}`);
        }
    }
    async getToken() {
        try {
            const secret = await this.context.secrets.get(this.serviceId);
            if (secret && secret !== '[]') {
                this.Logger.trace('Token acquired from secret storage.');
            }
            return secret;
        }
        catch (e) {
            // Ignore
            this.Logger.error(`Getting token failed: ${e}`);
            return Promise.resolve(undefined);
        }
    }
    async deleteToken() {
        try {
            return await this.context.secrets.delete(this.serviceId);
        }
        catch (e) {
            // Ignore
            this.Logger.error(`Deleting token failed: ${e}`);
            return Promise.resolve(undefined);
        }
    }
}
exports.Keychain = Keychain;
//# sourceMappingURL=keychain.js.map