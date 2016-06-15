"use strict";

import * as baseTestRunner from "./baseTestRunner";
import * as settings from "./../common/configSettings";
import {OutputChannel} from "vscode";

export class PyTestTests extends baseTestRunner.BaseTestRunner {
    constructor(pythonSettings: settings.IPythonSettings, outputChannel: OutputChannel) {
        super("pytest", pythonSettings, outputChannel, true);
    }

    public isEnabled(): boolean {
        return this.pythonSettings.unitTest.pyTestEnabled;
    }

    public runTests(filePath: string = ""): Promise<any> {
        if (!this.pythonSettings.unitTest.pyTestEnabled) {
            return Promise.resolve();
        }

        let pyTestPath = this.pythonSettings.unitTest.pyTestPath;
        let cmdLine = `${pyTestPath} ${filePath}`;
        return new Promise<any>(resolve => {
            this.run(cmdLine).then(messages => {
                resolve(messages);
            });
        });
    }
}