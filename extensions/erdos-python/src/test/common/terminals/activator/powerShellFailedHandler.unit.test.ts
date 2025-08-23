// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import * as TypeMoq from 'typemoq';
import { Terminal } from 'vscode';
import { IDiagnosticsService } from '../../../../client/application/diagnostics/types';
import { IPlatformService } from '../../../../client/common/platform/types';
import { PowershellTerminalActivationFailedHandler } from '../../../../client/common/terminal/activator/powershellFailedHandler';
import {
    ITerminalActivationHandler,
    ITerminalHelper,
    TerminalShellType,
} from '../../../../client/common/terminal/types';
import { getNamesAndValues } from '../../../../client/common/utils/enum';

suite('Terminal Activation Powershell Failed Handler', () => {
    let psHandler: ITerminalActivationHandler;
    let helper: TypeMoq.IMock<ITerminalHelper>;
    let platform: TypeMoq.IMock<IPlatformService>;
    let diagnosticService: TypeMoq.IMock<IDiagnosticsService>;

    async function testDiagnostics(
        mustHandleDiagnostics: boolean,
        isWindows: boolean,
        activatedSuccessfully: boolean,
        shellType: TerminalShellType,
        cmdPromptHasActivationCommands: boolean,
    ) {
        platform.setup((p) => p.isWindows).returns(() => isWindows);
        helper.setup((p) => p.identifyTerminalShell(TypeMoq.It.isAny())).returns(() => shellType);
        const cmdPromptCommands = cmdPromptHasActivationCommands ? ['a'] : [];
        helper
            .setup((h) =>
                h.getEnvironmentActivationCommands(
                    TypeMoq.It.isValue(TerminalShellType.commandPrompt),
                    TypeMoq.It.isAny(),
                ),
            )
            .returns(() => Promise.resolve(cmdPromptCommands));

        diagnosticService
            .setup((d) => d.handle(TypeMoq.It.isAny()))
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.exactly(mustHandleDiagnostics ? 1 : 0));
        await psHandler.handleActivation(
            TypeMoq.Mock.ofType<Terminal>().object,
            undefined,
            false,
            activatedSuccessfully,
        );
    }

    [true, false].forEach((isWindows) => {
        suite(`OS is ${isWindows ? 'Windows' : 'Non-Widows'}`, () => {
            getNamesAndValues<TerminalShellType>(TerminalShellType).forEach((shell) => {
                suite(`Shell is ${shell.name}`, () => {
                    [true, false].forEach((hasCommandPromptActivations) => {
                        hasCommandPromptActivations =
                            isWindows && hasCommandPromptActivations && shell.value !== TerminalShellType.commandPrompt;
                        suite(
                            `${
                                hasCommandPromptActivations
                                    ? 'Can activate with Command Prompt'
                                    : "Can't activate with Command Prompt"
                            }`,
                            () => {
                                [true, false].forEach((activatedSuccessfully) => {
                                    suite(
                                        `Terminal Activation is ${activatedSuccessfully ? 'successful' : 'has failed'}`,
                                        () => {
                                            setup(() => {
                                                helper = TypeMoq.Mock.ofType<ITerminalHelper>();
                                                platform = TypeMoq.Mock.ofType<IPlatformService>();
                                                diagnosticService = TypeMoq.Mock.ofType<IDiagnosticsService>();
                                                psHandler = new PowershellTerminalActivationFailedHandler(
                                                    helper.object,
                                                    platform.object,
                                                    diagnosticService.object,
                                                );
                                            });
                                            const isPs =
                                                shell.value === TerminalShellType.powershell ||
                                                shell.value === TerminalShellType.powershellCore;
                                            const mustHandleDiagnostics =
                                                isPs && !activatedSuccessfully && hasCommandPromptActivations;
                                            test(`Diagnostic must ${
                                                mustHandleDiagnostics ? 'be' : 'not be'
                                            } handled`, async () => {
                                                await testDiagnostics(
                                                    mustHandleDiagnostics,
                                                    isWindows,
                                                    activatedSuccessfully,
                                                    shell.value,
                                                    hasCommandPromptActivations,
                                                );
                                                helper.verifyAll();
                                                diagnosticService.verifyAll();
                                            });
                                        },
                                    );
                                });
                            },
                        );
                    });
                });
            });
        });
    });
});
