/*---------------------------------------------------------
 ** Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as child_process from 'child_process';
import {ILinter} from './linter';
import {ITextDocument, Diagnostic, DiagnosticSeverity, Range, Position} from 'vscode-languageserver';
import * as path from 'path';

// const REGEX = '(?<line>\\d+),(?<col>\\d+),(?<type>\\w+),(\\w\\d+):(?<message>.*)\\r?(\\n|$)';
var NamedRegexp = null;

interface IPylintMessage {
    line: number
    column: number
    code: string
    message: string
    type: string
}
function matchNamedRegEx(data, regex): IPylintMessage {
    if (NamedRegexp === null) {
        NamedRegexp = require('named-js-regexp');
        compiledRegexp = NamedRegexp(regex, "g");
    }

    var rawMatch = compiledRegexp.exec(data);
    if (rawMatch !== null) {
        return rawMatch.groups()
    }

    return null;
}

var compiledRegexp;

const REGEX = '(?<line>\\d+),(?<column>\\d+),(?<type>\\w+),(?<code>\\w\\d+):(?<message>.*)\\r?(\\n|$)';
const FILE_PROTOCOL = "file:///"
const PYLINT_COMMANDLINE = "pylint  --msg-template='{line},{column},{C},{msg_id}:{msg}' --reports=n --output-format=text";

const PYLINT_CATEGORY_MAPPING = {};
PYLINT_CATEGORY_MAPPING["R"] = DiagnosticSeverity.Hint;
PYLINT_CATEGORY_MAPPING["C"] = DiagnosticSeverity.Hint;
PYLINT_CATEGORY_MAPPING["W"] = DiagnosticSeverity.Warning;
PYLINT_CATEGORY_MAPPING["E"] = DiagnosticSeverity.Error;
PYLINT_CATEGORY_MAPPING["F"] = DiagnosticSeverity.Error;

function uriToPath(pathValue: string): string {
    if (pathValue.startsWith(FILE_PROTOCOL)) {
        pathValue = pathValue.substring(FILE_PROTOCOL.length);
    }

    return path.normalize(decodeURIComponent(pathValue));
}

export class PyLinter {
    run(textDocument: ITextDocument, maxNumberOfProblems: number): Promise<Diagnostic[]> {
        var filePath = uriToPath(textDocument.uri);
        var txtDocumentLines = textDocument.getText().split(/\r?\n/g);
        if (NamedRegexp === null) {
            NamedRegexp = require('named-js-regexp')
            compiledRegexp = NamedRegexp(REGEX, "g");
        }

        return new Promise<Diagnostic[]>((resolve, reject) => {
            child_process.exec(`${PYLINT_COMMANDLINE} "${filePath}"`, (error, stdout, stderr) => {
                var outputLines = stdout.toString('utf-8').split(/\r?\n/g);
                var diagnostics: Diagnostic[] = [];
                outputLines.forEach(line=> {
                    if (diagnostics.length >= maxNumberOfProblems) {
                        return;
                    }
                    var match = matchNamedRegEx(line, REGEX);
                    if (match == null) {
                        return;
                    }

                    try {
                        match.line = parseInt(<any>match.line);
                        match.column = parseInt(<any>match.column);

                        var sourceLine = txtDocumentLines[match.line - 1];
                        var sourceStart = sourceLine.substring(match.column - 1);
                        var endCol = txtDocumentLines[match.line - 1].length;
                                         
                        //try to get the first word from the startig position
                        var possibleProblemWords = sourceStart.match(/\w+/g);
                        if (possibleProblemWords != null && possibleProblemWords.length > 0 && sourceStart.startsWith(possibleProblemWords[0])) {
                            endCol = match.column + possibleProblemWords[0].length;
                        }

                        var range = Range.create(Position.create(match.line - 1, match.column), Position.create(match.line - 1, endCol));

                        diagnostics.push(Diagnostic.create(range, match.message, PYLINT_CATEGORY_MAPPING[match.type], match.code));
                    }
                    catch (ex) {
                        var y = "";
                    }
                });

                resolve(diagnostics);
            });
        });
    }
}