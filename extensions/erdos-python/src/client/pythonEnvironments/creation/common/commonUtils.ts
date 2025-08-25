// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as path from 'path';
import { WorkspaceFolder } from 'vscode';
import * as fs from '../../../common/platform/fs-paths';
import { Commands } from '../../../common/constants';
import { Common } from '../../../common/utils/localize';
import { executeCommand } from '../../../common/vscodeApis/commandApis';
import { showErrorMessage } from '../../../common/vscodeApis/windowApis';
import { isWindows } from '../../../common/utils/platform';

export async function showErrorMessageWithLogs(message: string): Promise<void> {
    const result = await showErrorMessage(message, Common.openOutputPanel, Common.selectPythonInterpreter);
    if (result === Common.openOutputPanel) {
        await executeCommand(Commands.ViewOutput);
    } else if (result === Common.selectPythonInterpreter) {
        await executeCommand(Commands.Set_Interpreter);
    }
}

// Same as above but opens the Erdos session picker instead
export async function showErdosErrorMessageWithLogs(message: string): Promise<void> {
    const result = await showErrorMessage(message, Common.openOutputPanel, Common.selectNewSession);
    if (result === Common.openOutputPanel) {
        await executeCommand(Commands.ViewOutput);
    } else if (result === Common.selectNewSession) {
        await executeCommand('workbench.action.language.runtime.openActivePicker');
    }
}

export function getVenvPath(workspaceFolder: WorkspaceFolder): string {
    return path.join(workspaceFolder.uri.fsPath, '.venv');
}

export async function hasVenv(workspaceFolder: WorkspaceFolder): Promise<boolean> {
    return fs.pathExists(path.join(getVenvPath(workspaceFolder), 'pyvenv.cfg'));
}

export function getVenvExecutable(workspaceFolder: WorkspaceFolder): string {
    if (isWindows()) {
        return path.join(getVenvPath(workspaceFolder), 'Scripts', 'python.exe');
    }
    return path.join(getVenvPath(workspaceFolder), 'bin', 'python');
}

export function getPrefixCondaEnvPath(workspaceFolder: WorkspaceFolder): string {
    return path.join(workspaceFolder.uri.fsPath, '.conda');
}

export async function hasPrefixCondaEnv(workspaceFolder: WorkspaceFolder): Promise<boolean> {
    return fs.pathExists(getPrefixCondaEnvPath(workspaceFolder));
}
