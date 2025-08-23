// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable, unmanaged } from 'inversify';
import * as path from 'path';
import { ConfigurationTarget, Disposable, QuickPickItem, Uri } from 'vscode';
import { IExtensionSingleActivationService } from '../../../../activation/types';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../../../common/application/types';
import { IConfigurationService, IDisposable, IPathUtils, Resource } from '../../../../common/types';
import { Common, Interpreters } from '../../../../common/utils/localize';
import { IPythonPathUpdaterServiceManager } from '../../types';
export interface WorkspaceSelectionQuickPickItem extends QuickPickItem {
    uri?: Uri;
}
@injectable()
export abstract class BaseInterpreterSelectorCommand implements IExtensionSingleActivationService, IDisposable {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };
    protected disposables: Disposable[] = [];
    constructor(
        @unmanaged() protected readonly pythonPathUpdaterService: IPythonPathUpdaterServiceManager,
        @unmanaged() protected readonly commandManager: ICommandManager,
        @unmanaged() protected readonly applicationShell: IApplicationShell,
        @unmanaged() protected readonly workspaceService: IWorkspaceService,
        @unmanaged() protected readonly pathUtils: IPathUtils,
        @unmanaged() protected readonly configurationService: IConfigurationService,
    ) {
        this.disposables.push(this);
    }

    public dispose() {
        this.disposables.forEach((disposable) => disposable.dispose());
    }

    public abstract activate(): Promise<void>;

    protected async getConfigTargets(options?: {
        resetTarget?: boolean;
    }): Promise<
        | {
              folderUri: Resource;
              configTarget: ConfigurationTarget;
          }[]
        | undefined
    > {
        const workspaceFolders = this.workspaceService.workspaceFolders;
        if (workspaceFolders === undefined || workspaceFolders.length === 0) {
            return [
                {
                    folderUri: undefined,
                    configTarget: ConfigurationTarget.Global,
                },
            ];
        }
        if (workspaceFolders.length === 1) {
            return [
                {
                    folderUri: workspaceFolders[0].uri,
                    configTarget: ConfigurationTarget.WorkspaceFolder,
                },
            ];
        }

        // Ok we have multiple workspaces, get the user to pick a folder.

        let quickPickItems: WorkspaceSelectionQuickPickItem[] = options?.resetTarget
            ? [
                  {
                      label: Common.clearAll,
                  },
              ]
            : [];
        quickPickItems.push(
            ...workspaceFolders.map((w) => {
                const selectedInterpreter = this.pathUtils.getDisplayName(
                    this.configurationService.getSettings(w.uri).pythonPath,
                    w.uri.fsPath,
                );
                return {
                    label: w.name,
                    description: this.pathUtils.getDisplayName(path.dirname(w.uri.fsPath)),
                    uri: w.uri,
                    detail: selectedInterpreter,
                };
            }),
            {
                label: options?.resetTarget ? Interpreters.clearAtWorkspace : Interpreters.entireWorkspace,
                uri: workspaceFolders[0].uri,
            },
        );

        const selection = await this.applicationShell.showQuickPick(quickPickItems, {
            placeHolder: options?.resetTarget
                ? 'Select the workspace folder to clear the interpreter for'
                : 'Select the workspace folder to set the interpreter',
        });

        if (selection?.label === Common.clearAll) {
            const folderTargets: {
                folderUri: Resource;
                configTarget: ConfigurationTarget;
            }[] = workspaceFolders.map((w) => ({
                folderUri: w.uri,
                configTarget: ConfigurationTarget.WorkspaceFolder,
            }));
            return [
                ...folderTargets,
                { folderUri: workspaceFolders[0].uri, configTarget: ConfigurationTarget.Workspace },
            ];
        }

        return selection
            ? selection.label === Interpreters.entireWorkspace || selection.label === Interpreters.clearAtWorkspace
                ? [{ folderUri: selection.uri, configTarget: ConfigurationTarget.Workspace }]
                : [{ folderUri: selection.uri, configTarget: ConfigurationTarget.WorkspaceFolder }]
            : undefined;
    }
}
