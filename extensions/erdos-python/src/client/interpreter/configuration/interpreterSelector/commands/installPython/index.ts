// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { IExtensionSingleActivationService } from '../../../../../activation/types';
import { ExtensionContextKey } from '../../../../../common/application/contextKeys';
import { ICommandManager, IContextKeyManager } from '../../../../../common/application/types';
import { PythonWelcome } from '../../../../../common/application/walkThroughs';
import { Commands, PVSC_EXTENSION_ID } from '../../../../../common/constants';
import { IBrowserService, IDisposableRegistry } from '../../../../../common/types';
import { IPlatformService } from '../../../../../common/platform/types';

@injectable()
export class InstallPythonCommand implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: true, virtualWorkspace: false };

    constructor(
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IContextKeyManager) private readonly contextManager: IContextKeyManager,
        @inject(IBrowserService) private readonly browserService: IBrowserService,
        @inject(IPlatformService) private readonly platformService: IPlatformService,
        @inject(IDisposableRegistry) private readonly disposables: IDisposableRegistry,
    ) {}

    public async activate(): Promise<void> {
        this.disposables.push(this.commandManager.registerCommand(Commands.InstallPython, () => this._installPython()));
    }

    public async _installPython(): Promise<void> {
        if (this.platformService.isWindows) {
            const version = await this.platformService.getVersion();
            if (version.major > 8) {
                // OS is not Windows 8, ms-windows-store URIs are available:
                // https://docs.microsoft.com/en-us/windows/uwp/launch-resume/launch-store-app
                this.browserService.launch('ms-windows-store://pdp/?ProductId=9NRWMJP3717K');
                return;
            }
        }
        this.showInstallPythonTile();
    }

    private showInstallPythonTile() {
        this.contextManager.setContext(ExtensionContextKey.showInstallPythonTile, true);
        let step: string;
        if (this.platformService.isWindows) {
            step = PythonWelcome.windowsInstallId;
        } else if (this.platformService.isLinux) {
            step = PythonWelcome.linuxInstallId;
        } else {
            step = PythonWelcome.macOSInstallId;
        }
        this.commandManager.executeCommand(
            'workbench.action.openWalkthrough',
            {
                category: `${PVSC_EXTENSION_ID}#${PythonWelcome.name}`,
                step: `${PVSC_EXTENSION_ID}#${PythonWelcome.name}#${step}`,
            },
            false,
        );
    }
}
