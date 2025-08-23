// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable } from 'inversify';
import * as path from 'path';
import { CancellationToken, DebugConfiguration, Uri, WorkspaceFolder } from 'vscode';
import { IConfigurationService } from '../../../../common/types';
import { getOSType, OSType } from '../../../../common/utils/platform';
import {
    getWorkspaceFolder as getVSCodeWorkspaceFolder,
    getWorkspaceFolders,
} from '../../../../common/vscodeApis/workspaceApis';
import { IInterpreterService } from '../../../../interpreter/contracts';
import { AttachRequestArguments, DebugOptions, LaunchRequestArguments, PathMapping } from '../../../types';
import { PythonPathSource } from '../../types';
import { IDebugConfigurationResolver } from '../types';
import { resolveVariables } from '../utils/common';
import { getProgram } from './helper';

@injectable()
export abstract class BaseConfigurationResolver<T extends DebugConfiguration>
    implements IDebugConfigurationResolver<T> {
    protected pythonPathSource: PythonPathSource = PythonPathSource.launchJson;

    constructor(
        protected readonly configurationService: IConfigurationService,
        protected readonly interpreterService: IInterpreterService,
    ) {}

    // This is a legacy hook used solely for backwards-compatible manual substitution
    // of ${command:python.interpreterPath} in "pythonPath", for the sake of other
    // existing implementations of resolveDebugConfiguration() that may rely on it.
    //
    // For all future config variables, expansion should be performed by VSCode itself,
    // and validation of debug configuration in derived classes should be performed in
    // resolveDebugConfigurationWithSubstitutedVariables() instead, where all variables
    // are already substituted.
    // eslint-disable-next-line class-methods-use-this
    public async resolveDebugConfiguration(
        _folder: WorkspaceFolder | undefined,
        debugConfiguration: DebugConfiguration,
        _token?: CancellationToken,
    ): Promise<T | undefined> {
        if (debugConfiguration.clientOS === undefined) {
            debugConfiguration.clientOS = getOSType() === OSType.Windows ? 'windows' : 'unix';
        }
        return debugConfiguration as T;
    }

    public abstract resolveDebugConfigurationWithSubstitutedVariables(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: DebugConfiguration,
        token?: CancellationToken,
    ): Promise<T | undefined>;

    protected static getWorkspaceFolder(folder: WorkspaceFolder | undefined): Uri | undefined {
        if (folder) {
            return folder.uri;
        }
        const program = getProgram();
        const workspaceFolders = getWorkspaceFolders();

        if (!Array.isArray(workspaceFolders) || workspaceFolders.length === 0) {
            return program ? Uri.file(path.dirname(program)) : undefined;
        }
        if (workspaceFolders.length === 1) {
            return workspaceFolders[0].uri;
        }
        if (program) {
            const workspaceFolder = getVSCodeWorkspaceFolder(Uri.file(program));
            if (workspaceFolder) {
                return workspaceFolder.uri;
            }
        }
        return undefined;
    }

    protected async resolveAndUpdatePaths(
        workspaceFolder: Uri | undefined,
        debugConfiguration: LaunchRequestArguments,
    ): Promise<void> {
        BaseConfigurationResolver.resolveAndUpdateEnvFilePath(workspaceFolder, debugConfiguration);
        await this.resolveAndUpdatePythonPath(workspaceFolder, debugConfiguration);
    }

    protected static resolveAndUpdateEnvFilePath(
        workspaceFolder: Uri | undefined,
        debugConfiguration: LaunchRequestArguments,
    ): void {
        if (!debugConfiguration) {
            return;
        }
        if (debugConfiguration.envFile && (workspaceFolder || debugConfiguration.cwd)) {
            debugConfiguration.envFile = resolveVariables(
                debugConfiguration.envFile,
                (workspaceFolder ? workspaceFolder.fsPath : undefined) || debugConfiguration.cwd,
                undefined,
            );
        }
    }

    protected async resolveAndUpdatePythonPath(
        workspaceFolder: Uri | undefined,
        debugConfiguration: LaunchRequestArguments,
    ): Promise<void> {
        if (!debugConfiguration) {
            return;
        }
        if (debugConfiguration.pythonPath === '${command:python.interpreterPath}' || !debugConfiguration.pythonPath) {
            const interpreterPath =
                (await this.interpreterService.getActiveInterpreter(workspaceFolder))?.path ??
                this.configurationService.getSettings(workspaceFolder).pythonPath;
            debugConfiguration.pythonPath = interpreterPath;
        } else {
            debugConfiguration.pythonPath = resolveVariables(
                debugConfiguration.pythonPath ? debugConfiguration.pythonPath : undefined,
                workspaceFolder?.fsPath,
                undefined,
            );
        }

        if (debugConfiguration.python === '${command:python.interpreterPath}') {
            this.pythonPathSource = PythonPathSource.settingsJson;
            const interpreterPath =
                (await this.interpreterService.getActiveInterpreter(workspaceFolder))?.path ??
                this.configurationService.getSettings(workspaceFolder).pythonPath;
            debugConfiguration.python = interpreterPath;
        } else if (debugConfiguration.python === undefined) {
            this.pythonPathSource = PythonPathSource.settingsJson;
            debugConfiguration.python = debugConfiguration.pythonPath;
        } else {
            this.pythonPathSource = PythonPathSource.launchJson;
            debugConfiguration.python = resolveVariables(
                debugConfiguration.python ?? debugConfiguration.pythonPath,
                workspaceFolder?.fsPath,
                undefined,
            );
        }

        if (
            debugConfiguration.debugAdapterPython === '${command:python.interpreterPath}' ||
            debugConfiguration.debugAdapterPython === undefined
        ) {
            debugConfiguration.debugAdapterPython = debugConfiguration.pythonPath ?? debugConfiguration.python;
        }
        if (
            debugConfiguration.debugLauncherPython === '${command:python.interpreterPath}' ||
            debugConfiguration.debugLauncherPython === undefined
        ) {
            debugConfiguration.debugLauncherPython = debugConfiguration.pythonPath ?? debugConfiguration.python;
        }

        delete debugConfiguration.pythonPath;
    }

    protected static debugOption(debugOptions: DebugOptions[], debugOption: DebugOptions): void {
        if (debugOptions.indexOf(debugOption) >= 0) {
            return;
        }
        debugOptions.push(debugOption);
    }

    protected static isLocalHost(hostName?: string): boolean {
        const LocalHosts = ['localhost', '127.0.0.1', '::1'];
        return !!(hostName && LocalHosts.indexOf(hostName.toLowerCase()) >= 0);
    }

    protected static fixUpPathMappings(
        pathMappings: PathMapping[],
        defaultLocalRoot?: string,
        defaultRemoteRoot?: string,
    ): PathMapping[] {
        if (!defaultLocalRoot) {
            return [];
        }
        if (!defaultRemoteRoot) {
            defaultRemoteRoot = defaultLocalRoot;
        }

        if (pathMappings.length === 0) {
            pathMappings = [
                {
                    localRoot: defaultLocalRoot,
                    remoteRoot: defaultRemoteRoot,
                },
            ];
        } else {
            // Expand ${workspaceFolder} variable first if necessary.
            pathMappings = pathMappings.map(({ localRoot: mappedLocalRoot, remoteRoot }) => {
                const resolvedLocalRoot = resolveVariables(mappedLocalRoot, defaultLocalRoot, undefined);
                return {
                    localRoot: resolvedLocalRoot || '',
                    // TODO: Apply to remoteRoot too?
                    remoteRoot,
                };
            });
        }

        // If on Windows, lowercase the drive letter for path mappings.
        // TODO: Apply even if no localRoot?
        if (getOSType() === OSType.Windows) {
            // TODO: Apply to remoteRoot too?
            pathMappings = pathMappings.map(({ localRoot: windowsLocalRoot, remoteRoot }) => {
                let localRoot = windowsLocalRoot;
                if (windowsLocalRoot.match(/^[A-Z]:/)) {
                    localRoot = `${windowsLocalRoot[0].toLowerCase()}${windowsLocalRoot.substr(1)}`;
                }
                return { localRoot, remoteRoot };
            });
        }

        return pathMappings;
    }

    protected static isDebuggingFastAPI(
        debugConfiguration: Partial<LaunchRequestArguments & AttachRequestArguments>,
    ): boolean {
        return !!(debugConfiguration.module && debugConfiguration.module.toUpperCase() === 'FASTAPI');
    }

    protected static isDebuggingFlask(
        debugConfiguration: Partial<LaunchRequestArguments & AttachRequestArguments>,
    ): boolean {
        return !!(debugConfiguration.module && debugConfiguration.module.toUpperCase() === 'FLASK');
    }
}
