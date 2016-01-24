/*---------------------------------------------------------
 ** Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as child_process from 'child_process';
import {ILinter} from './linter';
import {ITextDocument, Diagnostic, DiagnosticSeverity, Range, Position} from 'vscode-languageserver';
import * as path from 'path';
import { exec } from 'child_process';

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
const PYLINT_COMMANDLINE = " --msg-template='{line},{column},{category},{msg_id}:{msg}' --reports=n --output-format=text";
const PEP_COMMANDLINE = " --format='%(row)d,%(col)d,%(code)s,%(code)s:%(text)s'";
 
const PYLINT_CATEGORY_MAPPING = {};
PYLINT_CATEGORY_MAPPING["refactor"] = DiagnosticSeverity.Hint;
PYLINT_CATEGORY_MAPPING["convention"] = DiagnosticSeverity.Hint;
PYLINT_CATEGORY_MAPPING["warning"] = DiagnosticSeverity.Warning;
PYLINT_CATEGORY_MAPPING["error"] = DiagnosticSeverity.Error;
PYLINT_CATEGORY_MAPPING["fatal"] = DiagnosticSeverity.Error;

function uriToPath(pathValue: string): string {
    if (pathValue.startsWith(FILE_PROTOCOL)) {
        pathValue = pathValue.substring(FILE_PROTOCOL.length);
    }

    return path.normalize(decodeURIComponent(pathValue));
}
function getEnumValue(name:string):DiagnosticSeverity{
    return DiagnosticSeverity[name];
}

export class Linter {
    public constructor(){
        
    }
    run(textDocument: ITextDocument, settings: any, isPep8:boolean): Promise<Diagnostic[]> {
        PYLINT_CATEGORY_MAPPING["convention"] = getEnumValue(settings.linting.pylintCategorySeverity.convention);        
        PYLINT_CATEGORY_MAPPING["refactor"] = getEnumValue(settings.linting.pylintCategorySeverity.refactor);
        PYLINT_CATEGORY_MAPPING["warning"] = getEnumValue(settings.linting.pylintCategorySeverity.warning);
        PYLINT_CATEGORY_MAPPING["error"] = getEnumValue(settings.linting.pylintCategorySeverity.error);
        PYLINT_CATEGORY_MAPPING["fatal"] = getEnumValue(settings.linting.pylintCategorySeverity.fatal);
        
        var filePath = uriToPath(textDocument.uri);
        var txtDocumentLines = textDocument.getText().split(/\r?\n/g);
        var dir = path.dirname(filePath); 
        var maxNumberOfProblems = settings.linting.maxNumberOfProblems;
        var lintPath = isPep8 ? settings.linting.pep8Path : settings.linting.pylintPath;
        var lintArgs = isPep8 ? PEP_COMMANDLINE : PYLINT_COMMANDLINE;
        
        var cmd: string = `${lintPath} ${lintArgs} ${filePath}`;
        if (NamedRegexp === null) {
            NamedRegexp = require('named-js-regexp')
            compiledRegexp = NamedRegexp(REGEX, "g");
        } 

        return new Promise<Diagnostic[]>((resolve, reject) => {
            var dir = path.dirname(filePath); 
            //var cmd: string = `${PYLINT_COMMANDLINE} ${filePath}`;
            exec(cmd,{cwd:dir}, (error: Error, stdout: Buffer, stderr: Buffer) => {
                var outputLines = (stdout || "").toString('utf-8').split(/\r?\n/g);
                if (outputLines.length === 0 || outputLines[0] === ""){
                    var errorMessages = [];
                    if (error && error.message){
                        errorMessages.push(`Error Message (${error.name}) : ${error.message}`);
                    }
                    if (stderr && stderr.length > 0){
                        errorMessages.push(stderr.toString('utf-8'));
                    }                    
                    if (errorMessages.length === 0){
                        return resolve([])
                    }
                    var msg = "";
                    if (isPep8){
                        msg = "If Pep8 isn't used an not installed, you can turn its usage off from the setting 'python.linting.pep8Enabled'." + 
                                "If Pep8 is used, but cannot be located, then configure the path in 'python.linting.pep8Path'";
                    }
                    else {
                        msg = "If Pep8 isn't used an not installed, you can turn its usage off from the setting 'python.linting.pep8Enabled'." + 
                                "If Pep8 is used, but cannot be located, then configure the path in 'python.linting.pep8Path'";

                    }
                    msg = msg + "\n" + errorMessages.join("\n");
                    console.error(msg);
                    return resolve([]);
                }
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

                        var severity = isPep8? DiagnosticSeverity.Information : PYLINT_CATEGORY_MAPPING[match.type];
                        diagnostics.push(Diagnostic.create(range, match.code + ":" + match.message, severity));
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