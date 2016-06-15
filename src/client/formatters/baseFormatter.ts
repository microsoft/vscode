"use strict";

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {sendCommand} from "./../common/childProc";
import * as settings from "./../common/configSettings";
import {getTextEditsFromPatch, getTempFileWithDocumentContents} from "./../common/editor";

export abstract class BaseFormatter {
    public Id: string;
    protected outputChannel: vscode.OutputChannel;
    protected pythonSettings: settings.IPythonSettings;

    constructor(id: string, outputChannel: vscode.OutputChannel) {
        this.Id = id;
        this.outputChannel = outputChannel;
        this.pythonSettings = settings.PythonSettings.getInstance();
    }

    public abstract formatDocument(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken): Thenable<vscode.TextEdit[]>;

    protected provideDocumentFormattingEdits(document: vscode.TextDocument, options: vscode.FormattingOptions, token: vscode.CancellationToken, cmdLine: string): Thenable<vscode.TextEdit[]> {
        // Todo: Save the contents of the file to a temporary file and format that instead saving the actual file
        // This could unnecessarily trigger other behaviours
        this.outputChannel.clear();

        // autopep8 and yapf have the ability to read from the process input stream and return the formatted code out of the output stream
        // However they don't support returning the diff of the formatted text when reading data from the input stream
        // Yes getting text formatted that way avoids having to create a temporary file, however the diffing will have
        // to be done here in node (extension), i.e. extension cpu, i.e. les responsive solution
        let tmpFileCreated = document.isDirty;
        let filePromise = tmpFileCreated ? getTempFileWithDocumentContents(document) : Promise.resolve(document.fileName);
        return filePromise.then(filePath => {
            if (token.isCancellationRequested) {
                return [filePath, ""];
            }
            return Promise.all<string>([Promise.resolve(filePath), sendCommand(cmdLine + ` "${filePath}"`, vscode.workspace.rootPath)]);
        }).then(data => {
            // Delete the temporary file created
            if (tmpFileCreated) {
                fs.unlink(data[0]);
            }
            if (token.isCancellationRequested) {
                return [];
            }
            return getTextEditsFromPatch(document.getText(), data[1]);
        }).catch(error => {
            this.outputChannel.appendLine(error);
            throw new Error(`There was an error in formatting the document. View the Python output window for details.`);
        });
    }
}
