// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// eslint-disable-next-line max-classes-per-file
import { inject, injectable } from 'inversify';
import { DiagnosticSeverity, l10n } from 'vscode';
import '../../../common/extensions';
import { IPlatformService } from '../../../common/platform/types';
import {
    IConfigurationService,
    IDisposableRegistry,
    IInterpreterPathService,
    InterpreterConfigurationScope,
    Resource,
} from '../../../common/types';
import { IInterpreterHelper } from '../../../interpreter/contracts';
import { IServiceContainer } from '../../../ioc/types';
import { BaseDiagnostic, BaseDiagnosticsService } from '../base';
import { IDiagnosticsCommandFactory } from '../commands/types';
import { DiagnosticCodes } from '../constants';
import { DiagnosticCommandPromptHandlerServiceId, MessageCommandPrompt } from '../promptHandler';
import { DiagnosticScope, IDiagnostic, IDiagnosticCommand, IDiagnosticHandlerService } from '../types';
import { Common } from '../../../common/utils/localize';

const messages = {
    [DiagnosticCodes.MacInterpreterSelected]: l10n.t(
        'The selected macOS system install of Python is not recommended, some functionality in the extension will be limited. [Install another version of Python](https://www.python.org/downloads) or select a different interpreter for the best experience. [Learn more](https://aka.ms/AA7jfor).',
    ),
};

export class InvalidMacPythonInterpreterDiagnostic extends BaseDiagnostic {
    constructor(code: DiagnosticCodes.MacInterpreterSelected, resource: Resource) {
        super(code, messages[code], DiagnosticSeverity.Error, DiagnosticScope.WorkspaceFolder, resource);
    }
}

export const InvalidMacPythonInterpreterServiceId = 'InvalidMacPythonInterpreterServiceId';

@injectable()
export class InvalidMacPythonInterpreterService extends BaseDiagnosticsService {
    protected changeThrottleTimeout = 1000;

    private timeOut?: NodeJS.Timeout | number;

    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IDisposableRegistry) disposableRegistry: IDisposableRegistry,
        @inject(IPlatformService) private readonly platform: IPlatformService,
        @inject(IInterpreterHelper) private readonly helper: IInterpreterHelper,
    ) {
        super([DiagnosticCodes.MacInterpreterSelected], serviceContainer, disposableRegistry, true);
        this.addPythonPathChangedHandler();
    }

    public dispose(): void {
        if (this.timeOut && typeof this.timeOut !== 'number') {
            clearTimeout(this.timeOut);
            this.timeOut = undefined;
        }
    }

    public async diagnose(resource: Resource): Promise<IDiagnostic[]> {
        if (!this.platform.isMac) {
            return [];
        }
        const configurationService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        const settings = configurationService.getSettings(resource);
        if (!(await this.helper.isMacDefaultPythonPath(settings.pythonPath))) {
            return [];
        }
        return [new InvalidMacPythonInterpreterDiagnostic(DiagnosticCodes.MacInterpreterSelected, resource)];
    }

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
                const canHandle = await this.canHandle(diagnostic);
                const shouldIgnore = await this.filterService.shouldIgnoreDiagnostic(diagnostic.code);
                if (!canHandle || shouldIgnore) {
                    return;
                }
                const commandPrompts = this.getCommandPrompts(diagnostic);
                await messageService.handle(diagnostic, { commandPrompts, message: diagnostic.message });
            }),
        );
    }

    protected addPythonPathChangedHandler(): void {
        const disposables = this.serviceContainer.get<IDisposableRegistry>(IDisposableRegistry);
        const interpreterPathService = this.serviceContainer.get<IInterpreterPathService>(IInterpreterPathService);
        disposables.push(interpreterPathService.onDidChange((i) => this.onDidChangeConfiguration(i)));
    }

    protected async onDidChangeConfiguration(
        interpreterConfigurationScope: InterpreterConfigurationScope,
    ): Promise<void> {
        const workspaceUri = interpreterConfigurationScope.uri;
        // Lets wait, for more changes, dirty simple throttling.
        if (this.timeOut && typeof this.timeOut !== 'number') {
            clearTimeout(this.timeOut);
            this.timeOut = undefined;
        }
        this.timeOut = setTimeout(() => {
            this.timeOut = undefined;
            this.diagnose(workspaceUri)
                .then((diagnostics) => this.handle(diagnostics))
                .ignoreErrors();
        }, this.changeThrottleTimeout);
    }

    private getCommandPrompts(diagnostic: IDiagnostic): { prompt: string; command?: IDiagnosticCommand }[] {
        const commandFactory = this.serviceContainer.get<IDiagnosticsCommandFactory>(IDiagnosticsCommandFactory);
        switch (diagnostic.code) {
            case DiagnosticCodes.MacInterpreterSelected: {
                return [
                    {
                        prompt: Common.selectPythonInterpreter,
                        command: commandFactory.createCommand(diagnostic, {
                            type: 'executeVSCCommand',
                            options: 'python.setInterpreter',
                        }),
                    },
                    {
                        prompt: Common.doNotShowAgain,
                        command: commandFactory.createCommand(diagnostic, {
                            type: 'ignore',
                            options: DiagnosticScope.Global,
                        }),
                    },
                ];
            }
            default: {
                throw new Error("Invalid diagnostic for 'InvalidMacPythonInterpreterService'");
            }
        }
    }
}
