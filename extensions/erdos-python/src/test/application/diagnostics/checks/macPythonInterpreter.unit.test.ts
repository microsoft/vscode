// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as typemoq from 'typemoq';
import { BaseDiagnosticsService } from '../../../../client/application/diagnostics/base';
import {
    InvalidMacPythonInterpreterDiagnostic,
    InvalidMacPythonInterpreterService,
} from '../../../../client/application/diagnostics/checks/macPythonInterpreter';
import { CommandOption, IDiagnosticsCommandFactory } from '../../../../client/application/diagnostics/commands/types';
import { DiagnosticCodes } from '../../../../client/application/diagnostics/constants';
import {
    DiagnosticCommandPromptHandlerServiceId,
    MessageCommandPrompt,
} from '../../../../client/application/diagnostics/promptHandler';
import {
    DiagnosticScope,
    IDiagnostic,
    IDiagnosticCommand,
    IDiagnosticFilterService,
    IDiagnosticHandlerService,
    IDiagnosticsService,
} from '../../../../client/application/diagnostics/types';
import { CommandsWithoutArgs } from '../../../../client/common/application/commands';
import { IWorkspaceService } from '../../../../client/common/application/types';
import { IPlatformService } from '../../../../client/common/platform/types';
import {
    IConfigurationService,
    IDisposableRegistry,
    IInterpreterPathService,
    InterpreterConfigurationScope,
    IPythonSettings,
} from '../../../../client/common/types';
import { sleep } from '../../../../client/common/utils/async';
import { noop } from '../../../../client/common/utils/misc';
import { IInterpreterHelper } from '../../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../../client/ioc/types';

suite('Application Diagnostics - Checks Mac Python Interpreter', () => {
    let diagnosticService: IDiagnosticsService;
    let messageHandler: typemoq.IMock<IDiagnosticHandlerService<MessageCommandPrompt>>;
    let commandFactory: typemoq.IMock<IDiagnosticsCommandFactory>;
    let settings: typemoq.IMock<IPythonSettings>;
    let platformService: typemoq.IMock<IPlatformService>;
    let helper: typemoq.IMock<IInterpreterHelper>;
    let filterService: typemoq.IMock<IDiagnosticFilterService>;
    let interpreterPathService: typemoq.IMock<IInterpreterPathService>;
    const pythonPath = 'My Python Path in Settings';
    let serviceContainer: typemoq.IMock<IServiceContainer>;
    function createContainer() {
        serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
        messageHandler = typemoq.Mock.ofType<IDiagnosticHandlerService<MessageCommandPrompt>>();
        serviceContainer
            .setup((s) =>
                s.get(
                    typemoq.It.isValue(IDiagnosticHandlerService),
                    typemoq.It.isValue(DiagnosticCommandPromptHandlerServiceId),
                ),
            )
            .returns(() => messageHandler.object);
        commandFactory = typemoq.Mock.ofType<IDiagnosticsCommandFactory>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IDiagnosticsCommandFactory)))
            .returns(() => commandFactory.object);
        settings = typemoq.Mock.ofType<IPythonSettings>();
        settings.setup((s) => s.pythonPath).returns(() => pythonPath);
        const configService = typemoq.Mock.ofType<IConfigurationService>();
        configService.setup((c) => c.getSettings(typemoq.It.isAny())).returns(() => settings.object);
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IConfigurationService)))
            .returns(() => configService.object);
        platformService = typemoq.Mock.ofType<IPlatformService>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IPlatformService)))
            .returns(() => platformService.object);
        helper = typemoq.Mock.ofType<IInterpreterHelper>();
        serviceContainer.setup((s) => s.get(typemoq.It.isValue(IInterpreterHelper))).returns(() => helper.object);
        serviceContainer.setup((s) => s.get(typemoq.It.isValue(IDisposableRegistry))).returns(() => []);
        filterService = typemoq.Mock.ofType<IDiagnosticFilterService>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IDiagnosticFilterService)))
            .returns(() => filterService.object);

        interpreterPathService = typemoq.Mock.ofType<IInterpreterPathService>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IInterpreterPathService)))
            .returns(() => interpreterPathService.object);
        platformService
            .setup((p) => p.isMac)
            .returns(() => true)
            .verifiable(typemoq.Times.once());
        return serviceContainer.object;
    }
    suite('Diagnostics', () => {
        setup(() => {
            diagnosticService = new (class extends InvalidMacPythonInterpreterService {
                public _clear() {
                    while (BaseDiagnosticsService.handledDiagnosticCodeKeys.length > 0) {
                        BaseDiagnosticsService.handledDiagnosticCodeKeys.shift();
                    }
                }
                protected addPythonPathChangedHandler() {
                    noop();
                }
            })(createContainer(), [], platformService.object, helper.object);
            (diagnosticService as any)._clear();
        });

        test('Can handle InvalidPythonPathInterpreter diagnostics', async () => {
            for (const code of [DiagnosticCodes.MacInterpreterSelected]) {
                const diagnostic = typemoq.Mock.ofType<IDiagnostic>();
                diagnostic
                    .setup((d) => d.code)
                    .returns(() => code)
                    .verifiable(typemoq.Times.atLeastOnce());

                const canHandle = await diagnosticService.canHandle(diagnostic.object);
                expect(canHandle).to.be.equal(true, `Should be able to handle ${code}`);
                diagnostic.verifyAll();
            }
        });
        test('Can not handle non-InvalidPythonPathInterpreter diagnostics', async () => {
            const diagnostic = typemoq.Mock.ofType<IDiagnostic>();
            diagnostic
                .setup((d) => d.code)
                .returns(() => 'Something Else' as any)
                .verifiable(typemoq.Times.atLeastOnce());

            const canHandle = await diagnosticService.canHandle(diagnostic.object);
            expect(canHandle).to.be.equal(false, 'Invalid value');
            diagnostic.verifyAll();
        });
        test('Should return empty diagnostics if not a Mac', async () => {
            platformService.reset();
            platformService
                .setup((p) => p.isMac)
                .returns(() => true)
                .verifiable(typemoq.Times.once());

            const diagnostics = await diagnosticService.diagnose(undefined);
            expect(diagnostics).to.be.deep.equal([]);
            platformService.verifyAll();
        });
        test('Should return empty diagnostics if platform is mac and selected interpreter is not default mac interpreter', async () => {
            platformService
                .setup((i) => i.isMac)
                .returns(() => true)
                .verifiable(typemoq.Times.once());
            helper
                .setup((i) => i.isMacDefaultPythonPath(typemoq.It.isAny()))
                .returns(() => Promise.resolve(false))
                .verifiable(typemoq.Times.once());

            const diagnostics = await diagnosticService.diagnose(undefined);
            expect(diagnostics).to.be.deep.equal([]);
            settings.verifyAll();
            platformService.verifyAll();
            helper.verifyAll();
        });
        test('Should return diagnostic if platform is mac and selected interpreter is default mac interpreter', async () => {
            platformService
                .setup((i) => i.isMac)
                .returns(() => true)
                .verifiable(typemoq.Times.once());
            helper
                .setup((i) => i.isMacDefaultPythonPath(typemoq.It.isValue(pythonPath)))
                .returns(() => Promise.resolve(true))
                .verifiable(typemoq.Times.atLeastOnce());

            const diagnostics = await diagnosticService.diagnose(undefined);
            expect(diagnostics).to.be.deep.equal(
                [new InvalidMacPythonInterpreterDiagnostic(DiagnosticCodes.MacInterpreterSelected, undefined)],
                'not the same',
            );
        });
        test('Handling no interpreters diagnostic should return select interpreter cmd', async () => {
            const diagnostic = new InvalidMacPythonInterpreterDiagnostic(
                DiagnosticCodes.MacInterpreterSelected,
                undefined,
            );
            const cmd = ({} as any) as IDiagnosticCommand;
            const cmdIgnore = ({} as any) as IDiagnosticCommand;
            let messagePrompt: MessageCommandPrompt | undefined;
            messageHandler
                .setup((i) => i.handle(typemoq.It.isValue(diagnostic), typemoq.It.isAny()))
                .callback((_d, p: MessageCommandPrompt) => (messagePrompt = p))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());
            commandFactory
                .setup((f) =>
                    f.createCommand(
                        typemoq.It.isAny(),
                        typemoq.It.isObjectWith<CommandOption<'executeVSCCommand', CommandsWithoutArgs>>({
                            type: 'executeVSCCommand',
                        }),
                    ),
                )
                .returns(() => cmd)
                .verifiable(typemoq.Times.once());
            commandFactory
                .setup((f) =>
                    f.createCommand(
                        typemoq.It.isAny(),
                        typemoq.It.isObjectWith<CommandOption<'ignore', DiagnosticScope>>({
                            type: 'ignore',
                            options: DiagnosticScope.Global,
                        }),
                    ),
                )
                .returns(() => cmdIgnore)
                .verifiable(typemoq.Times.once());

            await diagnosticService.handle([diagnostic]);

            messageHandler.verifyAll();
            commandFactory.verifyAll();
            expect(messagePrompt).not.be.equal(undefined, 'Message prompt not set');
            expect(messagePrompt!.commandPrompts).to.be.deep.equal([
                { prompt: 'Select Python Interpreter', command: cmd },
                { prompt: "Don't show again", command: cmdIgnore },
            ]);
        });
        test('Should not display a message if No Interpreters diagnostic has been ignored', async () => {
            const diagnostic = new InvalidMacPythonInterpreterDiagnostic(
                DiagnosticCodes.MacInterpreterSelected,
                undefined,
            );

            filterService
                .setup((f) => f.shouldIgnoreDiagnostic(typemoq.It.isValue(DiagnosticCodes.MacInterpreterSelected)))
                .returns(() => Promise.resolve(true))
                .verifiable(typemoq.Times.once());
            commandFactory
                .setup((f) => f.createCommand(typemoq.It.isAny(), typemoq.It.isAny()))
                .verifiable(typemoq.Times.never());
            messageHandler
                .setup((f) => f.handle(typemoq.It.isAny(), typemoq.It.isAny()))
                .verifiable(typemoq.Times.never());

            await diagnosticService.handle([diagnostic]);

            messageHandler.verifyAll();
            filterService.verifyAll();
            commandFactory.verifyAll();
        });
    });

    suite('Change Handlers.', () => {
        test('Add PythonPath handler is invoked', async () => {
            let invoked = false;
            diagnosticService = new (class extends InvalidMacPythonInterpreterService {
                protected addPythonPathChangedHandler() {
                    invoked = true;
                }
            })(createContainer(), [], platformService.object, helper.object);

            expect(invoked).to.be.equal(true, 'Not invoked');
        });
        test('Diagnostics are checked with correct interpreter config uri when path changes', async () => {
            const event = typemoq.Mock.ofType<InterpreterConfigurationScope>();
            const workspaceService = typemoq.Mock.ofType<IWorkspaceService>();
            const serviceContainerObject = createContainer();
            let diagnoseInvocationCount = 0;
            workspaceService
                .setup((w) => w.workspaceFolders)
                .returns(() => [{ uri: '' }] as any)
                .verifiable(typemoq.Times.once());
            serviceContainer
                .setup((s) => s.get(typemoq.It.isValue(IWorkspaceService)))
                .returns(() => workspaceService.object);

            const diagnosticSvc = new (class extends InvalidMacPythonInterpreterService {
                constructor(arg1: IServiceContainer, arg3: IPlatformService, arg4: IInterpreterHelper) {
                    super(arg1, [], arg3, arg4);
                    this.changeThrottleTimeout = 1;
                }
                public onDidChangeConfigurationEx = (e: InterpreterConfigurationScope) =>
                    super.onDidChangeConfiguration(e);
                public diagnose(): Promise<any> {
                    diagnoseInvocationCount += 1;
                    return Promise.resolve();
                }
            })(
                serviceContainerObject,
                typemoq.Mock.ofType<IPlatformService>().object,
                typemoq.Mock.ofType<IInterpreterHelper>().object,
            );

            await diagnosticSvc.onDidChangeConfigurationEx(event.object);
            event.verifyAll();
            await sleep(100);
            expect(diagnoseInvocationCount).to.be.equal(1, 'Not invoked');

            await diagnosticSvc.onDidChangeConfigurationEx(event.object);
            await sleep(100);
            expect(diagnoseInvocationCount).to.be.equal(2, 'Not invoked');
        });

        test('Diagnostics are checked and throttled when path changes', async () => {
            const event = typemoq.Mock.ofType<InterpreterConfigurationScope>();
            const workspaceService = typemoq.Mock.ofType<IWorkspaceService>();
            const serviceContainerObject = createContainer();
            let diagnoseInvocationCount = 0;
            workspaceService
                .setup((w) => w.workspaceFolders)
                .returns(() => [{ uri: '' }] as any)
                .verifiable(typemoq.Times.once());
            serviceContainer
                .setup((s) => s.get(typemoq.It.isValue(IWorkspaceService)))
                .returns(() => workspaceService.object);

            const diagnosticSvc = new (class extends InvalidMacPythonInterpreterService {
                constructor(arg1: IServiceContainer, arg3: IPlatformService, arg4: IInterpreterHelper) {
                    super(arg1, [], arg3, arg4);
                    this.changeThrottleTimeout = 100;
                }
                public onDidChangeConfigurationEx = (e: InterpreterConfigurationScope) =>
                    super.onDidChangeConfiguration(e);
                public diagnose(): Promise<any> {
                    diagnoseInvocationCount += 1;
                    return Promise.resolve();
                }
            })(
                serviceContainerObject,
                typemoq.Mock.ofType<IPlatformService>().object,
                typemoq.Mock.ofType<IInterpreterHelper>().object,
            );

            await diagnosticSvc.onDidChangeConfigurationEx(event.object);
            await diagnosticSvc.onDidChangeConfigurationEx(event.object);
            await diagnosticSvc.onDidChangeConfigurationEx(event.object);
            await diagnosticSvc.onDidChangeConfigurationEx(event.object);
            await diagnosticSvc.onDidChangeConfigurationEx(event.object);
            await sleep(500);
            expect(diagnoseInvocationCount).to.be.equal(1, 'Not invoked');
        });

        test('Ensure event Handler is registered correctly', async () => {
            let interpreterPathServiceHandler: Function;
            let invoked = false;
            const workspaceService = { onDidChangeConfiguration: noop } as any;
            const serviceContainerObject = createContainer();

            interpreterPathService
                .setup((d) => d.onDidChange(typemoq.It.isAny(), typemoq.It.isAny()))
                .callback((cb) => (interpreterPathServiceHandler = cb))
                .returns(() => {
                    return { dispose: noop };
                });

            serviceContainer.setup((s) => s.get(typemoq.It.isValue(IWorkspaceService))).returns(() => workspaceService);

            diagnosticService = new (class extends InvalidMacPythonInterpreterService {
                protected async onDidChangeConfiguration(_i: InterpreterConfigurationScope) {
                    invoked = true;
                }
            })(serviceContainerObject, [], undefined as any, undefined as any);

            expect(interpreterPathServiceHandler!).to.not.equal(undefined, 'Handler not set');
            await interpreterPathServiceHandler!({} as any);
            expect(invoked).to.be.equal(true, 'Not invoked');
        });
    });
});
