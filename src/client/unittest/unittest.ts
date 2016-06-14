"use strict";

import * as path from "path";
import * as baseTestRunner from "./baseTestRunner";
import * as settings from "./../common/configSettings";
import {OutputChannel} from "vscode";

export class PythonUnitTest extends baseTestRunner.BaseTestRunner {
    constructor(pythonSettings: settings.IPythonSettings, outputChannel: OutputChannel) {
        super("unittest", pythonSettings, outputChannel, true);
    }

    public isEnabled(): boolean {
        return this.pythonSettings.unitTest.unittestEnabled;
    }
    public runTests(filePath: string = ""): Promise<any> {
        if (!this.pythonSettings.unitTest.unittestEnabled) {
            return Promise.resolve();
        }

        let ptyhonPath = this.pythonSettings.pythonPath;
        let unittestPath = " unittest";
        let cmdLine = "";
        if (typeof filePath !== "string" || filePath.length === 0) {
            cmdLine = `${ptyhonPath} -m unittest discover`;
        }
        else {
            cmdLine = `${ptyhonPath} -m unittest ${filePath}`;
        }
        return new Promise<any>(resolve => {
            this.run(cmdLine).then(messages => {
                resolve(messages);
            });
        });
    }
}