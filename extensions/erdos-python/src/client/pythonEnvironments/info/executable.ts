// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { getExecutable } from '../../common/process/internal/python';
import { ShellExecFunc } from '../../common/process/types';
import { traceError } from '../../logging';
import { copyPythonExecInfo, PythonExecInfo } from '../exec';

/**
 * Find the filename for the corresponding Python executable.
 *
 * Effectively, we look up `sys.executable`.
 *
 * @param python - the information to use when running Python
 * @param shellExec - the function to use to run Python
 */
export async function getExecutablePath(python: PythonExecInfo, shellExec: ShellExecFunc): Promise<string | undefined> {
    try {
        const [args, parse] = getExecutable();
        const info = copyPythonExecInfo(python, args);
        const argv = [info.command, ...info.args];
        // Concat these together to make a set of quoted strings
        const quoted = argv.reduce(
            (p, c) => (p ? `${p} ${c.toCommandArgumentForPythonExt()}` : `${c.toCommandArgumentForPythonExt()}`),
            '',
        );
        const result = await shellExec(quoted, { timeout: 15000 });
        const executable = parse(result.stdout.trim());
        if (executable === '') {
            throw new Error(`${quoted} resulted in empty stdout`);
        }
        return executable;
    } catch (ex) {
        traceError(ex);
        return undefined;
    }
}
