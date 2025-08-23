// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable } from 'inversify';
import { CancellationToken, Uri, WorkspaceFolder } from 'vscode';
import { getOSType, OSType } from '../../../../common/utils/platform';
import { AttachRequestArguments, DebugOptions, PathMapping } from '../../../types';
import { BaseConfigurationResolver } from './base';

@injectable()
export class AttachConfigurationResolver extends BaseConfigurationResolver<AttachRequestArguments> {
    public async resolveDebugConfigurationWithSubstitutedVariables(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: AttachRequestArguments,
        _token?: CancellationToken,
    ): Promise<AttachRequestArguments | undefined> {
        const workspaceFolder = AttachConfigurationResolver.getWorkspaceFolder(folder);

        await this.provideAttachDefaults(workspaceFolder, debugConfiguration as AttachRequestArguments);

        const dbgConfig = debugConfiguration;
        if (Array.isArray(dbgConfig.debugOptions)) {
            dbgConfig.debugOptions = dbgConfig.debugOptions!.filter(
                (item, pos) => dbgConfig.debugOptions!.indexOf(item) === pos,
            );
        }
        if (debugConfiguration.clientOS === undefined) {
            debugConfiguration.clientOS = getOSType() === OSType.Windows ? 'windows' : 'unix';
        }
        return debugConfiguration;
    }

    protected async provideAttachDefaults(
        workspaceFolder: Uri | undefined,
        debugConfiguration: AttachRequestArguments,
    ): Promise<void> {
        if (!Array.isArray(debugConfiguration.debugOptions)) {
            debugConfiguration.debugOptions = [];
        }
        if (!(debugConfiguration.connect || debugConfiguration.listen) && !debugConfiguration.host) {
            // Connect and listen cannot be mixed with host property.
            debugConfiguration.host = 'localhost';
        }
        debugConfiguration.showReturnValue = debugConfiguration.showReturnValue !== false;
        // Pass workspace folder so we can get this when we get debug events firing.
        debugConfiguration.workspaceFolder = workspaceFolder ? workspaceFolder.fsPath : undefined;
        const debugOptions = debugConfiguration.debugOptions!;
        if (debugConfiguration.django) {
            AttachConfigurationResolver.debugOption(debugOptions, DebugOptions.Django);
        }
        if (debugConfiguration.jinja) {
            AttachConfigurationResolver.debugOption(debugOptions, DebugOptions.Jinja);
        }
        if (debugConfiguration.subProcess === true) {
            AttachConfigurationResolver.debugOption(debugOptions, DebugOptions.SubProcess);
        }
        if (
            debugConfiguration.pyramid &&
            debugOptions.indexOf(DebugOptions.Jinja) === -1 &&
            debugConfiguration.jinja !== false
        ) {
            AttachConfigurationResolver.debugOption(debugOptions, DebugOptions.Jinja);
        }
        if (debugConfiguration.redirectOutput || debugConfiguration.redirectOutput === undefined) {
            AttachConfigurationResolver.debugOption(debugOptions, DebugOptions.RedirectOutput);
        }

        // We'll need paths to be fixed only in the case where local and remote hosts are the same
        // I.e. only if hostName === 'localhost' or '127.0.0.1' or ''
        const isLocalHost = AttachConfigurationResolver.isLocalHost(debugConfiguration.host);
        if (getOSType() === OSType.Windows && isLocalHost) {
            AttachConfigurationResolver.debugOption(debugOptions, DebugOptions.FixFilePathCase);
        }
        if (debugConfiguration.clientOS === undefined) {
            debugConfiguration.clientOS = getOSType() === OSType.Windows ? 'windows' : 'unix';
        }
        if (debugConfiguration.showReturnValue) {
            AttachConfigurationResolver.debugOption(debugOptions, DebugOptions.ShowReturnValue);
        }

        debugConfiguration.pathMappings = this.resolvePathMappings(
            debugConfiguration.pathMappings || [],
            debugConfiguration.host,
            debugConfiguration.localRoot,
            debugConfiguration.remoteRoot,
            workspaceFolder,
        );
    }

    // eslint-disable-next-line class-methods-use-this
    private resolvePathMappings(
        pathMappings: PathMapping[],
        host?: string,
        localRoot?: string,
        remoteRoot?: string,
        workspaceFolder?: Uri,
    ) {
        // This is for backwards compatibility.
        if (localRoot && remoteRoot) {
            pathMappings.push({
                localRoot,
                remoteRoot,
            });
        }
        // If attaching to local host, then always map local root and remote roots.
        if (AttachConfigurationResolver.isLocalHost(host)) {
            pathMappings = AttachConfigurationResolver.fixUpPathMappings(
                pathMappings,
                workspaceFolder ? workspaceFolder.fsPath : '',
            );
        }
        return pathMappings.length > 0 ? pathMappings : undefined;
    }
}
