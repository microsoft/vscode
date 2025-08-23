// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { WorkspaceFolder } from 'vscode';
import * as fs from '../../../common/platform/fs-paths';
import { traceError, traceInfo } from '../../../logging';
import { getVenvPath, showErrorMessageWithLogs } from '../common/commonUtils';
import { CreateEnv } from '../../../common/utils/localize';
import { sleep } from '../../../common/utils/async';
import { switchSelectedPython } from './venvSwitchPython';

async function tryDeleteFile(file: string): Promise<boolean> {
    try {
        if (!(await fs.pathExists(file))) {
            return true;
        }
        await fs.unlink(file);
        return true;
    } catch (err) {
        traceError(`Failed to delete file [${file}]:`, err);
        return false;
    }
}

async function tryDeleteDir(dir: string): Promise<boolean> {
    try {
        if (!(await fs.pathExists(dir))) {
            return true;
        }
        await fs.rmdir(dir, {
            recursive: true,
            maxRetries: 10,
            retryDelay: 200,
        });
        return true;
    } catch (err) {
        traceError(`Failed to delete directory [${dir}]:`, err);
        return false;
    }
}

export async function deleteEnvironmentNonWindows(workspaceFolder: WorkspaceFolder): Promise<boolean> {
    const venvPath = getVenvPath(workspaceFolder);
    if (await tryDeleteDir(venvPath)) {
        traceInfo(`Deleted venv dir: ${venvPath}`);
        return true;
    }
    showErrorMessageWithLogs(CreateEnv.Venv.errorDeletingEnvironment);
    return false;
}

export async function deleteEnvironmentWindows(
    workspaceFolder: WorkspaceFolder,
    interpreter: string | undefined,
): Promise<boolean> {
    const venvPath = getVenvPath(workspaceFolder);
    const venvPythonPath = path.join(venvPath, 'Scripts', 'python.exe');

    if (await tryDeleteFile(venvPythonPath)) {
        traceInfo(`Deleted python executable: ${venvPythonPath}`);
        if (await tryDeleteDir(venvPath)) {
            traceInfo(`Deleted ".venv" dir: ${venvPath}`);
            return true;
        }

        traceError(`Failed to delete ".venv" dir: ${venvPath}`);
        traceError(
            'This happens if the virtual environment is still in use, or some binary in the venv is still running.',
        );
        traceError(`Please delete the ".venv" manually: [${venvPath}]`);
        showErrorMessageWithLogs(CreateEnv.Venv.errorDeletingEnvironment);
        return false;
    }
    traceError(`Failed to delete python executable: ${venvPythonPath}`);
    traceError('This happens if the virtual environment is still in use.');

    if (interpreter) {
        traceError('We will attempt to switch python temporarily to delete the ".venv"');

        await switchSelectedPython(interpreter, workspaceFolder.uri, 'temporarily to delete the ".venv"');

        traceInfo(`Attempting to delete ".venv" again: ${venvPath}`);
        const ms = 500;
        for (let i = 0; i < 5; i = i + 1) {
            traceInfo(`Waiting for ${ms}ms to let processes exit, before a delete attempt.`);
            await sleep(ms);
            if (await tryDeleteDir(venvPath)) {
                traceInfo(`Deleted ".venv" dir: ${venvPath}`);
                return true;
            }
            traceError(`Failed to delete ".venv" dir [${venvPath}] (attempt ${i + 1}/5).`);
        }
    } else {
        traceError(`Please delete the ".venv" dir manually: [${venvPath}]`);
    }
    showErrorMessageWithLogs(CreateEnv.Venv.errorDeletingEnvironment);
    return false;
}
