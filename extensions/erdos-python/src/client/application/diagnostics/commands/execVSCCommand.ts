// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { CommandsWithoutArgs } from '../../../common/application/commands';
import { ICommandManager } from '../../../common/application/types';
import { IServiceContainer } from '../../../ioc/types';
import { sendTelemetryEvent } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { IDiagnostic } from '../types';
import { BaseDiagnosticCommand } from './base';

export class ExecuteVSCCommand extends BaseDiagnosticCommand {
    constructor(
        diagnostic: IDiagnostic,
        private serviceContainer: IServiceContainer,
        private commandName: CommandsWithoutArgs,
    ) {
        super(diagnostic);
    }
    public async invoke(): Promise<void> {
        sendTelemetryEvent(EventName.DIAGNOSTICS_ACTION, undefined, { commandName: this.commandName });
        const cmdManager = this.serviceContainer.get<ICommandManager>(ICommandManager);
        return cmdManager.executeCommand(this.commandName).then(() => undefined);
    }
}
