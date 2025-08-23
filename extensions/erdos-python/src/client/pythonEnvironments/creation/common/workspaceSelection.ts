// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { CancellationToken, QuickPickItem, WorkspaceFolder } from 'vscode';
import * as fsapi from '../../../common/platform/fs-paths';
import { MultiStepAction, showErrorMessage, showQuickPickWithBack } from '../../../common/vscodeApis/windowApis';
import { getWorkspaceFolders } from '../../../common/vscodeApis/workspaceApis';
import { Common, CreateEnv } from '../../../common/utils/localize';
import { executeCommand } from '../../../common/vscodeApis/commandApis';

function hasVirtualEnv(workspace: WorkspaceFolder): Promise<boolean> {
    return Promise.race([
        fsapi.pathExists(path.join(workspace.uri.fsPath, '.venv')),
        fsapi.pathExists(path.join(workspace.uri.fsPath, '.conda')),
    ]);
}

async function getWorkspacesForQuickPick(workspaces: readonly WorkspaceFolder[]): Promise<QuickPickItem[]> {
    const items: QuickPickItem[] = [];
    for (const workspace of workspaces) {
        items.push({
            label: workspace.name,
            detail: workspace.uri.fsPath,
            description: (await hasVirtualEnv(workspace)) ? CreateEnv.hasVirtualEnv : undefined,
        });
    }

    return items;
}

export interface PickWorkspaceFolderOptions {
    allowMultiSelect?: boolean;
    token?: CancellationToken;
    preSelectedWorkspace?: WorkspaceFolder;
}

export async function pickWorkspaceFolder(
    options?: PickWorkspaceFolderOptions,
    context?: MultiStepAction,
): Promise<WorkspaceFolder | WorkspaceFolder[] | undefined> {
    const workspaces = getWorkspaceFolders();

    if (!workspaces || workspaces.length === 0) {
        if (context === MultiStepAction.Back) {
            // No workspaces and nothing to show, should just go to previous
            throw MultiStepAction.Back;
        }
        const result = await showErrorMessage(CreateEnv.noWorkspace, Common.openFolder);
        if (result === Common.openFolder) {
            await executeCommand('vscode.openFolder');
        }
        return undefined;
    }

    if (options?.preSelectedWorkspace) {
        if (context === MultiStepAction.Back) {
            // In this case there is no Quick Pick shown, should just go to previous
            throw MultiStepAction.Back;
        }

        return options.preSelectedWorkspace;
    }

    if (workspaces.length === 1) {
        if (context === MultiStepAction.Back) {
            // In this case there is no Quick Pick shown, should just go to previous
            throw MultiStepAction.Back;
        }

        return workspaces[0];
    }

    // This is multi-root scenario.
    const selected = await showQuickPickWithBack(
        await getWorkspacesForQuickPick(workspaces),
        {
            placeHolder: CreateEnv.pickWorkspacePlaceholder,
            ignoreFocusOut: true,
            canPickMany: options?.allowMultiSelect,
            matchOnDescription: true,
            matchOnDetail: true,
        },
        options?.token,
    );

    if (selected) {
        if (Array.isArray(selected)) {
            const details = selected.map((s: QuickPickItem) => s.detail).filter((s) => s !== undefined);
            return workspaces.filter((w) => details.includes(w.uri.fsPath));
        }
        return workspaces.filter((w) => w.uri.fsPath === (selected as QuickPickItem).detail)[0];
    }

    return undefined;
}
