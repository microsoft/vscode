// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as path from 'path';
import { inject, injectable } from 'inversify';
import {
    MarkdownString,
    WorkspaceFolder,
    GlobalEnvironmentVariableCollection,
    EnvironmentVariableScope,
    EnvironmentVariableMutatorOptions,
    ProgressLocation,
} from 'vscode';
import { pathExists, normCase } from '../../common/platform/fs-paths';
import { IExtensionActivationService } from '../../activation/types';
import { IApplicationShell, IApplicationEnvironment, IWorkspaceService } from '../../common/application/types';
import { inTerminalEnvVarExperiment } from '../../common/experiments/helpers';
import { IPlatformService } from '../../common/platform/types';
import { identifyShellFromShellPath } from '../../common/terminal/shellDetectors/baseShellDetector';
import {
    IExtensionContext,
    IExperimentService,
    Resource,
    IDisposableRegistry,
    IConfigurationService,
    IPathUtils,
} from '../../common/types';
import { Interpreters } from '../../common/utils/localize';
import { traceError, traceInfo, traceLog, traceVerbose, traceWarn } from '../../logging';
import { IInterpreterService } from '../../interpreter/contracts';
import { defaultShells } from '../../interpreter/activation/service';
import { IEnvironmentActivationService } from '../../interpreter/activation/types';
import { EnvironmentType, PythonEnvironment } from '../../pythonEnvironments/info';
import { getSearchPathEnvVarNames } from '../../common/utils/exec';
import { EnvironmentVariables, IEnvironmentVariablesProvider } from '../../common/variables/types';
import { TerminalShellType } from '../../common/terminal/types';
import { OSType } from '../../common/utils/platform';

import { PythonEnvType } from '../../pythonEnvironments/base/info';
import {
    IShellIntegrationDetectionService,
    ITerminalDeactivateService,
    ITerminalEnvVarCollectionService,
} from '../types';
import { ProgressService } from '../../common/application/progressService';
import { useEnvExtension } from '../../envExt/api.internal';
import { registerPythonStartup } from '../pythonStartup';

@injectable()
export class TerminalEnvVarCollectionService implements IExtensionActivationService, ITerminalEnvVarCollectionService {
    public readonly supportedWorkspaceTypes = {
        untrustedWorkspace: false,
        virtualWorkspace: false,
    };

    /**
     * Prompts for these shells cannot be set reliably using variables
     */
    private noPromptVariableShells = [
        TerminalShellType.powershell,
        TerminalShellType.powershellCore,
        TerminalShellType.fish,
    ];

    private registeredOnce = false;

    /**
     * Carries default environment variables for the currently selected shell.
     */
    private processEnvVars: EnvironmentVariables | undefined;

    private readonly progressService: ProgressService;

    private separator: string;

    constructor(
        @inject(IPlatformService) private readonly platform: IPlatformService,
        @inject(IInterpreterService) private interpreterService: IInterpreterService,
        @inject(IExtensionContext) private context: IExtensionContext,
        @inject(IApplicationShell) private shell: IApplicationShell,
        @inject(IExperimentService) private experimentService: IExperimentService,
        @inject(IApplicationEnvironment) private applicationEnvironment: IApplicationEnvironment,
        @inject(IDisposableRegistry) private disposables: IDisposableRegistry,
        @inject(IEnvironmentActivationService) private environmentActivationService: IEnvironmentActivationService,
        @inject(IWorkspaceService) private workspaceService: IWorkspaceService,
        @inject(IConfigurationService) private readonly configurationService: IConfigurationService,
        @inject(ITerminalDeactivateService) private readonly terminalDeactivateService: ITerminalDeactivateService,
        @inject(IPathUtils) private readonly pathUtils: IPathUtils,
        @inject(IShellIntegrationDetectionService)
        private readonly shellIntegrationDetectionService: IShellIntegrationDetectionService,
        @inject(IEnvironmentVariablesProvider)
        private readonly environmentVariablesProvider: IEnvironmentVariablesProvider,
    ) {
        this.separator = platform.osType === OSType.Windows ? ';' : ':';
        this.progressService = new ProgressService(this.shell);
    }

    public async activate(resource: Resource): Promise<void> {
        try {
            if (useEnvExtension()) {
                traceVerbose('Ignoring environment variable experiment since env extension is being used');
                this.context.environmentVariableCollection.clear();
                // Needed for shell integration
                await registerPythonStartup(this.context);
                return;
            }

            if (!inTerminalEnvVarExperiment(this.experimentService)) {
                this.context.environmentVariableCollection.clear();
                await this.handleMicroVenv(resource);
                if (!this.registeredOnce) {
                    this.interpreterService.onDidChangeInterpreter(
                        async (r) => {
                            await this.handleMicroVenv(r);
                        },
                        this,
                        this.disposables,
                    );
                    this.registeredOnce = true;
                }
                await registerPythonStartup(this.context);
                return;
            }
            if (!this.registeredOnce) {
                this.interpreterService.onDidChangeInterpreter(
                    async (r) => {
                        await this._applyCollection(r).ignoreErrors();
                    },
                    this,
                    this.disposables,
                );
                this.shellIntegrationDetectionService.onDidChangeStatus(
                    async () => {
                        traceInfo("Shell integration status changed, can confirm it's working.");
                        await this._applyCollection(undefined).ignoreErrors();
                    },
                    this,
                    this.disposables,
                );
                this.environmentVariablesProvider.onDidEnvironmentVariablesChange(
                    async (r: Resource) => {
                        await this._applyCollection(r).ignoreErrors();
                    },
                    this,
                    this.disposables,
                );
                this.applicationEnvironment.onDidChangeShell(
                    async (shell: string) => {
                        this.processEnvVars = undefined;
                        // Pass in the shell where known instead of relying on the application environment, because of bug
                        // on VSCode: https://github.com/microsoft/vscode/issues/160694
                        await this._applyCollection(undefined, shell).ignoreErrors();
                    },
                    this,
                    this.disposables,
                );
                const { shell } = this.applicationEnvironment;
                const isActive = await this.shellIntegrationDetectionService.isWorking();
                const shellType = identifyShellFromShellPath(shell);
                if (!isActive && shellType !== TerminalShellType.commandPrompt) {
                    traceWarn(
                        `Shell integration may not be active, environment activated may be overridden by the shell.`,
                    );
                }
                this.registeredOnce = true;
            }
            this._applyCollection(resource).ignoreErrors();
        } catch (ex) {
            traceError(`Activating terminal env collection failed`, ex);
        }
    }

    public async _applyCollection(resource: Resource, shell?: string): Promise<void> {
        this.progressService.showProgress({
            location: ProgressLocation.Window,
            title: Interpreters.activatingTerminals,
        });
        await this._applyCollectionImpl(resource, shell).catch((ex) => {
            traceError(`Failed to apply terminal env vars`, shell, ex);
            return Promise.reject(ex); // Ensures progress indicator does not disappear in case of errors, so we can catch issues faster.
        });
        this.progressService.hideProgress();
    }

    private async _applyCollectionImpl(resource: Resource, shell = this.applicationEnvironment.shell): Promise<void> {
        const workspaceFolder = this.getWorkspaceFolder(resource);
        const settings = this.configurationService.getSettings(resource);
        const envVarCollection = this.getEnvironmentVariableCollection({ workspaceFolder });
        if (useEnvExtension()) {
            envVarCollection.clear();
            traceVerbose('Do not activate terminal env vars as env extension is being used');
            return;
        }

        if (!settings.terminal.activateEnvironment) {
            envVarCollection.clear();
            traceVerbose('Activating environments in terminal is disabled for', resource?.fsPath);
            return;
        }
        const activatedEnv = await this.environmentActivationService.getActivatedEnvironmentVariables(
            resource,
            undefined,
            undefined,
            shell,
        );
        const env = activatedEnv ? normCaseKeys(activatedEnv) : undefined;
        traceVerbose(`Activated environment variables for ${resource?.fsPath}`, env);
        if (!env) {
            const shellType = identifyShellFromShellPath(shell);
            const defaultShell = defaultShells[this.platform.osType];
            if (defaultShell?.shellType !== shellType) {
                // Commands to fetch env vars may fail in custom shells due to unknown reasons, in that case
                // fallback to default shells as they are known to work better.
                await this._applyCollectionImpl(resource, defaultShell?.shell);
                return;
            }
            await this.trackTerminalPrompt(shell, resource, env);
            envVarCollection.clear();
            this.processEnvVars = undefined;
            return;
        }
        if (!this.processEnvVars) {
            this.processEnvVars = await this.environmentActivationService.getProcessEnvironmentVariables(
                resource,
                shell,
            );
        }
        const processEnv = normCaseKeys(this.processEnvVars);

        // PS1 in some cases is a shell variable (not an env variable) so "env" might not contain it, calculate it in that case.
        env.PS1 = await this.getPS1(shell, resource, env);
        const defaultPrependOptions = await this.getPrependOptions();

        // Clear any previously set env vars from collection
        envVarCollection.clear();
        const deactivate = await this.terminalDeactivateService.getScriptLocation(shell, resource);
        Object.keys(env).forEach((key) => {
            if (shouldSkip(key)) {
                return;
            }
            let value = env[key];
            const prevValue = processEnv[key];
            if (prevValue !== value) {
                if (value !== undefined) {
                    if (key === 'PS1') {
                        // We cannot have the full PS1 without executing in terminal, which we do not. Hence prepend it.
                        traceLog(
                            `Prepending environment variable ${key} in collection with ${value} ${JSON.stringify(
                                defaultPrependOptions,
                            )}`,
                        );
                        envVarCollection.prepend(key, value, defaultPrependOptions);
                        return;
                    }
                    if (key === 'PATH') {
                        const options = {
                            applyAtShellIntegration: true,
                            applyAtProcessCreation: true,
                        };
                        if (processEnv.PATH && env.PATH?.endsWith(processEnv.PATH)) {
                            // Prefer prepending to PATH instead of replacing it, as we do not want to replace any
                            // changes to PATH users might have made it in their init scripts (~/.bashrc etc.)
                            value = env.PATH.slice(0, -processEnv.PATH.length);
                            if (deactivate) {
                                value = `${deactivate}${this.separator}${value}`;
                            }
                            traceLog(
                                `Prepending environment variable ${key} in collection with ${value} ${JSON.stringify(
                                    options,
                                )}`,
                            );
                            envVarCollection.prepend(key, value, options);
                        } else {
                            if (!value.endsWith(this.separator)) {
                                value = value.concat(this.separator);
                            }
                            if (deactivate) {
                                value = `${deactivate}${this.separator}${value}`;
                            }
                            traceLog(
                                `Prepending environment variable ${key} in collection to ${value} ${JSON.stringify(
                                    options,
                                )}`,
                            );
                            envVarCollection.prepend(key, value, options);
                        }
                        return;
                    }
                    const options = {
                        applyAtShellIntegration: true,
                        applyAtProcessCreation: true,
                    };
                    traceLog(
                        `Setting environment variable ${key} in collection to ${value} ${JSON.stringify(options)}`,
                    );
                    envVarCollection.replace(key, value, options);
                }
            }
        });

        const displayPath = this.pathUtils.getDisplayName(settings.pythonPath, workspaceFolder?.uri.fsPath);
        const description = new MarkdownString(`${Interpreters.activateTerminalDescription} \`${displayPath}\``);
        envVarCollection.description = description;

        await this.trackTerminalPrompt(shell, resource, env);
        await this.terminalDeactivateService.initializeScriptParams(shell).catch((ex) => {
            traceError(`Failed to initialize deactivate script`, shell, ex);
        });
    }

    private isPromptSet = new Map<number | undefined, boolean>();

    // eslint-disable-next-line class-methods-use-this
    public isTerminalPromptSetCorrectly(resource?: Resource): boolean {
        const workspaceFolder = this.getWorkspaceFolder(resource);
        return !!this.isPromptSet.get(workspaceFolder?.index);
    }

    /**
     * Call this once we know terminal prompt is set correctly for terminal owned by this resource.
     */
    private terminalPromptIsCorrect(resource: Resource) {
        const key = this.getWorkspaceFolder(resource)?.index;
        this.isPromptSet.set(key, true);
    }

    private terminalPromptIsUnknown(resource: Resource) {
        const key = this.getWorkspaceFolder(resource)?.index;
        this.isPromptSet.delete(key);
    }

    /**
     * Tracks whether prompt for terminal was correctly set.
     */
    private async trackTerminalPrompt(shell: string, resource: Resource, env: EnvironmentVariables | undefined) {
        this.terminalPromptIsUnknown(resource);
        if (!env) {
            this.terminalPromptIsCorrect(resource);
            return;
        }
        const customShellType = identifyShellFromShellPath(shell);
        if (this.noPromptVariableShells.includes(customShellType)) {
            return;
        }
        if (this.platform.osType !== OSType.Windows) {
            // These shells are expected to set PS1 variable for terminal prompt for virtual/conda environments.
            const interpreter = await this.interpreterService.getActiveInterpreter(resource);
            const shouldSetPS1 = shouldPS1BeSet(interpreter?.type, env);
            if (shouldSetPS1 && !env.PS1) {
                // PS1 should be set but no PS1 was set.
                return;
            }
            const config = await this.shellIntegrationDetectionService.isWorking();
            if (!config) {
                traceVerbose('PS1 is not set when shell integration is disabled.');
                return;
            }
        }
        this.terminalPromptIsCorrect(resource);
    }

    private async getPS1(shell: string, resource: Resource, env: EnvironmentVariables) {
        // PS1 returned by shell is not predictable: #22078
        // Hence calculate it ourselves where possible. Should no longer be needed once #22128 is available.
        const customShellType = identifyShellFromShellPath(shell);
        if (this.noPromptVariableShells.includes(customShellType)) {
            return env.PS1;
        }
        if (this.platform.osType !== OSType.Windows) {
            // These shells are expected to set PS1 variable for terminal prompt for virtual/conda environments.
            const interpreter = await this.interpreterService.getActiveInterpreter(resource);
            const shouldSetPS1 = shouldPS1BeSet(interpreter?.type, env);
            if (shouldSetPS1) {
                const prompt = getPromptForEnv(interpreter, env);
                if (prompt) {
                    return prompt;
                }
            }
        }
        if (env.PS1) {
            // Prefer PS1 set by env vars, as env.PS1 may or may not contain the full PS1: #22056.
            return env.PS1;
        }
        return undefined;
    }

    private async handleMicroVenv(resource: Resource) {
        try {
            const settings = this.configurationService.getSettings(resource);
            const workspaceFolder = this.getWorkspaceFolder(resource);
            if (useEnvExtension()) {
                this.getEnvironmentVariableCollection({ workspaceFolder }).clear();
                traceVerbose('Do not activate microvenv as env extension is being used');
                return;
            }
            if (!settings.terminal.activateEnvironment) {
                this.getEnvironmentVariableCollection({ workspaceFolder }).clear();
                traceVerbose(
                    'Do not activate microvenv as activating environments in terminal is disabled for',
                    resource?.fsPath,
                );
                return;
            }
            const interpreter = await this.interpreterService.getActiveInterpreter(resource);
            if (interpreter?.envType === EnvironmentType.Venv) {
                const activatePath = path.join(path.dirname(interpreter.path), 'activate');
                if (!(await pathExists(activatePath))) {
                    const envVarCollection = this.getEnvironmentVariableCollection({ workspaceFolder });
                    const pathVarName = getSearchPathEnvVarNames()[0];
                    envVarCollection.replace(
                        'PATH',
                        `${path.dirname(interpreter.path)}${path.delimiter}${process.env[pathVarName]}`,
                        { applyAtShellIntegration: true, applyAtProcessCreation: true },
                    );
                    return;
                }
                this.getEnvironmentVariableCollection({ workspaceFolder }).clear();
            }
        } catch (ex) {
            traceWarn(`Microvenv failed as it is using proposed API which is constantly changing`, ex);
        }
    }

    private async getPrependOptions(): Promise<EnvironmentVariableMutatorOptions> {
        const isActive = await this.shellIntegrationDetectionService.isWorking();
        // Ideally we would want to prepend exactly once, either at shell integration or process creation.
        // TODO: Stop prepending altogether once https://github.com/microsoft/vscode/issues/145234 is available.
        return isActive
            ? {
                  applyAtShellIntegration: true,
                  applyAtProcessCreation: false,
              }
            : {
                  applyAtShellIntegration: true, // Takes care of false negatives in case manual integration is being used.
                  applyAtProcessCreation: true,
              };
    }

    private getEnvironmentVariableCollection(scope: EnvironmentVariableScope = {}) {
        const envVarCollection = this.context.environmentVariableCollection as GlobalEnvironmentVariableCollection;
        return envVarCollection.getScoped(scope);
    }

    private getWorkspaceFolder(resource: Resource): WorkspaceFolder | undefined {
        let workspaceFolder = this.workspaceService.getWorkspaceFolder(resource);
        if (
            !workspaceFolder &&
            Array.isArray(this.workspaceService.workspaceFolders) &&
            this.workspaceService.workspaceFolders.length > 0
        ) {
            [workspaceFolder] = this.workspaceService.workspaceFolders;
        }
        return workspaceFolder;
    }
}

function shouldPS1BeSet(type: PythonEnvType | undefined, env: EnvironmentVariables): boolean {
    if (env.PS1) {
        // Activated variables contain PS1, meaning it was supposed to be set.
        return true;
    }
    if (type === PythonEnvType.Virtual) {
        const promptDisabledVar = env.VIRTUAL_ENV_DISABLE_PROMPT;
        const isPromptDisabled = promptDisabledVar && promptDisabledVar !== undefined;
        return !isPromptDisabled;
    }
    if (type === PythonEnvType.Conda) {
        // Instead of checking config value using `conda config --get changeps1`, simply check
        // `CONDA_PROMPT_MODIFER` to avoid the cost of launching the conda binary.
        const promptEnabledVar = env.CONDA_PROMPT_MODIFIER;
        const isPromptEnabled = promptEnabledVar && promptEnabledVar !== '';
        return !!isPromptEnabled;
    }
    return false;
}

function shouldSkip(env: string) {
    return [
        '_',
        'SHLVL',
        // Even though this maybe returned, setting it can result in output encoding errors in terminal.
        'PYTHONUTF8',
        // We have deactivate service which takes care of setting it.
        '_OLD_VIRTUAL_PATH',
        'PWD',
    ].includes(env);
}

function getPromptForEnv(interpreter: PythonEnvironment | undefined, env: EnvironmentVariables) {
    if (!interpreter) {
        return undefined;
    }
    if (interpreter.envName) {
        if (interpreter.envName === 'base') {
            // If conda base environment is selected, it can lead to "(base)" appearing twice if we return the env name.
            return undefined;
        }
        if (interpreter.type === PythonEnvType.Virtual && env.VIRTUAL_ENV_PROMPT) {
            return `${env.VIRTUAL_ENV_PROMPT}`;
        }
        return `(${interpreter.envName}) `;
    }
    if (interpreter.envPath) {
        return `(${path.basename(interpreter.envPath)}) `;
    }
    return undefined;
}

function normCaseKeys(env: EnvironmentVariables): EnvironmentVariables {
    const result: EnvironmentVariables = {};
    Object.keys(env).forEach((key) => {
        result[normCase(key)] = env[key];
    });
    return result;
}
