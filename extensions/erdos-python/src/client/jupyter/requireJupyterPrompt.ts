// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable } from 'inversify';
import { IExtensionSingleActivationService } from '../activation/types';
import { IApplicationShell, ICommandManager } from '../common/application/types';
import { Common, Interpreters } from '../common/utils/localize';
import { Commands, JUPYTER_EXTENSION_ID } from '../common/constants';
import { IDisposable, IDisposableRegistry } from '../common/types';
import { sendTelemetryEvent } from '../telemetry';
import { EventName } from '../telemetry/constants';

@injectable()
export class RequireJupyterPrompt implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };

    constructor(
        @inject(IApplicationShell) private readonly appShell: IApplicationShell,
        @inject(ICommandManager) private readonly commandManager: ICommandManager,
        @inject(IDisposableRegistry) private readonly disposables: IDisposable[],
    ) {}

    public async activate(): Promise<void> {
        this.disposables.push(this.commandManager.registerCommand(Commands.InstallJupyter, () => this._showPrompt()));
    }

    public async _showPrompt(): Promise<void> {
        const prompts = [Common.bannerLabelYes, Common.bannerLabelNo];
        const telemetrySelections: ['Yes', 'No'] = ['Yes', 'No'];
        const selection = await this.appShell.showInformationMessage(Interpreters.requireJupyter, ...prompts);
        sendTelemetryEvent(EventName.REQUIRE_JUPYTER_PROMPT, undefined, {
            selection: selection ? telemetrySelections[prompts.indexOf(selection)] : undefined,
        });
        if (!selection) {
            return;
        }
        if (selection === prompts[0]) {
            await this.commandManager.executeCommand(
                'workbench.extensions.installExtension',
                JUPYTER_EXTENSION_ID,
                undefined,
            );
        }
    }
}
