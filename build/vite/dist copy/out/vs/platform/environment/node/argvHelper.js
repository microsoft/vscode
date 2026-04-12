/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { dirname, resolve } from '../../../base/common/path.js';
import { isWindows } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { NATIVE_CLI_COMMANDS, OPTIONS, parseArgs } from './argv.js';
function parseAndValidate(cmdLineArgs, reportWarnings) {
    const onMultipleValues = (id, val) => {
        console.warn(localize('multipleValues', "Option '{0}' is defined more than once. Using value '{1}'.", id, val));
    };
    const onEmptyValue = (id) => {
        console.warn(localize('emptyValue', "Option '{0}' requires a non empty value. Ignoring the option.", id));
    };
    const onDeprecatedOption = (deprecatedOption, message) => {
        console.warn(localize('deprecatedArgument', "Option '{0}' is deprecated: {1}", deprecatedOption, message));
    };
    const getSubcommandReporter = (command) => ({
        onUnknownOption: (id) => {
            if (!NATIVE_CLI_COMMANDS.includes(command)) {
                console.warn(localize('unknownSubCommandOption', "Warning: '{0}' is not in the list of known options for subcommand '{1}'", id, command));
            }
        },
        onMultipleValues,
        onEmptyValue,
        onDeprecatedOption,
        getSubcommandReporter: NATIVE_CLI_COMMANDS.includes(command) ? getSubcommandReporter : undefined
    });
    const errorReporter = {
        onUnknownOption: (id) => {
            console.warn(localize('unknownOption', "Warning: '{0}' is not in the list of known options, but still passed to Electron/Chromium.", id));
        },
        onMultipleValues,
        onEmptyValue,
        onDeprecatedOption,
        getSubcommandReporter
    };
    const args = parseArgs(cmdLineArgs, OPTIONS, reportWarnings ? errorReporter : undefined);
    if (args.goto) {
        args._.forEach(arg => assert(/^(\w:)?[^:]+(:\d*){0,2}:?$/.test(arg), localize('gotoValidation', "Arguments in `--goto` mode should be in the format of `FILE(:LINE(:CHARACTER))`.")));
    }
    return args;
}
function stripAppPath(argv) {
    const index = argv.findIndex(a => !/^-/.test(a));
    if (index > -1) {
        return [...argv.slice(0, index), ...argv.slice(index + 1)];
    }
    return undefined;
}
/**
 * Use this to parse raw code process.argv such as: `Electron . --verbose --wait`
 */
export function parseMainProcessArgv(processArgv) {
    let [, ...args] = processArgv;
    // When code.exe is configured to 'Run as administrator' on Windows, the CLI launcher (code.cmd) sets ELECTRON_RUN_AS_NODE=1 and passes
    // cli.js as the first argument. The elevated process does not inherit the environment variable so Electron starts as a GUI app with cli.js
    // as a stray positional argument. Detect and strip it. The path may include a version subdirectory (e.g., 2ca3b2734b\resources\app\out\cli.js).
    if (isWindows && args.length > 0) {
        const resolvedArg = resolve(args[0]).toLowerCase();
        const installDir = dirname(process.execPath).toLowerCase() + '\\';
        if (resolvedArg.startsWith(installDir) && resolvedArg.endsWith('\\resources\\app\\out\\cli.js')) {
            args.shift();
        }
    }
    // If dev, remove the first non-option argument: it's the app location
    if (process.env['VSCODE_DEV']) {
        args = stripAppPath(args) || [];
    }
    // If called from CLI, don't report warnings as they are already reported.
    const reportWarnings = !isLaunchedFromCli(process.env);
    return parseAndValidate(args, reportWarnings);
}
/**
 * Use this to parse raw code CLI process.argv such as: `Electron cli.js . --verbose --wait`
 */
export function parseCLIProcessArgv(processArgv) {
    let [, , ...args] = processArgv; // remove the first non-option argument: it's always the app location
    // If dev, remove the first non-option argument: it's the app location
    if (process.env['VSCODE_DEV']) {
        args = stripAppPath(args) || [];
    }
    return parseAndValidate(args, true);
}
export function addArg(argv, ...args) {
    const endOfArgsMarkerIndex = argv.indexOf('--');
    if (endOfArgsMarkerIndex === -1) {
        argv.push(...args);
    }
    else {
        // if the we have an argument "--" (end of argument marker)
        // we cannot add arguments at the end. rather, we add
        // arguments before the "--" marker.
        argv.splice(endOfArgsMarkerIndex, 0, ...args);
    }
    return argv;
}
export function isLaunchedFromCli(env) {
    return env['VSCODE_CLI'] === '1';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXJndkhlbHBlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2Vudmlyb25tZW50L25vZGUvYXJndkhlbHBlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNoRSxPQUFPLEVBQXVCLFNBQVMsRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQ2xGLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQztBQUUzQyxPQUFPLEVBQWlCLG1CQUFtQixFQUFFLE9BQU8sRUFBRSxTQUFTLEVBQUUsTUFBTSxXQUFXLENBQUM7QUFFbkYsU0FBUyxnQkFBZ0IsQ0FBQyxXQUFxQixFQUFFLGNBQXVCO0lBQ3ZFLE1BQU0sZ0JBQWdCLEdBQUcsQ0FBQyxFQUFVLEVBQUUsR0FBVyxFQUFFLEVBQUU7UUFDcEQsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLEVBQUUsNERBQTRELEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDakgsQ0FBQyxDQUFDO0lBQ0YsTUFBTSxZQUFZLEdBQUcsQ0FBQyxFQUFVLEVBQUUsRUFBRTtRQUNuQyxPQUFPLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsK0RBQStELEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUMzRyxDQUFDLENBQUM7SUFDRixNQUFNLGtCQUFrQixHQUFHLENBQUMsZ0JBQXdCLEVBQUUsT0FBZSxFQUFFLEVBQUU7UUFDeEUsT0FBTyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLEVBQUUsaUNBQWlDLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLENBQUMsQ0FBQztJ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