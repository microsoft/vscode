import * as path from 'path';
import * as vscode from 'vscode';
import type { PythonExtension } from '../client/api/types';
import {
    clearPythonPathInWorkspaceFolder,
    IExtensionTestApi,
    PYTHON_PATH,
    resetGlobalPythonPathSetting,
    setPythonPathInWorkspaceRoot,
} from './common';
import { IS_SMOKE_TEST, PVSC_EXTENSION_ID_FOR_TESTS } from './constants';
import { sleep } from './core';

export * from './constants';
export * from './ciConstants';

const dummyPythonFile = path.join(__dirname, '..', '..', 'src', 'test', 'python_files', 'dummy.py');
export const multirootPath = path.join(__dirname, '..', '..', 'src', 'testMultiRootWkspc');
const workspace3Uri = vscode.Uri.file(path.join(multirootPath, 'workspace3'));

//First thing to be executed.
process.env.VSC_PYTHON_CI_TEST = '1';

// Ability to use custom python environments for testing
export async function initializePython() {
    await resetGlobalPythonPathSetting();
    await clearPythonPathInWorkspaceFolder(dummyPythonFile);
    await clearPythonPathInWorkspaceFolder(workspace3Uri);
    await setPythonPathInWorkspaceRoot(PYTHON_PATH);
}

export async function initialize(): Promise<IExtensionTestApi> {
    await initializePython();

    const pythonConfig = vscode.workspace.getConfiguration('python');
    await pythonConfig.update('experiments.optInto', ['All'], vscode.ConfigurationTarget.Global);
    await pythonConfig.update('experiments.optOutFrom', [], vscode.ConfigurationTarget.Global);
    const api = await activateExtension();
    if (!IS_SMOKE_TEST) {
        // When running smoke tests, we won't have access to these.
        const configSettings = await import('../client/common/configSettings.js');
        // Dispose any cached python settings (used only in test env).
        configSettings.PythonSettings.dispose();
    }

    return (api as any) as IExtensionTestApi;
}
export async function activateExtension() {
    const extension = vscode.extensions.getExtension<PythonExtension>(PVSC_EXTENSION_ID_FOR_TESTS)!;
    const api = await extension.activate();
    // Wait until its ready to use.
    await api.ready;
    return api;
}

export async function initializeTest(): Promise<any> {
    await initializePython();
    await closeActiveWindows();
    if (!IS_SMOKE_TEST) {
        // When running smoke tests, we won't have access to these.
        const configSettings = await import('../client/common/configSettings.js');
        // Dispose any cached python settings (used only in test env).
        configSettings.PythonSettings.dispose();
    }
}
export async function closeActiveWindows(): Promise<void> {
    await closeActiveNotebooks();
    await closeWindowsInteral();
}
export async function closeActiveNotebooks(): Promise<void> {
    if (!vscode.env.appName.toLowerCase().includes('insiders') || !isANotebookOpen()) {
        return;
    }
    // We could have untitled notebooks, close them by reverting changes.

    while ((vscode as any).window.activeNotebookEditor || vscode.window.activeTextEditor) {
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }
    // Work around VS Code issues (sometimes notebooks do not get closed).
    // Hence keep trying.
    for (let counter = 0; counter <= 5 && isANotebookOpen(); counter += 1) {
        await sleep(counter * 100);
        await closeWindowsInteral();
    }
}

async function closeWindowsInteral() {
    return new Promise<void>((resolve, reject) => {
        // Attempt to fix #1301.
        // Lets not waste too much time.
        const timer = setTimeout(() => {
            reject(new Error("Command 'workbench.action.closeAllEditors' timed out"));
        }, 15000);
        vscode.commands.executeCommand('workbench.action.closeAllEditors').then(
            () => {
                clearTimeout(timer);
                resolve();
            },
            (ex) => {
                clearTimeout(timer);
                reject(ex);
            },
        );
    });
}

function isANotebookOpen() {
    if (!vscode.window.activeTextEditor?.document) {
        return false;
    }

    return !!(vscode.window.activeTextEditor.document as any).notebook;
}
