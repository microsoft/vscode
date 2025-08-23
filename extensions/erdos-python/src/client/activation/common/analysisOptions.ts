// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { Disposable, Event, EventEmitter, WorkspaceFolder } from 'vscode';
import { DocumentFilter, LanguageClientOptions, RevealOutputChannelOn } from 'vscode-languageclient/node';
import { IWorkspaceService } from '../../common/application/types';

import { PYTHON, PYTHON_LANGUAGE } from '../../common/constants';
import { ILogOutputChannel, Resource } from '../../common/types';
import { debounceSync } from '../../common/utils/decorators';
import { IEnvironmentVariablesProvider } from '../../common/variables/types';
import { traceDecoratorError } from '../../logging';
import { PythonEnvironment } from '../../pythonEnvironments/info';
import { ILanguageServerAnalysisOptions, ILanguageServerOutputChannel } from '../types';

export abstract class LanguageServerAnalysisOptionsBase implements ILanguageServerAnalysisOptions {
    protected readonly didChange = new EventEmitter<void>();
    private readonly output: ILogOutputChannel;

    protected constructor(
        lsOutputChannel: ILanguageServerOutputChannel,
        protected readonly workspace: IWorkspaceService,
    ) {
        this.output = lsOutputChannel.channel;
    }

    public async initialize(_resource: Resource, _interpreter: PythonEnvironment | undefined) {}

    public get onDidChange(): Event<void> {
        return this.didChange.event;
    }

    public dispose(): void {
        this.didChange.dispose();
    }

    @traceDecoratorError('Failed to get analysis options')
    public async getAnalysisOptions(): Promise<LanguageClientOptions> {
        const workspaceFolder = this.getWorkspaceFolder();
        const documentSelector = this.getDocumentFilters(workspaceFolder);

        return {
            documentSelector,
            workspaceFolder,
            synchronize: {
                configurationSection: this.getConfigSectionsToSynchronize(),
            },
            outputChannel: this.output,
            revealOutputChannelOn: RevealOutputChannelOn.Never,
            initializationOptions: await this.getInitializationOptions(),
        };
    }

    protected getWorkspaceFolder(): WorkspaceFolder | undefined {
        return undefined;
    }

    protected getDocumentFilters(_workspaceFolder?: WorkspaceFolder): DocumentFilter[] {
        return this.workspace.isVirtualWorkspace ? [{ language: PYTHON_LANGUAGE }] : PYTHON;
    }

    protected getConfigSectionsToSynchronize(): string[] {
        return [PYTHON_LANGUAGE];
    }

    protected async getInitializationOptions(): Promise<any> {
        return undefined;
    }
}

export abstract class LanguageServerAnalysisOptionsWithEnv extends LanguageServerAnalysisOptionsBase {
    protected disposables: Disposable[] = [];
    private envPythonPath: string = '';

    protected constructor(
        private readonly envVarsProvider: IEnvironmentVariablesProvider,
        lsOutputChannel: ILanguageServerOutputChannel,
        workspace: IWorkspaceService,
    ) {
        super(lsOutputChannel, workspace);
    }

    public async initialize(_resource: Resource, _interpreter: PythonEnvironment | undefined) {
        const disposable = this.envVarsProvider.onDidEnvironmentVariablesChange(this.onEnvVarChange, this);
        this.disposables.push(disposable);
    }

    public dispose(): void {
        super.dispose();
        this.disposables.forEach((d) => d.dispose());
    }

    protected async getEnvPythonPath(): Promise<string> {
        const vars = await this.envVarsProvider.getEnvironmentVariables();
        this.envPythonPath = vars.PYTHONPATH || '';
        return this.envPythonPath;
    }

    @debounceSync(1000)
    protected onEnvVarChange(): void {
        this.notifyifEnvPythonPathChanged().ignoreErrors();
    }

    protected async notifyifEnvPythonPathChanged(): Promise<void> {
        const vars = await this.envVarsProvider.getEnvironmentVariables();
        const envPythonPath = vars.PYTHONPATH || '';

        if (this.envPythonPath !== envPythonPath) {
            this.didChange.fire();
        }
    }
}
