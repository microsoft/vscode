/* eslint-disable max-classes-per-file */
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { inject, injectable, named } from 'inversify';
import { ConfigurationTarget, DiagnosticSeverity } from 'vscode';
import { LanguageServerType } from '../../../activation/types';
import { IWorkspaceService } from '../../../common/application/types';
import { IDisposableRegistry, Resource } from '../../../common/types';
import { Common, SwitchToDefaultLS } from '../../../common/utils/localize';
import { IServiceContainer } from '../../../ioc/types';
import { BaseDiagnostic, BaseDiagnosticsService } from '../base';
import { DiagnosticCodes } from '../constants';
import { DiagnosticCommandPromptHandlerServiceId, MessageCommandPrompt } from '../promptHandler';
import { DiagnosticScope, IDiagnostic, IDiagnosticHandlerService } from '../types';

export class SwitchToDefaultLanguageServerDiagnostic extends BaseDiagnostic {
    constructor(message: string, resource: Resource) {
        super(
            DiagnosticCodes.SwitchToDefaultLanguageServerDiagnostic,
            message,
            DiagnosticSeverity.Warning,
            DiagnosticScope.Global,
            resource,
        );
    }
}

export const SwitchToDefaultLanguageServerDiagnosticServiceId = 'SwitchToDefaultLanguageServerDiagnosticServiceId';

@injectable()
export class SwitchToDefaultLanguageServerDiagnosticService extends BaseDiagnosticsService {
    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IWorkspaceService) private readonly workspaceService: IWorkspaceService,
        @inject(IDiagnosticHandlerService)
        @named(DiagnosticCommandPromptHandlerServiceId)
        protected readonly messageService: IDiagnosticHandlerService<MessageCommandPrompt>,
        @inject(IDisposableRegistry) disposableRegistry: IDisposableRegistry,
    ) {
        super([DiagnosticCodes.JediPython27NotSupportedDiagnostic], serviceContainer, disposableRegistry, true, true);
    }

    public diagnose(resource: Resource): Promise<IDiagnostic[]> {
        let changed = false;
        const config = this.workspaceService.getConfiguration('python');
        const value = config.inspect<string>('languageServer');
        if (value?.workspaceValue === LanguageServerType.Microsoft) {
            config.update('languageServer', 'Default', ConfigurationTarget.Workspace);
            changed = true;
        }

        if (value?.globalValue === LanguageServerType.Microsoft) {
            config.update('languageServer', 'Default', ConfigurationTarget.Global);
            changed = true;
        }

        return Promise.resolve(
            changed ? [new SwitchToDefaultLanguageServerDiagnostic(SwitchToDefaultLS.bannerMessage, resource)] : [],
        );
    }

    protected async onHandle(diagnostics: IDiagnostic[]): Promise<void> {
        if (diagnostics.length === 0 || !this.canHandle(diagnostics[0])) {
            return;
        }
        const diagnostic = diagnostics[0];
        if (await this.filterService.shouldIgnoreDiagnostic(diagnostic.code)) {
            return;
        }

        await this.messageService.handle(diagnostic, {
            commandPrompts: [
                {
                    prompt: Common.gotIt,
                },
            ],
        });
    }
}
