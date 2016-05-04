'use strict';

import * as path from 'path';
import * as baseLinter from './baseLinter';
import {ILintMessage} from './baseLinter';
import * as settings from './../common/configSettings';
import {OutputChannel, window} from 'vscode';
import { exec } from 'child_process';
import {sendCommand} from './../common/childProc';

export class Linter extends baseLinter.BaseLinter {
    constructor(rootDir: string, pythonSettings: settings.IPythonSettings, outputChannel: OutputChannel) {
        super("pydocstyle", pythonSettings, outputChannel);
    }

    public runLinter(filePath: string, txtDocumentLines: string[]): Promise<baseLinter.ILintMessage[]> {
        if (!this.pythonSettings.linting.pydocstyleEnabled) {
            return Promise.resolve([]);
        }

        var pydocStylePath = this.pythonSettings.linting.pydocStylePath;
        var cmdLine = `${pydocStylePath} "${filePath}"`;
        return new Promise<baseLinter.ILintMessage[]>(resolve => {
            this.run(cmdLine, filePath, txtDocumentLines).then(messages => {
                //All messages in pep8 are treated as warnings for now
                messages.forEach(msg => {
                    msg.severity = baseLinter.LintMessageSeverity.Information;
                });

                resolve(messages);
            });
        });
    }

    protected run(commandLine: string, filePath: string, txtDocumentLines: string[]): Promise<ILintMessage[]> {
        var outputChannel = this.outputChannel;
        var linterId = this.Id;

        return new Promise<ILintMessage[]>((resolve, reject) => {
            var fileDir = path.dirname(filePath);
            sendCommand(commandLine, fileDir, true).then(data => {
                outputChannel.clear();
                outputChannel.append(data);
                var outputLines = data.split(/\r?\n/g);
                var diagnostics: ILintMessage[] = [];
                var baseFileName = path.basename(filePath);

                //Remember, the first line of the response contains the file name and line number, the next line contains the error message
                //So we have two lines per message, hence we need to take lines in pairs
                var maxLines = this.pythonSettings.linting.maxNumberOfProblems * 2;
                //First line is almost always empty
                while (outputLines.length > 0 && outputLines[0].trim().length === 0) {
                    outputLines.splice(0, 1);
                }
                outputLines = outputLines.filter((value, index) => index < maxLines);

                //Iterate through the lines (skipping the messages)
                //So, just iterate the response in pairs
                for (var counter = 0; counter < outputLines.length; counter = counter + 2) {
                    try {
                        var line = outputLines[counter];
                        if (line.trim().length === 0) {
                            continue;
                        }
                        var messageLine = outputLines[counter + 1];
                        var lineNumber = parseInt(line.substring(line.indexOf(baseFileName) + baseFileName.length + 1));
                        var code = messageLine.substring(0, messageLine.indexOf(":")).trim();
                        var message = messageLine.substring(messageLine.indexOf(":") + 1).trim();

                        var sourceLine = txtDocumentLines[lineNumber - 1];
                        var trmmedSourceLine = sourceLine.trim();
                        var sourceStart = sourceLine.indexOf(trmmedSourceLine);
                        var endCol = sourceStart + trmmedSourceLine.length;

                        diagnostics.push({
                            code: code,
                            message: message,
                            column: sourceStart,
                            line: lineNumber,
                            type: "",
                            provider: this.Id
                        });
                    }
                    catch (ex) {
                        //Hmm, need to handle this later
                        var y = "";
                    }
                }

                resolve(diagnostics);
            }, error => {
                outputChannel.appendLine(`Linting with ${linterId} failed. If not installed please turn if off in settings.\n ${error}`);
                window.showInformationMessage(`Linting with ${linterId} failed. If not installed please turn if off in settings. View Python output for details.`);
            });
        });
    }
}
