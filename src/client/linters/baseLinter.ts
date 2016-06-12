'use strict';
import * as child_process from 'child_process';
import * as path from 'path';
import { exec } from 'child_process';
import {sendCommand} from './../common/childProc';
import * as settings from './../common/configSettings';
import {OutputChannel, window} from 'vscode';

var NamedRegexp = null;
const REGEX = '(?<line>\\d+),(?<column>\\d+),(?<type>\\w+),(?<code>\\w\\d+):(?<message>.*)\\r?(\\n|$)';

export interface IRegexGroup {
    line: number
    column: number
    code: string
    message: string
    type: string
}

export interface ILintMessage {
    line: number
    column: number
    code: string
    message: string
    type: string
    possibleWord?: string
    severity?: LintMessageSeverity
    provider: string
}
export enum LintMessageSeverity {
    Hint,
    Error,
    Warning,
    Information
}

export function matchNamedRegEx(data, regex): IRegexGroup {
    if (NamedRegexp === null) {
        NamedRegexp = require('named-js-regexp');
    }

    var compiledRegexp = NamedRegexp(regex, "g");
    var rawMatch = compiledRegexp.exec(data);
    if (rawMatch !== null) {
        return <IRegexGroup>rawMatch.groups()
    }

    return null;
}

export abstract class BaseLinter {
    public Id: string;
    protected pythonSettings: settings.IPythonSettings;
    protected outputChannel: OutputChannel;
    constructor(id: string, outputChannel: OutputChannel) {
        this.Id = id;
        this.pythonSettings = settings.PythonSettings.getInstance();
        this.outputChannel = outputChannel;
    }

    public abstract runLinter(filePath: string, txtDocumentLines: string[]): Promise<ILintMessage[]>;

    protected run(commandLine: string, filePath: string, txtDocumentLines: string[], cwd: string, regEx: string = REGEX): Promise<ILintMessage[]> {
        var outputChannel = this.outputChannel;
        var linterId = this.Id;

        return new Promise<ILintMessage[]>((resolve, reject) => {
            sendCommand(commandLine, cwd, true).then(data => {
                outputChannel.clear();
                outputChannel.append(data);
                var outputLines = data.split(/\r?\n/g);
                var diagnostics: ILintMessage[] = [];
                outputLines.filter((value, index) => index <= this.pythonSettings.linting.maxNumberOfProblems).forEach(line => {
                    var match = matchNamedRegEx(line, regEx);
                    if (match == null) {
                        return;
                    }

                    try {
                        match.line = Number(<any>match.line);
                        match.column = Number(<any>match.column);

                        var sourceLine = txtDocumentLines[match.line - 1];
                        var sourceStart = sourceLine.substring(match.column - 1);
                        var endCol = txtDocumentLines[match.line - 1].length;

                        //try to get the first word from the startig position
                        var possibleProblemWords = sourceStart.match(/\w+/g);
                        var possibleWord: string;
                        if (possibleProblemWords != null && possibleProblemWords.length > 0 && sourceStart.startsWith(possibleProblemWords[0])) {
                            possibleWord = possibleProblemWords[0];
                        }

                        diagnostics.push({
                            code: match.code,
                            message: match.message,
                            column: match.column,
                            line: match.line,
                            possibleWord: possibleWord,
                            type: match.type,
                            provider: this.Id
                        });
                    }
                    catch (ex) {
                        //Hmm, need to handle this later
                        //TODO:
                        var y = "";
                    }
                });

                resolve(diagnostics);
            }, error => {
                outputChannel.appendLine(`Linting with ${linterId} failed. If not installed please turn if off in settings.\n ${error}`);
                window.showInformationMessage(`Linting with ${linterId} failed. If not installed please turn if off in settings. View Python output for details.`);
            });
        });
    }
}
