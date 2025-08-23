// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import rewiremock from 'rewiremock';
import * as sinon from 'sinon';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import { ICommandManager, ITerminalManager } from '../../../../client/common/application/types';
import { Commands } from '../../../../client/common/constants';
import { ITerminalService } from '../../../../client/common/terminal/types';
import { IDisposable } from '../../../../client/common/types';
import { Interpreters } from '../../../../client/common/utils/localize';
import { InstallPythonViaTerminal } from '../../../../client/interpreter/configuration/interpreterSelector/commands/installPython/installPythonViaTerminal';

suite('Install Python via Terminal', () => {
    let cmdManager: ICommandManager;
    let terminalServiceFactory: ITerminalManager;
    let installPythonCommand: InstallPythonViaTerminal;
    let terminalService: ITerminalService;
    let message: string | undefined;
    setup(() => {
        rewiremock.enable();
        cmdManager = mock<ICommandManager>();
        terminalServiceFactory = mock<ITerminalManager>();
        terminalService = mock<ITerminalService>();
        message = undefined;
        when(terminalServiceFactory.createTerminal(anything())).thenCall((options) => {
            message = options.message;
            return instance(terminalService);
        });
        installPythonCommand = new InstallPythonViaTerminal(instance(cmdManager), instance(terminalServiceFactory), []);
    });

    teardown(() => {
        rewiremock.disable();
        sinon.restore();
    });

    test('Sends expected commands when InstallPythonOnLinux command is executed if apt is available', async () => {
        let installCommandHandler: () => Promise<void>;
        when(cmdManager.registerCommand(Commands.InstallPythonOnLinux, anything())).thenCall((_, cb) => {
            installCommandHandler = cb;
            return TypeMoq.Mock.ofType<IDisposable>().object;
        });
        rewiremock('which').with((cmd: string) => {
            if (cmd === 'apt') {
                return 'path/to/apt';
            }
            throw new Error('Command not found');
        });
        await installPythonCommand.activate();
        when(terminalService.sendText('sudo apt-get update')).thenResolve();
        when(terminalService.sendText('sudo apt-get install python3 python3-venv python3-pip')).thenResolve();

        await installCommandHandler!();

        verify(terminalService.sendText('sudo apt-get update')).once();
        verify(terminalService.sendText('sudo apt-get install python3 python3-venv python3-pip')).once();
    });

    test('Sends expected commands when InstallPythonOnLinux command is executed if dnf is available', async () => {
        let installCommandHandler: () => Promise<void>;
        when(cmdManager.registerCommand(Commands.InstallPythonOnLinux, anything())).thenCall((_, cb) => {
            installCommandHandler = cb;
            return TypeMoq.Mock.ofType<IDisposable>().object;
        });
        rewiremock('which').with((cmd: string) => {
            if (cmd === 'dnf') {
                return 'path/to/dnf';
            }
            throw new Error('Command not found');
        });

        await installPythonCommand.activate();
        when(terminalService.sendText('sudo dnf install python3')).thenResolve();

        await installCommandHandler!();

        verify(terminalService.sendText('sudo dnf install python3')).once();
        expect(message).to.be.equal(undefined);
    });

    test('Creates terminal with appropriate message when InstallPythonOnLinux command is executed if no known linux package managers are available', async () => {
        let installCommandHandler: () => Promise<void>;
        when(cmdManager.registerCommand(Commands.InstallPythonOnLinux, anything())).thenCall((_, cb) => {
            installCommandHandler = cb;
            return TypeMoq.Mock.ofType<IDisposable>().object;
        });
        rewiremock('which').with((_cmd: string) => {
            throw new Error('Command not found');
        });

        await installPythonCommand.activate();
        await installCommandHandler!();

        expect(message).to.be.equal(Interpreters.installPythonTerminalMessageLinux);
    });

    test('Sends expected commands on Mac when InstallPythonOnMac command is executed if brew is available', async () => {
        let installCommandHandler: () => Promise<void>;
        when(cmdManager.registerCommand(Commands.InstallPythonOnMac, anything())).thenCall((_, cb) => {
            installCommandHandler = cb;
            return TypeMoq.Mock.ofType<IDisposable>().object;
        });
        rewiremock('which').with((cmd: string) => {
            if (cmd === 'brew') {
                return 'path/to/brew';
            }
            throw new Error('Command not found');
        });

        await installPythonCommand.activate();
        when(terminalService.sendText('brew install python3')).thenResolve();

        await installCommandHandler!();

        verify(terminalService.sendText('brew install python3')).once();
        expect(message).to.be.equal(undefined);
    });

    test('Creates terminal with appropriate message when InstallPythonOnMac command is executed if brew is not available', async () => {
        let installCommandHandler: () => Promise<void>;
        when(cmdManager.registerCommand(Commands.InstallPythonOnMac, anything())).thenCall((_, cb) => {
            installCommandHandler = cb;
            return TypeMoq.Mock.ofType<IDisposable>().object;
        });
        rewiremock('which').with((_cmd: string) => {
            throw new Error('Command not found');
        });

        await installPythonCommand.activate();

        await installCommandHandler!();

        expect(message).to.be.equal(Interpreters.installPythonTerminalMacMessage);
    });
});
