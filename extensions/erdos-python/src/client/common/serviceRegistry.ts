// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { IExtensionSingleActivationService } from '../activation/types';
import {
    IBrowserService,
    IConfigurationService,
    ICurrentProcess,
    IExperimentService,
    IExtensions,
    IInstaller,
    IInterpreterPathService,
    IPathUtils,
    IPersistentStateFactory,
    IRandom,
    IToolExecutionPath,
    IsWindows,
    ToolExecutionPath,
} from './types';
import { IServiceManager } from '../ioc/types';
import { JupyterExtensionDependencyManager } from '../jupyter/jupyterExtensionDependencyManager';
import { ImportTracker } from '../telemetry/importTracker';
import { IImportTracker } from '../telemetry/types';
import { ActiveResourceService } from './application/activeResource';
import { ApplicationEnvironment } from './application/applicationEnvironment';
import { ApplicationShell } from './application/applicationShell';
import { ClipboardService } from './application/clipboard';
import { CommandManager } from './application/commandManager';
import { ReloadVSCodeCommandHandler } from './application/commands/reloadCommand';
import { ReportIssueCommandHandler } from './application/commands/reportIssueCommand';
import { DebugService } from './application/debugService';
import { DocumentManager } from './application/documentManager';
import { Extensions } from './application/extensions';
import { LanguageService } from './application/languageService';
import { TerminalManager } from './application/terminalManager';
import {
    IActiveResourceService,
    IApplicationEnvironment,
    IApplicationShell,
    IClipboard,
    ICommandManager,
    IContextKeyManager,
    IDebugService,
    IDocumentManager,
    IJupyterExtensionDependencyManager,
    ILanguageService,
    ITerminalManager,
    IWorkspaceService,
} from './application/types';
import { WorkspaceService } from './application/workspace';
import { ConfigurationService } from './configuration/service';
import { PipEnvExecutionPath } from './configuration/executionSettings/pipEnvExecution';
import { ExperimentService } from './experiments/service';
import { ProductInstaller } from './installer/productInstaller';
import { InterpreterPathService } from './interpreterPathService';
import { BrowserService } from './net/browser';
import { PersistentStateFactory } from './persistentState';
import { PathUtils } from './platform/pathUtils';
import { CurrentProcess } from './process/currentProcess';
import { ProcessLogger } from './process/logger';
import { IProcessLogger } from './process/types';
import { TerminalActivator } from './terminal/activator';
import { PowershellTerminalActivationFailedHandler } from './terminal/activator/powershellFailedHandler';
import { Bash } from './terminal/environmentActivationProviders/bash';
import { Nushell } from './terminal/environmentActivationProviders/nushell';
import { CommandPromptAndPowerShell } from './terminal/environmentActivationProviders/commandPrompt';
import { CondaActivationCommandProvider } from './terminal/environmentActivationProviders/condaActivationProvider';
import { PipEnvActivationCommandProvider } from './terminal/environmentActivationProviders/pipEnvActivationProvider';
import { PyEnvActivationCommandProvider } from './terminal/environmentActivationProviders/pyenvActivationProvider';
import { TerminalServiceFactory } from './terminal/factory';
import { TerminalHelper } from './terminal/helper';
import { SettingsShellDetector } from './terminal/shellDetectors/settingsShellDetector';
import { TerminalNameShellDetector } from './terminal/shellDetectors/terminalNameShellDetector';
import { UserEnvironmentShellDetector } from './terminal/shellDetectors/userEnvironmentShellDetector';
import { VSCEnvironmentShellDetector } from './terminal/shellDetectors/vscEnvironmentShellDetector';
import {
    IShellDetector,
    ITerminalActivationCommandProvider,
    ITerminalActivationHandler,
    ITerminalActivator,
    ITerminalHelper,
    ITerminalServiceFactory,
    TerminalActivationProviders,
} from './terminal/types';

import { IMultiStepInputFactory, MultiStepInputFactory } from './utils/multiStepInput';
import { Random } from './utils/random';
import { ContextKeyManager } from './application/contextKeyManager';
import { CreatePythonFileCommandHandler } from './application/commands/createPythonFile';
import { RequireJupyterPrompt } from '../jupyter/requireJupyterPrompt';
import { isWindows } from './utils/platform';
import { PixiActivationCommandProvider } from './terminal/environmentActivationProviders/pixiActivationProvider';

export function registerTypes(serviceManager: IServiceManager): void {
    serviceManager.addSingletonInstance<boolean>(IsWindows, isWindows());

    serviceManager.addSingleton<IActiveResourceService>(IActiveResourceService, ActiveResourceService);
    serviceManager.addSingleton<IInterpreterPathService>(IInterpreterPathService, InterpreterPathService);
    serviceManager.addSingleton<IExtensions>(IExtensions, Extensions);
    serviceManager.addSingleton<IRandom>(IRandom, Random);
    serviceManager.addSingleton<IPersistentStateFactory>(IPersistentStateFactory, PersistentStateFactory);
    serviceManager.addBinding(IPersistentStateFactory, IExtensionSingleActivationService);
    serviceManager.addSingleton<ITerminalServiceFactory>(ITerminalServiceFactory, TerminalServiceFactory);
    serviceManager.addSingleton<IPathUtils>(IPathUtils, PathUtils);
    serviceManager.addSingleton<IApplicationShell>(IApplicationShell, ApplicationShell);
    serviceManager.addSingleton<IClipboard>(IClipboard, ClipboardService);
    serviceManager.addSingleton<ICurrentProcess>(ICurrentProcess, CurrentProcess);
    serviceManager.addSingleton<IInstaller>(IInstaller, ProductInstaller);
    serviceManager.addSingleton<IJupyterExtensionDependencyManager>(
        IJupyterExtensionDependencyManager,
        JupyterExtensionDependencyManager,
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        RequireJupyterPrompt,
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        CreatePythonFileCommandHandler,
    );
    serviceManager.addSingleton<ICommandManager>(ICommandManager, CommandManager);
    serviceManager.addSingleton<IContextKeyManager>(IContextKeyManager, ContextKeyManager);
    serviceManager.addSingleton<IConfigurationService>(IConfigurationService, ConfigurationService);
    serviceManager.addSingleton<IWorkspaceService>(IWorkspaceService, WorkspaceService);
    serviceManager.addSingleton<IProcessLogger>(IProcessLogger, ProcessLogger);
    serviceManager.addSingleton<IDocumentManager>(IDocumentManager, DocumentManager);
    serviceManager.addSingleton<ITerminalManager>(ITerminalManager, TerminalManager);
    serviceManager.addSingleton<IDebugService>(IDebugService, DebugService);
    serviceManager.addSingleton<IApplicationEnvironment>(IApplicationEnvironment, ApplicationEnvironment);
    serviceManager.addSingleton<ILanguageService>(ILanguageService, LanguageService);
    serviceManager.addSingleton<IBrowserService>(IBrowserService, BrowserService);
    serviceManager.addSingleton<ITerminalActivator>(ITerminalActivator, TerminalActivator);
    serviceManager.addSingleton<ITerminalActivationHandler>(
        ITerminalActivationHandler,
        PowershellTerminalActivationFailedHandler,
    );
    serviceManager.addSingleton<IExperimentService>(IExperimentService, ExperimentService);

    serviceManager.addSingleton<ITerminalHelper>(ITerminalHelper, TerminalHelper);
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        Bash,
        TerminalActivationProviders.bashCShellFish,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        CommandPromptAndPowerShell,
        TerminalActivationProviders.commandPromptAndPowerShell,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        Nushell,
        TerminalActivationProviders.nushell,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        PyEnvActivationCommandProvider,
        TerminalActivationProviders.pyenv,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        CondaActivationCommandProvider,
        TerminalActivationProviders.conda,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        PixiActivationCommandProvider,
        TerminalActivationProviders.pixi,
    );
    serviceManager.addSingleton<ITerminalActivationCommandProvider>(
        ITerminalActivationCommandProvider,
        PipEnvActivationCommandProvider,
        TerminalActivationProviders.pipenv,
    );
    serviceManager.addSingleton<IToolExecutionPath>(IToolExecutionPath, PipEnvExecutionPath, ToolExecutionPath.pipenv);

    serviceManager.addSingleton<IMultiStepInputFactory>(IMultiStepInputFactory, MultiStepInputFactory);
    serviceManager.addSingleton<IImportTracker>(IImportTracker, ImportTracker);
    serviceManager.addBinding(IImportTracker, IExtensionSingleActivationService);
    serviceManager.addSingleton<IShellDetector>(IShellDetector, TerminalNameShellDetector);
    serviceManager.addSingleton<IShellDetector>(IShellDetector, SettingsShellDetector);
    serviceManager.addSingleton<IShellDetector>(IShellDetector, UserEnvironmentShellDetector);
    serviceManager.addSingleton<IShellDetector>(IShellDetector, VSCEnvironmentShellDetector);
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        ReloadVSCodeCommandHandler,
    );
    serviceManager.addSingleton<IExtensionSingleActivationService>(
        IExtensionSingleActivationService,
        ReportIssueCommandHandler,
    );
}
