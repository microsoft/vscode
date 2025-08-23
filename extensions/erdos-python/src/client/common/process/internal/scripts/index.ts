// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { _SCRIPTS_DIR } from './constants';

const SCRIPTS_DIR = _SCRIPTS_DIR;

// "scripts" contains everything relevant to the scripts found under
// the top-level "python_files" directory.  Each of those scripts has
// a function in this module which matches the script's filename.
// Each function provides the commandline arguments that should be
// used when invoking a Python executable, whether through spawn/exec
// or a terminal.
//
// Where relevant (nearly always), the function also returns a "parse"
// function that may be used to deserialize the stdout of the script
// into the corresponding object or objects.  "parse()" takes a single
// string as the stdout text and returns the relevant data.
//
// Some of the scripts are located in subdirectories of "python_files".
// For each of those subdirectories there is a sub-module where
// those scripts' functions may be found.
//
// In some cases one or more types related to a script are exported
// from the same module in which the script's function is located.
// These types typically relate to the return type of "parse()".
export * as testingTools from './testing_tools';

// interpreterInfo.py

type ReleaseLevel = 'alpha' | 'beta' | 'candidate' | 'final';
type PythonVersionInfo = [number, number, number, ReleaseLevel, number];
export type InterpreterInfoJson = {
    versionInfo: PythonVersionInfo;
    sysPrefix: string;
    sysVersion: string;
    is64Bit: boolean;
};

export const OUTPUT_MARKER_SCRIPT = path.join(_SCRIPTS_DIR, 'get_output_via_markers.py');

export function interpreterInfo(): [string[], (out: string) => InterpreterInfoJson] {
    const script = path.join(SCRIPTS_DIR, 'interpreterInfo.py');
    const args = [script];

    function parse(out: string): InterpreterInfoJson {
        try {
            return JSON.parse(out);
        } catch (ex) {
            throw Error(`python ${args} returned bad JSON (${out}) (${ex})`);
        }
    }

    return [args, parse];
}

// normalizeSelection.py

export function normalizeSelection(): [string[], (out: string) => string] {
    const script = path.join(SCRIPTS_DIR, 'normalizeSelection.py');
    const args = [script];

    function parse(out: string) {
        // The text will be used as-is.
        return out;
    }

    return [args, parse];
}

// printEnvVariables.py

export function printEnvVariables(): [string[], (out: string) => NodeJS.ProcessEnv] {
    const script = path.join(SCRIPTS_DIR, 'printEnvVariables.py').fileToCommandArgumentForPythonExt();
    const args = [script];

    function parse(out: string): NodeJS.ProcessEnv {
        return JSON.parse(out);
    }

    return [args, parse];
}

// shell_exec.py

// eslint-disable-next-line camelcase
export function shell_exec(command: string, lockfile: string, shellArgs: string[]): string[] {
    const script = path.join(SCRIPTS_DIR, 'shell_exec.py');
    // We don't bother with a "parse" function since the output
    // could be anything.
    return [
        script,
        command.fileToCommandArgumentForPythonExt(),
        // The shell args must come after the command
        // but before the lockfile.
        ...shellArgs,
        lockfile.fileToCommandArgumentForPythonExt(),
    ];
}

// testlauncher.py

export function testlauncher(testArgs: string[]): string[] {
    const script = path.join(SCRIPTS_DIR, 'testlauncher.py');
    // There is no output to parse, so we do not return a function.
    return [script, ...testArgs];
}

// run_pytest_script.py
export function pytestlauncher(testArgs: string[]): string[] {
    const script = path.join(SCRIPTS_DIR, 'vscode_pytest', 'run_pytest_script.py');
    // There is no output to parse, so we do not return a function.
    return [script, ...testArgs];
}

// visualstudio_py_testlauncher.py

// eslint-disable-next-line camelcase
export function visualstudio_py_testlauncher(testArgs: string[]): string[] {
    const script = path.join(SCRIPTS_DIR, 'visualstudio_py_testlauncher.py');
    // There is no output to parse, so we do not return a function.
    return [script, ...testArgs];
}

// execution.py
// eslint-disable-next-line camelcase
export function execution_py_testlauncher(testArgs: string[]): string[] {
    const script = path.join(SCRIPTS_DIR, 'unittestadapter', 'execution.py');
    return [script, ...testArgs];
}

// tensorboard_launcher.py

export function tensorboardLauncher(args: string[]): string[] {
    const script = path.join(SCRIPTS_DIR, 'tensorboard_launcher.py');
    return [script, ...args];
}

// linter.py

export function linterScript(): string {
    const script = path.join(SCRIPTS_DIR, 'linter.py');
    return script;
}

export function createVenvScript(): string {
    const script = path.join(SCRIPTS_DIR, 'create_venv.py');
    return script;
}

export function createCondaScript(): string {
    const script = path.join(SCRIPTS_DIR, 'create_conda.py');
    return script;
}

export function installedCheckScript(): string {
    const script = path.join(SCRIPTS_DIR, 'installed_check.py');
    return script;
}
