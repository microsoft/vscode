// Create test suite and test cases for the `replUtils` module
import * as TypeMoq from 'typemoq';
import { Disposable } from 'vscode';
import * as sinon from 'sinon';
import { expect } from 'chai';
import { IInterpreterService } from '../../client/interpreter/contracts';
import { ICommandManager } from '../../client/common/application/types';
import { ICodeExecutionHelper } from '../../client/terminals/types';
import * as replCommands from '../../client/repl/replCommands';
import * as replUtils from '../../client/repl/replUtils';
import * as nativeRepl from '../../client/repl/nativeRepl';
import { Commands } from '../../client/common/constants';
import { PythonEnvironment } from '../../client/pythonEnvironments/info';

suite('REPL - register native repl command', () => {
    let interpreterService: TypeMoq.IMock<IInterpreterService>;
    let commandManager: TypeMoq.IMock<ICommandManager>;
    let executionHelper: TypeMoq.IMock<ICodeExecutionHelper>;
    let getSendToNativeREPLSettingStub: sinon.SinonStub;
    // @ts-ignore: TS6133
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    let registerCommandSpy: sinon.SinonSpy;
    let executeInTerminalStub: sinon.SinonStub;
    let getNativeReplStub: sinon.SinonStub;
    let disposable: TypeMoq.IMock<Disposable>;
    let disposableArray: Disposable[] = [];

    setup(() => {
        interpreterService = TypeMoq.Mock.ofType<IInterpreterService>();
        commandManager = TypeMoq.Mock.ofType<ICommandManager>();
        executionHelper = TypeMoq.Mock.ofType<ICodeExecutionHelper>();
        commandManager
            .setup((cm) => cm.registerCommand(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()))
            .returns(() => TypeMoq.Mock.ofType<Disposable>().object);

        getSendToNativeREPLSettingStub = sinon.stub(replUtils, 'getSendToNativeREPLSetting');
        getSendToNativeREPLSettingStub.returns(false);
        executeInTerminalStub = sinon.stub(replUtils, 'executeInTerminal');
        executeInTerminalStub.returns(Promise.resolve());
        registerCommandSpy = sinon.spy(commandManager.object, 'registerCommand');
        disposable = TypeMoq.Mock.ofType<Disposable>();
        disposableArray = [disposable.object];
    });

    teardown(() => {
        sinon.restore();
        disposableArray.forEach((d) => {
            if (d) {
                d.dispose();
            }
        });

        disposableArray = [];
    });

    test('Ensure repl command is registered', async () => {
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));

        await replCommands.registerReplCommands(
            disposableArray,
            interpreterService.object,
            executionHelper.object,
            commandManager.object,
        );

        commandManager.verify(
            (c) => c.registerCommand(TypeMoq.It.isAny(), TypeMoq.It.isAny()),
            TypeMoq.Times.atLeastOnce(),
        );
    });

    test('Ensure getSendToNativeREPLSetting is called', async () => {
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));

        let commandHandler: undefined | (() => Promise<void>);
        commandManager
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .setup((c) => c.registerCommand as any)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .returns(() => (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                if (command === Commands.Exec_In_REPL) {
                    commandHandler = callback;
                }
                // eslint-disable-next-line no-void
                return { dispose: () => void 0 };
            });
        replCommands.registerReplCommands(
            disposableArray,
            interpreterService.object,
            executionHelper.object,
            commandManager.object,
        );

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        await commandHandler!();

        sinon.assert.calledOnce(getSendToNativeREPLSettingStub);
    });

    test('Ensure executeInTerminal is called when getSendToNativeREPLSetting returns false', async () => {
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));
        getSendToNativeREPLSettingStub.returns(false);

        let commandHandler: undefined | (() => Promise<void>);
        commandManager
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .setup((c) => c.registerCommand as any)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .returns(() => (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                if (command === Commands.Exec_In_REPL) {
                    commandHandler = callback;
                }
                // eslint-disable-next-line no-void
                return { dispose: () => void 0 };
            });
        replCommands.registerReplCommands(
            disposableArray,
            interpreterService.object,
            executionHelper.object,
            commandManager.object,
        );

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        await commandHandler!();

        sinon.assert.calledOnce(executeInTerminalStub);
    });

    test('Ensure we call getNativeREPL() when interpreter exist', async () => {
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(({ path: 'ps' } as unknown) as PythonEnvironment));
        getSendToNativeREPLSettingStub.returns(true);
        getNativeReplStub = sinon.stub(nativeRepl, 'getNativeRepl');

        let commandHandler: undefined | ((uri: string) => Promise<void>);
        commandManager
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .setup((c) => c.registerCommand as any)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .returns(() => (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                if (command === Commands.Exec_In_REPL) {
                    commandHandler = callback;
                }
                // eslint-disable-next-line no-void
                return { dispose: () => void 0 };
            });
        replCommands.registerReplCommands(
            disposableArray,
            interpreterService.object,
            executionHelper.object,
            commandManager.object,
        );

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        await commandHandler!('uri');
        sinon.assert.calledOnce(getNativeReplStub);
    });

    test('Ensure we do not call getNativeREPL() when interpreter does not exist', async () => {
        getNativeReplStub = sinon.stub(nativeRepl, 'getNativeRepl');
        getSendToNativeREPLSettingStub.returns(true);

        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(undefined));

        let commandHandler: undefined | ((uri: string) => Promise<void>);
        commandManager
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .setup((c) => c.registerCommand as any)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .returns(() => (command: string, callback: (...args: any[]) => any, _thisArg?: any) => {
                if (command === Commands.Exec_In_REPL) {
                    commandHandler = callback;
                }
                // eslint-disable-next-line no-void
                return { dispose: () => void 0 };
            });
        interpreterService
            .setup((i) => i.getActiveInterpreter(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve(undefined));

        replCommands.registerReplCommands(
            disposableArray,
            interpreterService.object,
            executionHelper.object,
            commandManager.object,
        );

        expect(commandHandler).not.to.be.an('undefined', 'Command handler not initialized');

        await commandHandler!('uri');
        sinon.assert.notCalled(getNativeReplStub);
    });
});
