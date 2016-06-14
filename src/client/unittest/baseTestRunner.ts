"use strict";
import * as child_process from "child_process";
import * as path from "path";
import { exec } from "child_process";
import {sendCommand} from "./../common/childProc";
import * as settings from "./../common/configSettings";
import {OutputChannel, window, workspace} from "vscode";

export abstract class BaseTestRunner {
    public Id: string;
    protected pythonSettings: settings.IPythonSettings;
    protected outputChannel: OutputChannel;
    private includeErrorAsResponse: boolean;
    constructor(id: string, pythonSettings: settings.IPythonSettings, outputChannel: OutputChannel, includeErrorAsResponse: boolean = false) {
        this.Id = id;
        this.pythonSettings = pythonSettings;
        this.outputChannel = outputChannel;
        this.includeErrorAsResponse = includeErrorAsResponse;
    }

    public runTests(filePath: string): Promise<any> {
        return Promise.resolve();
    }
    public abstract isEnabled(): boolean;
    protected run(commandLine: string): Promise<any> {
        let outputChannel = this.outputChannel;
        let linterId = this.Id;

        return new Promise<any>((resolve, reject) => {
            sendCommand(commandLine, workspace.rootPath, this.includeErrorAsResponse).then(data => {
                outputChannel.append(data);
                outputChannel.show();
            }, error => {
                outputChannel.append(error);
                outputChannel.show();
            });
        });
    }
}
