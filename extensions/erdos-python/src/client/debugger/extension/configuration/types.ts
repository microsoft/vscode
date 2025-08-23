// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { CancellationToken, DebugConfiguration, WorkspaceFolder } from 'vscode';

export const IDebugConfigurationResolver = Symbol('IDebugConfigurationResolver');
export interface IDebugConfigurationResolver<T extends DebugConfiguration> {
    resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: T,
        token?: CancellationToken,
    ): Promise<T | undefined>;

    resolveDebugConfigurationWithSubstitutedVariables(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: T,
        token?: CancellationToken,
    ): Promise<T | undefined>;
}
