'use strict';
import * as child_process from 'child_process';
import * as path from 'path';
import { exec } from 'child_process';
import {sendCommand} from './../common/childProc';
import * as settings from './../common/configSettings';
import {OutputChannel, window, workspace} from 'vscode';

export abstract class BaseTestRunner {
    public Id: string;
    protected pythonSettings: settings.IPythonSettings;
    protected outputChannel: OutputChannel;
    constructor(id: string, pythonSettings: settings.IPythonSettings, outputChannel: OutputChannel) {
        this.Id = id;
        this.pythonSettings = pythonSettings;
        this.outputChannel = outputChannel;
    }

    public runTests(filePath: string): Promise<any> {
        return Promise.resolve();
    }

    protected run(commandLine: string): Promise<any> {
        var outputChannel = this.outputChannel;
        var linterId = this.Id;

        return new Promise<any>((resolve, reject) => {
            sendCommand(commandLine, workspace.rootPath).then(data => {
                outputChannel.append(data);
                outputChannel.show();
            }, error=> {
                outputChannel.append(error);
                outputChannel.show();
            });
        });
    }
}
