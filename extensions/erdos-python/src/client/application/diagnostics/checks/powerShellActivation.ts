// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// eslint-disable-next-line max-classes-per-file
import { inject, injectable } from 'inversify';
import { DiagnosticSeverity, l10n } from 'vscode';
import '../../../common/extensions';
import { useCommandPromptAsDefaultShell } from '../../../common/terminal/commandPrompt';
import { IConfigurationService, ICurrentProcess, IDisposableRegistry, Resource } from '../../../common/types';
import { Common } from '../../../common/utils/localize';
import { IServiceContainer } from '../../../ioc/types';
import { traceError } from '../../../logging';
import { sendTelemetryEvent } from '../../../telemetry';
import { EventName } from '../../../telemetry/constants';
import { BaseDiagnostic, BaseDiagnosticsService } from '../base';
import { IDiagnosticsCommandFactory } from '../commands/types';
import { DiagnosticCodes } from '../constants';
import { DiagnosticCommandPromptHandlerServiceId, MessageCommandPrompt } from '../promptHandler';
import { DiagnosticScope, IDiagnostic, IDiagnosticHandlerService } from '../types';

const PowershellActivationNotSupportedWithBatchFilesMessage = l10n.t(
    'Activation of the selected Python environment is not supported in PowerShell. Consider changing your shell to Command Prompt.',
);

export class PowershellActivationNotAvailableDiagnostic extends BaseDiagnostic {
    constructor(resource: Resource) {
        super(
            DiagnosticCodes.EnvironmentActivationInPowerShellWithBatchFilesNotSupportedDiagnostic,
            PowershellActivationNotSupportedWithBatchFilesMessage,
            DiagnosticSeverity.Warning,
            DiagnosticScope.Global,
            resource,
            undefined,
            'always',
        );
    }
}

export const PowerShellActivationHackDiagnosticsServiceId =
    'EnvironmentActivationInPowerShellWithBatchFilesNotSupportedDiagnostic';

@injectable()
export class PowerShellActivationHackDiagnosticsService extends BaseDiagnosticsService {
    protected readonly messageService: IDiagnosticHandlerService<MessageCommandPrompt>;

    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IDisposableRegistry) disposableRegistry: IDisposableRegistry,
    ) {
        super(
            [DiagnosticCodes.EnvironmentActivationInPowerShellWithBatchFilesNotSupportedDiagnostic],
            serviceContainer,
            disposableRegistry,
            true,
        );
        this.messageService = serviceContainer.get<IDiagnosticHandlerService<MessageCommandPrompt>>(
            IDiagnosticHandlerService,
            DiagnosticCommandPromptHandlerServiceId,
        );
    }

    // eslint-disable-next-line class-methods-use-this
    public async diagnose(): Promise<IDiagnostic[]> {
        return [];
    }

    protected async onHandle(diagnostics: IDiagnostic[]): Promise<void> {
        // This class can only handle one type of diagnostic, hence just use first item in list.
        if (diagnostics.length === 0 || !this.canHandle(diagnostics[0])) {
            return;
        }
        const diagnostic = diagnostics[0];
        if (await this.filterService.shouldIgnoreDiagnostic(diagnostic.code)) {
            return;
        }
        const commandFactory = this.serviceContainer.get<IDiagnosticsCommandFactory>(IDiagnosticsCommandFactory);
        const currentProcess = this.serviceContainer.get<ICurrentProcess>(ICurrentProcess);
        const configurationService = this.serviceContainer.get<IConfigurationService>(IConfigurationService);
        const options = [
            {
                prompt: Common.useCommandPrompt,

                command: {
                    diagnostic,
                    invoke: async (): Promise<void> => {
                        sendTelemetryEvent(EventName.DIAGNOSTICS_ACTION, undefined, {
                            action: 'switchToCommandPrompt',
                        });
                        useCommandPromptAsDefaultShell(currentProcess, configurationService).catch((ex) =>
                            traceError('Use Command Prompt as default shell', ex),
                        );
                    },
                },
            },
            {
                prompt: Common.ignore,
            },
            {
                prompt: Common.alwaysIgnore,
                command: commandFactory.createCommand(diagnostic, { type: 'ignore', options: DiagnosticScope.Global }),
            },
            {
                prompt: Common.moreInfo,
                command: commandFactory.createCommand(diagnostic, {
                    type: 'launch',
                    options: 'https://aka.ms/CondaPwsh',
                }),
            },
        ];

        await this.messageService.handle(diagnostic, { commandPrompts: options });
    }
}
