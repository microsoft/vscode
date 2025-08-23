// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import * as TypeMoq from 'typemoq';
import { LanguageServerOutputChannel } from '../../client/activation/common/outputChannel';
import { IApplicationShell, ICommandManager } from '../../client/common/application/types';
import { ILogOutputChannel } from '../../client/common/types';
import { sleep } from '../../client/common/utils/async';
import { OutputChannelNames } from '../../client/common/utils/localize';

suite('Language Server Output Channel', () => {
    let appShell: TypeMoq.IMock<IApplicationShell>;
    let languageServerOutputChannel: LanguageServerOutputChannel;
    let commandManager: TypeMoq.IMock<ICommandManager>;
    let output: TypeMoq.IMock<ILogOutputChannel>;
    setup(() => {
        appShell = TypeMoq.Mock.ofType<IApplicationShell>();
        output = TypeMoq.Mock.ofType<ILogOutputChannel>();
        commandManager = TypeMoq.Mock.ofType<ICommandManager>();
        languageServerOutputChannel = new LanguageServerOutputChannel(appShell.object, commandManager.object, []);
    });

    test('Create output channel if one does not exist before and return it', async () => {
        appShell
            .setup((a) => a.createOutputChannel(OutputChannelNames.languageServer))
            .returns(() => output.object)
            .verifiable(TypeMoq.Times.once());
        const { channel } = languageServerOutputChannel;
        appShell.verifyAll();
        expect(channel).to.not.equal(undefined, 'Channel should not be undefined');
    });

    test('Do not create output channel if one already exists', async () => {
        languageServerOutputChannel.output = output.object;
        appShell
            .setup((a) => a.createOutputChannel(TypeMoq.It.isAny()))
            .returns(() => output.object)
            .verifiable(TypeMoq.Times.never());
        const { channel } = languageServerOutputChannel;
        appShell.verifyAll();
        expect(channel).to.not.equal(undefined, 'Channel should not be undefined');
    });
    test('Register Command to display output panel', async () => {
        appShell
            .setup((a) => a.createOutputChannel(TypeMoq.It.isAny()))
            .returns(() => output.object)
            .verifiable(TypeMoq.Times.once());
        commandManager
            .setup((c) =>
                c.executeCommand(
                    TypeMoq.It.isValue('setContext'),
                    TypeMoq.It.isValue('python.hasLanguageServerOutputChannel'),
                    TypeMoq.It.isValue(true),
                ),
            )
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.once());
        commandManager
            .setup((c) => c.registerCommand(TypeMoq.It.isValue('python.viewLanguageServerOutput'), TypeMoq.It.isAny()))
            .verifiable(TypeMoq.Times.once());

        // Doesn't matter how many times we access channel property.
        let { channel } = languageServerOutputChannel;
        channel = languageServerOutputChannel.channel;
        channel = languageServerOutputChannel.channel;

        await sleep(1);

        appShell.verifyAll();
        commandManager.verifyAll();
        expect(channel).to.not.equal(undefined, 'Channel should not be undefined');
    });
    test('Display panel when invoking command python.viewLanguageServerOutput', async () => {
        let cmdCallback: () => unknown | undefined = () => {
            /* no-op */
        };
        appShell
            .setup((a) => a.createOutputChannel(TypeMoq.It.isAny()))
            .returns(() => output.object)
            .verifiable(TypeMoq.Times.once());
        commandManager
            .setup((c) =>
                c.executeCommand(
                    TypeMoq.It.isValue('setContext'),
                    TypeMoq.It.isValue('python.hasLanguageServerOutputChannel'),
                    TypeMoq.It.isValue(true),
                ),
            )
            .returns(() => Promise.resolve())
            .verifiable(TypeMoq.Times.once());
        commandManager
            .setup((c) => c.registerCommand(TypeMoq.It.isValue('python.viewLanguageServerOutput'), TypeMoq.It.isAny()))
            .callback((_: string, callback: () => unknown) => {
                cmdCallback = callback;
            })
            .verifiable(TypeMoq.Times.once());
        output.setup((o) => o.show(true)).verifiable(TypeMoq.Times.never());
        // Doesn't matter how many times we access channel property.
        let { channel } = languageServerOutputChannel;
        channel = languageServerOutputChannel.channel;
        channel = languageServerOutputChannel.channel;

        await sleep(1);

        appShell.verifyAll();
        commandManager.verifyAll();
        output.verifyAll();
        expect(channel).to.not.equal(undefined, 'Channel should not be undefined');
        expect(cmdCallback).to.not.equal(undefined, 'Command handler should not be undefined');

        // Confirm panel is displayed when command handler is invoked.
        output.reset();
        output.setup((o) => o.show(true)).verifiable(TypeMoq.Times.once());

        // Invoke callback.
        cmdCallback!();

        output.verifyAll();
    });
});
