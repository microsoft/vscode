/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from '../common/platform/fs-paths';
import { IServiceContainer } from '../ioc/types';
import { PythonEnvironment } from '../pythonEnvironments/info';
import { IWorkspaceService } from '../common/application/types';
import { IPythonExecutionFactory } from '../common/process/types';
import { traceWarn } from '../logging';
import { EXTENSION_ROOT_DIR } from '../constants';

export interface IpykernelBundle {
    disabledReason?: string;
    paths?: string[];
}

export async function getIpykernelBundle(
    interpreter: PythonEnvironment,
    serviceContainer: IServiceContainer,
    resource?: vscode.Uri,
): Promise<IpykernelBundle> {
    const workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    const pythonExecutionFactory = serviceContainer.get<IPythonExecutionFactory>(IPythonExecutionFactory);

    const useBundledIpykernel = workspaceService
        .getConfiguration('python', resource)
        .get<boolean>('useBundledIpykernel', true);
    if (!useBundledIpykernel) {
        return { disabledReason: 'useBundledIpykernel setting is disabled' };
    }

    if (interpreter.version?.major !== 3 || ![9, 10, 11, 12, 13].includes(interpreter.version?.minor)) {
        return { disabledReason: `unsupported interpreter version: ${interpreter.version?.raw}` };
    }

    let { implementation } = interpreter;
    if (implementation === undefined) {
        const pythonExecutionService = await pythonExecutionFactory.create({ pythonPath: interpreter.path });
        implementation = (await pythonExecutionService.getInterpreterInformation())?.implementation;
    }

    if (implementation !== 'cpython') {
        return { disabledReason: `unsupported interpreter implementation: ${implementation}` };
    }

    const arch = os.arch();
    const cpxSpecifier = `cp${interpreter.version.major}${interpreter.version.minor}`;
    const paths = [
        path.join(EXTENSION_ROOT_DIR, 'python_files', 'lib', 'ipykernel', arch, cpxSpecifier),
        path.join(EXTENSION_ROOT_DIR, 'python_files', 'lib', 'ipykernel', arch, 'cp3'),
        path.join(EXTENSION_ROOT_DIR, 'python_files', 'lib', 'ipykernel', 'py3'),
    ];

    for (const bundlePath of paths) {
        if (!(await fs.pathExists(bundlePath))) {
            traceWarn(`ipykernel bundle path does not exist: ${bundlePath}`);
            return { disabledReason: `bundle path does not exist: ${bundlePath}` };
        }
    }

    return { paths };
}
