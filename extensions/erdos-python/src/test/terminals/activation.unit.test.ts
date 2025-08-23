// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { anything, instance, mock, verify, when } from 'ts-mockito';
import { EventEmitter, Terminal } from 'vscode';
import { ActiveResourceService } from '../../client/common/application/activeResource';
import { TerminalManager } from '../../client/common/application/terminalManager';
import { IActiveResourceService, ITerminalManager } from '../../client/common/application/types';
import { TerminalActivator } from '../../client/common/terminal/activator';
import { ITerminalActivator } from '../../client/common/terminal/types';
import { TerminalAutoActivation } from '../../client/terminals/activation';
import { ITerminalAutoActivation } from '../../client/terminals/types';
import { noop } from '../core';

suite('Terminal', () => {
    suite('Terminal Auto Activation', () => {
        let autoActivation: ITerminalAutoActivation;
        let manager: ITerminalManager;
        let activator: ITerminalActivator;
        let resourceService: IActiveResourceService;
        let onDidOpenTerminalEventEmitter: EventEmitter<Terminal>;
        let terminal: Terminal;
        let nonActivatedTerminal: Terminal;

        setup(() => {
            manager = mock(TerminalManager);
            activator = mock(TerminalActivator);
            resourceService = mock(ActiveResourceService);
            onDidOpenTerminalEventEmitter = new EventEmitter<Terminal>();
            when(manager.onDidOpenTerminal).thenReturn(onDidOpenTerminalEventEmitter.event);
            when(activator.activateEnvironmentInTerminal(anything(), anything())).thenResolve();

            autoActivation = new TerminalAutoActivation(
                instance(manager),
                [],
                instance(activator),
                instance(resourceService),
            );

            terminal = ({
                dispose: noop,
                hide: noop,
                name: 'Some Name',
                creationOptions: {},
                processId: Promise.resolve(0),
                sendText: noop,
                show: noop,
                exitStatus: { code: 0 },
            } as unknown) as Terminal;
            nonActivatedTerminal = ({
                dispose: noop,
                hide: noop,
                creationOptions: { hideFromUser: true },
                name: 'Something',
                processId: Promise.resolve(0),
                sendText: noop,
                show: noop,
                exitStatus: { code: 0 },
            } as unknown) as Terminal;
            autoActivation.register();
        });
        // teardown(() => fakeTimer.uninstall());

        test('Should activate terminal', async () => {
            // Trigger opening a terminal.

            await ((onDidOpenTerminalEventEmitter.fire(terminal) as unknown) as Promise<void>);

            // The terminal should get activated.
            verify(activator.activateEnvironmentInTerminal(terminal, anything())).once();
        });
        test('Should not activate terminal if name starts with specific prefix', async () => {
            // Trigger opening a terminal.

            await ((onDidOpenTerminalEventEmitter.fire(nonActivatedTerminal) as unknown) as Promise<void>);

            // The terminal should get activated.
            verify(activator.activateEnvironmentInTerminal(anything(), anything())).never();
        });
    });
});
