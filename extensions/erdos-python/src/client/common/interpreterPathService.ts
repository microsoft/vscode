// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as fs from '../common/platform/fs-paths';
import { inject, injectable } from 'inversify';
import { ConfigurationChangeEvent, ConfigurationTarget, Event, EventEmitter, Uri } from 'vscode';
import { traceError, traceVerbose } from '../logging';
import { IApplicationEnvironment, IWorkspaceService } from './application/types';
import { PythonSettings } from './configSettings';
import { isTestExecution } from './constants';
import { FileSystemPaths } from './platform/fs-paths';
import {
    IDisposable,
    IDisposableRegistry,
    IInterpreterPathService,
    InspectInterpreterSettingType,
    InterpreterConfigurationScope,
    IPersistentState,
    IPersistentStateFactory,
    IPythonSettings,
    Resource,
} from './types';
import { SystemVariables } from './variables/systemVariables';

export const remoteWorkspaceKeysForWhichTheCopyIsDone_Key = 'remoteWorkspaceKeysForWhichTheCopyIsDone_Key';
export const remoteWorkspaceFolderKeysForWhichTheCopyIsDone_Key = 'remoteWorkspaceFolderKeysForWhichTheCopyIsDone_Key';
export const isRemoteGlobalSettingCopiedKey = 'isRemoteGlobalSettingCopiedKey';
export const defaultInterpreterPathSetting: keyof IPythonSettings = 'defaultInterpreterPath';
const CI_PYTHON_PATH = getCIPythonPath();

export function getCIPythonPath(): string {
    if (process.env.CI_PYTHON_PATH && fs.existsSync(process.env.CI_PYTHON_PATH)) {
        return process.env.CI_PYTHON_PATH;
    }
    return 'python';
}
@injectable()
export class InterpreterPathService implements IInterpreterPathService {
    public get onDidChange(): Event<InterpreterConfigurationScope> {
        return this._didChangeInterpreterEmitter.event;
    }
    public _didChangeInterpreterEmitter = new EventEmitter<InterpreterConfigurationScope>();
    private fileSystemPaths: FileSystemPaths;
    constructor(
        @inject(IPersistentStateFactory) private readonly persistentStateFactory: IPersistentStateFactory,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IDisposableRegistry) disposables: IDisposable[],
        @inject(IApplicationEnvironment) private readonly appEnvironment: IApplicationEnvironment,
    ) {
        disposables.push(this.workspaceService.onDidChangeConfiguration(this.onDidChangeConfiguration.bind(this)));
        this.fileSystemPaths = FileSystemPaths.withDefaults();
    }

    public async onDidChangeConfiguration(event: ConfigurationChangeEvent) {
        if (event.affectsConfiguration(`python.${defaultInterpreterPathSetting}`)) {
            this._didChangeInterpreterEmitter.fire({ uri: undefined, configTarget: ConfigurationTarget.Global });
            traceVerbose('Interpreter Path updated', `python.${defaultInterpreterPathSetting}`);
        }
    }

    public inspect(resource: Resource, useOldKey = false): InspectInterpreterSettingType {
        resource = PythonSettings.getSettingsUriAndTarget(resource, this.workspaceService).uri;
        let workspaceFolderSetting: IPersistentState<string | undefined> | undefined;
        let workspaceSetting: IPersistentState<string | undefined> | undefined;
        if (resource) {
            workspaceFolderSetting = this.persistentStateFactory.createGlobalPersistentState<string | undefined>(
                this.getSettingKey(resource, ConfigurationTarget.WorkspaceFolder, useOldKey),
                undefined,
            );
            workspaceSetting = this.persistentStateFactory.createGlobalPersistentState<string | undefined>(
                this.getSettingKey(resource, ConfigurationTarget.Workspace, useOldKey),
                undefined,
            );
        }
        const defaultInterpreterPath: InspectInterpreterSettingType =
            this.workspaceService.getConfiguration('python', resource)?.inspect<string>('defaultInterpreterPath') ?? {};
        return {
            globalValue: defaultInterpreterPath.globalValue,
            workspaceFolderValue:
                !workspaceFolderSetting?.value || workspaceFolderSetting?.value === 'python'
                    ? defaultInterpreterPath.workspaceFolderValue
                    : workspaceFolderSetting.value,
            workspaceValue:
                !workspaceSetting?.value || workspaceSetting?.value === 'python'
                    ? defaultInterpreterPath.workspaceValue
                    : workspaceSetting.value,
        };
    }

    public get(resource: Resource): string {
        const settings = this.inspect(resource);        
        const value =
            settings.workspaceFolderValue ||
            settings.workspaceValue ||
            settings.globalValue ||
            (isTestExecution() ? CI_PYTHON_PATH : 'python');
        
        const systemVariables = new SystemVariables(
            undefined,
            this.workspaceService.getWorkspaceFolder(resource)?.uri.fsPath,
            this.workspaceService,
        );
        const resolved = systemVariables.resolveAny(value)!;
        return resolved;
    }

    public async update(
        resource: Resource,
        configTarget: ConfigurationTarget,
        pythonPath: string | undefined,
    ): Promise<void> {
        resource = PythonSettings.getSettingsUriAndTarget(resource, this.workspaceService).uri;
        if (configTarget === ConfigurationTarget.Global) {
            // const pythonConfig = this.workspaceService.getConfiguration('python');
            // const globalValue = pythonConfig.inspect<string>('defaultInterpreterPath')!.globalValue;
            // if (globalValue !== pythonPath) {
            //     await pythonConfig.update('defaultInterpreterPath', pythonPath, true);
            // }
            return;
        }
        if (!resource) {
            traceError('Cannot update workspace settings as no workspace is opened');
            return;
        }
        const settingKey = this.getSettingKey(resource, configTarget);
        const persistentSetting = this.persistentStateFactory.createGlobalPersistentState<string | undefined>(
            settingKey,
            undefined,
        );
        if (persistentSetting.value !== pythonPath) {
            await persistentSetting.updateValue(pythonPath);
            this._didChangeInterpreterEmitter.fire({ uri: resource, configTarget });
            traceVerbose('Interpreter Path updated', settingKey, pythonPath);
        }
    }

    public getSettingKey(
        resource: Uri,
        configTarget: ConfigurationTarget.Workspace | ConfigurationTarget.WorkspaceFolder,
        useOldKey = false,
    ): string {
        let settingKey: string;
        const folderKey = this.workspaceService.getWorkspaceFolderIdentifier(resource);
        if (configTarget === ConfigurationTarget.WorkspaceFolder) {
            settingKey = `WORKSPACE_FOLDER_INTERPRETER_PATH_${folderKey}`;
        } else {
            settingKey = this.workspaceService.workspaceFile
                ? `WORKSPACE_INTERPRETER_PATH_${this.fileSystemPaths.normCase(
                      this.workspaceService.workspaceFile.fsPath,
                  )}`
                : // Only a single folder is opened, use fsPath of the folder as key
                  `WORKSPACE_FOLDER_INTERPRETER_PATH_${folderKey}`;
        }
        if (!useOldKey && this.appEnvironment.remoteName) {
            return `${this.appEnvironment.remoteName}_${settingKey}`;
        }
        return settingKey;
    }

    public async copyOldInterpreterStorageValuesToNew(resource: Resource): Promise<void> {
        resource = PythonSettings.getSettingsUriAndTarget(resource, this.workspaceService).uri;
        const oldSettings = this.inspect(resource, true);
        await Promise.all([
            this._copyWorkspaceFolderValueToNewStorage(resource, oldSettings.workspaceFolderValue),
            this._copyWorkspaceValueToNewStorage(resource, oldSettings.workspaceValue),
            this._moveGlobalSettingValueToNewStorage(oldSettings.globalValue),
        ]);
    }

    public async _copyWorkspaceFolderValueToNewStorage(resource: Resource, value: string | undefined): Promise<void> {
        // Copy workspace folder setting into the new storage if it hasn't been copied already
        const workspaceFolderKey = this.workspaceService.getWorkspaceFolderIdentifier(resource, '');
        if (workspaceFolderKey === '') {
            // No workspace folder is opened, simply return.
            return;
        }
        const flaggedWorkspaceFolderKeysStorage = this.persistentStateFactory.createGlobalPersistentState<string[]>(
            remoteWorkspaceFolderKeysForWhichTheCopyIsDone_Key,
            [],
        );
        const flaggedWorkspaceFolderKeys = flaggedWorkspaceFolderKeysStorage.value;
        const shouldUpdateWorkspaceFolderSetting = !flaggedWorkspaceFolderKeys.includes(workspaceFolderKey);
        if (shouldUpdateWorkspaceFolderSetting) {
            await this.update(resource, ConfigurationTarget.WorkspaceFolder, value);
            await flaggedWorkspaceFolderKeysStorage.updateValue([workspaceFolderKey, ...flaggedWorkspaceFolderKeys]);
        }
    }

    public async _copyWorkspaceValueToNewStorage(resource: Resource, value: string | undefined): Promise<void> {
        // Copy workspace setting into the new storage if it hasn't been copied already
        const workspaceKey = this.workspaceService.workspaceFile
            ? this.fileSystemPaths.normCase(this.workspaceService.workspaceFile.fsPath)
            : undefined;
        if (!workspaceKey) {
            return;
        }
        const flaggedWorkspaceKeysStorage = this.persistentStateFactory.createGlobalPersistentState<string[]>(
            remoteWorkspaceKeysForWhichTheCopyIsDone_Key,
            [],
        );
        const flaggedWorkspaceKeys = flaggedWorkspaceKeysStorage.value;
        const shouldUpdateWorkspaceSetting = !flaggedWorkspaceKeys.includes(workspaceKey);
        if (shouldUpdateWorkspaceSetting) {
            await this.update(resource, ConfigurationTarget.Workspace, value);
            await flaggedWorkspaceKeysStorage.updateValue([workspaceKey, ...flaggedWorkspaceKeys]);
        }
    }

    public async _moveGlobalSettingValueToNewStorage(value: string | undefined) {
        // Move global setting into the new storage if it hasn't been moved already
        const isGlobalSettingCopiedStorage = this.persistentStateFactory.createGlobalPersistentState<boolean>(
            isRemoteGlobalSettingCopiedKey,
            false,
        );
        const shouldUpdateGlobalSetting = !isGlobalSettingCopiedStorage.value;
        if (shouldUpdateGlobalSetting) {
            await this.update(undefined, ConfigurationTarget.Global, value);
            await isGlobalSettingCopiedStorage.updateValue(true);
        }
    }
}
