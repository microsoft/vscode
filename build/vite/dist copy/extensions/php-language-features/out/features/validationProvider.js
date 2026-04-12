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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LineDecoder = void 0;
const cp = __importStar(require("child_process"));
const string_decoder_1 = require("string_decoder");
const which_1 = __importDefault(require("which"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const async_1 = require("./utils/async");
class LineDecoder {
    stringDecoder;
    remaining;
    constructor(encoding = 'utf8') {
        this.stringDecoder = new string_decoder_1.StringDecoder(encoding);
        this.remaining = null;
    }
    write(buffer) {
        const result = [];
        const value = this.remaining
            ? this.remaining + this.stringDecoder.write(buffer)
            : this.stringDecoder.write(buffer);
        if (value.length < 1) {
            return result;
        }
        let start = 0;
        let ch;
        while (start < value.length && ((ch = value.charCodeAt(start)) === 13 || ch === 10)) {
            start++;
        }
        let idx = start;
        while (idx < value.length) {
            ch = value.charCodeAt(idx);
            if (ch === 13 || ch === 10) {
                result.push(value.substring(start, idx));
                idx++;
                while (idx < value.length && ((ch = value.charCodeAt(idx)) === 13 || ch === 10)) {
                    idx++;
                }
                start = idx;
            }
            else {
                idx++;
            }
        }
        this.remaining = start < value.length ? value.substr(start) : null;
        return result;
    }
    end() {
        return this.remaining;
    }
}
exports.LineDecoder = LineDecoder;
var RunTrigger;
(function (RunTrigger) {
    RunTrigger[RunTrigger["onSave"] = 0] = "onSave";
    RunTrigger[RunTrigger["onType"] = 1] = "onType";
})(RunTrigger || (RunTrigger = {}));
(function (RunTrigger) {
    RunTrigger.strings = {
        onSave: 'onSave',
        onType: 'onType'
    };
    RunTrigger.from = function (value) {
        if (value === 'onType') {
            return RunTrigger.onType;
        }
        else {
            return RunTrigger.onSave;
        }
    };
})(RunTrigger || (RunTrigger = {}));
class PHPValidationProvider {
    static MatchExpression = /(?:(?:Parse|Fatal) error): (.*)(?: in )(.*?)(?: on line )(\d+)/;
    static BufferArgs = ['-l', '-n', '-d', 'display_errors=On', '-d', 'log_errors=Off'];
    static FileArgs = ['-l', '-n', '-d', 'display_errors=On', '-d', 'log_errors=Off', '-f'];
    validationEnabled;
    pauseValidation;
    config;
    loadConfigP;
    documentListener = null;
    diagnosticCollection;
    delayers;
    constructor() {
        this.validationEnabled = true;
        this.pauseValidation = false;
        this.loadConfigP = this.loadConfiguration();
    }
    activate(subscriptions) {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection();
        subscriptions.push(this);
        subscriptions.push(vscode.workspace.onDidChangeConfiguration(() => this.loadConfigP = this.loadConfiguration()));
        vscode.workspace.onDidOpenTextDocument(this.triggerValidate, this, subscriptions);
        vscode.workspace.onDidCloseTextDocument((textDocument) => {
            this.diagnosticCollection.delete(textDocument.uri);
            if (this.delayers) {
                delete this.delayers[textDocument.uri.toString()];
            }
        }, null, subscriptions);
    }
    dispose() {
        if (this.diagnosticCollection) {
            this.diagnosticCollection.clear();
            this.diagnosticCollection.dispose();
        }
        if (this.documentListener) {
            this.documentListener.dispose();
            this.documentListener = null;
        }
    }
    async loadConfiguration() {
        const section = vscode.workspace.getConfiguration();
        const oldExecutable = this.config?.executable;
        this.validationEnabled = section.get("php.validate.enable" /* Setting.Enable */, true);
        this.config = await getConfig();
        this.delayers = Object.create(null);
        if (this.pauseValidation) {
            this.pauseValidation = oldExecutable === this.config.executable;
        }
        if (this.documentListener) {
            this.documentListener.dispose();
            this.documentListener = null;
        }
        this.diagnosticCollection.clear();
        if (this.validationEnabled) {
            if (this.config.trigger === RunTrigger.onType) {
                this.documentListener = vscode.workspace.onDidChangeTextDocument((e) => {
                    this.triggerValidate(e.document);
                });
            }
            else {
                this.documentListener = vscode.workspace.onDidSaveTextDocument(this.triggerValidate, this);
            }
            // Configuration has changed. Reevaluate all documents.
            vscode.workspace.textDocuments.forEach(this.triggerValidate, this);
        }
    }
    async triggerValidate(textDocument) {
        await this.loadConfigP;
        if (textDocument.languageId !== 'php' || this.pauseValidation || !this.validationEnabled) {
            return;
        }
        if (vscode.workspace.isTrusted) {
            const key = textDocument.uri.toString();
            let delayer = this.delayers[key];
            if (!delayer) {
                delayer = new async_1.ThrottledDelayer(this.config?.trigger === RunTrigger.onType ? 250 : 0);
                this.delayers[key] = delayer;
            }
            delayer.trigger(() => this.doValidate(textDocument));
        }
    }
    doValidate(textDocument) {
        return new Promise(resolve => {
            const executable = this.config.executable;
            if (!executable) {
                this.showErrorMessage(vscode.l10n.t("Cannot validate since a PHP installation could not be found. Use the setting 'php.validate.executablePath' to configure the PHP executable."));
                this.pauseValidation = true;
                resolve();
                return;
            }
            if (!path.isAbsolute(executable)) {
                // executable should either be resolved to an absolute path or undefined.
                // This is just to be sure.
                return;
            }
            const decoder = new LineDecoder();
            const diagnostics = [];
            const processLine = (line) => {
                const matches = line.match(PHPValidationProvider.MatchExpression);
                if (matches) {
                    const message = matches[1];
                    const line = parseInt(matches[3]) - 1;
                    const diagnostic = new vscode.Diagnostic(new vscode.Range(line, 0, line, 2 ** 31 - 1), // See https://github.com/microsoft/vscode/issues/80288#issuecomment-650636442 for discussion
                    message);
                    diagnostics.push(diagnostic);
                }
            };
            const options = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) ? { cwd: vscode.workspace.workspaceFolders[0].uri.fsPath } : undefined;
            let args;
            if (this.config.trigger === RunTrigger.onSave) {
                args = PHPValidationProvider.FileArgs.slice(0);
                args.push(textDocument.fileName);
            }
            else {
                args = PHPValidationProvider.BufferArgs;
            }
            try {
                const childProcess = cp.spawn(executable, args, options);
                childProcess.on('error', (error) => {
                    if (this.pauseValidation) {
                        resolve();
                        return;
                    }
                    this.showError(error, executable);
                    this.pauseValidation = true;
                    resolve();
                });
                if (childProcess.pid) {
                    if (this.config.trigger === RunTrigger.onType) {
                        childProcess.stdin.write(textDocument.getText());
                        childProcess.stdin.end();
                    }
                    childProcess.stdout.on('data', (data) => {
                        decoder.write(data).forEach(processLine);
                    });
                    childProcess.stdout.on('end', () => {
                        const line = decoder.end();
                        if (line) {
                            processLine(line);
                        }
                        this.diagnosticCollection.set(textDocument.uri, diagnostics);
                        resolve();
                    });
                }
                else {
                    resolve();
                }
            }
            catch (error) {
                this.showError(error, executable);
            }
        });
    }
    async showError(error, executable) {
        let message = null;
        if (error.code === 'ENOENT') {
            if (this.config.executable) {
                message = vscode.l10n.t("Cannot validate since {0} is not a valid php executable. Use the setting 'php.validate.executablePath' to configure the PHP executable.", executable);
            }
            else {
                message = vscode.l10n.t("Cannot validate since no PHP executable is set. Use the setting 'php.validate.executablePath' to configure the PHP executable.");
            }
        }
        else {
            message = error.message ? error.message : vscode.l10n.t("Failed to run php using path: {0}. Reason is unknown.", executable);
        }
        if (!message) {
            return;
        }
        return this.showErrorMessage(message);
    }
    async showErrorMessage(message) {
        const openSettings = vscode.l10n.t("Open Settings");
        if (await vscode.window.showInformationMessage(message, openSettings) === openSettings) {
            vscode.commands.executeCommand('workbench.action.openSettings', "php.validate.executablePath" /* Setting.ExecutablePath */);
        }
    }
}
exports.default = PHPValidationProvider;
async function getConfig() {
    const section = vscode.workspace.getConfiguration();
    let executable;
    let executableIsUserDefined;
    const inspect = section.inspect("php.validate.executablePath" /* Setting.ExecutablePath */);
    if (inspect && inspect.workspaceValue) {
        executable = inspect.workspaceValue;
        executableIsUserDefined = false;
    }
    else if (inspect && inspect.globalValue) {
        executable = inspect.globalValue;
        executableIsUserDefined = true;
    }
    else {
        executable = undefined;
        executableIsUserDefined = undefined;
    }
    if (executable && !path.isAbsolute(executable)) {
        const first = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0];
        if (first) {
            executable = vscode.Uri.joinPath(first.uri, executable).fsPath;
        }
        else {
            executable = undefined;
        }
    }
    else if (!executable) {
        executable = await getPhpPath();
    }
    const trigger = RunTrigger.from(section.get("php.validate.run" /* Setting.Run */, RunTrigger.strings.onSave));
    return {
        executable,
        executableIsUserDefined,
        trigger
    };
}
async function getPhpPath() {
    try {
        return await (0, which_1.default)('php');
    }
    catch (e) {
        return undefined;
    }
}
//# sourceMappingURL=validationProvider.js.map