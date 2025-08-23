// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { assert } from 'chai';
import * as path from 'path';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { CancellationTokenSource } from 'vscode';
import { CancellationError } from '../../../client/common/cancellation';
import { FileSystem } from '../../../client/common/platform/fileSystem';
import { IFileSystem } from '../../../client/common/platform/types';
import { TerminalService } from '../../../client/common/terminal/service';
import { SynchronousTerminalService } from '../../../client/common/terminal/syncTerminalService';
import { createDeferredFrom } from '../../../client/common/utils/async';
import { EXTENSION_ROOT_DIR } from '../../../client/constants';
import { IInterpreterService } from '../../../client/interpreter/contracts';
import { InterpreterService } from '../../../client/interpreter/interpreterService';
import { noop, sleep } from '../../core';

suite('Terminal Service (synchronous)', () => {
    let service: SynchronousTerminalService;
    let fs: IFileSystem;
    let interpreterService: IInterpreterService;
    let terminalService: TerminalService;
    setup(() => {
        fs = mock(FileSystem);
        interpreterService = mock(InterpreterService);
        terminalService = mock(TerminalService);
        service = new SynchronousTerminalService(instance(fs), instance(interpreterService), instance(terminalService));
    });
    suite('Show, sendText and dispose should invoke corresponding methods in wrapped TerminalService', () => {
        test('Show should invoke show in terminal', async () => {
            when(terminalService.show(anything())).thenResolve();
            await service.show();
            verify(terminalService.show(undefined)).once();
        });
        test('Show should invoke show in terminal (without chaning focus)', async () => {
            when(terminalService.show(anything())).thenResolve();
            await service.show(false);
            verify(terminalService.show(false)).once();
        });
        test('Show should invoke show in terminal (without chaning focus)', async () => {
            when(terminalService.show(anything())).thenResolve();
            await service.show(false);
            verify(terminalService.show(false)).once();
        });
        test('Show should invoke show in terminal (without chaning focus)', async () => {
            when(terminalService.show(anything())).thenResolve();
            await service.show(false);
            verify(terminalService.show(false)).once();
        });
        test('Dispose should dipose the wrapped TerminalService', async () => {
            service.dispose();
            verify(terminalService.dispose()).once();
        });
        test('sendText should invokeSendText in wrapped TerminalService', async () => {
            when(terminalService.sendText('Blah')).thenResolve();
            await service.sendText('Blah');
            verify(terminalService.sendText('Blah')).once();
        });
        test('sendText should invokeSendText in wrapped TerminalService (errors should be bubbled up)', async () => {
            when(terminalService.sendText('Blah')).thenReject(new Error('kaboom'));
            const promise = service.sendText('Blah');

            await assert.isRejected(promise, 'kaboom');
            verify(terminalService.sendText('Blah')).once();
        });
    });
    suite('sendCommand', () => {
        const shellExecFile = path.join(EXTENSION_ROOT_DIR, 'python_files', 'shell_exec.py');

        test('run sendCommand in terminalService if there is no cancellation token', async () => {
            when(terminalService.sendCommand('cmd', deepEqual(['1', '2']))).thenResolve();
            await service.sendCommand('cmd', ['1', '2']);
            verify(terminalService.sendCommand('cmd', deepEqual(['1', '2']))).once();
        });
        test('run sendCommand in terminalService should be cancelled', async () => {
            const cancel = new CancellationTokenSource();
            const tmpFile = { filePath: 'tmp with spaces', dispose: noop };
            when(terminalService.sendCommand(anything(), anything())).thenResolve();
            when(interpreterService.getActiveInterpreter(undefined)).thenResolve(undefined);
            when(fs.createTemporaryFile('.log')).thenResolve(tmpFile);
            when(fs.readFile(anything())).thenResolve('');

            // Send the necessary commands to the terminal.
            const promise = service.sendCommand('cmd', ['1', '2'], cancel.token).catch((ex) => Promise.reject(ex));

            const deferred = createDeferredFrom(promise);
            // required to shutup node (we must handled exceptions).
            deferred.promise.ignoreErrors();

            // Should not have completed.
            assert.isFalse(deferred.completed);

            // Wait for some time, and it should still not be completed
            // Should complete only after command has executed successfully or been cancelled.
            await sleep(500);
            assert.isFalse(deferred.completed);

            // If cancelled, then throw cancellation error.
            cancel.cancel();

            await assert.isRejected(promise, new CancellationError().message);
            verify(fs.createTemporaryFile('.log')).once();
            verify(fs.readFile(tmpFile.filePath)).atLeast(1);
            verify(
                terminalService.sendCommand(
                    'python',
                    deepEqual([shellExecFile, 'cmd', '1', '2', tmpFile.filePath.fileToCommandArgumentForPythonExt()]),
                ),
            ).once();
        }).timeout(1_000);
        test('run sendCommand in terminalService should complete when command completes', async () => {
            const cancel = new CancellationTokenSource();
            const tmpFile = { filePath: 'tmp with spaces', dispose: noop };
            when(terminalService.sendCommand(anything(), anything())).thenResolve();
            when(interpreterService.getActiveInterpreter(undefined)).thenResolve(undefined);
            when(fs.createTemporaryFile('.log')).thenResolve(tmpFile);
            when(fs.readFile(anything())).thenResolve('');

            // Send the necessary commands to the terminal.
            const promise = service.sendCommand('cmd', ['1', '2'], cancel.token).catch((ex) => Promise.reject(ex));

            const deferred = createDeferredFrom(promise);
            // required to shutup node (we must handled exceptions).
            deferred.promise.ignoreErrors();

            // Should not have completed.
            assert.isFalse(deferred.completed);

            // Wait for some time, and it should still not be completed
            // Should complete only after command has executed successfully or been cancelled.
            await sleep(500);
            assert.isFalse(deferred.completed);

            // Write `END` into file, to trigger completion of the command.
            when(fs.readFile(anything())).thenResolve('END');

            await promise;
            verify(fs.createTemporaryFile('.log')).once();
            verify(fs.readFile(tmpFile.filePath)).atLeast(1);
            verify(
                terminalService.sendCommand(
                    'python',
                    deepEqual([shellExecFile, 'cmd', '1', '2', tmpFile.filePath.fileToCommandArgumentForPythonExt()]),
                ),
            ).once();
        }).timeout(2_000);
    });
});
