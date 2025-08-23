// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as TypeMoq from 'typemoq';
import { Terminal } from 'vscode';
import { BaseTerminalActivator } from '../../../../client/common/terminal/activator/base';
import { ITerminalActivator, ITerminalHelper } from '../../../../client/common/terminal/types';
import { noop } from '../../../../client/common/utils/misc';

suite('Terminal Base Activator', () => {
    let activator: ITerminalActivator;
    let helper: TypeMoq.IMock<ITerminalHelper>;

    setup(() => {
        helper = TypeMoq.Mock.ofType<ITerminalHelper>();
        activator = (new (class extends BaseTerminalActivator {
            public waitForCommandToProcess() {
                noop();
                return Promise.resolve();
            }
        })(helper.object) as any) as ITerminalActivator;
    });
    [
        { commandCount: 1, preserveFocus: false },
        { commandCount: 2, preserveFocus: false },
        { commandCount: 1, preserveFocus: true },
        { commandCount: 1, preserveFocus: true },
    ].forEach((item) => {
        const titleSuffix = `(${item.commandCount} activation command, and preserve focus in terminal is ${item.preserveFocus})`;
        const activationCommands = item.commandCount === 1 ? ['CMD1'] : ['CMD1', 'CMD2'];
        test(`Terminal is activated ${titleSuffix}`, async () => {
            helper
                .setup((h) =>
                    h.getEnvironmentActivationCommands(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                )
                .returns(() => Promise.resolve(activationCommands));
            const terminal = TypeMoq.Mock.ofType<Terminal>();

            terminal
                .setup((t) => t.show(TypeMoq.It.isValue(item.preserveFocus)))
                .returns(() => undefined)
                .verifiable(TypeMoq.Times.exactly(activationCommands.length));
            activationCommands.forEach((cmd) => {
                terminal
                    .setup((t) => t.sendText(TypeMoq.It.isValue(cmd)))
                    .returns(() => undefined)
                    .verifiable(TypeMoq.Times.exactly(1));
            });

            await activator.activateEnvironmentInTerminal(terminal.object, { preserveFocus: item.preserveFocus });

            terminal.verifyAll();
        });
        test(`Terminal is activated only once ${titleSuffix}`, async () => {
            helper
                .setup((h) =>
                    h.getEnvironmentActivationCommands(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                )
                .returns(() => Promise.resolve(activationCommands));
            const terminal = TypeMoq.Mock.ofType<Terminal>();

            terminal
                .setup((t) => t.show(TypeMoq.It.isValue(item.preserveFocus)))
                .returns(() => undefined)
                .verifiable(TypeMoq.Times.exactly(activationCommands.length));
            activationCommands.forEach((cmd) => {
                terminal
                    .setup((t) => t.sendText(TypeMoq.It.isValue(cmd)))
                    .returns(() => undefined)
                    .verifiable(TypeMoq.Times.exactly(1));
            });

            await activator.activateEnvironmentInTerminal(terminal.object, { preserveFocus: item.preserveFocus });
            await activator.activateEnvironmentInTerminal(terminal.object, { preserveFocus: item.preserveFocus });
            await activator.activateEnvironmentInTerminal(terminal.object, { preserveFocus: item.preserveFocus });

            terminal.verifyAll();
        });
        test(`Terminal is activated only once ${titleSuffix} (even when not waiting)`, async () => {
            helper
                .setup((h) =>
                    h.getEnvironmentActivationCommands(TypeMoq.It.isAny(), TypeMoq.It.isAny(), TypeMoq.It.isAny()),
                )
                .returns(() => Promise.resolve(activationCommands));
            const terminal = TypeMoq.Mock.ofType<Terminal>();

            terminal
                .setup((t) => t.show(TypeMoq.It.isValue(item.preserveFocus)))
                .returns(() => undefined)
                .verifiable(TypeMoq.Times.exactly(activationCommands.length));
            activationCommands.forEach((cmd) => {
                terminal
                    .setup((t) => t.sendText(TypeMoq.It.isValue(cmd)))
                    .returns(() => undefined)
                    .verifiable(TypeMoq.Times.exactly(1));
            });

            const activated = await Promise.all([
                activator.activateEnvironmentInTerminal(terminal.object, { preserveFocus: item.preserveFocus }),
                activator.activateEnvironmentInTerminal(terminal.object, { preserveFocus: item.preserveFocus }),
                activator.activateEnvironmentInTerminal(terminal.object, { preserveFocus: item.preserveFocus }),
            ]);

            terminal.verifyAll();
            expect(activated).to.deep.equal([true, true, true], 'Invalid values');
        });
    });
});
