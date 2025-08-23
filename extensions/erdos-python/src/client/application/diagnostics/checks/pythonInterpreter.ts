// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// eslint-disable-next-line max-classes-per-file
import { inject, injectable } from 'inversify';
import { DiagnosticSeverity, l10n } from 'vscode';
import '../../../common/extensions';
import * as path from 'path';
import { IConfigurationService, IDisposableRegistry, IInterpreterPathService, Resource } from '../../../common/types';
import { IInterpreterService } from '../../../interpreter/contracts';
import { IServiceContainer } from '../../../ioc/types';
import { BaseDiagnostic, BaseDiagnosticsService } from '../base';
import { IDiagnosticsCommandFactory } from '../commands/types';
import { DiagnosticCodes } from '../constants';
import { DiagnosticCommandPromptHandlerServiceId, MessageCommandPrompt } from '../promptHandler';
import {
    DiagnosticScope,
    IDiagnostic,
    IDiagnosticCommand,
    IDiagnosticHandlerService,
    IDiagnosticMessageOnCloseHandler,
} from '../types';
import { Common } from '../../../common/utils/localize';
import { Commands } from '../../../common/constants';
import { ICommandManager, IWorkspaceService } from '../../../common/application/types';
import { sendTelemetryEvent } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { IExtensionSingleActivationService } from '../../../activation/types';
import { cache } from '../../../common/utils/decorators';
import { noop } from '../../../common/utils/misc';
import { getEnvironmentVariable, getOSType, OSType } from '../../../common/utils/platform';
import { IFileSystem } from '../../../common/platform/types';
import { traceError } from '../../../logging';
import { getExecutable } from '../../../common/process/internal/python';
import { getSearchPathEnvVarNames } from '../../../common/utils/exec';
import { IProcessServiceFactory } from '../../../common/process/types';
import { normCasePath } from '../../../common/platform/fs-paths';

const messages = {
    [DiagnosticCodes.NoPythonInterpretersDiagnostic]: l10n.t(
        'No Python interpreter is selected. Please select a Python interpreter to enable features such as IntelliSense, linting, and debugging.',
    ),
    [DiagnosticCodes.InvalidPythonInterpreterDiagnostic]: l10n.t(
        'An Invalid Python interpreter is selected{0}, please try changing it to enable features such as IntelliSense, linting, and debugging. See output for more details regarding why the interpreter is invalid.',
    ),
    [DiagnosticCodes.InvalidComspecDiagnostic]: l10n.t(
        'We detected an issue with one of your environment variables that breaks features such as IntelliSense, linting and debugging. Try setting the "ComSpec" variable to a valid Command Prompt path in your system to fix it.',
    ),
    [DiagnosticCodes.IncompletePathVarDiagnostic]: l10n.t(
        'We detected an issue with "Path" environment variable that breaks features such as IntelliSense, linting and debugging. Please edit it to make sure it contains the "System32" subdirectories.',
    ),
    [DiagnosticCodes.DefaultShellErrorDiagnostic]: l10n.t(
        'We detected an issue with your default shell that breaks features such as IntelliSense, linting and debugging. Try resetting "ComSpec" and "Path" environment variables to fix it.',
    ),
};

export class InvalidPythonInterpreterDiagnostic extends BaseDiagnostic {
    constructor(
        code: DiagnosticCodes.NoPythonInterpretersDiagnostic | DiagnosticCodes.InvalidPythonInterpreterDiagnostic,
        resource: Resource,
        workspaceService: IWorkspaceService,
        scope = DiagnosticScope.WorkspaceFolder,
    ) {
        let formatArg = '';
        if (
            workspaceService.workspaceFile &&
            workspaceService.workspaceFolders &&
            workspaceService.workspaceFolders?.length > 1
        ) {
            // Specify folder name in case of multiroot scenarios
            const folder = workspaceService.getWorkspaceFolder(resource);
            if (folder) {
                formatArg = ` ${l10n.t('for workspace')} ${path.basename(folder.uri.fsPath)}`;
            }
        }
        super(code, messages[code].format(formatArg), DiagnosticSeverity.Error, scope, resource, undefined, 'always');
    }
}

type DefaultShellDiagnostics =
    | DiagnosticCodes.InvalidComspecDiagnostic
    | DiagnosticCodes.IncompletePathVarDiagnostic
    | DiagnosticCodes.DefaultShellErrorDiagnostic;

export class DefaultShellDiagnostic extends BaseDiagnostic {
    constructor(code: DefaultShellDiagnostics, resource: Resource, scope = DiagnosticScope.Global) {
        super(code, messages[code], DiagnosticSeverity.Error, scope, resource, undefined, 'always');
    }
}

export const InvalidPythonInterpreterServiceId = 'InvalidPythonInterpreterServiceId';

@injectable()
export class InvalidPythonInterpreterService extends BaseDiagnosticsService
    implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: false, virtualWorkspace: true };

    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IDisposableRegistry) disposableRegistry: IDisposableRegistry,
    ) {
        super(
            [
                DiagnosticCodes.NoPythonInterpretersDiagnostic,
                DiagnosticCodes.InvalidPythonInterpreterDiagnostic,
                DiagnosticCodes.InvalidComspecDiagnostic,
                DiagnosticCodes.IncompletePathVarDiagnostic,
                DiagnosticCodes.DefaultShellErrorDiagnostic,
            ],
            serviceContainer,
            disposableRegistry,
            false,
        );
    }

    public async activate(): Promise<void> {
        const commandManager = this.serviceContainer.get<ICommandManager>(ICommandManager);
        this.disposableRegistry.push(
            commandManager.registerCommand(Commands.TriggerEnvironmentSelection, (resource: Resource) =>
                this.triggerEnvSelectionIfNecessary(resource),
            ),
        );
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        this.disposableRegistry.push(
            interpreterService.onDidChangeInterpreterConfiguration((e) =>
                commandManager.executeCommand(Commands.TriggerEnvironmentSelection, e).then(noop, noop),
            ),
        );
    }

    public async diagnose(resource: Resource): Promise<IDiagnostic[]> {
        return this.diagnoseDefaultShell(resource);
    }

    public async _manualDiagnose(resource: Resource): Promise<IDiagnostic[]> {
        const workspaceService = this.serviceContainer.get<IWorkspaceService>(IWorkspaceService);
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        const diagnostics = await this.diagnoseDefaultShell(resource);
        if (diagnostics.length > 0) {
            return diagnostics;
        }
        const hasInterpreters = await interpreterService.hasInterpreters();
        const interpreterPathService = this.serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
        const isInterpreterSetToDefault = interpreterPathService.get(resource) === 'python';

        if (!hasInterpreters && isInterpreterSetToDefault) {
            return [
                new InvalidPythonInterpreterDiagnostic(
                    DiagnosticCodes.NoPythonInterpretersDiagnostic,
                    resource,
                    workspaceService,
                    DiagnosticScope.Global,
                ),
            ];
        }

        const currentInterpreter = await interpreterService.getActiveInterpreter(resource);
        if (!currentInterpreter) {
            return [
                new InvalidPythonInterpreterDiagnostic(
                    DiagnosticCodes.InvalidPythonInterpreterDiagnostic,
                    resource,
                    workspaceService,
                ),
            ];
        }
        return [];
    }

    public async triggerEnvSelectionIfNecessary(resource: Resource): Promise<boolean> {
        const diagnostics = await this._manualDiagnose(resource);
        if (!diagnostics.length) {
            return true;
        }
        this.handle(diagnostics).ignoreErrors();
        return false;
    }

    private async diagnoseDefaultShell(resource: Resource): Promise<IDiagnostic[]> {
        if (getOSType() !== OSType.Windows) {
            return [];
        }
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        const currentInterpreter = await interpreterService.getActiveInterpreter(resource);
        if (currentInterpreter) {
            return [];
        }
        try {
            await this.shellExecPython();
        } catch (ex) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((ex as any).errno === -4058) {
                // ENOENT (-4058) error is thrown by Node when the default shell is invalid.
                traceError('ComSpec is likely set to an invalid value', getEnvironmentVariable('ComSpec'));
                if (await this.isComspecInvalid()) {
                    return [new DefaultShellDiagnostic(DiagnosticCodes.InvalidComspecDiagnostic, resource)];
                }
                if (this.isPathVarIncomplete()) {
                    traceError('PATH env var appears to be incomplete', process.env.Path, process.env.PATH);
                    return [new DefaultShellDiagnostic(DiagnosticCodes.IncompletePathVarDiagnostic, resource)];
                }
                return [new DefaultShellDiagnostic(DiagnosticCodes.DefaultShellErrorDiagnostic, resource)];
            }
        }
        return [];
    }

    private async isComspecInvalid() {
        const comSpec = getEnvironmentVariable('ComSpec') ?? '';
        const fs = this.serviceContainer.get<IFileSystem>(IFileSystem);
        return fs.fileExists(comSpec).then((exists) => !exists);
    }

    // eslint-disable-next-line class-methods-use-this
    private isPathVarIncomplete() {
        const envVars = getSearchPathEnvVarNames();
        const systemRoot = getEnvironmentVariable('SystemRoot') ?? 'C:\\WINDOWS';
        const system32 = path.join(systemRoot, 'system32');
        for (const envVar of envVars) {
            const value = getEnvironmentVariable(envVar);
            if (value && normCasePath(value).includes(normCasePath(system32))) {
                return false;
            }
        }
        return true;
    }

    @cache(-1, true)
    // eslint-disable-next-line class-methods-use-this
    private async shellExecPython() {
        const configurationService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        const { pythonPath } = configurationService.getSettings();
        const [args] = getExecutable();
        const argv = [pythonPath, ...args];
        // Concat these together to make a set of quoted strings
        const quoted = argv.reduce(
            (p, c) => (p ? `${p} ${c.toCommandArgumentForPythonExt()}` : `${c.toCommandArgumentForPythonExt()}`),
            '',
        );
        const processServiceFactory = this.serviceContainer.get<IProcessServiceFactory>(IProcessServiceFactory);
        const service = await processServiceFactory.create();
        return service.shellExec(quoted, { timeout: 15000 });
    }

    @cache(1000, true) // This is to handle throttling of multiple events.
    protected async onHandle(diagnostics: IDiagnostic[]): Promise<void> {
        if (diagnostics.length === 0) {
            return;
        }
        const messageService = this.serviceContainer.get<IDiagnosticHandlerService<MessageCommandPrompt>>(
            IDiagnosticHandlerService,
            DiagnosticCommandPromptHandlerServiceId,
        );
        await Promise.all(
            diagnostics.map(async (diagnostic) => {
                if (!this.canHandle(diagnostic)) {
                    return;
                }
                const commandPrompts = this.getCommandPrompts(diagnostic);
                const onClose = getOnCloseHandler(diagnostic);
                await messageService.handle(diagnostic, { commandPrompts, message: diagnostic.message, onClose });
            }),
        );
    }

    private getCommandPrompts(diagnostic: IDiagnostic): { prompt: string; command?: IDiagnosticCommand }[] {
        const commandFactory = this.serviceContainer.get<IDiagnosticsCommandFactory>(IDiagnosticsCommandFactory);
        if (
            diagnostic.code === DiagnosticCodes.InvalidComspecDiagnostic ||
            diagnostic.code === DiagnosticCodes.IncompletePathVarDiagnostic ||
            diagnostic.code === DiagnosticCodes.DefaultShellErrorDiagnostic
        ) {
            const links: Record<DefaultShellDiagnostics, string> = {
                InvalidComspecDiagnostic: 'https://aka.ms/AAk3djo',
                IncompletePathVarDiagnostic: 'https://aka.ms/AAk744c',
                DefaultShellErrorDiagnostic: 'https://aka.ms/AAk7qix',
            };
            return [
                {
                    prompt: Common.seeInstructions,
                    command: commandFactory.createCommand(diagnostic, {
                        type: 'launch',
                        options: links[diagnostic.code],
                    }),
                },
            ];
        }
        const prompts = [
            {
                prompt: Common.selectPythonInterpreter,
                command: commandFactory.createCommand(diagnostic, {
                    type: 'executeVSCCommand',
                    options: Commands.Set_Interpreter,
                }),
            },
        ];
        if (diagnostic.code === DiagnosticCodes.InvalidPythonInterpreterDiagnostic) {
            prompts.push({
                prompt: Common.openOutputPanel,
                command: commandFactory.createCommand(diagnostic, {
                    type: 'executeVSCCommand',
                    options: Commands.ViewOutput,
                }),
            });
        }
        return prompts;
    }
}

function getOnCloseHandler(diagnostic: IDiagnostic): IDiagnosticMessageOnCloseHandler | undefined {
    if (diagnostic.code === DiagnosticCodes.NoPythonInterpretersDiagnostic) {
        return (response?: string) => {
            sendTelemetryEvent(EventName.PYTHON_NOT_INSTALLED_PROMPT, undefined, {
                selection: response ? 'Download' : 'Ignore',
            });
        };
    }
    return undefined;
}
