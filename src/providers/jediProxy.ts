import * as fs from 'fs';
import * as os from 'os';
import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';

var proc: child_process.ChildProcess;


function spawnProcess(dir: string) {
    proc = child_process.spawn("python", ["-u", "completion.py"], {
        cwd: dir
    });

    proc.stderr.on("data", (data) => {
        console.error("Error " + data);
    });

    proc.on("end", (end) => {
        console.error("End - " + end);
    });

    proc.stdout.on("data", (data) => {
        var dataStr = data + "";
        var responses = dataStr.split("\n").filter(line=> line.length > 0).map(resp=> JSON.parse(resp));
        responses.forEach((response) => {
            if (response["argments"]) {
                var index = commandQueue.indexOf(cmd.id);
                commandQueue.splice(index, 1);
                return;
            }
            var cmd = <ICommand>commands[response["id"]];
            if (typeof cmd === "object" && cmd !== null) {
                delete commands[cmd.id];
                var index = commandQueue.indexOf(cmd.id);
                commandQueue.splice(index, 1);

                switch (cmd.command) {
                    case CommandType.Completions: {
                        var results = <IAutoCompleteItem[]>response['results'];
                        if (results.length > 0) {
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
                            var defResult: IDefinitionResult = {
                                requestId: cmd.id,
                                definition: {
                                    columnIndex: <number>defs[0].column,
                                    fileName: <string>defs[0].fileName,
                                    lineIndex: <number>defs[0].line,
                                    text: <string>defs[0].text,
                                    type: <string>defs[0].type
                                }
                            };

                            cmd.resolve(defResult);
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
                    if (commands[id]) {
                        delete commands[id];
                    }
                })
            }
        });
    });

}

function getConfig() {
    return {
        extraPaths: [],
        useSnippets: false,
        caseInsensitiveCompletion: true,
        showDescriptions: true,
        fuzzyMatcher: true
    };
}
var lookupTypes = ["arguments", "completions", "usages", "definitions"];

export enum CommandType {
    Arguments,
    Completions,
    Usages,
    Definitions
}

export interface ICommand {
    id: string,
    command: CommandType,
    source: string,
    fileName: string,
    lineIndex: number,
    columnIndex: number,
    resolve: (value?: ICommandResult) => void;
    reject: (ICommandError) => void
}

export interface ICommandError {
    message: string
}

export interface ICommandResult {
    requestId: string
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
export interface IReference {
    name: string,
    fileName: string,
    columnIndex: number,
    lineIndex: number,
    moduleName: string
}

export interface IAutoCompleteItem {
    type: string,
    text: string,
    description: string,
    rightLabel: string
}
export interface IDefinition {
    type: string,
    text: string,
    fileName: string,
    columnIndex: number,
    lineIndex: number
}
var commands = {};
var commandQueue: string[] = [];

export function sendCommand(cmd: ICommand): Promise<ICommandResult> {
    return new Promise<ICommandResult>((resolve, reject) => {
        var payload = createPayload(cmd);
        cmd.resolve = resolve;
        cmd.reject = reject;
        proc.stdin.write(JSON.stringify(payload) + "\n");
        commands[cmd.id] = cmd;
        commandQueue.push(cmd.id);
    });
}

var commandNames = {};
commandNames[CommandType.Arguments] = "arguments";
commandNames[CommandType.Completions] = "completions";
commandNames[CommandType.Definitions] = "definitions";
commandNames[CommandType.Usages] = "usages";

var started: boolean = false;
export function initialize(dir: string) {
    if (started) { return; }
    started = true;
    spawnProcess(path.join(dir, "out/src"));
}

function createPayload(cmd: ICommand): any {
    return {
        id: cmd.id,
        prefix: "",
        lookup: commandNames[cmd.command],
        path: cmd.fileName,
        source: cmd.source,
        line: cmd.lineIndex,
        column: cmd.columnIndex,
        config: getConfig()
    };
}
