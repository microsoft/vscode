'use strict';

import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import * as settings from './../common/configSettings';
import * as logger from './../common/logger';

var proc: child_process.ChildProcess;
var pythonSettings = settings.PythonSettings.getInstance();

const pythonVSCodeTypeMappings = new Map<string, vscode.CompletionItemKind>();
var mappings = {
    "none": vscode.CompletionItemKind.Value,
    "type": vscode.CompletionItemKind.Class,
    "tuple": vscode.CompletionItemKind.Class,
    "dict": vscode.CompletionItemKind.Class,
    "dictionary": vscode.CompletionItemKind.Class,
    "function": vscode.CompletionItemKind.Function,
    "lambda": vscode.CompletionItemKind.Function,
    "generator": vscode.CompletionItemKind.Function,
    "class": vscode.CompletionItemKind.Class,
    "instance": vscode.CompletionItemKind.Reference,
    "method": vscode.CompletionItemKind.Method,
    "builtin": vscode.CompletionItemKind.Class,
    "builtinfunction": vscode.CompletionItemKind.Function,
    "module": vscode.CompletionItemKind.Module,
    "file": vscode.CompletionItemKind.File,
    "xrange": vscode.CompletionItemKind.Class,
    "slice": vscode.CompletionItemKind.Class,
    "traceback": vscode.CompletionItemKind.Class,
    "frame": vscode.CompletionItemKind.Class,
    "buffer": vscode.CompletionItemKind.Class,
    "dictproxy": vscode.CompletionItemKind.Class,
    "funcdef": vscode.CompletionItemKind.Function,
    "property": vscode.CompletionItemKind.Property,
    "import": vscode.CompletionItemKind.Module,
    "keyword": vscode.CompletionItemKind.Keyword,
    "constant": vscode.CompletionItemKind.Variable,
    "variable": vscode.CompletionItemKind.Variable,
    "value": vscode.CompletionItemKind.Value,
    "param": vscode.CompletionItemKind.Variable,
    "statement": vscode.CompletionItemKind.Keyword
};

Object.keys(mappings).forEach(key=> {
    pythonVSCodeTypeMappings.set(key, mappings[key]);
});

const pythonVSCodeSymbolMappings = new Map<string, vscode.SymbolKind>();
var symbolMappings = {
    "none": vscode.SymbolKind.Variable,
    "type": vscode.SymbolKind.Class,
    "tuple": vscode.SymbolKind.Class,
    "dict": vscode.SymbolKind.Class,
    "dictionary": vscode.SymbolKind.Class,
    "function": vscode.SymbolKind.Function,
    "lambda": vscode.SymbolKind.Function,
    "generator": vscode.SymbolKind.Function,
    "class": vscode.SymbolKind.Class,
    "instance": vscode.SymbolKind.Class,
    "method": vscode.SymbolKind.Method,
    "builtin": vscode.SymbolKind.Class,
    "builtinfunction": vscode.SymbolKind.Function,
    "module": vscode.SymbolKind.Module,
    "file": vscode.SymbolKind.File,
    "xrange": vscode.SymbolKind.Array,
    "slice": vscode.SymbolKind.Class,
    "traceback": vscode.SymbolKind.Class,
    "frame": vscode.SymbolKind.Class,
    "buffer": vscode.SymbolKind.Array,
    "dictproxy": vscode.SymbolKind.Class,
    "funcdef": vscode.SymbolKind.Function,
    "property": vscode.SymbolKind.Property,
    "import": vscode.SymbolKind.Module,
    "keyword": vscode.SymbolKind.Variable,
    "constant": vscode.SymbolKind.Constant,
    "variable": vscode.SymbolKind.Variable,
    "value": vscode.SymbolKind.Variable,
    "param": vscode.SymbolKind.Variable,
    "statement": vscode.SymbolKind.Variable,
    "boolean": vscode.SymbolKind.Boolean,
    "int": vscode.SymbolKind.Number,
    "longlean": vscode.SymbolKind.Number,
    "float": vscode.SymbolKind.Number,
    "complex": vscode.SymbolKind.Number,
    "string": vscode.SymbolKind.String,
    "unicode": vscode.SymbolKind.String,
    "list": vscode.SymbolKind.Array
};

Object.keys(symbolMappings).forEach(key=> {
    pythonVSCodeSymbolMappings.set(key, symbolMappings[key]);
});

function getMappedVSCodeType(pythonType: string): vscode.CompletionItemKind {
    if (pythonVSCodeTypeMappings.has(pythonType)) {
        return pythonVSCodeTypeMappings.get(pythonType);
    }
    else {
        return vscode.CompletionItemKind.Keyword;
    }
}

function getMappedVSCodeSymbol(pythonType: string): vscode.SymbolKind {
    if (pythonVSCodeTypeMappings.has(pythonType)) {
        return pythonVSCodeSymbolMappings.get(pythonType);
    }
    else {
        return vscode.SymbolKind.Variable;
    }
}

export enum CommandType {
    Arguments,
    Completions,
    Usages,
    Definitions,
    Symbols
}

var commandNames = new Map<CommandType, string>();
commandNames.set(CommandType.Arguments, "arguments");
commandNames.set(CommandType.Completions, "completions");
commandNames.set(CommandType.Definitions, "definitions");
commandNames.set(CommandType.Usages, "usages");
commandNames.set(CommandType.Symbols, "names");

export class JediProxy extends vscode.Disposable {
    public constructor(context: vscode.ExtensionContext) {
        super(killProcess);

        context.subscriptions.push(this);
        initialize(context.asAbsolutePath("."));
    }

    private cmdId: number = 0;

    public getNextCommandId(): number {
        return this.cmdId++;
    }
    public sendCommand<T extends ICommandResult>(cmd: ICommand<T>): Promise<T> {
        return sendCommand(cmd);
    }
}

function initialize(dir: string) {
    spawnProcess(path.join(dir, "pythonFiles"));
}

var previousData = "";
var commands = new Map<number, IExecutionCommand<ICommandResult>>();
var commandQueue: number[] = [];

function killProcess() {
    try {
        if (proc) {
            proc.kill();
        }
    }
    catch (ex) { }
}

function handleError(source: string, errorMessage: string) {
    logger.error(source + ' jediProxy', `Error (${source}) ${errorMessage}`);
}

function spawnProcess(dir: string) {
    try {
        logger.log('child_process.spawn in jediProxy', 'Value of pythonSettings.pythonPath is :' + pythonSettings.pythonPath);
        proc = child_process.spawn(pythonSettings.pythonPath, ["-u", "completion.py"], {
            cwd: dir
        });
    }
    catch (ex) {
        return handleError("spawnProcess", ex.message);
    }
    proc.stderr.on("data", (data) => {
        handleError("stderr", data);
    });
    proc.on("end", (end) => {
        logger.error('spawnProcess.end', "End - " + end);
    });
    proc.on("error", error => {
        handleError("error", error);
    });

    proc.stdout.on("data", (data) => {
        //Possible there was an exception in parsing the data returned
        //So append the data then parse it
        var dataStr = previousData = previousData + data + ""
        var responses: any[];
        try {
            responses = dataStr.split("\n").filter(line=> line.length > 0).map(resp=> JSON.parse(resp));
            previousData = "";
        }
        catch (ex) {
            //Possible we've only received part of the data, hence don't clear previousData
            handleError("stdout", ex.message);
            return;
        }

        responses.forEach((response) => {
            if (response["argments"]) {
                var index = commandQueue.indexOf(cmd.id);
                commandQueue.splice(index, 1);
                return;
            }
            var responseId = <number>response["id"];

            var cmd = <IExecutionCommand<ICommandResult>>commands.get(responseId);

            if (typeof cmd === "object" && cmd !== null) {
                commands.delete(responseId);
                var index = commandQueue.indexOf(cmd.id);
                commandQueue.splice(index, 1);

                //Check if this command has expired
                if (cmd.token.isCancellationRequested) {
                    return;
                }

                switch (cmd.command) {
                    case CommandType.Completions: {
                        var results = <IAutoCompleteItem[]>response['results'];
                        if (results.length > 0) {
                            results.forEach(item=> {
                                item.type = getMappedVSCodeType(<string><any>item.type);
                                item.kind = getMappedVSCodeSymbol(<string><any>item.type);
                            });

                            var completionResult: ICompletionResult = {
                                items: results,
                                requestId: cmd.id
                            }
                            cmd.resolve(completionResult);
                        }
                        break;
                    }
                    case CommandType.Definitions: {
                        var defs = <any[]>response['results'];
                        if (defs.length > 0) {
                            var def = defs[0];
                            var defResult: IDefinitionResult = {
                                requestId: cmd.id,
                                definition: {
                                    columnIndex: Number(def.column),
                                    fileName: def.fileName,
                                    lineIndex: Number(def.line),
                                    text: def.text,
                                    type: getMappedVSCodeType(<string>def.type),
                                    kind: getMappedVSCodeSymbol(<string>def.type)
                                }
                            };

                            cmd.resolve(defResult);
                        }
                        break;
                    }
                    case CommandType.Symbols: {
                        var defs = <any[]>response['results'];
                        if (defs.length > 0) {
                            var defResults: ISymbolResult = {
                                requestId: cmd.id,
                                definitions: []
                            }
                            defResults.definitions = defs.map(def=> {
                                return <IDefinition>{
                                    columnIndex: <number>def.column,
                                    fileName: <string>def.fileName,
                                    lineIndex: <number>def.line,
                                    text: <string>def.text,
                                    type: getMappedVSCodeType(<string>def.type),
                                    kind: getMappedVSCodeSymbol(<string><any>def.type)
                                };
                            });

                            cmd.resolve(defResults);
                        }
                        break;
                    }
                    case CommandType.Usages: {
                        var defs = <any[]>response['results'];
                        if (defs.length > 0) {
                            var refResult: IReferenceResult = {
                                requestId: cmd.id,
                                references: defs.map(item=> {
                                    return {
                                        columnIndex: item.column,
                                        fileName: item.fileName,
                                        lineIndex: item.line - 1,
                                        moduleName: item.moduleName,
                                        name: item.name
                                    };
                                }
                                )
                            };

                            cmd.resolve(refResult);
                        }
                        break;
                    }
                }
            }
            
            //Ok, check if too many pending requets
            if (commandQueue.length > 10) {
                var items = commandQueue.splice(0, commandQueue.length - 10);
                items.forEach(id=> {
                    if (commands.has(id)) {
                        commands.delete(id);
                    }
                })
            }
        });
    });
}

function sendCommand<T extends ICommandResult>(cmd: ICommand<T>): Promise<T> {
    return new Promise<ICommandResult>((resolve, reject) => {
        if (!proc) {
            return reject("Python proc not initialized");
        }
        var exexcutionCmd = <IExecutionCommand<T>>cmd;
        var payload = createPayload(exexcutionCmd);
        exexcutionCmd.resolve = resolve;
        exexcutionCmd.reject = reject;
        try {
            proc.stdin.write(JSON.stringify(payload) + "\n");
            commands.set(exexcutionCmd.id, exexcutionCmd);
            commandQueue.push(exexcutionCmd.id);
        }
        catch (ex) {
            //If 'This socket is closed.' that means process didn't start at all (at least not properly)
            if (ex.message === "This socket is closed.") {
                killProcess();
            }
            else {
                handleError("sendCommand", ex.message);
            }
            reject(ex.message);
        }
    });
}

function createPayload<T extends ICommandResult>(cmd: IExecutionCommand<T>): any {
    var payload = {
        id: cmd.id,
        prefix: "",
        lookup: commandNames.get(cmd.command),
        path: cmd.fileName,
        source: cmd.source,
        line: cmd.lineIndex,
        column: cmd.columnIndex,
        config: getConfig()
    };

    if (cmd.command === CommandType.Symbols) {
        delete payload.column;
        delete payload.line;
    }

    return payload;
}

function getConfig() {
    //Add support for paths relative to workspace
    var extraPaths = pythonSettings.autoComplete.extraPaths.map(extraPath=> {
        if (path.isAbsolute(extraPath)) {
            return extraPath;
        }
        return path.join(vscode.workspace.rootPath, extraPath);
    });

    return {
        extraPaths: extraPaths,
        useSnippets: false,
        caseInsensitiveCompletion: true,
        showDescriptions: true,
        fuzzyMatcher: true
    };
}

export interface ICommand<T extends ICommandResult> {
    command: CommandType;
    source: string;
    fileName: string;
    lineIndex: number;
    columnIndex: number;
}

interface IExecutionCommand<T extends ICommandResult> extends ICommand<T> {
    id?: number;
    resolve: (value?: T) => void
    reject: (ICommandError) => void;
    token: vscode.CancellationToken;
}

export interface ICommandError {
    message: string
}

export interface ICommandResult {
    requestId: number
}
export interface ICompletionResult extends ICommandResult {
    items: IAutoCompleteItem[];
}
export interface IDefinitionResult extends ICommandResult {
    definition: IDefinition;
}
export interface IReferenceResult extends ICommandResult {
    references: IReference[];
}
export interface ISymbolResult extends ICommandResult {
    definitions: IDefinition[]
}

export interface IReference {
    name: string,
    fileName: string,
    columnIndex: number,
    lineIndex: number,
    moduleName: string
}

export interface IAutoCompleteItem {
    type: vscode.CompletionItemKind;
    kind: vscode.SymbolKind;
    text: string;
    description: string;
    rightLabel: string;
}
export interface IDefinition {
    type: vscode.CompletionItemKind;
    kind: vscode.SymbolKind;
    text: string;
    fileName: string;
    columnIndex: number;
    lineIndex: number;
}


export class JediProxyHandler<R extends ICommandResult, T> {
    private jediProxy: JediProxy;
    private defaultCallbackData: T;

    private lastToken: vscode.CancellationToken;
    private lastCommandId: number;
    private promiseResolve: (value?: T) => void;
    private parseResponse: (data: R) => T;
    private cancellationTokenSource: vscode.CancellationTokenSource;

    public constructor(context: vscode.ExtensionContext, defaultCallbackData: T, parseResponse: (data: R) => T) {
        this.jediProxy = new JediProxy(context);
        this.defaultCallbackData = defaultCallbackData;
        this.parseResponse = parseResponse;
    }

    public sendCommand(cmd: ICommand<R>, resolve: (value: T) => void, token?: vscode.CancellationToken) {
        var executionCmd = <IExecutionCommand<R>>cmd;
        executionCmd.id = executionCmd.id || this.jediProxy.getNextCommandId();

        if (this.cancellationTokenSource) {
            try {
                this.cancellationTokenSource.cancel();
            }
            catch (ex) { }
        }

        this.cancellationTokenSource = new vscode.CancellationTokenSource();
        executionCmd.token = this.cancellationTokenSource.token;

        this.jediProxy.sendCommand<R>(executionCmd).then(data=> this.onResolved(data), () => { });
        this.lastCommandId = executionCmd.id;
        this.lastToken = token;
        this.promiseResolve = resolve;
    }

    private onResolved(data: R) {
        if (this.lastToken.isCancellationRequested || data.requestId !== this.lastCommandId) {
            this.promiseResolve(this.defaultCallbackData);
        }
        if (data) {
            this.promiseResolve(this.parseResponse(data));
        }
        else {
            this.promiseResolve(this.defaultCallbackData);
        }
    }
}
