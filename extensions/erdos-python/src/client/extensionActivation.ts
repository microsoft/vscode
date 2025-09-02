// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { DebugConfigurationProvider, debug, languages, window } from 'vscode';

import { registerTypes as activationRegisterTypes } from './activation/serviceRegistry';
import { IExtensionActivationManager } from './activation/types';
import { registerTypes as appRegisterTypes } from './application/serviceRegistry';
import { IApplicationDiagnostics } from './application/types';
import { IApplicationEnvironment, ICommandManager, IWorkspaceService } from './common/application/types';
import { Commands, PYTHON_LANGUAGE, UseProposedApi } from './common/constants';
import { registerTypes as installerRegisterTypes } from './common/installer/serviceRegistry';
import { IFileSystem } from './common/platform/types';
import {
    IConfigurationService,
    IDisposableRegistry,
    IExtensions,
    IInterpreterPathService,
    ILogOutputChannel,
    IPathUtils,
} from './common/types';
import { noop } from './common/utils/misc';
import { registerTypes as debugConfigurationRegisterTypes } from './debugger/extension/serviceRegistry';
import { IDebugConfigurationService } from './debugger/extension/types';
import { IInterpreterService } from './interpreter/contracts';
import { getLanguageConfiguration } from './language/languageConfiguration';
import { ReplProvider } from './providers/replProvider';
import { registerTypes as providersRegisterTypes } from './providers/serviceRegistry';
import { TerminalProvider } from './providers/terminalProvider';
import { setExtensionInstallTelemetryProperties } from './telemetry/extensionInstallTelemetry';
import { registerTypes as tensorBoardRegisterTypes } from './tensorBoard/serviceRegistry';
import { registerTypes as commonRegisterTerminalTypes } from './terminals/serviceRegistry';
import { ICodeExecutionHelper, ICodeExecutionManager, ITerminalAutoActivation } from './terminals/types';
import { registerTypes as unitTestsRegisterTypes } from './testing/serviceRegistry';

// components
import * as pythonEnvironments from './pythonEnvironments';

import { ActivationResult, ExtensionState } from './components';
import { Components } from './extensionInit';
import { setDefaultLanguageServer } from './activation/common/defaultlanguageServer';
import { DebugService } from './common/application/debugService';
import { DebugSessionEventDispatcher } from './debugger/extension/hooks/eventHandlerDispatcher';
import { IDebugSessionEventHandlers } from './debugger/extension/hooks/types';
import { WorkspaceService } from './common/application/workspace';
import { IInterpreterQuickPick, IPythonPathUpdaterServiceManager } from './interpreter/configuration/types';
import { registerAllCreateEnvironmentFeatures } from './pythonEnvironments/creation/registrations';
import { registerCreateEnvironmentTriggers } from './pythonEnvironments/creation/createEnvironmentTrigger';
import { initializePersistentStateForTriggers } from './common/persistentState';
import { DebuggerTypeName } from './debugger/constants';
import { StopWatch } from './common/utils/stopWatch';
import { registerReplCommands, registerReplExecuteOnEnter, registerStartNativeReplCommand } from './repl/replCommands';
import { registerTriggerForTerminalREPL } from './terminals/codeExecution/terminalReplWatcher';
import { registerPythonStartup } from './terminals/pythonStartup';
import { registerPixiFeatures } from './pythonEnvironments/common/environmentManagers/pixi';
import { registerEnvExtFeatures } from './envExt/api.internal';
import { IPythonRuntimeManager } from './erdos/manager';

export async function activateComponents(
    // `ext` is passed to any extra activation funcs.
    ext: ExtensionState,
    components: Components,
    startupStopWatch: StopWatch,
): Promise<ActivationResult[]> {
    // Note that each activation returns a promise that resolves
    // when that activation completes.  However, it might have started
    // some non-critical background operations that do not block
    // extension activation but do block use of the extension "API".
    // Each component activation can't just resolve an "inner" promise
    // for those non-critical operations because `await` (and
    // `Promise.all()`, etc.) will flatten nested promises.  Thus
    // activation resolves `ActivationResult`, which can safely wrap
    // the "inner" promise.

    // TODO: As of now activateLegacy() registers various classes which might
    // be required while activating components. Once registration from
    // activateLegacy() are moved before we activate other components, we can
    // activate them in parallel with the other components.
    // https://github.com/microsoft/vscode-python/issues/15380
    // These will go away eventually once everything is refactored into components.
    const legacyActivationResult = await activateLegacy(ext, startupStopWatch);
    const workspaceService = new WorkspaceService();
    if (!workspaceService.isTrusted) {
        return [legacyActivationResult];
    }
    const promises: Promise<ActivationResult>[] = [
        // More component activations will go here
        pythonEnvironments.activateAndRefreshEnvs(components.pythonEnvs),
    ];
    return Promise.all([legacyActivationResult, ...promises]);
}

export async function activateFeatures(ext: ExtensionState, _components: Components): Promise<void> {
    const interpreterQuickPick: IInterpreterQuickPick = ext.legacyIOC.serviceContainer.get<IInterpreterQuickPick>(
        IInterpreterQuickPick,
    );
    const interpreterPathService: IInterpreterPathService = ext.legacyIOC.serviceContainer.get<IInterpreterPathService>(
        IInterpreterPathService,
    );
    const interpreterService: IInterpreterService = ext.legacyIOC.serviceContainer.get<IInterpreterService>(
        IInterpreterService,
    );

    const pythonRuntimeManager: IPythonRuntimeManager = ext.legacyIOC.serviceContainer.get<IPythonRuntimeManager>(
        IPythonRuntimeManager,
    );

    registerEnvExtFeatures(ext.disposables, interpreterPathService);
    const pathUtils = ext.legacyIOC.serviceContainer.get<IPathUtils>(IPathUtils);
    registerPixiFeatures(ext.disposables);
    await registerAllCreateEnvironmentFeatures(
        ext.disposables,
        interpreterQuickPick,
        ext.legacyIOC.serviceContainer.get<IPythonPathUpdaterServiceManager>(IPythonPathUpdaterServiceManager),
        interpreterService,
        pathUtils,
        pythonRuntimeManager,
    );
    const executionHelper = ext.legacyIOC.serviceContainer.get<ICodeExecutionHelper>(ICodeExecutionHelper);
    const commandManager = ext.legacyIOC.serviceContainer.get<ICommandManager>(ICommandManager);
    registerTriggerForTerminalREPL(ext.disposables);
    registerStartNativeReplCommand(ext.disposables, interpreterService);
    registerReplCommands(ext.disposables, interpreterService, executionHelper, commandManager);
    registerReplExecuteOnEnter(ext.disposables, interpreterService, commandManager);
    // This hyperlinks the terminal to the native REPL, which we don't use.
    // registerCustomTerminalLinkProvider(ext.disposables);
}

/// //////////////////////////
// old activation code

// TODO: Gradually move simple initialization
// and DI registration currently in this function over
// to initializeComponents().  Likewise with complex
// init and activation: move them to activateComponents().
// See https://github.com/microsoft/vscode-python/issues/10454.

async function activateLegacy(ext: ExtensionState, startupStopWatch: StopWatch): Promise<ActivationResult> {
    const { legacyIOC } = ext;
    const { serviceManager, serviceContainer } = legacyIOC;

    // register "services"

    // We need to setup this property before any telemetry is sent
    const fs = serviceManager.get<IFileSystem>(IFileSystem);
    await setExtensionInstallTelemetryProperties(fs);

    const applicationEnv = serviceManager.get<IApplicationEnvironment>(IApplicationEnvironment);
    const { enableProposedApi } = applicationEnv.packageJson;
    serviceManager.addSingletonInstance<boolean>(UseProposedApi, enableProposedApi);
    // Feature specific registrations.
    unitTestsRegisterTypes(serviceManager);
    installerRegisterTypes(serviceManager);
    commonRegisterTerminalTypes(serviceManager);
    debugConfigurationRegisterTypes(serviceManager);
    tensorBoardRegisterTypes(serviceManager);

    const extensions = serviceContainer.get<IExtensions>(IExtensions);
    await setDefaultLanguageServer(extensions, serviceManager);

    // Settings are dependent on Experiment service, so we need to initialize it after experiments are activated.
    serviceContainer.get<IConfigurationService>(IConfigurationService).getSettings().register();

    // Language feature registrations.
    appRegisterTypes(serviceManager);
    providersRegisterTypes(serviceManager);
    activationRegisterTypes(serviceManager);

    // "initialize" "services"

    const disposables = serviceManager.get<IDisposableRegistry>(IDisposableRegistry);
    const workspaceService = serviceContainer.get<IWorkspaceService>(IWorkspaceService);
    const cmdManager = serviceContainer.get<ICommandManager>(ICommandManager);

    languages.setLanguageConfiguration(PYTHON_LANGUAGE, getLanguageConfiguration());
    if (workspaceService.isTrusted) {
        const interpreterManager = serviceContainer.get<IInterpreterService>(IInterpreterService);
        interpreterManager.initialize();
        if (!workspaceService.isVirtualWorkspace) {
            const handlers = serviceManager.getAll<IDebugSessionEventHandlers>(IDebugSessionEventHandlers);
            const dispatcher = new DebugSessionEventDispatcher(handlers, DebugService.instance, disposables);
            dispatcher.registerEventHandlers();
            const outputChannel = serviceManager.get<ILogOutputChannel>(ILogOutputChannel);
            disposables.push(cmdManager.registerCommand(Commands.ViewOutput, () => outputChannel.show()));
            cmdManager.executeCommand('setContext', 'python.vscode.channel', applicationEnv.channel).then(noop, noop);

            serviceContainer.get<IApplicationDiagnostics>(IApplicationDiagnostics).register();

            serviceManager.get<ITerminalAutoActivation>(ITerminalAutoActivation).register();

            await registerPythonStartup(ext.context);

            serviceManager.get<ICodeExecutionManager>(ICodeExecutionManager).registerCommands();

            disposables.push(new ReplProvider(serviceContainer));

            const terminalProvider = new TerminalProvider(serviceContainer);
            terminalProvider.initialize(window.activeTerminal).ignoreErrors();

            serviceContainer
                .getAll<DebugConfigurationProvider>(IDebugConfigurationService)
                .forEach((debugConfigProvider) => {
                    disposables.push(debug.registerDebugConfigurationProvider(DebuggerTypeName, debugConfigProvider));
                });
            disposables.push(terminalProvider);

            registerCreateEnvironmentTriggers(disposables);
            initializePersistentStateForTriggers(ext.context);
        }
    }

    // "activate" everything else

    const manager = serviceContainer.get<IExtensionActivationManager>(IExtensionActivationManager);
    disposables.push(manager);

    const activationPromise = manager.activate(startupStopWatch);

    return { fullyReady: activationPromise };
}
