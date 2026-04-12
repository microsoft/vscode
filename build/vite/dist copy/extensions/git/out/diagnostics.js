"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitCommitInputBoxCodeActionsProvider = exports.GitCommitInputBoxDiagnosticsManager = exports.DiagnosticCodes = void 0;
const vscode_1 = require("vscode");
const util_1 = require("./util");
var DiagnosticCodes;
(function (DiagnosticCodes) {
    DiagnosticCodes["empty_message"] = "empty_message";
    DiagnosticCodes["line_length"] = "line_length";
})(DiagnosticCodes || (exports.DiagnosticCodes = DiagnosticCodes = {}));
class GitCommitInputBoxDiagnosticsManager {
    model;
    diagnostics;
    severity = vscode_1.DiagnosticSeverity.Warning;
    disposables = [];
    constructor(model) {
        this.model = model;
        this.diagnostics = vscode_1.languages.createDiagnosticCollection();
        this.migrateInputValidationSettings()
            .then(() => {
            (0, util_1.mapEvent)((0, util_1.filterEvent)(vscode_1.workspace.onDidChangeTextDocument, e => e.document.uri.scheme === 'vscode-scm'), e => e.document)(this.onDidChangeTextDocument, this, this.disposables);
            (0, util_1.filterEvent)(vscode_1.workspace.onDidChangeConfiguration, e => e.affectsConfiguration('git.inputValidation') || e.affectsConfiguration('git.inputValidationLength') || e.affectsConfiguration('git.inputValidationSubjectLength'))(this.onDidChangeConfiguration, this, this.disposables);
        });
    }
    getDiagnostics(uri) {
        return this.diagnostics.get(uri) ?? [];
    }
    async migrateInputValidationSettings() {
        try {
            const config = vscode_1.workspace.getConfiguration('git');
            const inputValidation = config.inspect('inputValidation');
            if (inputValidation === undefined) {
                return;
            }
            // Workspace setting
            if (typeof inputValidation.workspaceValue === 'string') {
                await config.update('inputValidation', inputValidation.workspaceValue !== 'off', false);
            }
            // User setting
            if (typeof inputValidation.globalValue === 'string') {
                await config.update('inputValidation', inputValidation.workspaceValue !== 'off', true);
            }
        }
        catch { }
    }
    onDidChangeConfiguration() {
        for (const repository of this.model.repositories) {
            this.onDidChangeTextDocument(repository.inputBox.document);
        }
    }
    onDidChangeTextDocument(document) {
        const config = vscode_1.workspace.getConfiguration('git');
        const inputValidation = config.get('inputValidation', false);
        if (!inputValidation) {
            this.diagnostics.set(document.uri, undefined);
            return;
        }
        if (/^\s+$/.test(document.getText())) {
            const documentRange = new vscode_1.Range(document.lineAt(0).range.start, document.lineAt(document.lineCount - 1).range.end);
            const diagnostic = new vscode_1.Diagnostic(documentRange, vscode_1.l10n.t('Current commit message only contains whitespace characters'), this.severity);
            diagnostic.code = DiagnosticCodes.empty_message;
            this.diagnostics.set(document.uri, [diagnostic]);
            return;
        }
        const diagnostics = [];
        const inputValidationLength = config.get('inputValidationLength', 50);
        const inputValidationSubjectLength = config.get('inputValidationSubjectLength', undefined);
        for (let index = 0; index < document.lineCount; index++) {
            const line = document.lineAt(index);
            const threshold = index === 0 ? inputValidationSubjectLength ?? inputValidationLength : inputValidationLength;
            if (line.text.length > threshold) {
                const charactersOver = line.text.length - threshold;
                const lineLengthMessage = charactersOver === 1
                    ? vscode_1.l10n.t('{0} character over {1} in current line', charactersOver, threshold)
                    : vscode_1.l10n.t('{0} characters over {1} in current line', charactersOver, threshold);
                const diagnostic = new vscode_1.Diagnostic(line.range, lineLengthMessage, this.severity);
                diagnostic.code = DiagnosticCodes.line_length;
                diagnostics.push(diagnostic);
            }
        }
        this.diagnostics.set(document.uri, diagnostics);
    }
    dispose() {
        (0, util_1.dispose)(this.disposables);
    }
}
exports.GitCommitInputBoxDiagnosticsManager = GitCommitInputBoxDiagnosticsManager;
class GitCommitInputBoxCodeActionsProvider {
    diagnosticsManager;
    disposables = [];
    constructor(diagnosticsManager) {
        this.diagnosticsManager = diagnosticsManager;
        this.disposables.push(vscode_1.languages.registerCodeActionsProvider({ scheme: 'vscode-scm' }, this));
    }
    provideCodeActions(document, range) {
        const codeActions = [];
        const diagnostics = this.diagnosticsManager.getDiagnostics(document.uri);
        const wrapAllLinesCodeAction = this.getWrapAllLinesCodeAction(document, diagnostics);
        for (const diagnostic of diagnostics) {
            if (!diagnostic.range.contains(range)) {
                continue;
            }
            switch (diagnostic.code) {
                case DiagnosticCodes.empty_message: {
                    const workspaceEdit = new vscode_1.WorkspaceEdit();
                    workspaceEdit.delete(document.uri, diagnostic.range);
                    const codeAction = new vscode_1.CodeAction(vscode_1.l10n.t('Clear whitespace characters'), vscode_1.CodeActionKind.QuickFix);
                    codeAction.diagnostics = [diagnostic];
                    codeAction.edit = workspaceEdit;
                    codeActions.push(codeAction);
                    break;
                }
                case DiagnosticCodes.line_length: {
                    const workspaceEdit = this.getWrapLineWorkspaceEdit(document, diagnostic.range);
                    const codeAction = new vscode_1.CodeAction(vscode_1.l10n.t('Hard wrap line'), vscode_1.CodeActionKind.QuickFix);
                    codeAction.diagnostics = [diagnostic];
                    codeAction.edit = workspaceEdit;
                    codeActions.push(codeAction);
                    if (wrapAllLinesCodeAction) {
                        wrapAllLinesCodeAction.diagnostics = [diagnostic];
                        codeActions.push(wrapAllLinesCodeAction);
                    }
                    break;
                }
            }
        }
        return codeActions;
    }
    getWrapLineWorkspaceEdit(document, range) {
        const lineSegments = this.wrapTextDocumentLine(document, range.start.line);
        const workspaceEdit = new vscode_1.WorkspaceEdit();
        workspaceEdit.replace(document.uri, range, lineSegments.join('\n'));
        return workspaceEdit;
    }
    getWrapAllLinesCodeAction(document, diagnostics) {
        const lineLengthDiagnostics = diagnostics.filter(d => d.code === DiagnosticCodes.line_length);
        if (lineLengthDiagnostics.length < 2) {
            return undefined;
        }
        const wrapAllLinesCodeAction = new vscode_1.CodeAction(vscode_1.l10n.t('Hard wrap all lines'), vscode_1.CodeActionKind.QuickFix);
        wrapAllLinesCodeAction.edit = this.getWrapAllLinesWorkspaceEdit(document, lineLengthDiagnostics);
        return wrapAllLinesCodeAction;
    }
    getWrapAllLinesWorkspaceEdit(document, diagnostics) {
        const workspaceEdit = new vscode_1.WorkspaceEdit();
        for (const diagnostic of diagnostics) {
            const lineSegments = this.wrapTextDocumentLine(document, diagnostic.range.start.line);
            workspaceEdit.replace(document.uri, diagnostic.range, lineSegments.join('\n'));
        }
        return workspaceEdit;
    }
    wrapTextDocumentLine(document, line) {
        const config = vscode_1.workspace.getConfiguration('git');
        const inputValidationLength = config.get('inputValidationLength', 50);
        const inputValidationSubjectLength = config.get('inputValidationSubjectLength', undefined);
        const lineLengthThreshold = line === 0 ? inputValidationSubjectLength ?? inputValidationLength : inputValidationLength;
        const lineSegments = [];
        const lineText = document.lineAt(line).text.trim();
        let position = 0;
        while (lineText.length - position > lineLengthThreshold) {
            const lastSpaceBeforeThreshold = lineText.lastIndexOf(' ', position + lineLengthThreshold);
            if (lastSpaceBeforeThreshold !== -1 && lastSpaceBeforeThreshold > position) {
                lineSegments.push(lineText.substring(position, lastSpaceBeforeThreshold));
                position = lastSpaceBeforeThreshold + 1;
            }
            else {
                // Find first space after threshold
                const firstSpaceAfterThreshold = lineText.indexOf(' ', position + lineLengthThreshold);
                if (firstSpaceAfterThreshold !== -1) {
                    lineSegments.push(lineText.substring(position, firstSpaceAfterThreshold));
                    position = firstSpaceAfterThreshold + 1;
                }
                else {
                    lineSegments.push(lineText.substring(position));
                    position = lineText.length;
                }
            }
        }
        if (position < lineText.length) {
            lineSegments.push(lineText.substring(position));
        }
        return lineSegments;
    }
    dispose() {
        (0, util_1.dispose)(this.disposables);
    }
}
exports.GitCommitInputBoxCodeActionsProvider = GitCommitInputBoxCodeActionsProvider;
//# sourceMappingURL=diagnostics.js.map