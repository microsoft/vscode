// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { PythonExecutableInfo, PythonVersion } from '.';
import { isCI } from '../../../common/constants';
import {
    interpreterInfo as getInterpreterInfoCommand,
    InterpreterInfoJson,
} from '../../../common/process/internal/scripts';
import { Architecture } from '../../../common/utils/platform';
import { traceError, traceInfo, traceVerbose } from '../../../logging';
import { shellExecute } from '../../common/externalDependencies';
import { copyPythonExecInfo, PythonExecInfo } from '../../exec';
import { parseVersion } from './pythonVersion';

export type InterpreterInformation = {
    arch: Architecture;
    executable: PythonExecutableInfo;
    version: PythonVersion;
    implementation?: string;
};

/**
 * Compose full interpreter information based on the given data.
 *
 * The data format corresponds to the output of the `interpreterInfo.py` script.
 *
 * @param python - the path to the Python executable
 * @param raw - the information returned by the `interpreterInfo.py` script
 */
function extractInterpreterInfo(python: string, raw: InterpreterInfoJson): InterpreterInformation {
    let rawVersion = `${raw.versionInfo.slice(0, 3).join('.')}`;

    // We only need additional version details if the version is 'alpha', 'beta' or 'candidate'.
    // This restriction is needed to avoid sending any PII if this data is used with telemetry.
    // With custom builds of python it is possible that release level and values after that can
    // contain PII.
    if (raw.versionInfo[3] !== undefined && ['final', 'alpha', 'beta', 'candidate'].includes(raw.versionInfo[3])) {
        rawVersion = `${rawVersion}-${raw.versionInfo[3]}`;
        if (raw.versionInfo[4] !== undefined) {
            let serial = -1;
            try {
                serial = parseInt(`${raw.versionInfo[4]}`, 10);
            } catch (ex) {
                serial = -1;
            }
            rawVersion = serial >= 0 ? `${rawVersion}${serial}` : rawVersion;
        }
    }
    return {
        arch: raw.is64Bit ? Architecture.x64 : Architecture.x86,
        executable: {
            filename: python,
            sysPrefix: raw.sysPrefix,
            mtime: -1,
            ctime: -1,
        },
        version: {
            ...parseVersion(rawVersion),
            sysVersion: raw.sysVersion,
        },
        implementation: raw.implementation,
    };
}

/**
 * Collect full interpreter information from the given Python executable.
 *
 * @param python - the information to use when running Python
 * @param timeout - any specific timeouts to use for getting info.
 */
export async function getInterpreterInfo(
    python: PythonExecInfo,
    timeout?: number,
): Promise<InterpreterInformation | undefined> {
    const [args, parse] = getInterpreterInfoCommand();
    const info = copyPythonExecInfo(python, args);
    const argv = [info.command, ...info.args];

    // Concat these together to make a set of quoted strings
    const quoted = argv.reduce(
        (p, c) => (p ? `${p} ${c.toCommandArgumentForPythonExt()}` : `${c.toCommandArgumentForPythonExt()}`),
        '',
    );

    // Sometimes on CI, the python process takes a long time to start up. This is a workaround for that.
    let standardTimeout = isCI ? 30000 : 15000;
    if (process.env.VSC_PYTHON_INTERPRETER_INFO_TIMEOUT !== undefined) {
        // Custom override for setups where the initial Python setup process may take longer than the standard timeout.
        standardTimeout = parseInt(process.env.VSC_PYTHON_INTERPRETER_INFO_TIMEOUT, 10);
        traceInfo(`Custom interpreter discovery timeout: ${standardTimeout}`);
    }

    // Try shell execing the command, followed by the arguments. This will make node kill the process if it
    // takes too long.
    // Sometimes the python path isn't valid, timeout if that's the case.
    // See these two bugs:
    // https://github.com/microsoft/vscode-python/issues/7569
    // https://github.com/microsoft/vscode-python/issues/7760
    const result = await shellExecute(quoted, { timeout: timeout ?? standardTimeout });
    if (result.stderr) {
        traceError(
            `Stderr when executing script with >> ${quoted} << stderr: ${result.stderr}, still attempting to parse output`,
        );
    }
    let json: InterpreterInfoJson;
    try {
        json = parse(result.stdout);
    } catch (ex) {
        traceError(`Failed to parse interpreter information for >> ${quoted} << with ${ex}`);
        return undefined;
    }
    traceVerbose(`Found interpreter for >> ${quoted} <<: ${JSON.stringify(json)}`);
    return extractInterpreterInfo(python.pythonExecutable, json);
}
