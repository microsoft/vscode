/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';
import * as vscode from 'vscode';
import * as baseTest from './../unittest/baseTestRunner';
import * as unittest from './../unittest/unittest';
import * as nosetest from './../unittest/nosetests';
import * as settings from './../common/configSettings';

let pythonOutputChannel: vscode.OutputChannel;
let testProviders: baseTest.BaseTestRunner[] = [];

export function activateUnitTestProvider(context: vscode.ExtensionContext, settings: settings.IPythonSettings, outputChannel: vscode.OutputChannel) {
    pythonOutputChannel = outputChannel;
    vscode.commands.registerCommand("python.runtests", () => runUnitTests());

    testProviders.push(new unittest.PythonUnitTest(settings, outputChannel));
    testProviders.push(new nosetest.NoseTests(settings, outputChannel));
}

function runUnitTests(filePath: string = "") {
    pythonOutputChannel.clear();

    var promises = testProviders.map(t=> t.runTests(filePath));
    Promise.all(promises).then(() => {
        pythonOutputChannel.show();
    })
}