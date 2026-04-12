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
exports.LogLevelMonitor = void 0;
const vscode = __importStar(require("vscode"));
const configuration_1 = require("../configuration/configuration");
const configuration_2 = require("../utils/configuration");
const dispose_1 = require("../utils/dispose");
class LogLevelMonitor extends dispose_1.Disposable {
    context;
    static logLevelChangedStorageKey = 'typescript.tsserver.logLevelChanged';
    static doNotPromptLogLevelStorageKey = 'typescript.tsserver.doNotPromptLogLevel';
    _logLevel;
    constructor(context) {
        super();
        this.context = context;
        this._logLevel = this._register(new configuration_2.UnifiedConfigValue('tsserver.log', 'off', { fallbackSection: 'typescript' }));
        this._register(this._logLevel.onDidChange(() => {
            this.context.globalState.update(LogLevelMonitor.logLevelChangedStorageKey, new Date());
        }));
        if (this.shouldNotifyExtendedLogging()) {
            this.notifyExtendedLogging();
        }
    }
    get logLevel() {
        return configuration_1.TsServerLogLevel.fromString(this._logLevel.getValue());
    }
    /**
     * Last date change if it exists and can be parsed as a date,
     * otherwise undefined.
     */
    get lastLogLevelChange() {
        const lastChange = this.context.globalState.get(LogLevelMonitor.logLevelChangedStorageKey);
        if (lastChange) {
            const date = new Date(lastChange);
            if (date instanceof Date && !isNaN(date.valueOf())) {
                return date;
            }
        }
        return undefined;
    }
    get doNotPrompt() {
        return this.context.globalState.get(LogLevelMonitor.doNotPromptLogLevelStorageKey) || false;
    }
    shouldNotifyExtendedLogging() {
        const lastChangeMilliseconds = this.lastLogLevelChange ? new Date(this.lastLogLevelChange).valueOf() : 0;
        const lastChangePlusOneWeek = new Date(lastChangeMilliseconds + /* 7 days in milliseconds */ 86400000 * 7);
        if (!this.doNotPrompt && this.logLevel !== configuration_1.TsServerLogLevel.Off && lastChangePlusOneWeek.valueOf() < Date.now()) {
            return true;
        }
        return false;
    }
    notifyExtendedLogging() {
        vscode.window.showInformationMessage(vscode.l10n.t("TS Server logging is currently enabled which may impact performance."), {
            title: vscode.l10n.t("Disable logging"),
            choice: 0 /* Choice.DisableLogging */
        }, {
            title: vscode.l10n.t("Don't show again"),
            choice: 1 /* Choice.DoNotShowAgain */
        })
            .then(selection => {
            if (!selection) {
                return;
            }
            if (selection.choice === 0 /* Choice.DisableLogging */) {
                return vscode.workspace.getConfiguration().update(`${configuration_2.unifiedConfigSection}.tsserver.log`, 'off', true);
            }
            else if (selection.choice === 1 /* Choice.DoNotShowAgain */) {
                return this.context.globalState.update(LogLevelMonitor.doNotPromptLogLevelStorageKey, true);
            }
            return;
        });
    }
}
exports.LogLevelMonitor = LogLevelMonitor;
//# sourceMappingURL=logLevelMonitor.js.map