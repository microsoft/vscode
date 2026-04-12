"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.NpmScriptHoverProvider = void 0;
exports.invalidateHoverScriptsCache = invalidateHoverScriptsCache;
const path_1 = require("path");
const vscode_1 = require("vscode");
const readScripts_1 = require("./readScripts");
const tasks_1 = require("./tasks");
let cachedDocument = undefined;
let cachedScripts = undefined;
function invalidateHoverScriptsCache(document) {
    if (!document) {
        cachedDocument = undefined;
        return;
    }
    if (document.uri === cachedDocument) {
        cachedDocument = undefined;
    }
}
class NpmScriptHoverProvider {
    context;
    enabled;
    constructor(context) {
        this.context = context;
        context.subscriptions.push(vscode_1.commands.registerCommand('npm.runScriptFromHover', this.runScriptFromHover, this));
        context.subscriptions.push(vscode_1.commands.registerCommand('npm.debugScriptFromHover', this.debugScriptFromHover, this));
        context.subscriptions.push(vscode_1.workspace.onDidChangeTextDocument((e) => {
            invalidateHoverScriptsCache(e.document);
        }));
        const isEnabled = () => vscode_1.workspace.getConfiguration('npm').get('scriptHover', true);
        this.enabled = isEnabled();
        context.subscriptions.push(vscode_1.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('npm.scriptHover')) {
                this.enabled = isEnabled();
            }
        }));
    }
    provideHover(document, position, _token) {
        if (!this.enabled) {
            return;
        }
        let hover = undefined;
        if (!cachedDocument || cachedDocument.fsPath !== document.uri.fsPath) {
            cachedScripts = (0, readScripts_1.readScripts)(document);
            cachedDocument = document.uri;
        }
        cachedScripts?.scripts.forEach(({ name, nameRange }) => {
            if (nameRange.contains(position)) {
                const contents = new vscode_1.MarkdownString();
                contents.isTrusted = true;
                contents.appendMarkdown(this.createRunScriptMarkdown(name, document.uri));
                contents.appendMarkdown(this.createDebugScriptMarkdown(name, document.uri));
                hover = new vscode_1.Hover(contents);
            }
        });
        return hover;
    }
    createRunScriptMarkdown(script, documentUri) {
        const args = {
            documentUri: documentUri,
            script: script,
        };
        return this.createMarkdownLink(vscode_1.l10n.t("Run Script"), 'npm.runScriptFromHover', args, vscode_1.l10n.t("Run the script as a task"));
    }
    createDebugScriptMarkdown(script, documentUri) {
        const args = {
            documentUri: documentUri,
            script: script,
        };
        return this.createMarkdownLink(vscode_1.l10n.t("Debug Script"), 'npm.debugScriptFromHover', args, vscode_1.l10n.t("Runs the script under the debugger"), '|');
    }
    createMarkdownLink(label, cmd, args, tooltip, separator) {
        const encodedArgs = encodeURIComponent(JSON.stringify(args));
        let prefix = '';
        if (separator) {
            prefix = ` ${separator} `;
        }
        return `${prefix}[${label}](command:${cmd}?${encodedArgs} "${tooltip}")`;
    }
    async runScriptFromHover(args) {
        const script = args.script;
        const documentUri = args.documentUri;
        const folder = vscode_1.workspace.getWorkspaceFolder(documentUri);
        if (folder) {
            const task = await (0, tasks_1.createScriptRunnerTask)(this.context, script, folder, documentUri);
            await vscode_1.tasks.executeTask(task);
        }
    }
    debugScriptFromHover(args) {
        const script = args.script;
        const documentUri = args.documentUri;
        const folder = vscode_1.workspace.getWorkspaceFolder(documentUri);
        if (folder) {
            (0, tasks_1.startDebugging)(this.context, script, (0, path_1.dirname)(documentUri.fsPath), folder);
        }
    }
}
exports.NpmScriptHoverProvider = NpmScriptHoverProvider;
//# sourceMappingURL=scriptHover.js.map