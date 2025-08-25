import { inject, injectable } from 'inversify';
import { DiagnosticSeverity, l10n, Uri } from 'vscode';
import { IDisposableRegistry, Resource } from '../../../common/types';
import { IInterpreterService } from '../../../interpreter/contracts';
import { isVersionSupported } from '../../../interpreter/configuration/environmentTypeComparer';
import { IServiceContainer } from '../../../ioc/types';
import { BaseDiagnostic, BaseDiagnosticsService } from '../base';
import { IDiagnosticsCommandFactory } from '../commands/types';
import { DiagnosticCodes } from '../constants';
import { DiagnosticCommandPromptHandlerServiceId, MessageCommandPrompt } from '../promptHandler';
import { DiagnosticScope, IDiagnostic, IDiagnosticCommand, IDiagnosticHandlerService } from '../types';
import { Common } from '../../../common/utils/localize';

const messages = {
    [DiagnosticCodes.UnsupportedPythonVersion]: l10n.t(
        'The selected Python version {0} is not supported. Some features may not work as expected. Select a different session for the best experience.',
    ),
};

export class UnsupportedPythonVersionDiagnostic extends BaseDiagnostic {
    constructor(code: DiagnosticCodes.UnsupportedPythonVersion, resource: Resource, version: string) {
        super(
            code,
            messages[code].format(version),
            DiagnosticSeverity.Error,
            DiagnosticScope.WorkspaceFolder,
            resource,
            true,
            'always',
        );
    }
}

export const UnsupportedPythonVersionServiceId = 'UnsupportedPythonVersionServiceId';

@injectable()
export class UnsupportedPythonVersionService extends BaseDiagnosticsService {
    protected changeThrottleTimeout = 1000;

    private timeOut?: NodeJS.Timeout | number;

    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IDisposableRegistry) disposableRegistry: IDisposableRegistry,
    ) {
        super([DiagnosticCodes.UnsupportedPythonVersion], serviceContainer, disposableRegistry, true);
        this.addPythonEnvChangedHandler();
    }

    public dispose(): void {
        if (this.timeOut && typeof this.timeOut !== 'number') {
            clearTimeout(this.timeOut);
            this.timeOut = undefined;
        }
    }

    public async diagnose(resource: Resource): Promise<IDiagnostic[]> {
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        const interpreter = await interpreterService.getActiveInterpreter(resource);
        if (!interpreter?.version?.raw || isVersionSupported(interpreter.version)) {
            return [];
        }
        return [
            new UnsupportedPythonVersionDiagnostic(
                DiagnosticCodes.UnsupportedPythonVersion,
                resource,
                interpreter.version.raw,
            ),
        ];
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

    protected addPythonEnvChangedHandler(): void {
        const disposables = this.serviceContainer.get<IDisposableRegistry>(IDisposableRegistry);
        const interpreterService = this.serviceContainer.get<IInterpreterService>(IInterpreterService);
        disposables.push(interpreterService.onDidChangeInterpreter((e) => this.onDidChangeEnvironment(e)));
    }

    protected async onDidChangeEnvironment(resource?: Uri): Promise<void> {
        if (this.timeOut && typeof this.timeOut !== 'number') {
            clearTimeout(this.timeOut);
            this.timeOut = undefined;
        }
        this.timeOut = setTimeout(() => {
            this.timeOut = undefined;
            this.diagnose(resource)
                .then((diagnostics) => this.handle(diagnostics))
                .ignoreErrors();
        }, this.changeThrottleTimeout);
    }

    private getCommandPrompts(diagnostic: IDiagnostic): { prompt: string; command?: IDiagnosticCommand }[] {
        const commandFactory = this.serviceContainer.get<IDiagnosticsCommandFactory>(IDiagnosticsCommandFactory);
        switch (diagnostic.code) {
            case DiagnosticCodes.UnsupportedPythonVersion: {
                return [
                    {
                        prompt: Common.selectNewSession,
                        command: commandFactory.createCommand(diagnostic, {
                            type: 'executeVSCCommand',
                            options: 'workbench.action.language.runtime.selectSession',
                        }),
                    },
                    {
                        prompt: Common.doNotShowAgain,
                        command: commandFactory.createCommand(diagnostic, {
                            type: 'ignore',
                            options: DiagnosticScope.WorkspaceFolder,
                        }),
                    },
                ];
            }
            default: {
                throw new Error("Invalid diagnostic for 'UnsupportedPythonVersionService'");
            }
        }
    }
}