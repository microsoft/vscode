// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

// eslint-disable-next-line max-classes-per-file
import { inject, injectable, named } from 'inversify';
import * as path from 'path';
import { DiagnosticSeverity, Uri, workspace as workspc, WorkspaceFolder } from 'vscode';
import { IDocumentManager, IWorkspaceService } from '../../../common/application/types';
import '../../../common/extensions';
import { IConfigurationService, IDisposableRegistry, Resource } from '../../../common/types';
import { Common, Diagnostics } from '../../../common/utils/localize';
import { SystemVariables } from '../../../common/variables/systemVariables';
import { PythonPathSource } from '../../../debugger/extension/types';
import { IInterpreterHelper } from '../../../interpreter/contracts';
import { IServiceContainer } from '../../../ioc/types';
import { traceError } from '../../../logging';
import { BaseDiagnostic, BaseDiagnosticsService } from '../base';
import { IDiagnosticsCommandFactory } from '../commands/types';
import { DiagnosticCodes } from '../constants';
import { DiagnosticCommandPromptHandlerServiceId, MessageCommandPrompt } from '../promptHandler';
import {
    DiagnosticScope,
    IDiagnostic,
    IDiagnosticCommand,
    IDiagnosticHandlerService,
    IInvalidPythonPathInDebuggerService,
} from '../types';

const messages = {
    [DiagnosticCodes.InvalidPythonPathInDebuggerSettingsDiagnostic]: Diagnostics.invalidPythonPathInDebuggerSettings,
    [DiagnosticCodes.InvalidPythonPathInDebuggerLaunchDiagnostic]: Diagnostics.invalidPythonPathInDebuggerLaunch,
};

class InvalidPythonPathInDebuggerDiagnostic extends BaseDiagnostic {
    constructor(
        code:
            | DiagnosticCodes.InvalidPythonPathInDebuggerLaunchDiagnostic
            | DiagnosticCodes.InvalidPythonPathInDebuggerSettingsDiagnostic,
        resource: Resource,
    ) {
        super(
            code,
            messages[code],
            DiagnosticSeverity.Error,
            DiagnosticScope.WorkspaceFolder,
            resource,
            undefined,
            'always',
        );
    }
}

export const InvalidPythonPathInDebuggerServiceId = 'InvalidPythonPathInDebuggerServiceId';

@injectable()
export class InvalidPythonPathInDebuggerService extends BaseDiagnosticsService
    implements IInvalidPythonPathInDebuggerService {
    constructor(
        @inject(IServiceContainer) serviceContainer: IServiceContainer,
        @inject(IWorkspaceService) private readonly workspace: IWorkspaceService,
        @inject(IDiagnosticsCommandFactory) private readonly commandFactory: IDiagnosticsCommandFactory,
        @inject(IInterpreterHelper) private readonly interpreterHelper: IInterpreterHelper,
        @inject(IDocumentManager) private readonly documentManager: IDocumentManager,
        @inject(IConfigurationService) private readonly configService: IConfigurationService,
        @inject(IDisposableRegistry) disposableRegistry: IDisposableRegistry,
        @inject(IDiagnosticHandlerService)
        @named(DiagnosticCommandPromptHandlerServiceId)
        protected readonly messageService: IDiagnosticHandlerService<MessageCommandPrompt>,
    ) {
        super(
            [
                DiagnosticCodes.InvalidPythonPathInDebuggerSettingsDiagnostic,
                DiagnosticCodes.InvalidPythonPathInDebuggerLaunchDiagnostic,
            ],
            serviceContainer,
            disposableRegistry,
            true,
        );
    }

    // eslint-disable-next-line class-methods-use-this
    public async diagnose(): Promise<IDiagnostic[]> {
        return [];
    }

    public async validatePythonPath(
        pythonPath?: string,
        pythonPathSource?: PythonPathSource,
        resource?: Uri,
    ): Promise<boolean> {
        pythonPath = pythonPath ? this.resolveVariables(pythonPath, resource) : undefined;

        if (pythonPath === '${command:python.interpreterPath}' || !pythonPath) {
            pythonPath = this.configService.getSettings(resource).pythonPath;
        }
        if (await this.interpreterHelper.getInterpreterInformation(pythonPath).catch(() => undefined)) {
            return true;
        }
        traceError(`Invalid Python Path '${pythonPath}'`);
        if (pythonPathSource === PythonPathSource.launchJson) {
            this.handle([
                new InvalidPythonPathInDebuggerDiagnostic(
                    DiagnosticCodes.InvalidPythonPathInDebuggerLaunchDiagnostic,
                    resource,
                ),
            ])
                .catch((ex) => traceError('Failed to handle invalid python path in launch.json debugger', ex))
                .ignoreErrors();
        } else {
            this.handle([
                new InvalidPythonPathInDebuggerDiagnostic(
                    DiagnosticCodes.InvalidPythonPathInDebuggerSettingsDiagnostic,
                    resource,
                ),
            ])
                .catch((ex) => traceError('Failed to handle invalid python path in settings.json debugger', ex))
                .ignoreErrors();
        }
        return false;
    }

    protected async onHandle(diagnostics: IDiagnostic[]): Promise<void> {
        // This class can only handle one type of diagnostic, hence just use first item in list.
        if (diagnostics.length === 0 || !this.canHandle(diagnostics[0])) {
            return;
        }
        const diagnostic = diagnostics[0];
        const commandPrompts = this.getCommandPrompts(diagnostic);

        await this.messageService.handle(diagnostic, { commandPrompts });
    }

    protected resolveVariables(pythonPath: string, resource: Uri | undefined): string {
        const systemVariables = new SystemVariables(resource, undefined, this.workspace);
        return systemVariables.resolveAny(pythonPath);
    }

    private getCommandPrompts(diagnostic: IDiagnostic): { prompt: string; command?: IDiagnosticCommand }[] {
        switch (diagnostic.code) {
            case DiagnosticCodes.InvalidPythonPathInDebuggerSettingsDiagnostic: {
                return [
                    {
                        prompt: Common.selectPythonInterpreter,
                        command: this.commandFactory.createCommand(diagnostic, {
                            type: 'executeVSCCommand',
                            options: 'python.setInterpreter',
                        }),
                    },
                ];
            }
            case DiagnosticCodes.InvalidPythonPathInDebuggerLaunchDiagnostic: {
                return [
                    {
                        prompt: Common.openLaunch,
                        command: {
                            diagnostic,
                            invoke: async (): Promise<void> => {
                                const launchJson = getLaunchJsonFile(workspc.workspaceFolders![0]);
                                const doc = await this.documentManager.openTextDocument(launchJson);
                                await this.documentManager.showTextDocument(doc);
                            },
                        },
                    },
                ];
            }
            default: {
                throw new Error("Invalid diagnostic for 'InvalidPythonPathInDebuggerService'");
            }
        }
    }
}

function getLaunchJsonFile(workspaceFolder: WorkspaceFolder) {
    return path.join(workspaceFolder.uri.fsPath, '.vscode', 'launch.json');
}
