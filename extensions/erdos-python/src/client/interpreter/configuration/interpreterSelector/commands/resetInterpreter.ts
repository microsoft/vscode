// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../../../common/application/types';
import { Commands } from '../../../../common/constants';
import { IConfigurationService, IPathUtils } from '../../../../common/types';
import { IPythonPathUpdaterServiceManager } from '../../types';
import { BaseInterpreterSelectorCommand } from './base';
import { useEnvExtension } from '../../../../envExt/api.internal';
import { resetInterpreterLegacy } from '../../../../envExt/api.legacy';

@injectable()
export class ResetInterpreterCommand extends BaseInterpreterSelectorCommand {
    constructor(
        @inject(IPythonPathUpdaterServiceManager) pythonPathUpdaterService: IPythonPathUpdaterServiceManager,
        @inject(ICommandManager) commandManager: ICommandManager,
        @inject(IApplicationShell) applicationShell: IApplicationShell,
        @inject(IWorkspaceService) workspaceService: IWorkspaceService,
        @inject(IPathUtils) pathUtils: IPathUtils,
        @inject(IConfigurationService) configurationService: IConfigurationService,
    ) {
        super(
            pythonPathUpdaterService,
            commandManager,
            applicationShell,
            workspaceService,
            pathUtils,
            configurationService,
        );
    }

    public async activate() {
        this.disposables.push(
            this.commandManager.registerCommand(Commands.ClearWorkspaceInterpreter, this.resetInterpreter.bind(this)),
        );
    }

    public async resetInterpreter() {
        const targetConfigs = await this.getConfigTargets({ resetTarget: true });
        if (!targetConfigs) {
            return;
        }
        await Promise.all(
            targetConfigs.map(async (targetConfig) => {
                const configTarget = targetConfig.configTarget;
                const wkspace = targetConfig.folderUri;
                await this.pythonPathUpdaterService.updatePythonPath(undefined, configTarget, 'ui', wkspace);
                if (useEnvExtension()) {
                    await resetInterpreterLegacy(wkspace);
                }
            }),
        );
    }
}
