// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IDisposableRegistry } from '../../common/types';
import { executeCommand } from '../../common/vscodeApis/commandApis';
import { getConfiguration, onDidChangeConfiguration } from '../../common/vscodeApis/workspaceApis';

async function setShowCreateEnvButtonContextKey(): Promise<void> {
    const config = getConfiguration('python');
    const showCreateEnvButton = config.get<string>('createEnvironment.contentButton', 'show') === 'show';
    await executeCommand('setContext', 'showCreateEnvButton', showCreateEnvButton);
}

export function registerCreateEnvironmentButtonFeatures(disposables: IDisposableRegistry): void {
    disposables.push(
        onDidChangeConfiguration(async () => {
            await setShowCreateEnvButtonContextKey();
        }),
    );

    setShowCreateEnvButtonContextKey();
}
