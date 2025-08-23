// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';
import { expect } from 'chai';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import * as TypeMoq from 'typemoq';
import { Terminal, Uri } from 'vscode';
import { ActiveResourceService } from '../../../client/common/application/activeResource';
import { TerminalManager } from '../../../client/common/application/terminalManager';
import { IActiveResourceService, ITerminalManager } from '../../../client/common/application/types';
import { TerminalActivator } from '../../../client/common/terminal/activator';
import { ITerminalActivator } from '../../../client/common/terminal/types';
import { IDisposable } from '../../../client/common/types';
import { TerminalAutoActivation } from '../../../client/terminals/activation';
import { ITerminalAutoActivation } from '../../../client/terminals/types';
import { noop } from '../../core';

suite('Terminal Auto Activation', () => {
    let activator: ITerminalActivator;
    let terminalManager: ITerminalManager;
    let terminalAutoActivation: ITerminalAutoActivation;
    let activeResourceService: IActiveResourceService;
    const resource = Uri.parse('a');
    let terminal: Terminal;

    setup(() => {
        terminal = ({
            dispose: noop,
            hide: noop,
            name: 'Python',
            creationOptions: {},
            processId: Promise.resolve(0),
            sendText: noop,
            show: noop,
            exitStatus: { code: 0 },
        } as unknown) as Terminal;
        terminalManager = mock(TerminalManager);
        activator = mock(TerminalActivator);
        activeResourceService = mock(ActiveResourceService);

        terminalAutoActivation = new TerminalAutoActivation(
            instance(terminalManager),
            [],
            instance(activator),
            instance(activeResourceService),
        );
    });

    test('New Terminals should be activated', async () => {
        type EventHandler = (e: Terminal) => void;
        let handler: undefined | EventHandler;
        const handlerDisposable = TypeMoq.Mock.ofType<IDisposable>();
        const onDidOpenTerminal = (cb: EventHandler) => {
            handler = cb;
            return handlerDisposable.object;
        };
        when(activeResourceService.getActiveResource()).thenReturn(resource);
        when(terminalManager.onDidOpenTerminal).thenReturn(onDidOpenTerminal);
        when(activator.activateEnvironmentInTerminal(anything(), anything())).thenResolve();

        terminalAutoActivation.register();

        expect(handler).not.to.be.an('undefined', 'event handler not initialized');

        handler!.bind(terminalAutoActivation)(terminal);

        verify(activator.activateEnvironmentInTerminal(terminal, anything())).once();
    });
    test('New Terminals should not be activated if hidden from user', async () => {
        terminal = ({
            dispose: noop,
            hide: noop,
            name: 'Python',
            creationOptions: { hideFromUser: true },
            processId: Promise.resolve(0),
            sendText: noop,
            show: noop,
            exitStatus: { code: 0 },
        } as unknown) as Terminal;
        type EventHandler = (e: Terminal) => void;
        let handler: undefined | EventHandler;
        const handlerDisposable = TypeMoq.Mock.ofType<IDisposable>();
        const onDidOpenTerminal = (cb: EventHandler) => {
            handler = cb;
            return handlerDisposable.object;
        };
        when(activeResourceService.getActiveResource()).thenReturn(resource);
        when(terminalManager.onDidOpenTerminal).thenReturn(onDidOpenTerminal);
        when(activator.activateEnvironmentInTerminal(anything(), anything())).thenResolve();

        terminalAutoActivation.register();

        expect(handler).not.to.be.an('undefined', 'event handler not initialized');

        handler!.bind(terminalAutoActivation)(terminal);

        verify(activator.activateEnvironmentInTerminal(terminal, anything())).never();
    });
    test('New Terminals should not be activated if auto activation is to be disabled', async () => {
        terminal = ({
            dispose: noop,
            hide: noop,
            name: 'Python',
            creationOptions: { hideFromUser: false },
            processId: Promise.resolve(0),
            sendText: noop,
            show: noop,
            exitStatus: { code: 0 },
        } as unknown) as Terminal;
        type EventHandler = (e: Terminal) => void;
        let handler: undefined | EventHandler;
        const handlerDisposable = TypeMoq.Mock.ofType<IDisposable>();
        const onDidOpenTerminal = (cb: EventHandler) => {
            handler = cb;
            return handlerDisposable.object;
        };
        when(activeResourceService.getActiveResource()).thenReturn(resource);
        when(terminalManager.onDidOpenTerminal).thenReturn(onDidOpenTerminal);
        when(activator.activateEnvironmentInTerminal(anything(), anything())).thenResolve();

        terminalAutoActivation.register();
        terminalAutoActivation.disableAutoActivation(terminal);

        expect(handler).not.to.be.an('undefined', 'event handler not initialized');

        handler!.bind(terminalAutoActivation)(terminal);

        verify(activator.activateEnvironmentInTerminal(terminal, anything())).never();
    });
    test('New Terminals should be activated with resource of single workspace', async () => {
        type EventHandler = (e: Terminal) => void;
        let handler: undefined | EventHandler;
        const handlerDisposable = TypeMoq.Mock.ofType<IDisposable>();
        const onDidOpenTerminal = (cb: EventHandler) => {
            handler = cb;
            return handlerDisposable.object;
        };
        when(activeResourceService.getActiveResource()).thenReturn(resource);
        when(terminalManager.onDidOpenTerminal).thenReturn(onDidOpenTerminal);
        when(activator.activateEnvironmentInTerminal(anything(), anything())).thenResolve();

        terminalAutoActivation.register();

        expect(handler).not.to.be.an('undefined', 'event handler not initialized');

        handler!.bind(terminalAutoActivation)(terminal);

        verify(activator.activateEnvironmentInTerminal(terminal, anything())).once();
    });
    test('New Terminals should be activated with resource of main workspace', async () => {
        type EventHandler = (e: Terminal) => void;
        let handler: undefined | EventHandler;
        const handlerDisposable = TypeMoq.Mock.ofType<IDisposable>();
        const onDidOpenTerminal = (cb: EventHandler) => {
            handler = cb;
            return handlerDisposable.object;
        };
        when(activeResourceService.getActiveResource()).thenReturn(resource);
        when(terminalManager.onDidOpenTerminal).thenReturn(onDidOpenTerminal);
        when(activator.activateEnvironmentInTerminal(anything(), anything())).thenResolve();
        terminalAutoActivation.register();

        expect(handler).not.to.be.an('undefined', 'event handler not initialized');

        handler!.bind(terminalAutoActivation)(terminal);

        verify(activator.activateEnvironmentInTerminal(terminal, anything())).once();
    });
});
