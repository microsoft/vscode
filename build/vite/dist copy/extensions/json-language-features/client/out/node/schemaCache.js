"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSONSchemaCache = void 0;
const fs_1 = require("fs");
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const MEMENTO_KEY = 'json-schema-cache';
class JSONSchemaCache {
    schemaCacheLocation;
    globalState;
    cacheInfo;
    constructor(schemaCacheLocation, globalState) {
        this.schemaCacheLocation = schemaCacheLocation;
        this.globalState = globalState;
        const infos = globalState.get(MEMENTO_KEY, {});
        const validated = {};
        for (const schemaUri in infos) {
            const { etag, fileName, updateTime } = infos[schemaUri];
            if (typeof etag === 'string' && typeof fileName === 'string' && typeof updateTime === 'number') {
                validated[schemaUri] = { etag, fileName, updateTime };
            }
        }
        this.cacheInfo = validated;
    }
    getETag(schemaUri) {
        return this.cacheInfo[schemaUri]?.etag;
    }
    getLastUpdatedInHours(schemaUri) {
        const updateTime = this.cacheInfo[schemaUri]?.updateTime;
        if (updateTime !== undefined) {
            return (new Date().getTime() - updateTime) / 1000 / 60 / 60;
        }
        return undefined;
    }
    async putSchema(schemaUri, etag, schemaContent) {
        try {
            const fileName = getCacheFileName(schemaUri);
            await fs_1.promises.writeFile(path.join(this.schemaCacheLocation, fileName), schemaContent);
            const entry = { etag, fileName, updateTime: new Date().getTime() };
            this.cacheInfo[schemaUri] = entry;
        }
        catch (e) {
            delete this.cacheInfo[schemaUri];
        }
        finally {
            await this.updateMemento();
        }
    }
    async getSchemaIfUpdatedSince(schemaUri, expirationDurationInHours) {
        const lastUpdatedInHours = this.getLastUpdatedInHours(schemaUri);
        if (lastUpdatedInHours !== undefined && (lastUpdatedInHours < expirationDurationInHours)) {
            return this.loadSchemaFile(schemaUri, this.cacheInfo[schemaUri], false);
        }
        return undefined;
    }
    async getSchema(schemaUri, etag, etagValid) {
        const cacheEntry = this.cacheInfo[schemaUri];
        if (cacheEntry) {
            if (cacheEntry.etag === etag) {
                return this.loadSchemaFile(schemaUri, cacheEntry, etagValid);
            }
            else {
                this.deleteSchemaFile(schemaUri, cacheEntry);
            }
        }
        return undefined;
    }
    async loadSchemaFile(schemaUri, cacheEntry, isUpdated) {
        const cacheLocation = path.join(this.schemaCacheLocation, cacheEntry.fileName);
        try {
            const content = (await fs_1.promises.readFile(cacheLocation)).toString();
            if (isUpdated) {
                cacheEntry.updateTime = new Date().getTime();
            }
            return content;
        }
        catch (e) {
            delete this.cacheInfo[schemaUri];
            return undefined;
        }
        finally {
            await this.updateMemento();
        }
    }
    async deleteSchemaFile(schemaUri, cacheEntry) {
        const cacheLocation = path.join(this.schemaCacheLocation, cacheEntry.fileName);
        delete this.cacheInfo[schemaUri];
        await this.updateMemento();
        try {
            await fs_1.promises.rm(cacheLocation);
        }
        catch (e) {
            // ignore
        }
    }
    // for debugging
    getCacheInfo() {
        return this.cacheInfo;
    }
    async updateMemento() {
        try {
            await this.globalState.update(MEMENTO_KEY, this.cacheInfo);
        }
        catch (e) {
            // ignore
        }
    }
    async clearCache() {
        const uris = Object.keys(this.cacheInfo);
        try {
            const files = await fs_1.promises.readdir(this.schemaCacheLocation);
            for (const file of files) {
                try {
                    await fs_1.promises.unlink(path.join(this.schemaCacheLocation, file));
                }
                catch (_e) {
                    // ignore
                }
            }
        }
        catch (e) {
            // ignore
        }
        finally {
            this.cacheInfo = {};
            await this.updateMemento();
        }
        return uris;
    }
}
exports.JSONSchemaCache = JSONSchemaCache;
function getCacheFileName(uri) {
    return `${(0, crypto_1.createHash)('sha256').update(uri).digest('hex')}.schema.json`;
}
//# sourceMappingURL=schemaCache.js.map