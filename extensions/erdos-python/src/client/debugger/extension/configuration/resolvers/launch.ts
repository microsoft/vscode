// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { inject, injectable, named } from 'inversify';
import { CancellationToken, Uri, WorkspaceFolder } from 'vscode';
import { InvalidPythonPathInDebuggerServiceId } from '../../../../application/diagnostics/checks/invalidPythonPathInDebugger';
import { IDiagnosticsService, IInvalidPythonPathInDebuggerService } from '../../../../application/diagnostics/types';
import { IConfigurationService } from '../../../../common/types';
import { getOSType, OSType } from '../../../../common/utils/platform';
import { EnvironmentVariables } from '../../../../common/variables/types';
import { IEnvironmentActivationService } from '../../../../interpreter/activation/types';
import { IInterpreterService } from '../../../../interpreter/contracts';
import { DebuggerTypeName } from '../../../constants';
import { DebugOptions, LaunchRequestArguments } from '../../../types';
import { BaseConfigurationResolver } from './base';
import { getProgram, IDebugEnvironmentVariablesService } from './helper';
import {
    CreateEnvironmentCheckKind,
    triggerCreateEnvironmentCheckNonBlocking,
} from '../../../../pythonEnvironments/creation/createEnvironmentTrigger';
import { sendTelemetryEvent } from '../../../../telemetry';
import { EventName } from '../../../../telemetry/constants';

@injectable()
export class LaunchConfigurationResolver extends BaseConfigurationResolver<LaunchRequestArguments> {
    private isCustomPythonSet = false;

    constructor(
        @inject(IDiagnosticsService)
        @named(InvalidPythonPathInDebuggerServiceId)
        private readonly invalidPythonPathInDebuggerService: IInvalidPythonPathInDebuggerService,
        @inject(IConfigurationService) configurationService: IConfigurationService,
        @inject(IDebugEnvironmentVariablesService) private readonly debugEnvHelper: IDebugEnvironmentVariablesService,
        @inject(IInterpreterService) interpreterService: IInterpreterService,
        @inject(IEnvironmentActivationService) private environmentActivationService: IEnvironmentActivationService,
    ) {
        super(configurationService, interpreterService);
    }

    public async resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: LaunchRequestArguments,
        _token?: CancellationToken,
    ): Promise<LaunchRequestArguments | undefined> {
        this.isCustomPythonSet = debugConfiguration.python !== undefined;
        if (
            debugConfiguration.name === undefined &&
            debugConfiguration.type === undefined &&
            debugConfiguration.request === undefined &&
            debugConfiguration.program === undefined &&
            debugConfiguration.env === undefined
        ) {
            const defaultProgram = getProgram();
            debugConfiguration.name = 'Launch';
            debugConfiguration.type = DebuggerTypeName;
            debugConfiguration.request = 'launch';
            debugConfiguration.program = defaultProgram ?? '';
            debugConfiguration.env = {};
        }

        const workspaceFolder = LaunchConfigurationResolver.getWorkspaceFolder(folder);
        // Pass workspace folder so we can get this when we get debug events firing.
        // Do it here itself instead of `resolveDebugConfigurationWithSubstitutedVariables` which is called after
        // this method, as in order to calculate substituted variables, this might be needed.
        debugConfiguration.workspaceFolder = workspaceFolder?.fsPath;
        await this.resolveAndUpdatePaths(workspaceFolder, debugConfiguration);
        if (debugConfiguration.clientOS === undefined) {
            debugConfiguration.clientOS = getOSType() === OSType.Windows ? 'windows' : 'unix';
        }
        return debugConfiguration;
    }

    public async resolveDebugConfigurationWithSubstitutedVariables(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: LaunchRequestArguments,
        _token?: CancellationToken,
    ): Promise<LaunchRequestArguments | undefined> {
        const workspaceFolder = LaunchConfigurationResolver.getWorkspaceFolder(folder);
        await this.provideLaunchDefaults(workspaceFolder, debugConfiguration);

        const isValid = await this.validateLaunchConfiguration(folder, debugConfiguration);
        if (!isValid) {
            return undefined;
        }

        if (Array.isArray(debugConfiguration.debugOptions)) {
            debugConfiguration.debugOptions = debugConfiguration.debugOptions!.filter(
                (item, pos) => debugConfiguration.debugOptions!.indexOf(item) === pos,
            );
        }
        sendTelemetryEvent(EventName.ENVIRONMENT_CHECK_TRIGGER, undefined, { trigger: 'debug' });
        triggerCreateEnvironmentCheckNonBlocking(CreateEnvironmentCheckKind.Workspace, workspaceFolder);
        return debugConfiguration;
    }

    protected async provideLaunchDefaults(
        workspaceFolder: Uri | undefined,
        debugConfiguration: LaunchRequestArguments,
    ): Promise<void> {
        if (debugConfiguration.python === undefined) {
            debugConfiguration.python = debugConfiguration.pythonPath;
        }
        if (debugConfiguration.debugAdapterPython === undefined) {
            debugConfiguration.debugAdapterPython = debugConfiguration.pythonPath;
        }
        if (debugConfiguration.debugLauncherPython === undefined) {
            debugConfiguration.debugLauncherPython = debugConfiguration.pythonPath;
        }
        delete debugConfiguration.pythonPath;

        if (typeof debugConfiguration.cwd !== 'string' && workspaceFolder) {
            debugConfiguration.cwd = workspaceFolder.fsPath;
        }
        if (typeof debugConfiguration.envFile !== 'string' && workspaceFolder) {
            const settings = this.configurationService.getSettings(workspaceFolder);
            debugConfiguration.envFile = settings.envFile;
        }
        let baseEnvVars: EnvironmentVariables | undefined;
        if (this.isCustomPythonSet || debugConfiguration.console !== 'integratedTerminal') {
            // We only have the right activated environment present in integrated terminal if no custom Python path
            // is specified. Otherwise, we need to explicitly set the variables.
            baseEnvVars = await this.environmentActivationService.getActivatedEnvironmentVariables(
                workspaceFolder,
                await this.interpreterService.getInterpreterDetails(debugConfiguration.python ?? ''),
            );
        }
        // Extract environment variables from .env file in the vscode context and
        // set the "env" debug configuration argument. This expansion should be
        // done here before handing of the environment settings to the debug adapter
        debugConfiguration.env = await this.debugEnvHelper.getEnvironmentVariables(debugConfiguration, baseEnvVars);

        if (typeof debugConfiguration.stopOnEntry !== 'boolean') {
            debugConfiguration.stopOnEntry = false;
        }
        debugConfiguration.showReturnValue = debugConfiguration.showReturnValue !== false;
        if (!debugConfiguration.console) {
            debugConfiguration.console = 'integratedTerminal';
        }
        // If using a terminal, then never open internal console.
        if (debugConfiguration.console !== 'internalConsole' && !debugConfiguration.internalConsoleOptions) {
            debugConfiguration.internalConsoleOptions = 'neverOpen';
        }
        if (!Array.isArray(debugConfiguration.debugOptions)) {
            debugConfiguration.debugOptions = [];
        }
        const debugOptions = debugConfiguration.debugOptions!;
        if (debugConfiguration.stopOnEntry) {
            LaunchConfigurationResolver.debugOption(debugOptions, DebugOptions.StopOnEntry);
        }
        if (debugConfiguration.showReturnValue) {
            LaunchConfigurationResolver.debugOption(debugOptions, DebugOptions.ShowReturnValue);
        }
        if (debugConfiguration.django) {
            LaunchConfigurationResolver.debugOption(debugOptions, DebugOptions.Django);
        }
        if (debugConfiguration.jinja) {
            LaunchConfigurationResolver.debugOption(debugOptions, DebugOptions.Jinja);
        }
        if (debugConfiguration.redirectOutput === undefined && debugConfiguration.console === 'internalConsole') {
            debugConfiguration.redirectOutput = true;
        }
        if (debugConfiguration.redirectOutput) {
            LaunchConfigurationResolver.debugOption(debugOptions, DebugOptions.RedirectOutput);
        }
        if (debugConfiguration.sudo) {
            LaunchConfigurationResolver.debugOption(debugOptions, DebugOptions.Sudo);
        }
        if (debugConfiguration.subProcess === true) {
            LaunchConfigurationResolver.debugOption(debugOptions, DebugOptions.SubProcess);
        }
        if (getOSType() === OSType.Windows) {
            LaunchConfigurationResolver.debugOption(debugOptions, DebugOptions.FixFilePathCase);
        }
        const isFastAPI = LaunchConfigurationResolver.isDebuggingFastAPI(debugConfiguration);
        const isFlask = LaunchConfigurationResolver.isDebuggingFlask(debugConfiguration);
        if (
            (debugConfiguration.pyramid || isFlask || isFastAPI) &&
            debugOptions.indexOf(DebugOptions.Jinja) === -1 &&
            debugConfiguration.jinja !== false
        ) {
            LaunchConfigurationResolver.debugOption(debugOptions, DebugOptions.Jinja);
        }
        // Unlike with attach, we do not set a default path mapping.
        // (See: https://github.com/microsoft/vscode-python/issues/3568)
        if (debugConfiguration.pathMappings) {
            let { pathMappings } = debugConfiguration;
            if (pathMappings.length > 0) {
                pathMappings = LaunchConfigurationResolver.fixUpPathMappings(
                    pathMappings || [],
                    workspaceFolder ? workspaceFolder.fsPath : '',
                );
            }
            debugConfiguration.pathMappings = pathMappings.length > 0 ? pathMappings : undefined;
        }
    }

    protected async validateLaunchConfiguration(
        folder: WorkspaceFolder | undefined,
        debugConfiguration: LaunchRequestArguments,
    ): Promise<boolean> {
        const diagnosticService = this.invalidPythonPathInDebuggerService;
        for (const executable of [
            debugConfiguration.python,
            debugConfiguration.debugAdapterPython,
            debugConfiguration.debugLauncherPython,
        ]) {
            if (!(await diagnosticService.validatePythonPath(executable, this.pythonPathSource, folder?.uri))) {
                return false;
            }
        }
        return true;
    }
}
