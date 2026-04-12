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
exports.VersionStatus = void 0;
const vscode = __importStar(require("vscode"));
const selectTypeScriptVersion_1 = require("../commands/selectTypeScriptVersion");
const languageIds_1 = require("../configuration/languageIds");
const dispose_1 = require("../utils/dispose");
class VersionStatus extends dispose_1.Disposable {
    _client;
    _statusItem;
    constructor(_client) {
        super();
        this._client = _client;
        this._statusItem = this._register(vscode.languages.createLanguageStatusItem('typescript.version', languageIds_1.jsTsLanguageModes));
        this._statusItem.name = vscode.l10n.t("TypeScript Version");
        this._statusItem.detail = vscode.l10n.t("TypeScript version");
        this._register(this._client.onTsServerStarted(({ version }) => this.onDidChangeTypeScriptVersion(version)));
    }
    onDidChangeTypeScriptVersion(version) {
        this._statusItem.text = version.displayName;
        this._statusItem.command = {
            command: selectTypeScriptVersion_1.SelectTypeScriptVersionCommand.id,
            title: vscode.l10n.t("Select Version"),
            tooltip: version.path
        };
    }
}
exports.VersionStatus = VersionStatus;
//# sourceMappingURL=versionStatus.js.map