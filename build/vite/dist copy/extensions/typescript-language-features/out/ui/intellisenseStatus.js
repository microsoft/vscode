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
exports.IntellisenseStatus = void 0;
const vscode = __importStar(require("vscode"));
const languageIds_1 = require("../configuration/languageIds");
const tsconfig_1 = require("../tsconfig");
const typescriptService_1 = require("../typescriptService");
const dispose_1 = require("../utils/dispose");
var IntellisenseState;
(function (IntellisenseState) {
    IntellisenseState.None = Object.freeze({ type: 0 /* Type.None */ });
    IntellisenseState.SyntaxOnly = Object.freeze({ type: 3 /* Type.SyntaxOnly */ });
    class Pending {
        resource;
        projectType;
        type = 1 /* Type.Pending */;
        cancellation = new vscode.CancellationTokenSource();
        constructor(resource, projectType) {
            this.resource = resource;
            this.projectType = projectType;
        }
    }
    IntellisenseState.Pending = Pending;
    class Resolved {
        resource;
        projectType;
        configFile;
        type = 2 /* Type.Resolved */;
        constructor(resource, projectType, configFile) {
            this.resource = resource;
            this.projectType = projectType;
            this.configFile = configFile;
        }
    }
    IntellisenseState.Resolved = Resolved;
})(IntellisenseState || (IntellisenseState = {}));
class IntellisenseStatus extends dispose_1.Disposable {
    _client;
    _activeTextEditorManager;
    openOpenConfigCommandId = '_typescript.openConfig';
    createOrOpenConfigCommandId = '_typescript.createOrOpenConfig';
    _statusItem;
    _ready = false;
    _state = IntellisenseState.None;
    constructor(_client, commandManager, _activeTextEditorManager) {
        super();
        this._client = _client;
        this._activeTextEditorManager = _activeTextEditorManager;
        commandManager.register({
            id: this.openOpenConfigCommandId,
            execute: async (...[root, projectType]) => {
                if (this._state.type === 2 /* IntellisenseState.Type.Resolved */) {
                    await (0, tsconfig_1.openProjectConfigOrPromptToCreate)(projectType, this._client, root, this._state.configFile);
                }
                else if (this._state.type === 1 /* IntellisenseState.Type.Pending */) {
                    await (0, tsconfig_1.openProjectConfigForFile)(projectType, this._client, this._state.resource);
                }
            },
        });
        commandManager.register({
            id: this.createOrOpenConfigCommandId,
            execute: async (...[root, projectType]) => {
                await (0, tsconfig_1.openOrCreateConfig)(this._client.apiVersion, projectType, root, this._client.configuration);
            },
        });
        _activeTextEditorManager.onDidChangeActiveJsTsEditor(this.updateStatus, this, this._disposables);
        this._client.onReady(() => {
            this._ready = true;
            this.updateStatus();
        });
    }
    dispose() {
        super.dispose();
        this._statusItem?.dispose();
    }
    async updateStatus() {
        const doc = this._activeTextEditorManager.activeJsTsEditor?.document;
        if (!doc || !(0, languageIds_1.isSupportedLanguageMode)(doc)) {
            this.updateState(IntellisenseState.None);
            return;
        }
        if (!this._client.hasCapabilityForResource(doc.uri, typescriptService_1.ClientCapability.Semantic)) {
            this.updateState(IntellisenseState.SyntaxOnly);
            return;
        }
        const file = this._client.toOpenTsFilePath(doc, { suppressAlertOnFailure: true });
        if (!file) {
            this.updateState(IntellisenseState.None);
            return;
        }
        if (!this._ready) {
            return;
        }
        const projectType = (0, languageIds_1.isTypeScriptDocument)(doc) ? 0 /* ProjectType.TypeScript */ : 1 /* ProjectType.JavaScript */;
        const pendingState = new IntellisenseState.Pending(doc.uri, projectType);
        this.updateState(pendingState);
        const response = await this._client.execute('projectInfo', { file, needFileNameList: false }, pendingState.cancellation.token);
        if (response.type === 'response' && response.body) {
            if (this._state === pendingState) {
                this.updateState(new IntellisenseState.Resolved(doc.uri, projectType, response.body.configFileName));
            }
        }
    }
    updateState(newState) {
        if (this._state === newState) {
            return;
        }
        if (this._state.type === 1 /* IntellisenseState.Type.Pending */) {
            this._state.cancellation.cancel();
            this._state.cancellation.dispose();
        }
        this._state = newState;
        switch (this._state.type) {
            case 0 /* IntellisenseState.Type.None */: {
                this._statusItem?.dispose();
                this._statusItem = undefined;
                break;
            }
            case 1 /* IntellisenseState.Type.Pending */: {
                const statusItem = this.ensureStatusItem();
                statusItem.severity = vscode.LanguageStatusSeverity.Information;
                statusItem.text = vscode.l10n.t("Loading IntelliSense status");
                statusItem.detail = undefined;
                statusItem.command = undefined;
                statusItem.busy = true;
                break;
            }
            case 2 /* IntellisenseState.Type.Resolved */: {
                const noConfigFileText = this._state.projectType === 0 /* ProjectType.TypeScript */
                    ? vscode.l10n.t("No tsconfig")
                    : vscode.l10n.t("No jsconfig");
                const rootPath = this._client.getWorkspaceRootForResource(this._state.resource);
                if (!rootPath) {
                    if (this._statusItem) {
                        this._statusItem.text = noConfigFileText;
                        this._statusItem.detail = !vscode.workspace.workspaceFolders
                            ? vscode.l10n.t("No opened folders")
                            : vscode.l10n.t("File is not part opened folders");
                        this._statusItem.busy = false;
                    }
                    return;
                }
                const statusItem = this.ensureStatusItem();
                statusItem.busy = false;
                statusItem.detail = undefined;
                statusItem.severity = vscode.LanguageStatusSeverity.Information;
                if ((0, tsconfig_1.isImplicitProjectConfigFile)(this._state.configFile)) {
                    statusItem.text = noConfigFileText;
                    statusItem.detail = undefined;
                    statusItem.command = {
                        command: this.createOrOpenConfigCommandId,
                        title: this._state.projectType === 0 /* ProjectType.TypeScript */
                            ? vscode.l10n.t("Configure TSConfig")
                            : vscode.l10n.t("Configure JSConfig"),
                        arguments: [rootPath, this._state.projectType],
                    };
                }
                else {
                    statusItem.text = vscode.workspace.asRelativePath(this._state.configFile);
                    statusItem.detail = undefined;
                    statusItem.command = {
                        command: this.openOpenConfigCommandId,
                        title: vscode.l10n.t("Open Config File"),
                        arguments: [rootPath, this._state.projectType],
                    };
                }
                break;
            }
            case 3 /* IntellisenseState.Type.SyntaxOnly */: {
                const statusItem = this.ensureStatusItem();
                statusItem.severity = vscode.LanguageStatusSeverity.Warning;
                statusItem.text = vscode.l10n.t("Partial mode");
                statusItem.detail = vscode.l10n.t("Project wide IntelliSense not available");
                statusItem.busy = false;
                statusItem.command = {
                    title: vscode.l10n.t("Learn More"),
                    command: 'vscode.open',
                    arguments: [
                        vscode.Uri.parse('https://aka.ms/vscode/jsts/partial-mode'),
                    ]
                };
                break;
            }
        }
    }
    ensureStatusItem() {
        if (!this._statusItem) {
            this._statusItem = vscode.languages.createLanguageStatusItem('typescript.projectStatus', languageIds_1.jsTsLanguageModes);
            this._statusItem.name = vscode.l10n.t("JS/TS IntelliSense Status");
        }
        return this._statusItem;
    }
}
exports.IntellisenseStatus = IntellisenseStatus;
//# sourceMappingURL=intellisenseStatus.js.map