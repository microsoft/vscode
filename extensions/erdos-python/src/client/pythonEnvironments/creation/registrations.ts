// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IPythonRuntimeManager } from '../../erdos/manager';
import { IDisposableRegistry, IPathUtils } from '../../common/types';
import { IInterpreterQuickPick, IPythonPathUpdaterServiceManager } from '../../interpreter/configuration/types';
import { IInterpreterService } from '../../interpreter/contracts';
import { registerCreateEnvironmentFeatures } from './createEnvApi';
import { registerCreateEnvironmentButtonFeatures } from './createEnvButtonContext';
import { registerTriggerForPipInTerminal } from './globalPipInTerminalTrigger';
import { registerInstalledPackagesDiagnosticsProvider } from './installedPackagesDiagnostic';
import { registerPyProjectTomlFeatures } from './pyProjectTomlContext';

export async function registerAllCreateEnvironmentFeatures(
    disposables: IDisposableRegistry,
    interpreterQuickPick: IInterpreterQuickPick,
    pythonPathUpdater: IPythonPathUpdaterServiceManager,
    interpreterService: IInterpreterService,
    pathUtils: IPathUtils,
    pythonRuntimeManager: IPythonRuntimeManager,
): Promise<void> {
    await registerCreateEnvironmentFeatures(
        disposables,
        interpreterQuickPick,
        pythonPathUpdater,
        pathUtils,
        pythonRuntimeManager,
    );
    registerCreateEnvironmentButtonFeatures(disposables);
    registerPyProjectTomlFeatures(disposables);
    registerInstalledPackagesDiagnosticsProvider(disposables, interpreterService);
    registerTriggerForPipInTerminal(disposables);
}
