// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';
import * as sinon from 'sinon';
import { ConfigurationChangeEvent, Uri, WorkspaceFolder, WorkspaceFoldersChangeEvent } from 'vscode';
import { JediLanguageServerManager } from '../../client/activation/jedi/manager';
import { NodeLanguageServerManager } from '../../client/activation/node/manager';
import { ILanguageServerOutputChannel, LanguageServerType } from '../../client/activation/types';
import { IApplicationShell, ICommandManager, IWorkspaceService } from '../../client/common/application/types';
import { IFileSystem } from '../../client/common/platform/types';
import {
    IConfigurationService,
    IDisposable,
    IExperimentService,
    IExtensions,
    IInterpreterPathService,
} from '../../client/common/types';
import { LanguageService } from '../../client/common/utils/localize';
import { IEnvironmentVariablesProvider } from '../../client/common/variables/types';
import { IInterpreterHelper, IInterpreterService } from '../../client/interpreter/contracts';
import { IServiceContainer } from '../../client/ioc/types';
import { JediLSExtensionManager } from '../../client/languageServer/jediLSExtensionManager';
import { NoneLSExtensionManager } from '../../client/languageServer/noneLSExtensionManager';
import { PylanceLSExtensionManager } from '../../client/languageServer/pylanceLSExtensionManager';
import { ILanguageServerExtensionManager } from '../../client/languageServer/types';
import { LanguageServerWatcher } from '../../client/languageServer/watcher';
import * as Logging from '../../client/logging';
import { PythonEnvironment } from '../../client/pythonEnvironments/info';

suite('Language server watcher', () => {
    let watcher: LanguageServerWatcher;
    let disposables: IDisposable[];
    const sandbox = sinon.createSandbox();

    setup(() => {
        disposables = [];
        watcher = new LanguageServerWatcher(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            ({
                getActiveInterpreter: () => 'python',
                onDidChangeInterpreterInformation: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            ({
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );

        watcher.register();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('The constructor should add a listener to onDidChange to the list of disposables if it is a trusted workspace', () => {
        watcher = new LanguageServerWatcher(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            {} as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            ({
                onDidChangeInterpreterInformation: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            ({
                isTrusted: true,
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            {} as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();
        assert.strictEqual(disposables.length, 11);
    });

    test('The constructor should not add a listener to onDidChange to the list of disposables if it is not a trusted workspace', () => {
        watcher = new LanguageServerWatcher(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            {} as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            ({
                onDidChangeInterpreterInformation: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            ({
                isTrusted: false,
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            {} as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();
        assert.strictEqual(disposables.length, 10);
    });

    test(`When starting the language server, the language server extension manager should not be undefined`, async () => {
        // First start
        await watcher.startLanguageServer(LanguageServerType.None);
        // get should return the None LS (the noop LS).
        // This LS is returned by the None LS manager in get().
        const languageServer = await watcher.get();

        assert.notStrictEqual(languageServer, undefined);
    });

    test(`If the interpreter changed, the existing language server should be stopped if there is one`, async () => {
        const getActiveInterpreterStub = sandbox.stub();
        getActiveInterpreterStub.onFirstCall().returns('python');
        getActiveInterpreterStub.onSecondCall().returns('other/python');

        const interpreterService = ({
            getActiveInterpreter: getActiveInterpreterStub,
            onDidChangeInterpreterInformation: () => {
                /* do nothing */
            },
        } as unknown) as IInterpreterService;

        watcher = new LanguageServerWatcher(
            ({
                get: () => {
                    /* do nothing */
                },
            } as unknown) as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            interpreterService,
            ({
                onDidEnvironmentVariablesChange: () => {
                    /* do nothing */
                },
            } as unknown) as IEnvironmentVariablesProvider,
            ({
                isTrusted: true,
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();

        // First start, get the reference to the extension manager.
        await watcher.startLanguageServer(LanguageServerType.None);

        // For None case the object implements both ILanguageServer and ILanguageServerManager.
        const extensionManager = (await watcher.get()) as ILanguageServerExtensionManager;
        const stopLanguageServerSpy = sandbox.spy(extensionManager, 'stopLanguageServer');

        // Second start, check if the first server manager was stopped and disposed of.
        await watcher.startLanguageServer(LanguageServerType.None);

        assert.ok(stopLanguageServerSpy.calledOnce);
    });

    test(`When starting the language server, if the language server can be started, it should call startLanguageServer on the language server extension manager`, async () => {
        const startLanguageServerStub = sandbox.stub(NoneLSExtensionManager.prototype, 'startLanguageServer');
        startLanguageServerStub.returns(Promise.resolve());

        await watcher.startLanguageServer(LanguageServerType.None);

        assert.ok(startLanguageServerStub.calledOnce);
    });

    test(`When starting the language server, if the language server can be started, there should be logs written in the output channel`, async () => {
        let output = '';
        sandbox.stub(Logging, 'traceLog').callsFake((...args: unknown[]) => {
            output = output.concat(...(args as string[]));
        });

        watcher = new LanguageServerWatcher(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => ({ folderUri: Uri.parse('workspace') }),
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            ({
                getActiveInterpreter: () => 'python',
                onDidChangeInterpreterInformation: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            ({
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();

        await watcher.startLanguageServer(LanguageServerType.None);

        assert.strictEqual(output, LanguageService.startingNone);
    });

    test(`When starting the language server, if the language server can be started, this.languageServerType should reflect the new language server type`, async () => {
        await watcher.startLanguageServer(LanguageServerType.None);

        assert.deepStrictEqual(watcher.languageServerType, LanguageServerType.None);
    });

    test(`When starting the language server, if the language server cannot be started, it should call languageServerNotAvailable`, async () => {
        const canStartLanguageServerStub = sandbox.stub(NoneLSExtensionManager.prototype, 'canStartLanguageServer');
        canStartLanguageServerStub.returns(false);
        const languageServerNotAvailableStub = sandbox.stub(
            NoneLSExtensionManager.prototype,
            'languageServerNotAvailable',
        );
        languageServerNotAvailableStub.returns(Promise.resolve());

        await watcher.startLanguageServer(LanguageServerType.None);

        assert.ok(canStartLanguageServerStub.calledOnce);
        assert.ok(languageServerNotAvailableStub.calledOnce);
    });

    test('When the config settings change, but the python.languageServer setting is not affected, the watcher should not restart the language server', async () => {
        let onDidChangeConfigListener: (event: ConfigurationChangeEvent) => Promise<void> = () => Promise.resolve();

        const workspaceService = ({
            getWorkspaceFolder: (uri: Uri) => ({ uri }),
            onDidChangeConfiguration: (listener: (event: ConfigurationChangeEvent) => Promise<void>) => {
                onDidChangeConfigListener = listener;
            },
            onDidChangeWorkspaceFolders: () => {
                /* do nothing */
            },
        } as unknown) as IWorkspaceService;

        watcher = new LanguageServerWatcher(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            ({
                getActiveInterpreter: () => 'python',
                onDidChangeInterpreterInformation: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            workspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();
        const startLanguageServerSpy = sandbox.spy(watcher, 'startLanguageServer');

        await watcher.startLanguageServer(LanguageServerType.None);

        await onDidChangeConfigListener({ affectsConfiguration: () => false });

        // Check that startLanguageServer was only called once: When we called it above.
        assert.ok(startLanguageServerSpy.calledOnce);
    });

    test('When the config settings change, and the python.languageServer setting is affected, the watcher should restart the language server', async () => {
        let onDidChangeConfigListener: (event: ConfigurationChangeEvent) => Promise<void> = () => Promise.resolve();

        const workspaceService = ({
            getWorkspaceFolder: (uri: Uri) => ({ uri }),
            onDidChangeConfiguration: (listener: (event: ConfigurationChangeEvent) => Promise<void>) => {
                onDidChangeConfigListener = listener;
            },
            onDidChangeWorkspaceFolders: () => {
                /* do nothing */
            },
            workspaceFolders: [{ uri: Uri.parse('workspace') }],
        } as unknown) as IWorkspaceService;

        const getSettingsStub = sandbox.stub();
        getSettingsStub.onFirstCall().returns({ languageServer: LanguageServerType.None });
        getSettingsStub.onSecondCall().returns({ languageServer: LanguageServerType.Node });

        const configService = ({
            getSettings: getSettingsStub,
        } as unknown) as IConfigurationService;

        watcher = new LanguageServerWatcher(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            configService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            ({
                getActiveInterpreter: () => 'python',
                onDidChangeInterpreterInformation: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            workspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();

        // Use a fake here so we don't actually start up language servers.
        const startLanguageServerFake = sandbox.fake.resolves(undefined);
        sandbox.replace(watcher, 'startLanguageServer', startLanguageServerFake);
        await watcher.startLanguageServer(LanguageServerType.None);

        await onDidChangeConfigListener({ affectsConfiguration: () => true });

        // Check that startLanguageServer was called twice: When we called it above, and implicitly because of the event.
        assert.ok(startLanguageServerFake.calledTwice);
    });

    test('When starting a language server with a Python 2.7 interpreter and the python.languageServer setting is Jedi, do not instantiate a language server', async () => {
        const startLanguageServerStub = sandbox.stub(NoneLSExtensionManager.prototype, 'startLanguageServer');
        startLanguageServerStub.returns(Promise.resolve());

        watcher = new LanguageServerWatcher(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.Jedi }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            ({
                getActiveInterpreter: () => ({ version: { major: 2, minor: 7 } }),
                onDidChangeInterpreterInformation: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            ({
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();
        await watcher.startLanguageServer(LanguageServerType.Jedi);

        assert.ok(startLanguageServerStub.calledOnce);
    });

    test('When starting a language server with a Python 2.7 interpreter and the python.languageServer setting is default, use Pylance', async () => {
        const startLanguageServerStub = sandbox.stub(PylanceLSExtensionManager.prototype, 'startLanguageServer');
        startLanguageServerStub.returns(Promise.resolve());

        sandbox.stub(PylanceLSExtensionManager.prototype, 'canStartLanguageServer').returns(true);

        watcher = new LanguageServerWatcher(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({
                    languageServer: LanguageServerType.Jedi,
                    languageServerIsDefault: true,
                }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            ({
                getActiveInterpreter: () => ({ version: { major: 2, minor: 7 } }),
                onDidChangeInterpreterInformation: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            ({
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            ({
                showWarningMessage: () => Promise.resolve(undefined),
            } as unknown) as IApplicationShell,
            disposables,
        );
        watcher.register();

        await watcher.startLanguageServer(LanguageServerType.Node);

        assert.ok(startLanguageServerStub.calledOnce);
    });

    test('When starting a language server in an untrusted workspace with Jedi, do not instantiate a language server', async () => {
        const startLanguageServerStub = sandbox.stub(NoneLSExtensionManager.prototype, 'startLanguageServer');
        startLanguageServerStub.returns(Promise.resolve());

        watcher = new LanguageServerWatcher(
            {} as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.Jedi }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            ({
                getActiveInterpreter: () => ({ version: { major: 2, minor: 7 } }),
                onDidChangeInterpreterInformation: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterService,
            {} as IEnvironmentVariablesProvider,
            ({
                isTrusted: false,
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();

        await watcher.startLanguageServer(LanguageServerType.Jedi);

        assert.ok(startLanguageServerStub.calledOnce);
    });

    [
        {
            languageServer: LanguageServerType.Jedi,
            multiLS: true,
            extensionLSCls: JediLSExtensionManager,
            lsManagerCls: JediLanguageServerManager,
        },
        {
            languageServer: LanguageServerType.Node,
            multiLS: false,
            extensionLSCls: PylanceLSExtensionManager,
            lsManagerCls: NodeLanguageServerManager,
        },
        {
            languageServer: LanguageServerType.None,
            multiLS: false,
            extensionLSCls: NoneLSExtensionManager,
            lsManagerCls: undefined,
        },
    ].forEach(({ languageServer, multiLS, extensionLSCls, lsManagerCls }) => {
        test(`When starting language servers with different resources, ${
            multiLS ? 'multiple' : 'a single'
        } language server${multiLS ? 's' : ''} should be instantiated when using ${languageServer}`, async () => {
            const getActiveInterpreterStub = sandbox.stub();
            getActiveInterpreterStub.onFirstCall().returns({ path: 'folder1/python', version: { major: 3, minor: 9 } });
            getActiveInterpreterStub
                .onSecondCall()
                .returns({ path: 'folder2/python', version: { major: 3, minor: 10 } });
            const startLanguageServerStub = sandbox.stub(extensionLSCls.prototype, 'startLanguageServer');
            startLanguageServerStub.returns(Promise.resolve());
            const stopLanguageServerStub = sandbox.stub(extensionLSCls.prototype, 'stopLanguageServer');
            sandbox.stub(extensionLSCls.prototype, 'canStartLanguageServer').returns(true);

            watcher = new LanguageServerWatcher(
                {} as IServiceContainer,
                {} as ILanguageServerOutputChannel,
                {
                    getSettings: () => ({ languageServer }),
                } as IConfigurationService,
                {} as IExperimentService,
                ({
                    getActiveWorkspaceUri: () => undefined,
                } as unknown) as IInterpreterHelper,
                ({
                    onDidChange: () => {
                        /* do nothing */
                    },
                } as unknown) as IInterpreterPathService,
                ({
                    getActiveInterpreter: getActiveInterpreterStub,
                    onDidChangeInterpreterInformation: () => {
                        /* do nothing */
                    },
                } as unknown) as IInterpreterService,
                {} as IEnvironmentVariablesProvider,
                ({
                    isTrusted: true,
                    getWorkspaceFolder: (uri: Uri) => ({ uri }),
                    onDidChangeConfiguration: () => {
                        /* do nothing */
                    },
                    onDidChangeWorkspaceFolders: () => {
                        /* do nothing */
                    },
                } as unknown) as IWorkspaceService,
                ({
                    registerCommand: () => {
                        /* do nothing */
                    },
                } as unknown) as ICommandManager,
                {} as IFileSystem,
                ({
                    getExtension: () => undefined,
                    onDidChange: () => {
                        /* do nothing */
                    },
                } as unknown) as IExtensions,
                ({
                    showWarningMessage: () => Promise.resolve(undefined),
                } as unknown) as IApplicationShell,
                disposables,
            );
            watcher.register();

            await watcher.startLanguageServer(languageServer, Uri.parse('folder1'));
            await watcher.startLanguageServer(languageServer, Uri.parse('folder2'));

            // If multiLS set to true, then we expect to have called startLanguageServer twice.
            // If multiLS set to false, then we expect to have called startLanguageServer once.
            assert.ok(startLanguageServerStub.calledTwice === multiLS);
            assert.ok(startLanguageServerStub.calledOnce === !multiLS);
            assert.ok(getActiveInterpreterStub.calledTwice);
            assert.ok(stopLanguageServerStub.notCalled);
        });

        test(`${languageServer} language server(s) should ${
            multiLS ? '' : 'not'
        } be stopped if a workspace gets removed from the current project`, async () => {
            sandbox.stub(extensionLSCls.prototype, 'startLanguageServer').returns(Promise.resolve());
            if (lsManagerCls) {
                sandbox.stub(lsManagerCls.prototype, 'dispose').returns();
            }

            const stopLanguageServerStub = sandbox.stub(extensionLSCls.prototype, 'stopLanguageServer');
            stopLanguageServerStub.returns(Promise.resolve());

            let onDidChangeWorkspaceFoldersListener: (event: WorkspaceFoldersChangeEvent) => Promise<void> = () =>
                Promise.resolve();

            const workspaceService = ({
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: (listener: (event: WorkspaceFoldersChangeEvent) => Promise<void>) => {
                    onDidChangeWorkspaceFoldersListener = listener;
                },
                workspaceFolders: [{ uri: Uri.parse('workspace1') }, { uri: Uri.parse('workspace2') }],
                isTrusted: true,
            } as unknown) as IWorkspaceService;

            watcher = new LanguageServerWatcher(
                {} as IServiceContainer,
                {} as ILanguageServerOutputChannel,
                {
                    getSettings: () => ({ languageServer }),
                } as IConfigurationService,
                {} as IExperimentService,
                ({
                    getActiveWorkspaceUri: () => undefined,
                } as unknown) as IInterpreterHelper,
                ({
                    onDidChange: () => {
                        /* do nothing */
                    },
                } as unknown) as IInterpreterPathService,
                ({
                    getActiveInterpreter: () => ({ version: { major: 3, minor: 7 } }),
                    onDidChangeInterpreterInformation: () => {
                        /* do nothing */
                    },
                } as unknown) as IInterpreterService,
                {} as IEnvironmentVariablesProvider,
                workspaceService,
                ({
                    registerCommand: () => {
                        /* do nothing */
                    },
                } as unknown) as ICommandManager,
                {} as IFileSystem,
                ({
                    getExtension: () => undefined,
                    onDidChange: () => {
                        /* do nothing */
                    },
                } as unknown) as IExtensions,
                ({
                    showWarningMessage: () => Promise.resolve(undefined),
                } as unknown) as IApplicationShell,
                disposables,
            );
            watcher.register();

            await watcher.startLanguageServer(languageServer, Uri.parse('workspace1'));
            await watcher.startLanguageServer(languageServer, Uri.parse('workspace2'));

            await onDidChangeWorkspaceFoldersListener({
                added: [],
                removed: [{ uri: Uri.parse('workspace2') } as WorkspaceFolder],
            });

            // If multiLS set to true, then we expect to have stopped a language server.
            // If multiLS set to false, then we expect to not have stopped a language server.
            assert.ok(stopLanguageServerStub.calledOnce === multiLS);
            assert.ok(stopLanguageServerStub.notCalled === !multiLS);
        });
    });

    test('The language server should be restarted if the interpreter info changed', async () => {
        const info = ({
            envPath: 'foo',
            path: 'path/to/foo/bin/python',
        } as unknown) as PythonEnvironment;

        let onDidChangeInfoListener: (event: PythonEnvironment) => Promise<void> = () => Promise.resolve();

        const interpreterService = ({
            onDidChangeInterpreterInformation: (
                listener: (event: PythonEnvironment) => Promise<void>,
                thisArg: unknown,
            ): void => {
                onDidChangeInfoListener = listener.bind(thisArg);
            },
            getActiveInterpreter: () => ({
                envPath: 'foo',
                path: 'path/to/foo',
            }),
        } as unknown) as IInterpreterService;

        watcher = new LanguageServerWatcher(
            ({
                get: () => {
                    /* do nothing */
                },
            } as unknown) as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            interpreterService,
            ({
                onDidEnvironmentVariablesChange: () => {
                    /* do nothing */
                },
            } as unknown) as IEnvironmentVariablesProvider,
            ({
                isTrusted: true,
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();

        const startLanguageServerSpy = sandbox.spy(watcher, 'startLanguageServer');

        await watcher.startLanguageServer(LanguageServerType.None);

        await onDidChangeInfoListener(info);

        // Check that startLanguageServer was called twice: Once above, and once after the interpreter info changed.
        assert.ok(startLanguageServerSpy.calledTwice);
    });

    test('The language server should not be restarted if the interpreter info did not change', async () => {
        const info = ({
            envPath: 'foo',
            path: 'path/to/foo',
        } as unknown) as PythonEnvironment;

        let onDidChangeInfoListener: (event: PythonEnvironment) => Promise<void> = () => Promise.resolve();

        const interpreterService = ({
            onDidChangeInterpreterInformation: (
                listener: (event: PythonEnvironment) => Promise<void>,
                thisArg: unknown,
            ): void => {
                onDidChangeInfoListener = listener.bind(thisArg);
            },
            getActiveInterpreter: () => info,
        } as unknown) as IInterpreterService;

        watcher = new LanguageServerWatcher(
            ({
                get: () => {
                    /* do nothing */
                },
            } as unknown) as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            interpreterService,
            ({
                onDidEnvironmentVariablesChange: () => {
                    /* do nothing */
                },
            } as unknown) as IEnvironmentVariablesProvider,
            ({
                isTrusted: true,
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();

        const startLanguageServerSpy = sandbox.spy(watcher, 'startLanguageServer');

        await watcher.startLanguageServer(LanguageServerType.None);

        await onDidChangeInfoListener(info);

        // Check that startLanguageServer was called once: Only when startLanguageServer() was called above.
        assert.ok(startLanguageServerSpy.calledOnce);
    });

    test('The language server should not be restarted if the interpreter info changed but the env path is an empty string', async () => {
        const info = ({
            envPath: '',
            path: 'path/to/foo',
        } as unknown) as PythonEnvironment;

        let onDidChangeInfoListener: (event: PythonEnvironment) => Promise<void> = () => Promise.resolve();

        const interpreterService = ({
            onDidChangeInterpreterInformation: (
                listener: (event: PythonEnvironment) => Promise<void>,
                thisArg: unknown,
            ): void => {
                onDidChangeInfoListener = listener.bind(thisArg);
            },
            getActiveInterpreter: () => ({
                envPath: 'foo',
                path: 'path/to/foo',
            }),
        } as unknown) as IInterpreterService;

        watcher = new LanguageServerWatcher(
            ({
                get: () => {
                    /* do nothing */
                },
            } as unknown) as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            interpreterService,
            ({
                onDidEnvironmentVariablesChange: () => {
                    /* do nothing */
                },
            } as unknown) as IEnvironmentVariablesProvider,
            ({
                isTrusted: true,
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();

        const startLanguageServerSpy = sandbox.spy(watcher, 'startLanguageServer');

        await watcher.startLanguageServer(LanguageServerType.None);

        await onDidChangeInfoListener(info);

        // Check that startLanguageServer was called once: Only when startLanguageServer() was called above.
        assert.ok(startLanguageServerSpy.calledOnce);
    });

    test('The language server should not be restarted if the interpreter info changed but the env path is undefined', async () => {
        const info = ({
            envPath: undefined,
            path: 'path/to/foo',
        } as unknown) as PythonEnvironment;

        let onDidChangeInfoListener: (event: PythonEnvironment) => Promise<void> = () => Promise.resolve();

        const interpreterService = ({
            onDidChangeInterpreterInformation: (
                listener: (event: PythonEnvironment) => Promise<void>,
                thisArg: unknown,
            ): void => {
                onDidChangeInfoListener = listener.bind(thisArg);
            },
            getActiveInterpreter: () => ({
                envPath: 'foo',
                path: 'path/to/foo',
            }),
        } as unknown) as IInterpreterService;

        watcher = new LanguageServerWatcher(
            ({
                get: () => {
                    /* do nothing */
                },
            } as unknown) as IServiceContainer,
            {} as ILanguageServerOutputChannel,
            {
                getSettings: () => ({ languageServer: LanguageServerType.None }),
            } as IConfigurationService,
            {} as IExperimentService,
            ({
                getActiveWorkspaceUri: () => undefined,
            } as unknown) as IInterpreterHelper,
            ({
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IInterpreterPathService,
            interpreterService,
            ({
                onDidEnvironmentVariablesChange: () => {
                    /* do nothing */
                },
            } as unknown) as IEnvironmentVariablesProvider,
            ({
                isTrusted: true,
                getWorkspaceFolder: (uri: Uri) => ({ uri }),
                onDidChangeConfiguration: () => {
                    /* do nothing */
                },
                onDidChangeWorkspaceFolders: () => {
                    /* do nothing */
                },
            } as unknown) as IWorkspaceService,
            ({
                registerCommand: () => {
                    /* do nothing */
                },
            } as unknown) as ICommandManager,
            {} as IFileSystem,
            ({
                getExtension: () => undefined,
                onDidChange: () => {
                    /* do nothing */
                },
            } as unknown) as IExtensions,
            {} as IApplicationShell,
            disposables,
        );
        watcher.register();

        const startLanguageServerSpy = sandbox.spy(watcher, 'startLanguageServer');

        await watcher.startLanguageServer(LanguageServerType.None);

        await onDidChangeInfoListener(info);

        // Check that startLanguageServer was called once: Only when startLanguageServer() was called above.
        assert.ok(startLanguageServerSpy.calledOnce);
    });
});
