// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { SpawnOptions } from 'child_process';
import * as path from 'path';
import { executeWorkerFile } from './main';
import { ExecutionResult, ShellOptions } from './types';

export function workerShellExec(command: string, options: ShellOptions): Promise<ExecutionResult<string>> {
    return executeWorkerFile(path.join(__dirname, 'shellExec.worker.js'), {
        command,
        options,
    });
}

export function workerPlainExec(
    file: string,
    args: string[],
    options: SpawnOptions = {},
): Promise<ExecutionResult<string>> {
    return executeWorkerFile(path.join(__dirname, 'plainExec.worker.js'), {
        file,
        args,
        options,
    });
}
