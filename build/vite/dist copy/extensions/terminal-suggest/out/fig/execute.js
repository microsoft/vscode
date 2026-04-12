"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeCommand = exports.executeCommandTimeout = exports.cleanOutput = void 0;
const os_1 = require("../helpers/os");
const common_1 = require("../shell/common");
const utils_1 = require("./shared/utils");
const cleanOutput = (output) => output
    .replace(/\r\n/g, '\n') // Replace carriage returns with just a normal return
    .replace(/\x1b\[\?25h/g, '') // removes cursor character if present
    .replace(/^\n+/, '') // strips new lines from start of output
    .replace(/\n+$/, ''); // strips new lines from end of output
exports.cleanOutput = cleanOutput;
const executeCommandTimeout = async (fallbacks, input, timeout = (0, os_1.osIsWindows)() ? 20000 : 5000) => {
    const command = [input.command, ...input.args].join(' ');
    try {
        console.debug(`About to run shell command '${command}'`);
        const result = await (0, utils_1.withTimeout)(Math.max(timeout, input.timeout ?? 0), (0, common_1.spawnHelper2)(input.command, input.args, {
            env: input.env ?? fallbacks.env,
            cwd: input.cwd ?? fallbacks.cwd,
            timeout: input.timeout,
        }));
        const cleanStdout = (0, exports.cleanOutput)(result.stdout);
        const cleanStderr = (0, exports.cleanOutput)(result.stderr);
        if (result.exitCode !== 0) {
            console.warn(`Command ${command} exited with exit code ${result.exitCode}: ${cleanStderr}`);
        }
        return {
            status: result.exitCode,
            stdout: cleanStdout,
            stderr: cleanStderr,
        };
    }
    catch (err) {
        console.error(`Error running shell command '${command}'`, { err });
        throw err;
    }
};
exports.executeCommandTimeout = executeCommandTimeout;
const executeCommand = (fallbacks, args) => (0, exports.executeCommandTimeout)(fallbacks, args);
exports.executeCommand = executeCommand;
//# sourceMappingURL=execute.js.map