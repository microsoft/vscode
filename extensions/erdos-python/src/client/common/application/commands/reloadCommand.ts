// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { IExtensionSingleActivationService } from '../../../activation/types';
import { Common } from '../../utils/localize';
import { noop } from '../../utils/misc';
import { IApplicationShell, ICommandManager } from '../types';

/**
 * Prompts user to reload VS Code with a custom message, and reloads if necessary.
 */
@injectable()
export class ReloadVSCodeCommandHandler implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };
    constructor(
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
    ) {}
    public async activate(): Promise<void> {
        this.commandManager.registerCommand('python.reloadVSCode', this.onReloadVSCode, this);
    }
    private async onReloadVSCode(message: string) {
        const item = await this.appShell.showInformationMessage(message, Common.reload);
        if (item === Common.reload) {
            this.commandManager.executeCommand('workbench.action.reloadWindow').then(noop, noop);
        }
    }
}
