// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * A representation of the information needed to run a Python executable.
 *
 * @prop command - the executable to execute in a new OS process
 * @prop args - the full list of arguments with which to invoke the command
 * @prop python - the command + the arguments needed just to invoke Python
 * @prop pythonExecutable - the path the the Python executable
 */
export type PythonExecInfo = {
    command: string;
    args: string[];

    python: string[];
    pythonExecutable: string;
};

/**
 * Compose Python execution info for the given executable.
 *
 * @param python - the path (or command + arguments) to use to invoke Python
 * @param pythonArgs - any extra arguments to use when running Python
 */
export function buildPythonExecInfo(
    python: string | string[],
    pythonArgs?: string[],
    pythonExecutable?: string,
): PythonExecInfo {
    if (Array.isArray(python)) {
        const args = python.slice(1);
        if (pythonArgs) {
            args.push(...pythonArgs);
        }
        return {
            args,
            command: python[0],
            python: [...python],
            pythonExecutable: pythonExecutable ?? python[python.length - 1],
        };
    }
    return {
        command: python,
        args: pythonArgs || [],
        python: [python],
        pythonExecutable: python,
    };
}

/**
 * Create a copy, optionally adding to the args to pass to Python.
 *
 * @param orig - the object to copy
 * @param extraPythonArgs - any arguments to add to the end of `orig.args`
 */
export function copyPythonExecInfo(orig: PythonExecInfo, extraPythonArgs?: string[]): PythonExecInfo {
    const info = {
        command: orig.command,
        args: [...orig.args],
        python: [...orig.python],
        pythonExecutable: orig.pythonExecutable,
    };
    if (extraPythonArgs) {
        info.args.push(...extraPythonArgs);
    }
    if (info.pythonExecutable === undefined) {
        info.pythonExecutable = info.python[info.python.length - 1]; // Default case
    }
    return info;
}
