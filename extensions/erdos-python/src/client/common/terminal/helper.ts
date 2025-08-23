// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable, multiInject, named } from 'inversify';
import { Terminal, Uri } from 'vscode';
import { IComponentAdapter, IInterpreterService } from '../../interpreter/contracts';
import { IServiceContainer } from '../../ioc/types';
import { traceDecoratorError, traceError } from '../../logging';
import { EnvironmentType, PythonEnvironment } from '../../pythonEnvironments/info';
import { sendTelemetryEvent } from '../../telemetry';
import { EventName } from '../../telemetry/constants';
import { ITerminalManager } from '../application/types';
import '../extensions';
import { IPlatformService } from '../platform/types';
import { IConfigurationService, Resource } from '../types';
import { OSType } from '../utils/platform';
import { ShellDetector } from './shellDetector';
import {
    IShellDetector,
    ITerminalActivationCommandProvider,
    ITerminalHelper,
    TerminalActivationProviders,
    TerminalShellType,
} from './types';
import { isPixiEnvironment } from '../../pythonEnvironments/common/environmentManagers/pixi';

@injectable()
export class TerminalHelper implements ITerminalHelper {
    private readonly shellDetector: ShellDetector;
    constructor(
        @inject(IPlatformService) private readonly platform: IPlatformService,
        @inject(ITerminalManager) private readonly terminalManager: ITerminalManager,
        @inject(IServiceContainer) private readonly serviceContainer: IServiceContainer,
        @inject(IInterpreterService) readonly interpreterService: IInterpreterService,
        @inject(IConfigurationService) private readonly configurationService: IConfigurationService,
        @inject(ITerminalActivationCommandProvider)
        @named(TerminalActivationProviders.conda)
        private readonly conda: ITerminalActivationCommandProvider,
        @inject(ITerminalActivationCommandProvider)
        @named(TerminalActivationProviders.bashCShellFish)
        private readonly bashCShellFish: ITerminalActivationCommandProvider,
        @inject(ITerminalActivationCommandProvider)
        @named(TerminalActivationProviders.commandPromptAndPowerShell)
        private readonly commandPromptAndPowerShell: ITerminalActivationCommandProvider,
        @inject(ITerminalActivationCommandProvider)
        @named(TerminalActivationProviders.nushell)
        private readonly nushell: ITerminalActivationCommandProvider,
        @inject(ITerminalActivationCommandProvider)
        @named(TerminalActivationProviders.pyenv)
        private readonly pyenv: ITerminalActivationCommandProvider,
        @inject(ITerminalActivationCommandProvider)
        @named(TerminalActivationProviders.pipenv)
        private readonly pipenv: ITerminalActivationCommandProvider,
        @inject(ITerminalActivationCommandProvider)
        @named(TerminalActivationProviders.pixi)
        private readonly pixi: ITerminalActivationCommandProvider,
        @multiInject(IShellDetector) shellDetectors: IShellDetector[],
    ) {
        this.shellDetector = new ShellDetector(this.platform, shellDetectors);
    }
    public createTerminal(title?: string): Terminal {
        return this.terminalManager.createTerminal({ name: title });
    }
    public identifyTerminalShell(terminal?: Terminal): TerminalShellType {
        return this.shellDetector.identifyTerminalShell(terminal);
    }

    public buildCommandForTerminal(terminalShellType: TerminalShellType, command: string, args: string[]) {
        const isPowershell =
            terminalShellType === TerminalShellType.powershell ||
            terminalShellType === TerminalShellType.powershellCore;
        const commandPrefix = isPowershell ? '& ' : '';
        const formattedArgs = args.map((a) => a.toCommandArgumentForPythonExt());

        return `${commandPrefix}${command.fileToCommandArgumentForPythonExt()} ${formattedArgs.join(' ')}`.trim();
    }
    public async getEnvironmentActivationCommands(
        terminalShellType: TerminalShellType,
        resource?: Uri,
        interpreter?: PythonEnvironment,
    ): Promise<string[] | undefined> {
        const providers = [
            this.pixi,
            this.pipenv,
            this.pyenv,
            this.bashCShellFish,
            this.commandPromptAndPowerShell,
            this.nushell,
        ];
        const promise = this.getActivationCommands(resource || undefined, interpreter, terminalShellType, providers);
        this.sendTelemetry(
            terminalShellType,
            EventName.PYTHON_INTERPRETER_ACTIVATION_FOR_TERMINAL,
            interpreter,
            promise,
        ).ignoreErrors();
        return promise;
    }
    public async getEnvironmentActivationShellCommands(
        resource: Resource,
        shell: TerminalShellType,
        interpreter?: PythonEnvironment,
    ): Promise<string[] | undefined> {
        if (this.platform.osType === OSType.Unknown) {
            return;
        }
        const providers = [this.pixi, this.bashCShellFish, this.commandPromptAndPowerShell, this.nushell];
        const promise = this.getActivationCommands(resource, interpreter, shell, providers);
        this.sendTelemetry(
            shell,
            EventName.PYTHON_INTERPRETER_ACTIVATION_FOR_RUNNING_CODE,
            interpreter,
            promise,
        ).ignoreErrors();
        return promise;
    }
    @traceDecoratorError('Failed to capture telemetry')
    protected async sendTelemetry(
        terminalShellType: TerminalShellType,
        eventName: EventName,
        interpreter: PythonEnvironment | undefined,
        promise: Promise<string[] | undefined>,
    ): Promise<void> {
        let hasCommands = false;
        let failed = false;
        try {
            const cmds = await promise;
            hasCommands = Array.isArray(cmds) && cmds.length > 0;
        } catch (ex) {
            failed = true;
            traceError('Failed to get activation commands', ex);
        }

        const pythonVersion = interpreter && interpreter.version ? interpreter.version.raw : undefined;
        const interpreterType = interpreter ? interpreter.envType : EnvironmentType.Unknown;
        const data = { failed, hasCommands, interpreterType, terminal: terminalShellType, pythonVersion };
        sendTelemetryEvent(eventName, undefined, data);
    }
    protected async getActivationCommands(
        resource: Resource,
        interpreter: PythonEnvironment | undefined,
        terminalShellType: TerminalShellType,
        providers: ITerminalActivationCommandProvider[],
    ): Promise<string[] | undefined> {
        const settings = this.configurationService.getSettings(resource);

        const isPixiEnv = interpreter
            ? interpreter.envType === EnvironmentType.Pixi
            : await isPixiEnvironment(settings.pythonPath);
        if (isPixiEnv) {
            const activationCommands = interpreter
                ? await this.pixi.getActivationCommandsForInterpreter(interpreter.path, terminalShellType)
                : await this.pixi.getActivationCommands(resource, terminalShellType);

            if (Array.isArray(activationCommands)) {
                return activationCommands;
            }
        }

        const condaService = this.serviceContainer.get<IComponentAdapter>(IComponentAdapter);
        // If we have a conda environment, then use that.
        const isCondaEnvironment = interpreter
            ? interpreter.envType === EnvironmentType.Conda
            : await condaService.isCondaEnvironment(settings.pythonPath);
        if (isCondaEnvironment) {
            const activationCommands = interpreter
                ? await this.conda.getActivationCommandsForInterpreter(interpreter.path, terminalShellType)
                : await this.conda.getActivationCommands(resource, terminalShellType);

            if (Array.isArray(activationCommands)) {
                return activationCommands;
            }
        }

        // Search from the list of providers.
        const supportedProviders = providers.filter((provider) => provider.isShellSupported(terminalShellType));

        for (const provider of supportedProviders) {
            const activationCommands = interpreter
                ? await provider.getActivationCommandsForInterpreter(interpreter.path, terminalShellType)
                : await provider.getActivationCommands(resource, terminalShellType);

            if (Array.isArray(activationCommands) && activationCommands.length > 0) {
                return activationCommands;
            }
        }
    }
}
