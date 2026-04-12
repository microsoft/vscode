"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = require("assert");
require("mocha");
const path_1 = require("path");
const terminalSuggestMain_1 = require("../terminalSuggestMain");
const tokens_1 = require("../tokens");
const cd_test_1 = require("./completions/cd.test");
const code_test_1 = require("./completions/code.test");
const helpers_1 = require("./helpers");
const code_insiders_test_1 = require("./completions/code-insiders.test");
const ls_test_1 = require("./completions/upstream/ls.test");
const echo_test_1 = require("./completions/upstream/echo.test");
const mkdir_test_1 = require("./completions/upstream/mkdir.test");
const rm_test_1 = require("./completions/upstream/rm.test");
const rmdir_test_1 = require("./completions/upstream/rmdir.test");
const touch_test_1 = require("./completions/upstream/touch.test");
const git_test_1 = require("./completions/upstream/git.test");
const os_1 = require("../helpers/os");
const code_1 = __importDefault(require("../completions/code"));
const fig_test_1 = require("./fig.test");
const testSpecs2 = [
    {
        name: 'Fallback to default completions',
        completionSpecs: [],
        availableCommands: [],
        testSpecs: [
            { input: '|', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
            { input: '|.', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
            { input: '|./', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
            { input: 'fakecommand |', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        ]
    },
    ...fig_test_1.figGenericTestSuites,
    // completions/
    cd_test_1.cdTestSuiteSpec,
    code_test_1.codeTestSuite,
    code_insiders_test_1.codeInsidersTestSuite,
    code_test_1.codeTunnelTestSuite,
    code_insiders_test_1.codeTunnelInsidersTestSuite,
    // completions/upstream/
    echo_test_1.echoTestSuiteSpec,
    ls_test_1.lsTestSuiteSpec,
    mkdir_test_1.mkdirTestSuiteSpec,
    rm_test_1.rmTestSuiteSpec,
    rmdir_test_1.rmdirTestSuiteSpec,
    touch_test_1.touchTestSuiteSpec,
    git_test_1.gitTestSuiteSpec,
];
if ((0, os_1.osIsWindows)()) {
    testSpecs2.push({
        name: 'Handle options extensions on Windows',
        completionSpecs: [code_1.default],
        availableCommands: [
            'code.bat',
            'code.cmd',
            'code.exe',
            'code.anything',
        ],
        testSpecs: [
            { input: 'code |', expectedCompletions: code_test_1.codeSpecOptionsAndSubcommands, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
            { input: 'code.bat |', expectedCompletions: code_test_1.codeSpecOptionsAndSubcommands, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
            { input: 'code.cmd |', expectedCompletions: code_test_1.codeSpecOptionsAndSubcommands, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
            { input: 'code.exe |', expectedCompletions: code_test_1.codeSpecOptionsAndSubcommands, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
            { input: 'code.anything |', expectedCompletions: code_test_1.codeSpecOptionsAndSubcommands, expectedResourceRequests: { type: 'both', cwd: helpers_1.testPaths.cwd } },
        ]
    });
}
suite('Terminal Suggest', () => {
    for (const suiteSpec of testSpecs2) {
        suite(suiteSpec.name, () => {
            const completionSpecs = (0, terminalSuggestMain_1.asArray)(suiteSpec.completionSpecs);
            const availableCommands = (0, terminalSuggestMain_1.asArray)(suiteSpec.availableCommands);
            for (const testSpec of suiteSpec.testSpecs) {
                let expectedString = testSpec.expectedCompletions ? `[${testSpec.expectedCompletions.map(e => `'${e}'`).join(', ')}]` : '[]';
                if (testSpec.expectedResourceRequests) {
                    expectedString += ` + ${testSpec.expectedResourceRequests.type}`;
                    if (testSpec.expectedResourceRequests.cwd && testSpec.expectedResourceRequests.cwd.fsPath !== helpers_1.testPaths.cwd.fsPath) {
                        expectedString += ` @ ${(0, path_1.basename)(testSpec.expectedResourceRequests.cwd.fsPath)}/`;
                    }
                }
                test(`'${testSpec.input}' -> ${expectedString}`, async () => {
                    const commandLine = testSpec.input.split('|')[0];
                    const cursorIndex = testSpec.input.indexOf('|');
                    const currentCommandString = (0, terminalSuggestMain_1.getCurrentCommandAndArgs)(commandLine, cursorIndex, undefined);
                    const showFiles = testSpec.expectedResourceRequests?.type === 'files' || testSpec.expectedResourceRequests?.type === 'both';
                    const showDirectories = testSpec.expectedResourceRequests?.type === 'folders' || testSpec.expectedResourceRequests?.type === 'both';
                    const terminalContext = { commandLine, cursorIndex };
                    const result = await (0, terminalSuggestMain_1.getCompletionItemsFromSpecs)(completionSpecs, terminalContext, availableCommands.map(c => { return { label: c }; }), currentCommandString, (0, tokens_1.getTokenType)(terminalContext, undefined), helpers_1.testPaths.cwd, {}, 'testName', undefined, new MockFigExecuteExternals());
                    (0, assert_1.deepStrictEqual)(
                    // Add detail to the label if it exists
                    result.items.map(i => {
                        if (typeof i.label === 'object' && i.label.detail) {
                            return `${i.label.label}${i.label.detail}`;
                        }
                        return i.label;
                    }).sort(), (testSpec.expectedCompletions ?? []).sort());
                    (0, assert_1.strictEqual)(result.showFiles, showFiles, 'Show files different than expected, got: ' + result.showFiles);
                    (0, assert_1.strictEqual)(result.showDirectories, showDirectories, 'Show directories different than expected, got: ' + result.showDirectories);
                    if (testSpec.expectedResourceRequests?.cwd) {
                        (0, assert_1.strictEqual)(result.cwd?.fsPath, testSpec.expectedResourceRequests.cwd.fsPath, 'Non matching cwd');
                    }
                });
            }
        });
    }
});
class MockFigExecuteExternals {
    async executeCommand(input) {
        return this.executeCommandTimeout(input);
    }
    async executeCommandTimeout(input) {
        const command = [input.command, ...input.args].join(' ');
        try {
            return {
                status: 0,
                stdout: input.command,
                stderr: '',
            };
        }
        catch (err) {
            console.error(`Error running shell command '${command}'`, { err });
            throw err;
        }
    }
}
//# sourceMappingURL=terminalSuggestMain.test.js.map