/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { dirname, resolve } from '../../../base/common/path.js';
import { IProcessEnvironment, isWindows } from '../../../base/common/platform.js';
import { localize } from '../../../nls.js';
import { NativeParsedArgs } from '../common/argv.js';
import { ErrorReporter, NATIVE_CLI_COMMANDS, OPTIONS, parseArgs } from './argv.js';

function parseAndValidate(cmdLineArgs: string[], reportWarnings: boolean): NativeParsedArgs {
	const onMultipleValues = (id: string, val: string) => {
		console.warn(localize('multipleValues', "Option '{0}' is defined more than once. Using value '{1}'.", id, val));
	};
	const onEmptyValue = (id: string) => {
		console.warn(localize('emptyValue', "Option '{0}' requires a non empty value. Ignoring the option.", id));
	};
	const onDeprecatedOption = (deprecatedOption: string, message: string) => {
		console.warn(localize('deprecatedArgument', "Option '{0}' is deprecated: {1}", deprecatedOption, message));
	};
	const getSubcommandReporter = (command: string) => ({
		onUnknownOption: (id: string) => {
			if (!(NATIVE_CLI_COMMANDS as readonly string[]).includes(command)) {
				console.warn(localize('unknownSubCommandOption', "Warning: '{0}' is not in the list of known options for subcommand '{1}'", id, command));
			}
		},
		onMultipleValues,
		onEmptyValue,
		onDeprecatedOption,
		getSubcommandReporter: (NATIVE_CLI_COMMANDS as readonly string[]).includes(command) ? getSubcommandReporter : undefined
	});
	const errorReporter: ErrorReporter = {
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

function stripAppPath(argv: string[]): string[] | undefined {
	const index = argv.findIndex(a => !/^-/.test(a));

	if (index > -1) {
		return [...argv.slice(0, index), ...argv.slice(index + 1)];
	}
	return undefined;
}

/**
 * Use this to parse raw code process.argv such as: `Electron . --verbose --wait`
 */
export function parseMainProcessArgv(processArgv: string[]): NativeParsedArgs {
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
export function parseCLIProcessArgv(processArgv: string[]): NativeParsedArgs {
	let [, , ...args] = processArgv; // remove the first non-option argument: it's always the app location

	// If dev, remove the first non-option argument: it's the app location
	if (process.env['VSCODE_DEV']) {
		args = stripAppPath(args) || [];
	}

	return parseAndValidate(args, true);
}

export function addArg(argv: string[], ...args: string[]): string[] {
	const endOfArgsMarkerIndex = argv.indexOf('--');
	if (endOfArgsMarkerIndex === -1) {
		argv.push(...args);
	} else {
		// if the we have an argument "--" (end of argument marker)
		// we cannot add arguments at the end. rather, we add
		// arguments before the "--" marker.
		argv.splice(endOfArgsMarkerIndex, 0, ...args);
	}

	return argv;
}

export function isLaunchedFromCli(env: IProcessEnvironment): boolean {
	return env['VSCODE_CLI'] === '1';
}
