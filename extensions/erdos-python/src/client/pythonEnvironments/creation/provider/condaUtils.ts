// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { CancellationToken, ProgressLocation, QuickPickItem, Uri, WorkspaceFolder } from 'vscode';
import { Commands, Octicons } from '../../../common/constants';
import { Common, CreateEnv } from '../../../common/utils/localize';
import { executeCommand } from '../../../common/vscodeApis/commandApis';
import {
    MultiStepAction,
    showErrorMessage,
    showQuickPickWithBack,
    withProgress,
} from '../../../common/vscodeApis/windowApis';
import { traceLog } from '../../../logging';
import { Conda } from '../../common/environmentManagers/conda';
import { getPrefixCondaEnvPath, hasPrefixCondaEnv } from '../common/commonUtils';
import { OSType, getEnvironmentVariable, getOSType } from '../../../common/utils/platform';
import { deleteCondaEnvironment } from './condaDeleteUtils';

const RECOMMENDED_CONDA_PYTHON = '3.11';

export async function getCondaBaseEnv(): Promise<string | undefined> {
    const conda = await Conda.getConda();

    if (!conda) {
        const response = await showErrorMessage(CreateEnv.Conda.condaMissing, Common.learnMore);
        if (response === Common.learnMore) {
            await executeCommand('vscode.open', Uri.parse('https://docs.anaconda.com/anaconda/install/'));
        }
        return undefined;
    }

    const envs = (await conda.getEnvList()).filter((e) => e.name === 'base');
    if (envs.length === 1) {
        return envs[0].prefix;
    }
    if (envs.length > 1) {
        traceLog(
            'Multiple conda base envs detected: ',
            envs.map((e) => e.prefix),
        );
        return undefined;
    }

    return undefined;
}

export async function pickPythonVersion(token?: CancellationToken): Promise<string | undefined> {
    const items: QuickPickItem[] = ['3.11', '3.12', '3.10', '3.9', '3.8'].map((v) => ({
        label: v === RECOMMENDED_CONDA_PYTHON ? `${Octicons.Star} Python` : 'Python',
        description: v,
    }));
    const selection = await showQuickPickWithBack(
        items,
        {
            placeHolder: CreateEnv.Conda.selectPythonQuickPickPlaceholder,
            matchOnDescription: true,
            ignoreFocusOut: true,
        },
        token,
    );

    if (selection) {
        return (selection as QuickPickItem).description;
    }

    return undefined;
}

export function getPathEnvVariableForConda(condaBasePythonPath: string): string {
    const pathEnv = getEnvironmentVariable('PATH') || getEnvironmentVariable('Path') || '';
    if (getOSType() === OSType.Windows) {
        // On windows `conda.bat` is used, which adds the following bin directories to PATH
        // then launches `conda.exe` which is a stub to `python.exe -m conda`. Here, we are
        // instead using the `python.exe` that ships with conda to run a python script that
        // handles conda env creation and package installation.
        // See conda issue: https://github.com/conda/conda/issues/11399
        const root = path.dirname(condaBasePythonPath);
        const libPath1 = path.join(root, 'Library', 'bin');
        const libPath2 = path.join(root, 'Library', 'mingw-w64', 'bin');
        const libPath3 = path.join(root, 'Library', 'usr', 'bin');
        const libPath4 = path.join(root, 'bin');
        const libPath5 = path.join(root, 'Scripts');
        const libPath = [libPath1, libPath2, libPath3, libPath4, libPath5].join(path.delimiter);
        return `${libPath}${path.delimiter}${pathEnv}`;
    }
    return pathEnv;
}

export async function deleteEnvironment(workspaceFolder: WorkspaceFolder, interpreter: string): Promise<boolean> {
    const condaEnvPath = getPrefixCondaEnvPath(workspaceFolder);
    return withProgress<boolean>(
        {
            location: ProgressLocation.Notification,
            title: `${CreateEnv.Conda.deletingEnvironmentProgress} ([${Common.showLogs}](command:${Commands.ViewOutput})): ${condaEnvPath}`,
            cancellable: false,
        },
        async () => deleteCondaEnvironment(workspaceFolder, interpreter, getPathEnvVariableForConda(interpreter)),
    );
}

export enum ExistingCondaAction {
    Recreate,
    UseExisting,
    Create,
}

export async function pickExistingCondaAction(
    workspaceFolder: WorkspaceFolder | undefined,
): Promise<ExistingCondaAction> {
    if (workspaceFolder) {
        if (await hasPrefixCondaEnv(workspaceFolder)) {
            const items: QuickPickItem[] = [
                { label: CreateEnv.Conda.recreate, description: CreateEnv.Conda.recreateDescription },
                {
                    label: CreateEnv.Conda.useExisting,
                    description: CreateEnv.Conda.useExistingDescription,
                },
            ];

            const selection = (await showQuickPickWithBack(
                items,
                {
                    placeHolder: CreateEnv.Conda.existingCondaQuickPickPlaceholder,
                    ignoreFocusOut: true,
                },
                undefined,
            )) as QuickPickItem | undefined;

            if (selection?.label === CreateEnv.Conda.recreate) {
                return ExistingCondaAction.Recreate;
            }

            if (selection?.label === CreateEnv.Conda.useExisting) {
                return ExistingCondaAction.UseExisting;
            }
        } else {
            return ExistingCondaAction.Create;
        }
    }

    throw MultiStepAction.Cancel;
}
