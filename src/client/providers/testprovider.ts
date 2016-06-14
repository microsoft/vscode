"use strict";
import * as vscode from "vscode";
import * as baseTest from "./../unittest/baseTestRunner";
import * as unittest from "./../unittest/unittest";
import * as nosetest from "./../unittest/nosetests";
import * as settings from "./../common/configSettings";
import * as telemetryHelper from "../common/telemetry";
import * as telemetryContracts from "../common/telemetryContracts";

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

    let promises = testProviders.map(t => {
        if (!t.isEnabled()) {
            return Promise.resolve();
        }
        let delays = new telemetryHelper.Delays();
        t.runTests(filePath).then(() => {
            delays.stop();
            telemetryHelper.sendTelemetryEvent(telemetryContracts.Commands.UnitTests, { UnitTest_Provider: t.Id }, delays.toMeasures());
        });
    });
    Promise.all(promises).then(() => {
        pythonOutputChannel.show();
    });
}