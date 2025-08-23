// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as typemoq from 'typemoq';
import { EventEmitter, Uri } from 'vscode';
import { BaseDiagnosticsService } from '../../../../client/application/diagnostics/base';
import {
    DefaultShellDiagnostic,
    InvalidPythonInterpreterDiagnostic,
    InvalidPythonInterpreterService,
} from '../../../../client/application/diagnostics/checks/pythonInterpreter';
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
    IDiagnosticHandlerService,
} from '../../../../client/application/diagnostics/types';
import { CommandsWithoutArgs } from '../../../../client/common/application/commands';
import { ICommandManager, IWorkspaceService } from '../../../../client/common/application/types';
import { Commands } from '../../../../client/common/constants';
import { IFileSystem, IPlatformService } from '../../../../client/common/platform/types';
import { IProcessService, IProcessServiceFactory } from '../../../../client/common/process/types';
import {
    IConfigurationService,
    IDisposable,
    IDisposableRegistry,
    IInterpreterPathService,
    Resource,
} from '../../../../client/common/types';
import { Common } from '../../../../client/common/utils/localize';
import { noop } from '../../../../client/common/utils/misc';
import { IInterpreterService } from '../../../../client/interpreter/contracts';
import { IServiceContainer } from '../../../../client/ioc/types';
import { EnvironmentType, PythonEnvironment } from '../../../../client/pythonEnvironments/info';
import { getOSType, OSType } from '../../../common';
import { sleep } from '../../../core';

suite('Application Diagnostics - Checks Python Interpreter', () => {
    let diagnosticService: InvalidPythonInterpreterService;
    let messageHandler: typemoq.IMock<IDiagnosticHandlerService<MessageCommandPrompt>>;
    let commandFactory: typemoq.IMock<IDiagnosticsCommandFactory>;
    let interpreterService: typemoq.IMock<IInterpreterService>;
    let platformService: typemoq.IMock<IPlatformService>;
    let workspaceService: typemoq.IMock<IWorkspaceService>;
    let commandManager: typemoq.IMock<ICommandManager>;
    let configService: typemoq.IMock<IConfigurationService>;
    let fs: typemoq.IMock<IFileSystem>;
    let serviceContainer: typemoq.IMock<IServiceContainer>;
    let processService: typemoq.IMock<IProcessService>;
    let interpreterPathService: typemoq.IMock<IInterpreterPathService>;
    const oldComSpec = process.env.ComSpec;
    const oldPath = process.env.Path;
    function createContainer() {
        fs = typemoq.Mock.ofType<IFileSystem>();
        fs.setup((f) => f.fileExists(process.env.ComSpec ?? 'exists')).returns(() => Promise.resolve(true));
        serviceContainer = typemoq.Mock.ofType<IServiceContainer>();
        processService = typemoq.Mock.ofType<IProcessService>();
        const processServiceFactory = typemoq.Mock.ofType<IProcessServiceFactory>();
        processServiceFactory.setup((p) => p.create()).returns(() => Promise.resolve(processService.object));
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IProcessServiceFactory)))
            .returns(() => processServiceFactory.object);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        processService.setup((p) => (p as any).then).returns(() => undefined);
        workspaceService = typemoq.Mock.ofType<IWorkspaceService>();
        commandManager = typemoq.Mock.ofType<ICommandManager>();
        serviceContainer.setup((s) => s.get(typemoq.It.isValue(IFileSystem))).returns(() => fs.object);
        serviceContainer.setup((s) => s.get(typemoq.It.isValue(ICommandManager))).returns(() => commandManager.object);
        workspaceService.setup((w) => w.workspaceFile).returns(() => undefined);
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IWorkspaceService)))
            .returns(() => workspaceService.object);
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
        interpreterService = typemoq.Mock.ofType<IInterpreterService>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IInterpreterService)))
            .returns(() => interpreterService.object);
        platformService = typemoq.Mock.ofType<IPlatformService>();
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IPlatformService)))
            .returns(() => platformService.object);
        interpreterPathService = typemoq.Mock.ofType<IInterpreterPathService>();
        interpreterPathService.setup((i) => i.get(typemoq.It.isAny())).returns(() => 'customPython');
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IInterpreterPathService)))
            .returns(() => interpreterPathService.object);
        configService = typemoq.Mock.ofType<IConfigurationService>();
        configService.setup((c) => c.getSettings()).returns(() => ({ pythonPath: 'pythonPath' } as any));
        serviceContainer
            .setup((s) => s.get(typemoq.It.isValue(IConfigurationService)))
            .returns(() => configService.object);
        serviceContainer.setup((s) => s.get(typemoq.It.isValue(IDisposableRegistry))).returns(() => []);
        return serviceContainer.object;
    }
    suite('Diagnostics', () => {
        setup(() => {
            diagnosticService = new (class extends InvalidPythonInterpreterService {
                public _clear() {
                    while (BaseDiagnosticsService.handledDiagnosticCodeKeys.length > 0) {
                        BaseDiagnosticsService.handledDiagnosticCodeKeys.shift();
                    }
                }
                protected addPythonPathChangedHandler() {
                    noop();
                }
            })(createContainer(), []);
            (diagnosticService as any)._clear();
        });

        teardown(() => {
            process.env.ComSpec = oldComSpec;
            process.env.Path = oldPath;
        });

        test('Registers command to trigger environment prompts', async () => {
            let triggerFunction: ((resource: Resource) => Promise<boolean>) | undefined;
            commandManager
                .setup((c) => c.registerCommand(Commands.TriggerEnvironmentSelection, typemoq.It.isAny()))
                .callback((_, cb) => (triggerFunction = cb))
                .returns(() => typemoq.Mock.ofType<IDisposable>().object);
            await diagnosticService.activate();
            expect(triggerFunction).to.not.equal(undefined);
            interpreterService.setup((i) => i.hasInterpreters()).returns(() => Promise.resolve(false));
            let result1 = await triggerFunction!(undefined);
            expect(result1).to.equal(false);

            interpreterService.reset();
            interpreterService.setup((i) => i.hasInterpreters()).returns(() => Promise.resolve(true));
            interpreterService
                .setup((i) => i.getActiveInterpreter(typemoq.It.isAny()))
                .returns(() => Promise.resolve(({ path: 'interpreterpath' } as unknown) as PythonEnvironment));
            const result2 = await triggerFunction!(undefined);
            expect(result2).to.equal(true);
        });

        test('Changes to interpreter configuration triggers environment prompts', async () => {
            commandManager
                .setup((c) => c.registerCommand(Commands.TriggerEnvironmentSelection, typemoq.It.isAny()))
                .returns(() => typemoq.Mock.ofType<IDisposable>().object);
            const interpreterEvent = new EventEmitter<Uri | undefined>();
            interpreterService
                .setup((i) => i.onDidChangeInterpreterConfiguration)
                .returns(() => interpreterEvent.event);
            await diagnosticService.activate();

            commandManager
                .setup((c) => c.executeCommand(Commands.TriggerEnvironmentSelection, undefined))
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.once());

            interpreterEvent.fire(undefined);
            await sleep(1);

            commandManager.verifyAll();
        });

        test('Can handle InvalidPythonPathInterpreter diagnostics', async () => {
            for (const code of [
                DiagnosticCodes.NoPythonInterpretersDiagnostic,
                DiagnosticCodes.InvalidPythonInterpreterDiagnostic,
            ]) {
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

        test('Should return empty diagnostics', async () => {
            const diagnostics = await diagnosticService.diagnose(undefined);
            expect(diagnostics).to.be.deep.equal([], 'not the same');
        });

        test('Should return diagnostics if there are no interpreters and no interpreter has been explicitly set', async () => {
            interpreterPathService.reset();
            interpreterPathService.setup((i) => i.get(typemoq.It.isAny())).returns(() => 'python');
            interpreterService
                .setup((i) => i.hasInterpreters())
                .returns(() => Promise.resolve(false))
                .verifiable(typemoq.Times.once());
            interpreterService
                .setup((i) => i.getInterpreters(undefined))
                .returns(() => [])
                .verifiable(typemoq.Times.once());

            const diagnostics = await diagnosticService._manualDiagnose(undefined);
            expect(diagnostics).to.be.deep.equal(
                [
                    new InvalidPythonInterpreterDiagnostic(
                        DiagnosticCodes.NoPythonInterpretersDiagnostic,
                        undefined,
                        workspaceService.object,
                        DiagnosticScope.Global,
                    ),
                ],
                'not the same',
            );
        });
        test('Should return comspec diagnostics if comspec is configured incorrectly', async function () {
            if (getOSType() !== OSType.Windows) {
                return this.skip();
            }
            // No interpreter should exist if comspec is incorrectly configured.
            interpreterService
                .setup((i) => i.getActiveInterpreter(typemoq.It.isAny()))
                .returns(() => {
                    return Promise.resolve(undefined);
                });
            // Should fail with this error code if comspec is incorrectly configured.
            processService
                .setup((p) => p.shellExec(typemoq.It.isAny(), typemoq.It.isAny()))
                .returns(() => Promise.reject({ errno: -4058 }));
            // Should be set to an invalid value in this case.
            process.env.ComSpec = 'doesNotExist';
            fs.setup((f) => f.fileExists('doesNotExist')).returns(() => Promise.resolve(false));

            const diagnostics = await diagnosticService._manualDiagnose(undefined);
            expect(diagnostics).to.be.deep.equal(
                [new DefaultShellDiagnostic(DiagnosticCodes.InvalidComspecDiagnostic, undefined)],
                'not the same',
            );
        });
        test('Should return incomplete path diagnostics if `Path` variable is incomplete and execution fails', async function () {
            if (getOSType() !== OSType.Windows) {
                return this.skip();
            }
            // No interpreter should exist if execution is failing.
            interpreterService
                .setup((i) => i.getActiveInterpreter(typemoq.It.isAny()))
                .returns(() => {
                    return Promise.resolve(undefined);
                });
            processService
                .setup((p) => p.shellExec(typemoq.It.isAny(), typemoq.It.isAny()))
                .returns(() => Promise.reject({ errno: -4058 }));
            process.env.Path = 'SystemRootDoesNotExist';
            const diagnostics = await diagnosticService._manualDiagnose(undefined);
            expect(diagnostics).to.be.deep.equal(
                [new DefaultShellDiagnostic(DiagnosticCodes.IncompletePathVarDiagnostic, undefined)],
                'not the same',
            );
        });
        test('Should return default shell error diagnostic if execution fails but we do not identify the cause', async function () {
            if (getOSType() !== OSType.Windows) {
                return this.skip();
            }
            // No interpreter should exist if execution is failing.
            interpreterService
                .setup((i) => i.getActiveInterpreter(typemoq.It.isAny()))
                .returns(() => {
                    return Promise.resolve(undefined);
                });
            processService
                .setup((p) => p.shellExec(typemoq.It.isAny(), typemoq.It.isAny()))
                .returns(() => Promise.reject({ errno: -4058 }));
            process.env.Path = 'C:\\Windows\\System32';
            const diagnostics = await diagnosticService._manualDiagnose(undefined);
            expect(diagnostics).to.be.deep.equal(
                [new DefaultShellDiagnostic(DiagnosticCodes.DefaultShellErrorDiagnostic, undefined)],
                'not the same',
            );
        });
        test('Should return invalid interpreter diagnostics on non-Windows if there is no current interpreter and execution fails', async function () {
            if (getOSType() === OSType.Windows) {
                return this.skip();
            }
            interpreterService.setup((i) => i.hasInterpreters()).returns(() => Promise.resolve(false));
            // No interpreter should exist if execution is failing.
            interpreterService
                .setup((i) => i.getActiveInterpreter(typemoq.It.isAny()))
                .returns(() => {
                    return Promise.resolve(undefined);
                });
            processService
                .setup((p) => p.shellExec(typemoq.It.isAny(), typemoq.It.isAny()))
                .returns(() => Promise.reject({ errno: -4058 }));
            const diagnostics = await diagnosticService._manualDiagnose(undefined);
            expect(diagnostics).to.be.deep.equal(
                [
                    new InvalidPythonInterpreterDiagnostic(
                        DiagnosticCodes.InvalidPythonInterpreterDiagnostic,
                        undefined,
                        workspaceService.object,
                    ),
                ],
                'not the same',
            );
        });
        test('Should return invalid interpreter diagnostics if there are interpreters but no current interpreter', async () => {
            interpreterService
                .setup((i) => i.hasInterpreters())
                .returns(() => Promise.resolve(true))
                .verifiable(typemoq.Times.once());
            interpreterService
                .setup((i) => i.getActiveInterpreter(typemoq.It.isAny()))
                .returns(() => {
                    return Promise.resolve(undefined);
                });

            const diagnostics = await diagnosticService._manualDiagnose(undefined);
            expect(diagnostics).to.be.deep.equal(
                [
                    new InvalidPythonInterpreterDiagnostic(
                        DiagnosticCodes.InvalidPythonInterpreterDiagnostic,
                        undefined,
                        workspaceService.object,
                    ),
                ],
                'not the same',
            );
        });
        test('Should return empty diagnostics if there are interpreters and a current interpreter', async () => {
            interpreterService.setup((i) => i.hasInterpreters()).returns(() => Promise.resolve(true));
            interpreterService
                .setup((i) => i.getActiveInterpreter(typemoq.It.isAny()))
                .returns(() => {
                    return Promise.resolve({ envType: EnvironmentType.Unknown } as any);
                });

            const diagnostics = await diagnosticService._manualDiagnose(undefined);
            expect(diagnostics).to.be.deep.equal([], 'not the same');
        });

        test('Handling comspec diagnostic should launch expected browser link', async () => {
            const diagnostic = new DefaultShellDiagnostic(DiagnosticCodes.InvalidComspecDiagnostic, undefined);
            const cmd = ({} as any) as IDiagnosticCommand;
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
                        typemoq.It.isObjectWith<CommandOption<'launch', string>>({
                            type: 'launch',
                            options: 'https://aka.ms/AAk3djo',
                        }),
                    ),
                )
                .returns(() => cmd)
                .verifiable(typemoq.Times.once());

            await diagnosticService.handle([diagnostic]);

            messageHandler.verifyAll();
            commandFactory.verifyAll();
            expect(messagePrompt).not.be.equal(undefined, 'Message prompt not set');
            expect(messagePrompt!.commandPrompts).to.be.deep.equal([
                {
                    prompt: Common.seeInstructions,
                    command: cmd,
                },
            ]);
        });

        test('Handling incomplete path diagnostic should launch expected browser link', async () => {
            const diagnostic = new DefaultShellDiagnostic(DiagnosticCodes.IncompletePathVarDiagnostic, undefined);
            const cmd = ({} as any) as IDiagnosticCommand;
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
                        typemoq.It.isObjectWith<CommandOption<'launch', string>>({
                            type: 'launch',
                            options: 'https://aka.ms/AAk744c',
                        }),
                    ),
                )
                .returns(() => cmd)
                .verifiable(typemoq.Times.once());

            await diagnosticService.handle([diagnostic]);

            messageHandler.verifyAll();
            commandFactory.verifyAll();
            expect(messagePrompt).not.be.equal(undefined, 'Message prompt not set');
            expect(messagePrompt!.commandPrompts).to.be.deep.equal([
                {
                    prompt: Common.seeInstructions,
                    command: cmd,
                },
            ]);
        });

        test('Handling default shell error diagnostic should launch expected browser link', async () => {
            const diagnostic = new DefaultShellDiagnostic(DiagnosticCodes.DefaultShellErrorDiagnostic, undefined);
            const cmd = ({} as any) as IDiagnosticCommand;
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
                        typemoq.It.isObjectWith<CommandOption<'launch', string>>({
                            type: 'launch',
                            options: 'https://aka.ms/AAk7qix',
                        }),
                    ),
                )
                .returns(() => cmd)
                .verifiable(typemoq.Times.once());

            await diagnosticService.handle([diagnostic]);

            messageHandler.verifyAll();
            commandFactory.verifyAll();
            expect(messagePrompt).not.be.equal(undefined, 'Message prompt not set');
            expect(messagePrompt!.commandPrompts).to.be.deep.equal([
                {
                    prompt: Common.seeInstructions,
                    command: cmd,
                },
            ]);
        });

        test('Handling no interpreters diagnostic should return select interpreter cmd', async () => {
            const diagnostic = new InvalidPythonInterpreterDiagnostic(
                DiagnosticCodes.NoPythonInterpretersDiagnostic,
                undefined,
                workspaceService.object,
            );
            const cmd = ({} as any) as IDiagnosticCommand;
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
                            options: Commands.Set_Interpreter,
                        }),
                    ),
                )
                .returns(() => cmd)
                .verifiable(typemoq.Times.once());

            await diagnosticService.handle([diagnostic]);

            messageHandler.verifyAll();
            commandFactory.verifyAll();
            expect(messagePrompt).not.be.equal(undefined, 'Message prompt not set');
            expect(messagePrompt!.commandPrompts).to.be.deep.equal([
                {
                    prompt: Common.selectPythonInterpreter,
                    command: cmd,
                },
            ]);
            expect(messagePrompt!.onClose).to.not.be.equal(undefined, 'onClose handler should be set.');
        });

        test('Handling no currently selected interpreter diagnostic should show select interpreter message', async () => {
            const diagnostic = new InvalidPythonInterpreterDiagnostic(
                DiagnosticCodes.InvalidPythonInterpreterDiagnostic,
                undefined,
                workspaceService.object,
            );
            const cmd = ({} as any) as IDiagnosticCommand;
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
                .verifiable(typemoq.Times.exactly(2));

            await diagnosticService.handle([diagnostic]);

            messageHandler.verifyAll();
            commandFactory.verifyAll();
            expect(messagePrompt).not.be.equal(undefined, 'Message prompt not set');
            expect(messagePrompt!.commandPrompts).to.be.deep.equal([
                { prompt: Common.selectPythonInterpreter, command: cmd },
                { prompt: Common.openOutputPanel, command: cmd },
            ]);
            expect(messagePrompt!.onClose).be.equal(undefined, 'onClose handler should not be set.');
        });
        test('Handling an empty diagnostic should not show a message nor return a command', async () => {
            const diagnostics: IDiagnostic[] = [];
            const cmd = ({} as any) as IDiagnosticCommand;

            messageHandler
                .setup((i) => i.handle(typemoq.It.isAny(), typemoq.It.isAny()))
                .callback((_d, p: MessageCommandPrompt) => p)
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.never());
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
                .verifiable(typemoq.Times.never());

            await diagnosticService.handle(diagnostics);

            messageHandler.verifyAll();
            commandFactory.verifyAll();
        });
        test('Handling an unsupported diagnostic code should not show a message nor return a command', async () => {
            const diagnostic = new InvalidPythonInterpreterDiagnostic(
                DiagnosticCodes.InvalidPythonInterpreterDiagnostic,
                undefined,
                workspaceService.object,
            );
            const cmd = ({} as any) as IDiagnosticCommand;
            const diagnosticServiceMock = (typemoq.Mock.ofInstance(diagnosticService) as any) as typemoq.IMock<
                InvalidPythonInterpreterService
            >;

            diagnosticServiceMock.setup((f) => f.canHandle(typemoq.It.isAny())).returns(() => Promise.resolve(false));
            messageHandler
                .setup((i) => i.handle(typemoq.It.isAny(), typemoq.It.isAny()))
                .callback((_d, p: MessageCommandPrompt) => p)
                .returns(() => Promise.resolve())
                .verifiable(typemoq.Times.never());
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
                .verifiable(typemoq.Times.never());

            await diagnosticServiceMock.object.handle([diagnostic]);

            messageHandler.verifyAll();
            commandFactory.verifyAll();
        });
    });
});
