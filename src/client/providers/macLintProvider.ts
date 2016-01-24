/*---------------------------------------------------------
 ** Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
'use strict';

import * as vscode from 'vscode';
import * as child_process from 'child_process';
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
    }

    var compiledRegexp = NamedRegexp(regex, "g");
    var rawMatch = compiledRegexp.exec(data);
    if (rawMatch !== null) {
        return rawMatch.groups()
    }

    return null;
}

//var compiledRegexp;

const REGEX = '(?<line>\\d+),(?<column>\\d+),(?<type>\\w+),(?<code>\\w\\d+):(?<message>.*)\\r?(\\n|$)';
const FILE_PROTOCOL = "file:///"
const PYLINT_COMMANDLINE = " --msg-template='{line},{column},{category},{msg_id}:{msg}' --reports=n --output-format=text";
const PEP_COMMANDLINE = " --format='%(row)d,%(col)d,%(code)s,%(code)s:%(text)s'";
 
const PYLINT_CATEGORY_MAPPING = {};
PYLINT_CATEGORY_MAPPING["refactor"] = vscode.DiagnosticSeverity.Hint;
PYLINT_CATEGORY_MAPPING["convention"] = vscode.DiagnosticSeverity.Hint;
PYLINT_CATEGORY_MAPPING["warning"] = vscode.DiagnosticSeverity.Warning;
PYLINT_CATEGORY_MAPPING["error"] = vscode.DiagnosticSeverity.Error;
PYLINT_CATEGORY_MAPPING["fatal"] = vscode.DiagnosticSeverity.Error;

function uriToPath(pathValue: string): string {
    if (pathValue.startsWith(FILE_PROTOCOL)) {
        pathValue = pathValue.substring(FILE_PROTOCOL.length);
    }

    return path.normalize(decodeURIComponent(pathValue));
}

interface IDocumentLinting {
    filePath:string
    lastRequestId:number
}

function getEnumValue(name:string):vscode.DiagnosticSeverity{
    return vscode.DiagnosticSeverity[name];
}
export class PythonMacPlintProvider {
    private requestId:number = 0;
    private lastRequestId:number = 0;
    private diagnosticCollection:vscode.DiagnosticCollection;   
    private lastDocumentLintingIds:any= {};
    private maxNumberOfErrorsToReport:number = 100;
    private lintOnTextChange:boolean = true;
    private lintEnabled:boolean = true;
    private lintOnSave:boolean = true;
    private pylintPath:string = "pylint";
    private pylintEnabled:boolean = true;
    private pep8Enabled:boolean = true;
    private pep8Path:string = "pep8";
    private readConfigSettings(){        
        var config = vscode.workspace.getConfiguration("python");
        this.maxNumberOfErrorsToReport = config.get<number>("linting.maxNumberOfProblems", 100);
        PYLINT_CATEGORY_MAPPING["convention"] = getEnumValue(config.get<string>("linting.pylintCategorySeverity.convention", "Hint"));        
        PYLINT_CATEGORY_MAPPING["refactor"] = getEnumValue(config.get<string>("linting.pylintCategorySeverity.convention", "Hint"));
        PYLINT_CATEGORY_MAPPING["warning"] = getEnumValue(config.get<string>("linting.pylintCategorySeverity.convention", "Warning"));
        PYLINT_CATEGORY_MAPPING["error"] = getEnumValue(config.get<string>("linting.pylintCategorySeverity.convention", "Error"));
        PYLINT_CATEGORY_MAPPING["fatal"] = getEnumValue(config.get<string>("linting.pylintCategorySeverity.convention", "Error"));
        
        this.lintEnabled = config.get<boolean>("linting.enabled", true);
        this.pylintEnabled = config.get<boolean>("linting.pylintEnabled", true);
        this.pep8Enabled = config.get<boolean>("linting.pep8Enabled", true);
        this.lintOnTextChange = config.get<boolean>("linting.lintOnTextChange", true);
        this.lintOnSave = config.get<boolean>("linting.lintOnSave", true);   
        this.pylintPath = config.get<string>("linting.pylintPath", "pylint");  
        this.pep8Path = config.get<string>("linting.pep8Path", "pep8");     
    }
    public constructor(){
        vscode.workspace.onDidChangeConfiguration(()=>{
            this.readConfigSettings();        
        });
        this.readConfigSettings();
    }
    
    public register(rootDir:string):vscode.Disposable[]{
        var disposables = [];
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection("python");        
        var disposable = vscode.workspace.onDidChangeTextDocument((e)=>{
            if (e.document.languageId !== "python" || !this.lintEnabled || !this.lintOnTextChange){
                return;
            }
            this.lintDocument(e.document.uri, e.document.getText().split(/\r?\n/g), 1000);
        });        
        disposables.push(disposable);
        
        disposable = vscode.workspace.onDidSaveTextDocument((e)=>{
            if (e.languageId !== "python" || !this.lintEnabled || !this.lintOnSave){
                return;
            }
            this.lintDocument(e.uri, e.getText().split(/\r?\n/g),100);
        });        
        disposables.push(disposable);
        
        return disposables;
    }
    
    private lastTimeout:number;
    private lintDocument(documentUri:vscode.Uri, documentLines:string[], delay:number):void{
        //Since this is a hack, lets wait for 2 seconds before linting
        //Give user to continue typing before we waste CPU time
        if (this.lastTimeout){
            clearTimeout(this.lastTimeout);
            this.lastTimeout = 0;
        }
        
        this.lastTimeout = setTimeout(()=> {
            this.onLintDocument(documentUri, documentLines);
        }, delay);
    }
    private onLintDocument(documentUri:vscode.Uri, documentLines:string[]):void{
        //Remove all issues related to this document
        if (!this.lastDocumentLintingIds[documentUri.fsPath]){
            this.lastDocumentLintingIds[documentUri.fsPath] = {filePath:documentUri.fsPath, lastRequestId:0}
        }
        var docId = <IDocumentLinting>this.lastDocumentLintingIds[documentUri.fsPath];
        docId.lastRequestId ++;
        var lastRequestId = docId.lastRequestId;
        
        var pyLintingCompletd = false;
        var pep8Completed = false;
        var pylintMessages = [];
        var pep8Messages = [];
        
        if (this.pylintEnabled){
            new Linter().run(this.pylintPath, PYLINT_COMMANDLINE, documentUri.fsPath, documentLines, this.maxNumberOfErrorsToReport, false).then(diagnostics=>{
                if (lastRequestId === docId.lastRequestId){
                    if (this.pep8Enabled){
                        diagnostics.forEach(d=>d.message = d.message + " (pylint)");
                    }
                    if (((this.pep8Enabled && pep8Completed) || (!this.pep8Enabled))){
                        diagnostics.forEach(d=>pep8Messages.push(d));
                        this.diagnosticCollection.delete(documentUri);
                        this.diagnosticCollection.set(documentUri,pep8Messages);          
                    }           
                    else {
                        pyLintingCompletd = true;
                        pylintMessages = diagnostics;
                    }
                }
            });
        }
        if (this.pep8Enabled){
            new Linter().run(this.pep8Path, PEP_COMMANDLINE, documentUri.fsPath, documentLines, this.maxNumberOfErrorsToReport, true).then(diagnostics=>{
                if (lastRequestId === docId.lastRequestId){
                    if (this.pylintEnabled){
                        diagnostics.forEach(d=>d.message = d.message + " (pep8)");
                    }
                    if (((this.pylintEnabled && pyLintingCompletd) || (!this.pylintEnabled))){
                        diagnostics.forEach(d=>pylintMessages.push(d));
                        this.diagnosticCollection.delete(documentUri);
                        this.diagnosticCollection.set(documentUri,pylintMessages);          
                    }           
                    else {
                        pep8Completed = true;
                        pep8Messages = diagnostics;
                    }
                }
            });
        }        
    }
}

class Linter {
    run(lintPath:string, lintArgs:string, filePath:string, txtDocumentLines:string[], maxNumberOfProblems: number, isPep8:boolean): Promise<vscode.Diagnostic[]> {
        // var filePath = textDocument.uri.path;
        // var txtDocumentLines = textDocument.getText().split(/\r?\n/g);
        if (NamedRegexp === null) {
            NamedRegexp = require('named-js-regexp')
        } 

        return new Promise<vscode.Diagnostic[]>((resolve, reject) => {
            var dir = path.dirname(filePath); 
            var cmd: string = `${lintPath} ${lintArgs} ${filePath}`;
            exec(cmd,(error: Error, stdout: Buffer, stderr: Buffer) => {
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
                var diagnostics: vscode.Diagnostic[] = [];
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

                        var range = new vscode.Range(new vscode.Position(match.line - 1, match.column), new vscode.Position(match.line - 1, endCol));

                        var severity = isPep8? vscode.DiagnosticSeverity.Information : PYLINT_CATEGORY_MAPPING[match.type];
                        diagnostics.push(new vscode.Diagnostic(range, match.code + ":" + match.message, severity));
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
