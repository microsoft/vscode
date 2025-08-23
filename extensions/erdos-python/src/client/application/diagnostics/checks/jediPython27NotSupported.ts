/* eslint-disable max-classes-per-file */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, named } from 'inversify';
import { ConfigurationTarget, DiagnosticSeverity } from 'vscode';
import { LanguageServerType } from '../../../activation/types';
import { IWorkspaceService } from '../../../common/application/types';
import { IConfigurationService, IDisposableRegistry, Resource } from '../../../common/types';
import { Common, Python27Support } from '../../../common/utils/localize';
import { IInterpreterService } from '../../../interpreter/contracts';
import { IServiceContainer } from '../../../ioc/types';
import { BaseDiagnostic, BaseDiagnosticsService } from '../base';
import { IDiagnosticsCommandFactory } from '../commands/types';
import { DiagnosticCodes } from '../constants';
import { DiagnosticCommandPromptHandlerServiceId, MessageCommandPrompt } from '../promptHandler';
import { DiagnosticScope, IDiagnostic, IDiagnosticHandlerService } from '../types';

export class JediPython27NotSupportedDiagnostic extends BaseDiagnostic {
    constructor(message: string, resource: Resource) {
        super(
            DiagnosticCodes.JediPython27NotSupportedDiagnostic,
            message,
            DiagnosticSeverity.Warning,
            DiagnosticScope.Global,
            resource,
        );
    }
}

export const JediPython27NotSupportedDiagnosticServiceId = 'JediPython27NotSupportedDiagnosticServiceId';

export class JediPython27NotSupportedDiagnosticService extends BaseDiagnosticsService {
    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IInterpreterService) private readonly interpreterService: IInterpreterService,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IConfigurationService) private readonly configurationService: IConfigurationService,
        @inject(IDiagnosticHandlerService)
        @named(DiagnosticCommandPromptHandlerServiceId)
        protected readonly messageService: IDiagnosticHandlerService<MessageCommandPrompt>,
        @inject(IDisposableRegistry) disposableRegistry: IDisposableRegistry,
    ) {
        super([DiagnosticCodes.JediPython27NotSupportedDiagnostic], serviceContainer, disposableRegistry, true);
    }

    public async diagnose(resource: Resource): Promise<IDiagnostic[]> {
        const interpreter = await this.interpreterService.getActiveInterpreter(resource);
        const { languageServer } = this.configurationService.getSettings(resource);

        await this.updateLanguageServerSetting(resource);

        // We don't need to check for JediLSP here, because we retrieve the setting from the configuration service,
        // Which already switched the JediLSP option to Jedi.
        if (interpreter && (interpreter.version?.major ?? 0) < 3 && languageServer === LanguageServerType.Jedi) {
            return [new JediPython27NotSupportedDiagnostic(Python27Support.jediMessage, resource)];
        }

        return [];
    }

    protected async onHandle(diagnostics: IDiagnostic[]): Promise<void> {
        if (diagnostics.length === 0 || !this.canHandle(diagnostics[0])) {
            return;
        }
        const diagnostic = diagnostics[0];
        if (await this.filterService.shouldIgnoreDiagnostic(diagnostic.code)) {
            return;
        }

        const commandFactory = this.serviceContainer.get<IDiagnosticsCommandFactory>(IDiagnosticsCommandFactory);
        const options = [
            {
                prompt: Common.gotIt,
            },
            {
                prompt: Common.doNotShowAgain,
                command: commandFactory.createCommand(diagnostic, { type: 'ignore', options: DiagnosticScope.Global }),
            },
        ];

        await this.messageService.handle(diagnostic, { commandPrompts: options });
    }

    private async updateLanguageServerSetting(resource: Resource): Promise<void | undefined> {
        // Update settings.json value to Jedi if it's JediLSP.
        const settings = this.workspaceService
            .getConfiguration('python', resource)
            .inspect<LanguageServerType>('languageServer');

        let configTarget: ConfigurationTarget;

        if (settings?.workspaceValue === LanguageServerType.JediLSP) {
            configTarget = ConfigurationTarget.Workspace;
        } else if (settings?.globalValue === LanguageServerType.JediLSP) {
            configTarget = ConfigurationTarget.Global;
        } else {
            return;
        }

        await this.configurationService.updateSetting(
            'languageServer',
            LanguageServerType.Jedi,
            resource,
            configTarget,
        );
    }
}
