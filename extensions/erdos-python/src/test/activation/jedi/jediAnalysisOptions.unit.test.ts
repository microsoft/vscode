// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { expect } from 'chai';
import * as path from 'path';
import { anything, instance, mock, when } from 'ts-mockito';
import { EventEmitter, Uri, WorkspaceFolder } from 'vscode';
import { JediLanguageServerAnalysisOptions } from '../../../client/activation/jedi/analysisOptions';
import { ILanguageServerAnalysisOptions, ILanguageServerOutputChannel } from '../../../client/activation/types';
import { IWorkspaceService } from '../../../client/common/application/types';
import { WorkspaceService } from '../../../client/common/application/workspace';
import { ConfigurationService } from '../../../client/common/configuration/service';
import { IConfigurationService } from '../../../client/common/types';
import { IEnvironmentVariablesProvider } from '../../../client/common/variables/types';
import { EnvironmentType, PythonEnvironment } from '../../../client/pythonEnvironments/info';
import { Architecture } from '../../../client/common/utils/platform';

suite('Jedi LSP - analysis Options', () => {
    const workspacePath = path.join('this', 'is', 'fake', 'workspace', 'path');
    const expectedWorkspacePath = path.sep + workspacePath;

    let envVarsProvider: IEnvironmentVariablesProvider;
    let lsOutputChannel: ILanguageServerOutputChannel;
    let configurationService: IConfigurationService;
    let workspaceService: IWorkspaceService;

    let analysisOptions: ILanguageServerAnalysisOptions;

    class MockWorkspaceFolder implements WorkspaceFolder {
        public uri: Uri;

        public name: string;

        public ownedResources = new Set<string>();

        constructor(folder: string, public index: number = 0) {
            this.uri = Uri.file(folder);
            this.name = folder;
        }
    }

    setup(() => {
        envVarsProvider = mock(IEnvironmentVariablesProvider);
        lsOutputChannel = mock(ILanguageServerOutputChannel);
        configurationService = mock(ConfigurationService);
        workspaceService = mock(WorkspaceService);

        const onDidChangeEnvVariables = new EventEmitter<Uri | undefined>();
        when(envVarsProvider.onDidEnvironmentVariablesChange).thenReturn(onDidChangeEnvVariables.event);

        analysisOptions = new JediLanguageServerAnalysisOptions(
            instance(envVarsProvider),
            instance(lsOutputChannel),
            instance(configurationService),
            instance(workspaceService),
        );
    });

    test('Validate defaults', async () => {
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn(undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(configurationService.getSettings(anything())).thenReturn({} as any);
        analysisOptions.initialize(undefined, undefined);

        const result = await analysisOptions.getAnalysisOptions();

        expect(result.initializationOptions.markupKindPreferred).to.deep.equal('markdown');
        expect(result.initializationOptions.completion.resolveEagerly).to.deep.equal(false);
        expect(result.initializationOptions.completion.disableSnippets).to.deep.equal(true);
        expect(result.initializationOptions.diagnostics.enable).to.deep.equal(true);
        expect(result.initializationOptions.diagnostics.didOpen).to.deep.equal(true);
        expect(result.initializationOptions.diagnostics.didSave).to.deep.equal(true);
        expect(result.initializationOptions.diagnostics.didChange).to.deep.equal(true);
        expect(result.initializationOptions.hover.disable.keyword.all).to.deep.equal(true);
        expect(result.initializationOptions.workspace.extraPaths).to.deep.equal([]);
        expect(result.initializationOptions.workspace.symbols.maxSymbols).to.deep.equal(0);
        expect(result.initializationOptions.semantic_tokens.enable).to.deep.equal(true);
    });

    test('With interpreter path', async () => {
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn(undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(configurationService.getSettings(anything())).thenReturn({} as any);
        const pythonEnvironment: PythonEnvironment = {
            envPath: '.../.venv',
            id: 'base_env',
            envType: EnvironmentType.Conda,
            path: '.../.venv/bin/python',
            architecture: Architecture.x86,
            sysPrefix: 'prefix/path',
        };
        analysisOptions.initialize(undefined, pythonEnvironment);

        const result = await analysisOptions.getAnalysisOptions();

        expect(result.initializationOptions.workspace.environmentPath).to.deep.equal('.../.venv/bin/python');
    });

    test('Without extraPaths provided and no workspace', async () => {
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn(undefined);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(configurationService.getSettings(anything())).thenReturn({} as any);
        analysisOptions.initialize(undefined, undefined);

        const result = await analysisOptions.getAnalysisOptions();
        expect(result.initializationOptions.workspace.extraPaths).to.deep.equal([]);
    });

    test('Without extraPaths provided', async () => {
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn(new MockWorkspaceFolder(workspacePath));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        when(configurationService.getSettings(anything())).thenReturn({} as any);
        analysisOptions.initialize(undefined, undefined);

        const result = await analysisOptions.getAnalysisOptions();
        expect(result.initializationOptions.workspace.extraPaths).to.deep.equal([expectedWorkspacePath]);
    });

    test('With extraPaths provided', async () => {
        when(workspaceService.getWorkspaceFolder(anything())).thenReturn(new MockWorkspaceFolder(workspacePath));
        when(configurationService.getSettings(anything())).thenReturn({
            // We expect a distinct set of paths back, using __dirname to test absolute path
            autoComplete: { extraPaths: [__dirname, 'relative/pathB', 'relative/pathB'] },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        analysisOptions.initialize(undefined, undefined);

        const result = await analysisOptions.getAnalysisOptions();

        expect(result.initializationOptions.workspace.extraPaths).to.deep.equal([
            expectedWorkspacePath,
            __dirname,
            path.join(expectedWorkspacePath, 'relative/pathB'),
        ]);
    });
});
