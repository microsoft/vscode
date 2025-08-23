// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { expect } from 'chai';
import * as TypeMoq from 'typemoq';
import * as sinon from 'sinon';
import { Disposable, TextDocument, TextEditor, Uri } from 'vscode';

import { ICommandManager, IDocumentManager, IWorkspaceService } from '../../../client/common/application/types';
import { Commands } from '../../../client/common/constants';
import { IServiceContainer } from '../../../client/ioc/types';
import { CodeExecutionManager } from '../../../client/terminals/codeExecution/codeExecutionManager';
import { ICodeExecutionHelper, ICodeExecutionManager, ICodeExecutionService } from '../../../client/terminals/types';
import { IConfigurationService } from '../../../client/common/types';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { PythonEnvironment } from '../../../client/pythonEnvironments/info';
import * as triggerApis from '../../../client/pythonEnvironments/creation/createEnvironmentTrigger';
import * as extapi from '../../../client/envExt/api.internal';

suite('Terminal - Code Execution Manager', () => {
    let executionManager: ICodeExecutionManager;
    let workspace: TypeMoq.IMock<IWorkspaceService>;
    let commandManager: TypeMoq.IMock<ICommandManager>;
    let disposables: Disposable[] = [];
    let serviceContainer: TypeMoq.IMock<IServiceContainer>;
    let documentManager: TypeMoq.IMock<IDocumentManager>;
    let configService: TypeMoq.IMock<IConfigurationService>;
    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    let triggerCreateEnvironmentCheckNonBlockingStub: sinon.SinonStub;
    let useEnvExtensionStub: sinon.SinonStub;
    setup(() => {
        useEnvExtensionStub = sinon.stub(extapi, 'useEnvExtension');
        useEnvExtensionStub.returns(false);

        workspace = TypeMoq.Mock.ofType<IWorkspaceService>();
        workspace
            .setup((c) => c.onDidChangeWorkspaceFolders(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => {
                return {
                    dispose: () => void 0,
                };
            });
        documentManager = TypeMoq.Mock.ofType<IDocumentManager>();
        commandManager = TypeMoq.Mock.ofType<ICommandManager>(undefined, TypeMoq.MockBehavior.Strict);
        serviceContainer = TypeMoq.Mock.ofType<IServiceContainer>();
        configService = TypeMoq.Mock.ofType<IConfigurationService>();
        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));
        serviceContainer.setup((c) => c.get(IInterpreterService)).returns(() => interpreterService.object);
        executionManager = new CodeExecutionManager(
            commandManager.object,
            documentManager.object,
            disposables,
            configService.object,
            serviceContainer.object,
        );
        triggerCreateEnvironmentCheckNonBlockingStub = sinon.stub(
            triggerApis,
            'triggerCreateEnvironmentCheckNonBlocking',
        );
        triggerCreateEnvironmentCheckNonBlockingStub.returns(undefined);
    });
    teardown(() => {
        sinon.restore();
        disposables.forEach((disposable) => {
            if (disposable) {
                disposable.dispose();
            }
        });

        disposables = [];
    });

    test('Ensure commands are registered', async () => {
        const registered: string[] = [];
        commandManager
            .setup((c) => c.registerCommand)
            .returns(() => {
                return (command: string, _callback: (...args: any[]) => any, _thisArg?: any) => {
                    registered.push(command);
                    return { dispose: () => void 0 };
                };
            });

        executionManager.registerCommands();

        const sorted = registered.sort();
        expect(sorted).to.deep.equal(
            [
                Commands.Exec_In_Separate_Terminal,
                Commands.Exec_In_Terminal,
                Commands.Exec_In_Terminal_Icon,
                Commands.Exec_Selection_In_Django_Shell,
                Commands.Exec_Selection_In_Terminal,
            ].sort(),
        );
    });

    test('Ensure executeFileInterTerminal will do nothing if no file is avialble', async () => {
        let commandHandler: undefined | (() => Promise<void>);
        commandManager
            .setup((c) => c.registerCommand as any)
            .returns(() => {
                return (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                    if (command === Commands.Exec_In_Terminal) {
                        commandHandler = callback;
                    }
                    return { dispose: () => void 0 };
                };
            });
        executionManager.registerCommands();

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        const helper = TypeMoq.Mock.ofType<ICodeExecutionHelper>();
        serviceContainer.setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionHelper))).returns(() => helper.object);

        await commandHandler!();
        helper.verify(async (h) => h.getFileToExecute(), TypeMoq.Times.once());
    });

    test('Ensure executeFileInterTerminal will use provided file', async () => {
        let commandHandler: undefined | ((file: Uri) => Promise<void>);
        commandManager
            .setup((c) => c.registerCommand as any)
            .returns(() => {
                return (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                    if (command === Commands.Exec_In_Terminal) {
                        commandHandler = callback;
                    }
                    return { dispose: () => void 0 };
                };
            });
        executionManager.registerCommands();

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        const helper = TypeMoq.Mock.ofType<ICodeExecutionHelper>();
        serviceContainer.setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionHelper))).returns(() => helper.object);

        const executionService = TypeMoq.Mock.ofType<ICodeExecutionService>();
        serviceContainer
            .setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionService), TypeMoq.It.isValue('standard')))
            .returns(() => executionService.object);

        const fileToExecute = Uri.file('x');
        await commandHandler!(fileToExecute);
        helper.verify(async (h) => h.getFileToExecute(), TypeMoq.Times.never());
        executionService.verify(
            async (e) => e.executeFile(TypeMoq.It.isValue(fileToExecute), TypeMoq.It.isAny()),
            TypeMoq.Times.once(),
        );
    });

    test('Ensure executeFileInterTerminal will use active file', async () => {
        let commandHandler: undefined | ((file: Uri) => Promise<void>);
        commandManager
            .setup((c) => c.registerCommand as any)
            .returns(() => {
                return (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                    if (command === Commands.Exec_In_Terminal) {
                        commandHandler = callback;
                    }
                    return { dispose: () => void 0 };
                };
            });
        executionManager.registerCommands();

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        const fileToExecute = Uri.file('x');
        const helper = TypeMoq.Mock.ofType<ICodeExecutionHelper>();
        serviceContainer.setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionHelper))).returns(() => helper.object);
        helper.setup(async (h) => h.getFileToExecute()).returns(() => Promise.resolve(fileToExecute));
        const executionService = TypeMoq.Mock.ofType<ICodeExecutionService>();
        serviceContainer
            .setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionService), TypeMoq.It.isValue('standard')))
            .returns(() => executionService.object);

        await commandHandler!(fileToExecute);
        executionService.verify(
            async (e) => e.executeFile(TypeMoq.It.isValue(fileToExecute), TypeMoq.It.isAny()),
            TypeMoq.Times.once(),
        );
    });

    async function testExecutionOfSelectionWithoutAnyActiveDocument(commandId: string, executionSericeId: string) {
        let commandHandler: undefined | (() => Promise<void>);
        commandManager
            .setup((c) => c.registerCommand as any)
            .returns(() => {
                return (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                    if (command === commandId) {
                        commandHandler = callback;
                    }
                    return { dispose: () => void 0 };
                };
            });
        executionManager.registerCommands();

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        const helper = TypeMoq.Mock.ofType<ICodeExecutionHelper>();
        serviceContainer.setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionHelper))).returns(() => helper.object);
        const executionService = TypeMoq.Mock.ofType<ICodeExecutionService>();
        serviceContainer
            .setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionService), TypeMoq.It.isValue(executionSericeId)))
            .returns(() => executionService.object);
        documentManager.setup((d) => d.activeTextEditor).returns(() => undefined);

        await commandHandler!();
        executionService.verify(async (e) => e.execute(TypeMoq.It.isAny()), TypeMoq.Times.never());
    }

    test('Ensure executeSelectionInTerminal will do nothing if theres no active document', async () => {
        await testExecutionOfSelectionWithoutAnyActiveDocument(Commands.Exec_Selection_In_Terminal, 'standard');
    });

    test('Ensure executeSelectionInDjangoShell will do nothing if theres no active document', async () => {
        await testExecutionOfSelectionWithoutAnyActiveDocument(Commands.Exec_Selection_In_Django_Shell, 'djangoShell');
    });

    async function testExecutionOfSlectionWithoutAnythingSelected(commandId: string, executionServiceId: string) {
        let commandHandler: undefined | (() => Promise<void>);
        commandManager
            .setup((c) => c.registerCommand as any)
            .returns(() => {
                return (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                    if (command === commandId) {
                        commandHandler = callback;
                    }
                    return { dispose: () => void 0 };
                };
            });
        executionManager.registerCommands();

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        const helper = TypeMoq.Mock.ofType<ICodeExecutionHelper>();
        serviceContainer.setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionHelper))).returns(() => helper.object);
        helper.setup((h) => h.getSelectedTextToExecute).returns(() => () => Promise.resolve(''));
        const executionService = TypeMoq.Mock.ofType<ICodeExecutionService>();
        serviceContainer
            .setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionService), TypeMoq.It.isValue(executionServiceId)))
            .returns(() => executionService.object);
        documentManager
            .setup((d) => d.activeTextEditor)
            .returns(() => {
                return {} as any;
            });

        await commandHandler!();
        executionService.verify(async (e) => e.execute(TypeMoq.It.isAny()), TypeMoq.Times.never());
    }

    test('Ensure executeSelectionInTerminal will do nothing if no text is selected', async () => {
        await testExecutionOfSlectionWithoutAnythingSelected(Commands.Exec_Selection_In_Terminal, 'standard');
    });

    test('Ensure executeSelectionInDjangoShell will do nothing if no text is selected', async () => {
        await testExecutionOfSlectionWithoutAnythingSelected(Commands.Exec_Selection_In_Django_Shell, 'djangoShell');
    });

    async function testExecutionOfSelectionIsSentToTerminal(commandId: string, executionServiceId: string) {
        let commandHandler: undefined | (() => Promise<void>);
        commandManager
            .setup((c) => c.registerCommand as any)
            .returns(() => {
                return (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                    if (command === commandId) {
                        commandHandler = callback;
                    }
                    return { dispose: () => void 0 };
                };
            });
        executionManager.registerCommands();

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        const textSelected = 'abcd';
        const activeDocumentUri = Uri.file('abc');
        const helper = TypeMoq.Mock.ofType<ICodeExecutionHelper>();
        serviceContainer.setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionHelper))).returns(() => helper.object);
        helper.setup((h) => h.getSelectedTextToExecute).returns(() => () => Promise.resolve(textSelected));
        helper
            .setup((h) => h.normalizeLines)
            .returns(() => () => Promise.resolve(textSelected))
            .verifiable(TypeMoq.Times.once());
        const executionService = TypeMoq.Mock.ofType<ICodeExecutionService>();
        serviceContainer
            .setup((s) => s.get(TypeMoq.It.isValue(ICodeExecutionService), TypeMoq.It.isValue(executionServiceId)))
            .returns(() => executionService.object);
        const document = TypeMoq.Mock.ofType<TextDocument>();
        document.setup((d) => d.uri).returns(() => activeDocumentUri);
        const activeEditor = TypeMoq.Mock.ofType<TextEditor>();
        activeEditor.setup((e) => e.document).returns(() => document.object);
        documentManager.setup((d) => d.activeTextEditor).returns(() => activeEditor.object);

        await commandHandler!();
        executionService.verify(
            async (e) => e.execute(TypeMoq.It.isValue(textSelected), TypeMoq.It.isValue(activeDocumentUri)),
            TypeMoq.Times.once(),
        );
        helper.verifyAll();
    }
    test('Ensure executeSelectionInTerminal will normalize selected text and send it to the terminal', async () => {
        await testExecutionOfSelectionIsSentToTerminal(Commands.Exec_Selection_In_Terminal, 'standard');
    });

    test('Ensure executeSelectionInDjangoShell will normalize selected text and send it to the terminal', async () => {
        await testExecutionOfSelectionIsSentToTerminal(Commands.Exec_Selection_In_Django_Shell, 'djangoShell');
    });
});
