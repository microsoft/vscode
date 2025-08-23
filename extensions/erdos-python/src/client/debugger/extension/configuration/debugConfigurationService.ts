// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable, named } from 'inversify';
import { CancellationToken, DebugConfiguration, WorkspaceFolder } from 'vscode';
import { AttachRequestArguments, LaunchRequestArguments } from '../../types';
import { IDebugConfigurationService } from '../types';
import { IDebugConfigurationResolver } from './types';

@injectable()
export class PythonDebugConfigurationService implements IDebugConfigurationService {
    constructor(
        @inject(IDebugConfigurationResolver)
        @named('attach')
        private readonly attachResolver: IDebugConfigurationResolver<AttachRequestArguments>,
        @inject(IDebugConfigurationResolver)
        @named('launch')
        private readonly launchResolver: IDebugConfigurationResolver<LaunchRequestArguments>,
    ) {}

    public async resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: DebugConfiguration,
        token?: CancellationToken,
    ): Promise<DebugConfiguration | undefined> {
        if (debugConfiguration.request === 'attach') {
            return this.attachResolver.resolveDebugConfiguration(
                folder,
                debugConfiguration as AttachRequestArguments,
                token,
            );
        }
        if (debugConfiguration.request === 'test') {
            // `"request": "test"` is now deprecated. But some users might have it in their
            // launch config. We get here if they triggered it using F5 or start with debugger.
            throw Error(
                'This configuration can only be used by the test debugging commands. `"request": "test"` is deprecated, please keep as `"request": "launch"` and add `"purpose": ["debug-test"]` instead.',
            );
        } else {
            if (Object.keys(debugConfiguration).length === 0) {
                return undefined;
            }
            return this.launchResolver.resolveDebugConfiguration(
                folder,
                debugConfiguration as LaunchRequestArguments,
                token,
            );
        }
    }

    public async resolveDebugConfigurationWithSubstitutedVariables(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: DebugConfiguration,
        token?: CancellationToken,
    ): Promise<DebugConfiguration | undefined> {
        function resolve<T extends DebugConfiguration>(resolver: IDebugConfigurationResolver<T>) {
            return resolver.resolveDebugConfigurationWithSubstitutedVariables(folder, debugConfiguration as T, token);
        }
        return debugConfiguration.request === 'attach' ? resolve(this.attachResolver) : resolve(this.launchResolver);
    }
}
