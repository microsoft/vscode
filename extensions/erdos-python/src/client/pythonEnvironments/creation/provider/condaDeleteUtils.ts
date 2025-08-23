// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { WorkspaceFolder } from 'vscode';
import { plainExec } from '../../../common/process/rawProcessApis';
import { CreateEnv } from '../../../common/utils/localize';
import { traceError, traceInfo } from '../../../logging';
import { getPrefixCondaEnvPath, hasPrefixCondaEnv, showErrorMessageWithLogs } from '../common/commonUtils';

export async function deleteCondaEnvironment(
    workspace: WorkspaceFolder,
    interpreter: string,
    pathEnvVar: string,
): Promise<boolean> {
    const condaEnvPath = getPrefixCondaEnvPath(workspace);
    const command = interpreter;
    const args = ['-m', 'conda', 'env', 'remove', '--prefix', condaEnvPath, '--yes'];
    try {
        traceInfo(`Deleting conda environment: ${condaEnvPath}`);
        traceInfo(`Running command: ${command} ${args.join(' ')}`);
        const result = await plainExec(command, args, { mergeStdOutErr: true }, { ...process.env, PATH: pathEnvVar });
        traceInfo(result.stdout);
        if (await hasPrefixCondaEnv(workspace)) {
            // If conda cannot delete files it will name the files as .conda_trash.
            // These need to be deleted manually.
            traceError(`Conda environment ${condaEnvPath} could not be deleted.`);
            traceError(`Please delete the environment manually: ${condaEnvPath}`);
            showErrorMessageWithLogs(CreateEnv.Conda.errorDeletingEnvironment);
            return false;
        }
    } catch (err) {
        showErrorMessageWithLogs(CreateEnv.Conda.errorDeletingEnvironment);
        traceError(`Deleting conda environment ${condaEnvPath} Failed with error: `, err);
        return false;
    }
    return true;
}
