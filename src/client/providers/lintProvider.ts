"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as linter from "../linters/baseLinter";
import * as prospector from "./../linters/prospector";
import * as pylint from "./../linters/pylint";
import * as pep8 from "./../linters/pep8Linter";
import * as flake8 from "./../linters/flake8";
import * as pydocstyle from "./../linters/pydocstyle";
import * as settings from "../common/configSettings";
import * as telemetryHelper from "../common/telemetry";
import * as telemetryContracts from "../common/telemetryContracts";

const lintSeverityToVSSeverity = new Map<linter.LintMessageSeverity, vscode.DiagnosticSeverity>();
lintSeverityToVSSeverity.set(linter.LintMessageSeverity.Error, vscode.DiagnosticSeverity.Error)
lintSeverityToVSSeverity.set(linter.LintMessageSeverity.Hint, vscode.DiagnosticSeverity.Hint)
lintSeverityToVSSeverity.set(linter.LintMessageSeverity.Information, vscode.DiagnosticSeverity.Information)
lintSeverityToVSSeverity.set(linter.LintMessageSeverity.Warning, vscode.DiagnosticSeverity.Warning)

function createDiagnostics(message: linter.ILintMessage, txtDocumentLines: string[]): vscode.Diagnostic {
    let sourceLine = txtDocumentLines[message.line - 1];
    let sourceStart = sourceLine.substring(message.column - 1);
    let endCol = txtDocumentLines[message.line - 1].length;

    // try to get the first word from the startig position
    if (message.possibleWord === "string" && message.possibleWord.length > 0) {
        endCol = message.column + message.possibleWord.length;
    }

    let range = new vscode.Range(new vscode.Position(message.line - 1, message.column), new vscode.Position(message.line - 1, endCol));

    let severity = lintSeverityToVSSeverity.get(message.severity);
    return new vscode.Diagnostic(range, message.code + ":" + message.message, severity);
}

export class LintProvider extends vscode.Disposable {
    private settings: settings.IPythonSettings;
    private diagnosticCollection: vscode.DiagnosticCollection;
    private linters: linter.BaseLinter[] = [];
    private pendingLintings = new Map<string, vscode.CancellationTokenSource>();
    private outputChannel: vscode.OutputChannel;
    private context: vscode.ExtensionContext;

    public constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
        super(() => { });
        this.outputChannel = outputChannel;
        this.context = context;
        this.settings = settings.PythonSettings.getInstance();

        this.initialize();
    }

    private initialize() {
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection("python");
        let disposables = [];

        this.linters.push(new prospector.Linter(this.outputChannel));
        this.linters.push(new pylint.Linter(this.outputChannel));
        this.linters.push(new pep8.Linter(this.outputChannel));
        this.linters.push(new flake8.Linter(this.outputChannel));
        this.linters.push(new pydocstyle.Linter(this.outputChannel));

        let disposable = vscode.workspace.onDidSaveTextDocument((e) => {
            if (e.languageId !== "python" || !this.settings.linting.enabled || !this.settings.linting.lintOnSave) {
                return;
            }
            this.lintDocument(e.uri, e.getText().split(/\r?\n/g), 100);
        });
        this.context.subscriptions.push(disposable);
    }

    private lastTimeout: number;
    private lintDocument(documentUri: vscode.Uri, documentLines: string[], delay: number): void {
        // Since this is a hack, lets wait for 2 seconds before linting
        // Give user to continue typing before we waste CPU time
        if (this.lastTimeout) {
            clearTimeout(this.lastTimeout);
            this.lastTimeout = 0;
        }

        this.lastTimeout = setTimeout(() => {
            this.onLintDocument(documentUri, documentLines);
        }, delay);
    }

    private onLintDocument(documentUri: vscode.Uri, documentLines: string[]): void {
        if (this.pendingLintings.has(documentUri.fsPath)) {
            this.pendingLintings.get(documentUri.fsPath).cancel();
            this.pendingLintings.delete(documentUri.fsPath);
        }

        let cancelToken = new vscode.CancellationTokenSource();
        cancelToken.token.onCancellationRequested(() => {
            if (this.pendingLintings.has(documentUri.fsPath)) {
                this.pendingLintings.delete(documentUri.fsPath);
            }
        });

        this.pendingLintings.set(documentUri.fsPath, cancelToken);
        let promises = this.linters.map(linter => {
            if (!linter.isEnabled()) {
                return Promise.resolve([]);
            }
            let delays = new telemetryHelper.Delays();
            return linter.runLinter(documentUri.fsPath, documentLines).then(results => {
                delays.stop();
                telemetryHelper.sendTelemetryEvent(telemetryContracts.IDE.Lint, { Lint_Provider: linter.Id }, delays.toMeasures());
                return results;
            });
        });

        Promise.all<linter.ILintMessage[]>(promises).then(msgs => {
            if (cancelToken.token.isCancellationRequested) {
                return;
            }

            // Flatten the array
            let consolidatedMessages: linter.ILintMessage[] = [];
            msgs.forEach(lintMessages => consolidatedMessages = consolidatedMessages.concat(lintMessages));

            // Limit the number of messages to the max value
            consolidatedMessages = consolidatedMessages.filter((value, index) => index <= this.settings.linting.maxNumberOfProblems);

            // Build the message and suffix the message with the name of the linter used
            let messages = [];
            consolidatedMessages.forEach(d => {
                d.message = `${d.message} (${d.provider})`;
                messages.push(createDiagnostics(d, documentLines));
            });

            this.diagnosticCollection.delete(documentUri);
            this.diagnosticCollection.set(documentUri, messages);
        });
    }
}