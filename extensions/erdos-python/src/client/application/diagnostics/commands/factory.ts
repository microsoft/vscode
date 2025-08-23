// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable } from 'inversify';
import { IServiceContainer } from '../../../ioc/types';
import { IDiagnostic, IDiagnosticCommand } from '../types';
import { ExecuteVSCCommand } from './execVSCCommand';
import { IgnoreDiagnosticCommand } from './ignore';
import { LaunchBrowserCommand } from './launchBrowser';
import { CommandOptions, IDiagnosticsCommandFactory } from './types';

@injectable()
export class DiagnosticsCommandFactory implements IDiagnosticsCommandFactory {
    constructor(@inject(IServiceContainer) private serviceContainer: IServiceContainer) {}
    public createCommand(diagnostic: IDiagnostic, options: CommandOptions): IDiagnosticCommand {
        const commandType = options.type;
        switch (options.type) {
            case 'ignore': {
                return new IgnoreDiagnosticCommand(diagnostic, this.serviceContainer, options.options);
            }
            case 'launch': {
                return new LaunchBrowserCommand(diagnostic, this.serviceContainer, options.options);
            }
            case 'executeVSCCommand': {
                return new ExecuteVSCCommand(diagnostic, this.serviceContainer, options.options);
            }
            default: {
                throw new Error(`Unknown Diagnostic command commandType '${commandType}'`);
            }
        }
    }
}
