'use strict';

import * as path from 'path';
import * as baseTestRunner from './baseTestRunner';
import * as settings from './../common/configSettings';
import {OutputChannel} from 'vscode';

export class NoseTests extends baseTestRunner.BaseTestRunner {
    constructor(pythonSettings: settings.IPythonSettings, outputChannel: OutputChannel) {
        super("nosetests", pythonSettings, outputChannel, true);
    }

    public runTests(filePath: string = ""): Promise<any> {
        if (!this.pythonSettings.unitTest.nosetestsEnabled) {
            return Promise.resolve();
        }

        var nosetestsPath = this.pythonSettings.unitTest.nosetestPath;
        var cmdLine = `${nosetestsPath} ${filePath}`;
        return new Promise<any>(resolve => {
            this.run(cmdLine).then(messages=> {
                resolve(messages);
            });
        });
    }
}
