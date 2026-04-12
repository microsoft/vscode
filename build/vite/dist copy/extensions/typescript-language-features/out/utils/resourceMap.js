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
exports.ResourceMap = void 0;
const fileSchemes = __importStar(require("../configuration/fileSchemes"));
const fs_1 = require("./fs");
/**
 * Maps of file resources
 *
 * Attempts to handle correct mapping on both case sensitive and case in-sensitive
 * file systems.
 */
class ResourceMap {
    _normalizePath;
    config;
    static defaultPathNormalizer = (resource) => {
        if (resource.scheme === fileSchemes.file) {
            return resource.fsPath;
        }
        return resource.toString(true);
    };
    _map = new Map();
    constructor(_normalizePath = ResourceMap.defaultPathNormalizer, config) {
        this._normalizePath = _normalizePath;
        this.config = config;
    }
    get size() {
        return this._map.size;
    }
    has(resource) {
        const file = this.toKey(resource);
        return !!file && this._map.has(file);
    }
    get(resource) {
        const file = this.toKey(resource);
        if (!file) {
            return undefined;
        }
        const entry = this._map.get(file);
        return entry ? entry.value : undefined;
    }
    set(resource, value) {
        const file = this.toKey(resource);
        if (!file) {
            return;
        }
        const entry = this._map.get(file);
        if (entry) {
            entry.value = value;
        }
        else {
            this._map.set(file, { resource, value });
        }
    }
    delete(resource) {
        const file = this.toKey(resource);
        if (file) {
            this._map.delete(file);
        }
    }
    clear() {
        this._map.clear();
    }
    values() {
        return Array.from(this._map.values(), x => x.value);
    }
    entries() {
        return this._map.values();
    }
    toKey(resource) {
        const key = this._normalizePath(resource);
        if (!key) {
            return key;
        }
        return this.isCaseInsensitivePath(key) ? key.toLowerCase() : key;
    }
    isCaseInsensitivePath(path) {
        if ((0, fs_1.looksLikeAbsoluteWindowsPath)(path)) {
            return true;
        }
        return path[0] === '/' && this.config.onCaseInsensitiveFileSystem;
    }
}
exports.ResourceMap = ResourceMap;
//# sourceMappingURL=resourceMap.js.map