// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { Uri, workspace } from 'vscode';
import { IExtensionSingleActivationService } from '../activation/types';
import { Commands } from '../common/constants';
import { IDisposable, IDisposableRegistry } from '../common/types';
import { registerCommand } from '../common/vscodeApis/commandApis';
import { IInterpreterService } from './contracts';
import { useEnvExtension } from '../envExt/api.internal';

@injectable()
export class InterpreterPathCommand implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: false };

    constructor(
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IDisposableRegistry) private readonly disposables: IDisposable[],
    ) {}

    public async activate(): Promise<void> {
        this.disposables.push(
            registerCommand(Commands.GetSelectedInterpreterPath, (args) => this._getSelectedInterpreterPath(args)),
        );
    }

    public async _getSelectedInterpreterPath(
        args: { workspaceFolder: string; type: string } | string[],
    ): Promise<string> {
        // If `launch.json` is launching this command, `args.workspaceFolder` carries the workspaceFolder
        // If `tasks.json` is launching this command, `args[1]` carries the workspaceFolder
        let workspaceFolder;
        if ('workspaceFolder' in args) {
            workspaceFolder = args.workspaceFolder;
        } else if (args[1]) {
            const [, second] = args;
            workspaceFolder = second;
        } else if (useEnvExtension() && 'type' in args && args.type === 'debugpy') {
            // If using the envsExt and the type is debugpy, we need to add the workspace folder to get the interpreter path.
            if (Array.isArray(workspace.workspaceFolders) && workspace.workspaceFolders.length > 0) {
                workspaceFolder = workspace.workspaceFolders[0].uri.fsPath;
            }
        } else {
            workspaceFolder = undefined;
        }

        let workspaceFolderUri;
        try {
            workspaceFolderUri = workspaceFolder ? Uri.file(workspaceFolder) : undefined;
        } catch (ex) {
            workspaceFolderUri = undefined;
        }

        const interpreterPath =
            (await this.interpreterService.getActiveInterpreter(workspaceFolderUri))?.path ?? 'python';
        return interpreterPath.toCommandArgumentForPythonExt();
    }
}
