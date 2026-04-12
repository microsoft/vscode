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
exports.NpmScriptLensProvider = void 0;
const path = __importStar(require("path"));
const vscode_1 = require("vscode");
const readScripts_1 = require("./readScripts");
const tasks_1 = require("./tasks");
const getFreshLensLocation = () => vscode_1.workspace.getConfiguration().get("debug.javascript.codelens.npmScripts" /* Constants.ConfigKey */);
/**
 * Npm script lens provider implementation. Can show a "Debug" text above any
 * npm script, or the npm scripts section.
 */
class NpmScriptLensProvider {
    lensLocation = getFreshLensLocation();
    changeEmitter = new vscode_1.EventEmitter();
    subscriptions = [];
    /**
     * @inheritdoc
     */
    onDidChangeCodeLenses = this.changeEmitter.event;
    constructor() {
        this.subscriptions.push(this.changeEmitter, vscode_1.workspace.onDidChangeConfiguration(evt => {
            if (evt.affectsConfiguration("debug.javascript.codelens.npmScripts" /* Constants.ConfigKey */)) {
                this.lensLocation = getFreshLensLocation();
                this.changeEmitter.fire();
            }
        }), vscode_1.languages.registerCodeLensProvider({
            language: 'json',
            pattern: '**/package.json',
        }, this));
    }
    /**
     * @inheritdoc
     */
    async provideCodeLenses(document) {
        if (this.lensLocation === 'never') {
            return [];
        }
        const tokens = (0, readScripts_1.readScripts)(document);
        if (!tokens) {
            return [];
        }
        const title = '$(debug-start) ' + vscode_1.l10n.t("Debug");
        const cwd = path.dirname(document.uri.fsPath);
        if (this.lensLocation === 'top') {
            return [
                new vscode_1.CodeLens(tokens.location.range, {
                    title,
                    command: 'extension.js-debug.npmScript',
                    arguments: [cwd],
                }),
            ];
        }
        if (this.lensLocation === 'all') {
            const folder = vscode_1.Uri.joinPath(document.uri, '..');
            return Promise.all(tokens.scripts.map(async ({ name, nameRange }) => {
                const runScriptCommand = await (0, tasks_1.getRunScriptCommand)(name, folder);
                return new vscode_1.CodeLens(nameRange, {
                    title,
                    command: 'extension.js-debug.createDebuggerTerminal',
                    arguments: [runScriptCommand.join(' '), vscode_1.workspace.getWorkspaceFolder(document.uri), { cwd }],
                });
            }));
        }
        return [];
    }
    /**
     * @inheritdoc
     */
    dispose() {
        this.subscriptions.forEach(s => s.dispose());
    }
}
exports.NpmScriptLensProvider = NpmScriptLensProvider;
//# sourceMappingURL=npmScriptLens.js.map