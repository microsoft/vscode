//
// Note: This example test is leveraging the Mocha test framework.
// Please refer to their documentation on https://mochajs.org/ for help.
//

// The module 'assert' provides assertion methods from node
import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import {sendCommand} from "../client/common/childProc";

// Defines a Mocha test suite to group tests of similar kind together
suite("ChildProc", () => {

    test("Standard Response", () => {
        sendCommand("python -c \"print(1)\"", __dirname, false).then(data => {
            assert.ok(data === "1\n");
        });
    });
    test("Error Response", () => {
        sendCommand("python -c \"print1234(1)\"", __dirname, false).then(data => {
            assert.ok(false);
        }).catch(() => {
            assert.ok(true);
        });
    });
});