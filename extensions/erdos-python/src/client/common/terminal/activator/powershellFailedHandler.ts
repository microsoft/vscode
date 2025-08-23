// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable, named } from 'inversify';
import { Terminal } from 'vscode';
import {
    PowerShellActivationHackDiagnosticsServiceId,
    PowershellActivationNotAvailableDiagnostic,
} from '../../../application/diagnostics/checks/powerShellActivation';
import { IDiagnosticsService } from '../../../application/diagnostics/types';
import { IPlatformService } from '../../platform/types';
import { Resource } from '../../types';
import { ITerminalActivationHandler, ITerminalHelper, TerminalShellType } from '../types';

@injectable()
export class PowershellTerminalActivationFailedHandler implements ITerminalActivationHandler {
    constructor(
        @inject(ITerminalHelper) private readonly helper: ITerminalHelper,
        @inject(IPlatformService) private readonly platformService: IPlatformService,
        @inject(IDiagnosticsService)
        @named(PowerShellActivationHackDiagnosticsServiceId)
        private readonly diagnosticService: IDiagnosticsService,
    ) {}
    public async handleActivation(terminal: Terminal, resource: Resource, _preserveFocus: boolean, activated: boolean) {
        if (activated || !this.platformService.isWindows) {
            return;
        }
        const shell = this.helper.identifyTerminalShell(terminal);
        if (shell !== TerminalShellType.powershell && shell !== TerminalShellType.powershellCore) {
            return;
        }
        // Check if we can activate in Command Prompt.
        const activationCommands = await this.helper.getEnvironmentActivationCommands(
            TerminalShellType.commandPrompt,
            resource,
        );
        if (!activationCommands || !Array.isArray(activationCommands) || activationCommands.length === 0) {
            return;
        }
        this.diagnosticService.handle([new PowershellActivationNotAvailableDiagnostic(resource)]).ignoreErrors();
    }
}
