// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ConfigurationTarget, Uri } from 'vscode';
import { LanguageServerType } from '../../../../client/activation/types';
import { BaseDiagnosticsService } from '../../../../client/application/diagnostics/base';
import {
    JediPython27NotSupportedDiagnostic,
    JediPython27NotSupportedDiagnosticService,
} from '../../../../client/application/diagnostics/checks/jediPython27NotSupported';
import { IDiagnosticsCommandFactory } from '../../../../client/application/diagnostics/commands/types';
import {
    DiagnosticCommandPromptHandlerService,
    MessageCommandPrompt,
} from '../../../../client/application/diagnostics/promptHandler';
import {
    IDiagnosticCommand,
    IDiagnosticFilterService,
    IDiagnosticHandlerService,
} from '../../../../client/application/diagnostics/types';
import { IWorkspaceService } from '../../../../client/common/application/types';
import { WorkspaceService } from '../../../../client/common/application/workspace';
import { ConfigurationService } from '../../../../client/common/configuration/service';
import { IConfigurationService, IPythonSettings } from '../../../../client/common/types';
import { Python27Support } from '../../../../client/common/utils/localize';
import { IInterpreterService } from '../../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../../client/ioc/types';

suite('Application Diagnostics - Jedi with Python 2.7 deprecated', () => {
    suite('Diagnostics', () => {
        const resource = Uri.file('test.py');

        function createConfigurationAndWorkspaceServices(
            languageServer: LanguageServerType,
        ): { configurationService: IConfigurationService; workspaceService: IWorkspaceService } {
            const configurationService = ({
                getSettings: () => ({ languageServer }),
                updateSetting: () => Promise.resolve(),
            } as unknown) as IConfigurationService;

            const workspaceService = ({
                getConfiguration: () => ({
                    inspect: () => ({
                        workspaceValue: languageServer,
                    }),
                }),
            } as unknown) as IWorkspaceService;

            return { configurationService, workspaceService };
        }

        test('Should return an empty diagnostics array if the active interpreter version is Python 3', async () => {
            const interpreterService = {
                getActiveInterpreter: () =>
                    Promise.resolve({
                        version: {
                            major: 3,
                            minor: 8,
                            patch: 0,
                        },
                    }),
            } as IInterpreterService;

            const { configurationService, workspaceService } = createConfigurationAndWorkspaceServices(
                LanguageServerType.Jedi,
            );

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            const result = await service.diagnose(resource);

            assert.strictEqual(result.length, 0);
        });

        test('Should return an empty diagnostics array if the active interpreter is undefined', async () => {
            const interpreterService = {
                getActiveInterpreter: () => Promise.resolve(undefined),
            } as IInterpreterService;

            const { configurationService, workspaceService } = createConfigurationAndWorkspaceServices(
                LanguageServerType.Jedi,
            );

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            const result = await service.diagnose(resource);

            assert.strictEqual(result.length, 0);
        });

        test('Should return a diagnostics array with one diagnostic if the active interpreter version is Python 2.7', async () => {
            const interpreterService = {
                getActiveInterpreter: () =>
                    Promise.resolve({
                        version: {
                            major: 2,
                            minor: 7,
                            patch: 10,
                        },
                    }),
            } as IInterpreterService;

            const { configurationService, workspaceService } = createConfigurationAndWorkspaceServices(
                LanguageServerType.Jedi,
            );

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            const result = await service.diagnose(resource);
            const diagnostic = result[0];

            assert.strictEqual(result.length, 1);
            assert.strictEqual(diagnostic.message, Python27Support.jediMessage);
        });

        test('Should return a diagnostics array with one diagnostic if the language server is Jedi', async () => {
            const interpreterService = {
                getActiveInterpreter: () =>
                    Promise.resolve({
                        version: {
                            major: 2,
                            minor: 7,
                            patch: 10,
                        },
                    }),
            } as IInterpreterService;

            const { configurationService, workspaceService } = createConfigurationAndWorkspaceServices(
                LanguageServerType.Jedi,
            );

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            const result = await service.diagnose(resource);
            const diagnostic = result[0];

            assert.strictEqual(result.length, 1);
            assert.strictEqual(diagnostic.message, Python27Support.jediMessage);
        });

        test('Should return an empty diagnostics array if the language server is Pylance', async () => {
            const interpreterService = {
                getActiveInterpreter: () =>
                    Promise.resolve({
                        version: {
                            major: 2,
                            minor: 7,
                            patch: 10,
                        },
                    }),
            } as IInterpreterService;

            const { configurationService, workspaceService } = createConfigurationAndWorkspaceServices(
                LanguageServerType.Node,
            );

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            const result = await service.diagnose(resource);

            assert.strictEqual(result.length, 0);
        });

        test('Should return an empty diagnostics array if there is no language server', async () => {
            const interpreterService = {
                getActiveInterpreter: () =>
                    Promise.resolve({
                        version: {
                            major: 2,
                            minor: 7,
                            patch: 10,
                        },
                    }),
            } as IInterpreterService;

            const { configurationService, workspaceService } = createConfigurationAndWorkspaceServices(
                LanguageServerType.None,
            );

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            const result = await service.diagnose(resource);

            assert.strictEqual(result.length, 0);
        });
    });

    suite('Setting update', () => {
        const resource = Uri.file('test.py');
        let workspaceService: IWorkspaceService;
        let getConfigurationStub: sinon.SinonStub;
        let updateSettingStub: sinon.SinonStub;
        let serviceContainer: IServiceContainer;
        let services: {
            [key: string]: IWorkspaceService;
        };

        const interpreterService = {
            getActiveInterpreter: () =>
                Promise.resolve({
                    version: {
                        major: 2,
                        minor: 7,
                        patch: 10,
                    },
                }),
        } as IInterpreterService;

        setup(() => {
            serviceContainer = ({
                get: (serviceIdentifier: symbol) => services[serviceIdentifier.toString()] as IWorkspaceService,
                tryGet: () => ({}),
            } as unknown) as IServiceContainer;

            workspaceService = new WorkspaceService();
            services = {
                'Symbol(IWorkspaceService)': workspaceService,
            };

            getConfigurationStub = sinon.stub(WorkspaceService.prototype, 'getConfiguration');
            updateSettingStub = sinon.stub(ConfigurationService.prototype, 'updateSetting');

            const getSettingsStub = sinon.stub(ConfigurationService.prototype, 'getSettings');
            getSettingsStub.returns(({
                getSettings: () => ({ languageServer: LanguageServerType.Jedi }),
            } as unknown) as IPythonSettings);
        });

        teardown(() => {
            sinon.restore();
        });

        test('Running the diagnostic should update the workspace setting if set', async () => {
            getConfigurationStub.returns({
                inspect: () => ({
                    workspaceValue: LanguageServerType.JediLSP,
                }),
            });
            const configurationService = new ConfigurationService(serviceContainer);

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            await service.diagnose(resource);

            sinon.assert.calledOnce(getConfigurationStub);
            sinon.assert.calledWith(
                updateSettingStub,
                'languageServer',
                LanguageServerType.Jedi,
                resource,
                ConfigurationTarget.Workspace,
            );
        });

        test('Running the diagnostic should update the global setting if set', async () => {
            getConfigurationStub.returns({
                inspect: () => ({
                    globalValue: LanguageServerType.JediLSP,
                }),
            });
            const configurationService = new ConfigurationService(serviceContainer);

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            await service.diagnose(resource);

            sinon.assert.calledOnce(getConfigurationStub);
            sinon.assert.calledWith(
                updateSettingStub,
                'languageServer',
                LanguageServerType.Jedi,
                resource,
                ConfigurationTarget.Global,
            );
        });

        test('Running the diagnostic should not update the setting if not set in workspace or global scopes', async () => {
            getConfigurationStub.returns({
                inspect: () => ({
                    workspaceFolderValue: LanguageServerType.JediLSP,
                }),
            });
            const configurationService = new ConfigurationService(serviceContainer);

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            await service.diagnose(resource);

            sinon.assert.calledOnce(getConfigurationStub);
            sinon.assert.notCalled(updateSettingStub);
        });

        test('Running the diagnostic should not update the setting if not set to Jedi LSP', async () => {
            getConfigurationStub.returns({
                inspect: () => ({
                    workspaceValue: LanguageServerType.Node,
                }),
            });
            const configurationService = new ConfigurationService(serviceContainer);

            const service = new JediPython27NotSupportedDiagnosticService(
                ({
                    get: () => ({}),
                } as unknown) as IServiceContainer,
                interpreterService,
                workspaceService,
                configurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            await service.diagnose(resource);

            sinon.assert.calledOnce(getConfigurationStub);
            sinon.assert.notCalled(updateSettingStub);
        });
    });

    suite('Handler', () => {
        class TestJediPython27NotSupportedDiagnosticService extends JediPython27NotSupportedDiagnosticService {
            // eslint-disable-next-line class-methods-use-this
            public static clear() {
                while (BaseDiagnosticsService.handledDiagnosticCodeKeys.length > 0) {
                    BaseDiagnosticsService.handledDiagnosticCodeKeys.shift();
                }
            }
        }

        let services: {
            [key: string]: IWorkspaceService | IDiagnosticFilterService | IDiagnosticsCommandFactory;
        };
        let serviceContainer: IServiceContainer;
        let handleMessageStub: sinon.SinonStub;

        const interpreterService = {
            getActiveInterpreter: () =>
                Promise.resolve({
                    version: {
                        major: 2,
                        minor: 7,
                        patch: 10,
                    },
                }),
        } as IInterpreterService;

        setup(() => {
            services = {
                'Symbol(IDiagnosticsCommandFactory)': {
                    createCommand: () => ({} as IDiagnosticCommand),
                },
            };
            serviceContainer = {
                get: (serviceIdentifier: symbol) =>
                    services[serviceIdentifier.toString()] as IDiagnosticFilterService | IDiagnosticsCommandFactory,
            } as IServiceContainer;

            handleMessageStub = sinon.stub(DiagnosticCommandPromptHandlerService.prototype, 'handle');
        });

        teardown(() => {
            sinon.restore();
            TestJediPython27NotSupportedDiagnosticService.clear();
        });

        test('Handling an empty diagnostics array does not display a prompt', async () => {
            const service = new TestJediPython27NotSupportedDiagnosticService(
                serviceContainer,
                interpreterService,
                {} as IWorkspaceService,
                {} as IConfigurationService,
                {} as IDiagnosticHandlerService<MessageCommandPrompt>,
                [],
            );

            await service.handle([]);

            sinon.assert.notCalled(handleMessageStub);
        });

        test('Handling a diagnostic that should be ignored does not display a prompt', async () => {
            const diagnosticHandlerService = new DiagnosticCommandPromptHandlerService(serviceContainer);

            services['Symbol(IDiagnosticFilterService)'] = ({
                shouldIgnoreDiagnostic: async () => Promise.resolve(true),
            } as unknown) as IDiagnosticFilterService;

            const service = new TestJediPython27NotSupportedDiagnosticService(
                serviceContainer,
                interpreterService,
                {} as IWorkspaceService,
                {} as IConfigurationService,
                diagnosticHandlerService,
                [],
            );

            await service.handle([new JediPython27NotSupportedDiagnostic('ignored', undefined)]);

            sinon.assert.notCalled(handleMessageStub);
        });

        test('Handling a diagnostic should show a prompt', async () => {
            const diagnosticHandlerService = new DiagnosticCommandPromptHandlerService(serviceContainer);
            const configurationService = new ConfigurationService(serviceContainer);

            services['Symbol(IDiagnosticFilterService)'] = ({
                shouldIgnoreDiagnostic: () => Promise.resolve(false),
            } as unknown) as IDiagnosticFilterService;

            const service = new TestJediPython27NotSupportedDiagnosticService(
                serviceContainer,
                interpreterService,
                {} as IWorkspaceService,
                configurationService,
                diagnosticHandlerService,
                [],
            );

            const diagnostic = new JediPython27NotSupportedDiagnostic('diagnostic', undefined);

            await service.handle([diagnostic]);

            sinon.assert.calledOnce(handleMessageStub);
        });
    });
});
