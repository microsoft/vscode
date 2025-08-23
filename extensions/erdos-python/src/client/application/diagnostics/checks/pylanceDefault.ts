// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// eslint-disable-next-line max-classes-per-file
import { inject, named } from 'inversify';
import { DiagnosticSeverity } from 'vscode';
import { IDisposableRegistry, IExtensionContext, Resource } from '../../../common/types';
import { Diagnostics, Common } from '../../../common/utils/localize';
import { IServiceContainer } from '../../../ioc/types';
import { BaseDiagnostic, BaseDiagnosticsService } from '../base';
import { DiagnosticCodes } from '../constants';
import { DiagnosticCommandPromptHandlerServiceId, MessageCommandPrompt } from '../promptHandler';
import { DiagnosticScope, IDiagnostic, IDiagnosticHandlerService } from '../types';

export const PYLANCE_PROMPT_MEMENTO = 'pylanceDefaultPromptMemento';
const EXTENSION_VERSION_MEMENTO = 'extensionVersion';

export class PylanceDefaultDiagnostic extends BaseDiagnostic {
    constructor(message: string, resource: Resource) {
        super(
            DiagnosticCodes.PylanceDefaultDiagnostic,
            message,
            DiagnosticSeverity.Information,
            DiagnosticScope.Global,
            resource,
        );
    }
}

export const PylanceDefaultDiagnosticServiceId = 'PylanceDefaultDiagnosticServiceId';

export class PylanceDefaultDiagnosticService extends BaseDiagnosticsService {
    public initialMementoValue: string | undefined = undefined;

    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IExtensionContext) private readonly context: IExtensionContext,
        @inject(IDiagnosticHandlerService)
        @named(DiagnosticCommandPromptHandlerServiceId)
        protected readonly messageService: IDiagnosticHandlerService<MessageCommandPrompt>,
        @inject(IDisposableRegistry) disposableRegistry: IDisposableRegistry,
    ) {
        super([DiagnosticCodes.PylanceDefaultDiagnostic], serviceContainer, disposableRegistry, true, true);

        this.initialMementoValue = this.context.globalState.get(EXTENSION_VERSION_MEMENTO);
    }

    public async diagnose(resource: Resource): Promise<IDiagnostic[]> {
        if (!(await this.shouldShowPrompt())) {
            return [];
        }

        return [new PylanceDefaultDiagnostic(Diagnostics.pylanceDefaultMessage, resource)];
    }

    protected async onHandle(diagnostics: IDiagnostic[]): Promise<void> {
        if (diagnostics.length === 0 || !this.canHandle(diagnostics[0])) {
            return;
        }

        const diagnostic = diagnostics[0];
        if (await this.filterService.shouldIgnoreDiagnostic(diagnostic.code)) {
            return;
        }

        const options = [{ prompt: Common.ok }];

        await this.messageService.handle(diagnostic, {
            commandPrompts: options,
            onClose: this.updateMemento.bind(this),
        });
    }

    private async updateMemento() {
        await this.context.globalState.update(PYLANCE_PROMPT_MEMENTO, true);
    }

    private async shouldShowPrompt(): Promise<boolean> {
        const savedVersion: string | undefined = this.initialMementoValue;
        const promptShown: boolean | undefined = this.context.globalState.get(PYLANCE_PROMPT_MEMENTO);

        // savedVersion being undefined means that this is the first time the user activates the extension,
        // and we don't want to show the prompt to first-time users.
        // We set PYLANCE_PROMPT_MEMENTO here to skip the prompt
        // in case the user reloads the extension and savedVersion becomes set
        if (savedVersion === undefined) {
            await this.updateMemento();
            return false;
        }

        // promptShown being undefined means that this is the first time we check if we should show the prompt.
        return promptShown === undefined;
    }
}
