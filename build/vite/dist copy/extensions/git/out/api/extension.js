"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitExtensionImpl = void 0;
const api1_1 = require("./api1");
const vscode_1 = require("vscode");
function deprecated(_target, key, descriptor) {
    if (typeof descriptor.value !== 'function') {
        throw new Error('not supported');
    }
    const original = descriptor.value;
    descriptor.value = function (...args) {
        console.warn(`Git extension API method '${String(key)}' is deprecated.`);
        return original.apply(this, args);
    };
}
class GitExtensionImpl {
    enabled = false;
    _onDidChangeEnablement = new vscode_1.EventEmitter();
    onDidChangeEnablement = this._onDidChangeEnablement.event;
    _model = undefined;
    _cloneManager = undefined;
    set model(model) {
        this._model = model;
        const enabled = !!model;
        if (this.enabled === enabled) {
            return;
        }
        this.enabled = enabled;
        this._onDidChangeEnablement.fire(this.enabled);
    }
    get model() {
        return this._model;
    }
    set cloneManager(cloneManager) {
        this._cloneManager = cloneManager;
    }
    constructor(privates) {
        if (privates) {
            this.enabled = true;
            this._model = privates.model;
            this._cloneManager = privates.cloneManager;
        }
    }
    async getGitPath() {
        if (!this._model) {
            throw new Error('Git model not found');
        }
        return this._model.git.path;
    }
    async getRepositories() {
        if (!this._model) {
            throw new Error('Git model not found');
        }
        return this._model.repositories.map(repository => new api1_1.ApiRepository(repository));
    }
    getAPI(version) {
        if (!this._model || !this._cloneManager) {
            throw new Error('Git model not found');
        }
        if (version !== 1) {
            throw new Error(`No API version ${version} found.`);
        }
        return new api1_1.ApiImpl({ model: this._model, cloneManager: this._cloneManager });
    }
}
exports.GitExtensionImpl = GitExtensionImpl;
__decorate([
    deprecated
], GitExtensionImpl.prototype, "getGitPath", null);
__decorate([
    deprecated
], GitExtensionImpl.prototype, "getRepositories", null);
//# sourceMappingURL=extension.js.map