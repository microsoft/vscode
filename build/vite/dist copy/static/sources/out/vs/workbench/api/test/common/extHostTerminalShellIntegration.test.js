/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InternalTerminalShellIntegration } from '../../common/extHostTerminalShellIntegration.js';
import { Emitter } from '../../../../base/common/event.js';
import { TerminalShellExecutionCommandLineConfidence } from '../../common/extHostTypes.js';
import { deepStrictEqual, notStrictEqual, strictEqual } from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
function cmdLine(value) {
    return Object.freeze({
        confidence: TerminalShellExecutionCommandLineConfidence.High,
        value,
        isTrusted: true,
    });
}
function asCmdLine(value) {
    if (typeof value === 'string') {
        return cmdLine(value);
    }
    return value;
}
function vsc(data) {
    return `\x1b]633;${data}\x07`;
}
const testCommandLine = 'echo hello world';
const testCommandLine2 = 'echo goodbye world';
suite('InternalTerminalShellIntegration', () => {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    let si;
    let terminal;
    let onDidStartTerminalShellExecution;
    let trackedEvents;
    let readIteratorsFlushed;
    async function startExecutionAwaitObject(commandLine, cwd) {
        return await new Promise(r => {
            store.add(onDidStartTerminalShellExecution.event(e => {
                r(e.execution);
            }));
            si.startShellExecution(asCmdLine(commandLine), cwd);
        });
    }
    async function endExecutionAwaitObject(commandLine) {
        return await new Promise(r => {
            store.add(si.onDidRequestEndExecution(e => r(e.execution)));
            si.endShellExecution(asCmdLine(commandLine), 0);
        });
    }
    async function emitData(data) {
        // AsyncIterableObjects are initialized in a microtask, this doesn't matter in practice
        // since the events will always come through in different events.
        await new Promise(r => queueMicrotask(r));
        si.emitData(data);
    }
    function assertTrackedEvents(expected) {
        deepStrictEqual(trackedEvents, expected);
    }
    function assertNonDataTrackedEvents(expected) {
        deepStrictEqual(trackedEvents.filter(e => e.type !== 'data'), expected);
    }
    function assertDataTrackedEvents(expected) {
        deepStrictEqual(trackedEvents.filter(e => e.type === 'data'), expected);
    }
    setup(() => {
        // eslint-disable-next-line local/code-no-any-casts
        terminal = Symbol('testTerminal');
        onDidStartTerminalShellExecution = store.add(new Emitter());
        si = store.add(new InternalTerminalShellIntegration(terminal, true, onDidStartTerminalShellExecution));
        trackedEvents = [];
        readIteratorsFlushed = [];
        store.add(onDidStartTerminalShellExecution.event(async (e) => {
            trackedEvents.push({
                type: 'start',
                commandLine: e.execution.commandLine.value,
            });
            const stream = e.execution.read();
            const readIteratorsFlushedDeferred = new DeferredPromise();
            readIteratorsFlushed.push(readIteratorsFlushedDeferred.p);
            for await (const data of stream) {
                trackedEvents.push({
                    type: 'data',
                    commandLine: e.execution.commandLine.value,
                    data,
                });
            }
            readIteratorsFlushedDeferred.complete();
        }));
        store.add(si.onDidRequestEndExecution(e => trackedEvents.push({
            type: 'end',
            commandLine: e.execution.commandLine.value,
        })));
    });
    test('simple execution', async () => {
        const execution = await startExecutionAwaitObject(testCommandLine);
        deepStrictEqual(execution.commandLine.value, testCommandLine);
        const execution2 = await endExecutionAwaitObject(testCommandLine);
        strictEqual(execution2, execution);
        assertTrackedEvents([
            { commandLine: testCommandLine, type: 'start' },
            { commandLine: testCommandLine, type: 'end' },
        ]);
    });
    test('different execution unexpectedly ended', async () => {
        const execution1 = await startExecutionAwaitObject(testCommandLine);
        const execution2 = await endExecutionAwaitObject(testCommandLine2);
        strictEqual(execution1, execution2, 'when a different execution is ended, the one that started first should end');
        assertTrackedEvents([
            { commandLine: testCommandLine, type: 'start' },
            // This looks weird, but it's the same execution behind the scenes, just the command
            // line was updated
            { commandLine: testCommandLine2, type: 'end' },
        ]);
    });
    test('no end event', async () => {
        const execution1 = await startExecutionAwaitObject(testCommandLine);
        const endedExecution = await new Promise(r => {
            store.add(si.onDidRequestEndExecution(e => r(e.execution)));
            startExecutionAwaitObject(testCommandLine2);
        });
        strictEqual(execution1, endedExecution, 'when no end event is fired, the current execution should end');
        // Clean up disposables
        await endExecutionAwaitObject(testCommandLine2);
        await Promise.all(readIteratorsFlushed);
        assertTrackedEvents([
            { commandLine: testCommandLine, type: 'start' },
            { commandLine: testCommandLine, type: 'end' },
            { commandLine: testCommandLine2, type: 'start' },
            { commandLine: testCommandLine2, type: 'end' },
        ]);
    });
    suite('executeCommand', () => {
        test('^C to clear previous command', async () => {
            const commandLine = 'foo';
            const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), undefined);
            const firstExecution = await startExecutionAwaitObject('^C');
            notStrictEqual(firstExecution, apiRequestedExecution.value);
            si.emitData('SIGINT');
            si.endShellExecution(cmdLine('^C'), 0);
            si.startShellExecution(cmdLine(commandLine), undefined);
            await emitData('1');
            await endExecutionAwaitObject(commandLine);
            // IMPORTANT: We cannot reliably assert the order of data events here because flushing
            // of the async iterator is asynchronous and could happen after the execution's end
            // event fires if an execution is started immediately afterwards.
            await Promise.all(readIteratorsFlushed);
            assertNonDataTrackedEvents([
                { commandLine: '^C', type: 'start' },
                { commandLine: '^C', type: 'end' },
                { commandLine, type: 'start' },
                { commandLine, type: 'end' },
            ]);
            assertDataTrackedEvents([
                { commandLine: '^C', type: 'data', data: 'SIGINT' },
                { commandLine, type: 'data', data: '1' },
            ]);
        });
        test('multi-line command line', async () => {
            const commandLine = 'foo\nbar';
            const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), undefined);
            const startedExecution = await startExecutionAwaitObject('foo');
            strictEqual(startedExecution, apiRequestedExecution.value);
            si.emitData('1');
            si.emitData('2');
            si.endShellExecution(cmdLine('foo'), 0);
            si.startShellExecution(cmdLine('bar'), undefined);
            si.emitData('3');
            si.emitData('4');
            const endedExecution = await endExecutionAwaitObject('bar');
            strictEqual(startedExecution, endedExecution);
            assertTrackedEvents([
                { commandLine, type: 'start' },
                { commandLine, type: 'data', data: '1' },
                { commandLine, type: 'data', data: '2' },
                { commandLine, type: 'data', data: '3' },
                { commandLine, type: 'data', data: '4' },
                { commandLine, type: 'end' },
            ]);
        });
        test('multi-line command with long second command', async () => {
            const commandLine = 'echo foo\ncat << EOT\nline1\nline2\nline3\nEOT';
            const subCommandLine1 = 'echo foo';
            const subCommandLine2 = 'cat << EOT\nline1\nline2\nline3\nEOT';
            const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), undefined);
            const startedExecution = await startExecutionAwaitObject(subCommandLine1);
            strictEqual(startedExecution, apiRequestedExecution.value);
            si.emitData(`${vsc('C')}foo`);
            si.endShellExecution(cmdLine(subCommandLine1), 0);
            si.startShellExecution(cmdLine(subCommandLine2), undefined);
            si.emitData(`${vsc('C')}line1`);
            si.emitData('line2');
            si.emitData('line3');
            const endedExecution = await endExecutionAwaitObject(subCommandLine2);
            strictEqual(startedExecution, endedExecution);
            assertTrackedEvents([
                { commandLine, type: 'start' },
                { commandLine, type: 'data', data: `${vsc('C')}foo` },
                { commandLine, type: 'data', data: `${vsc('C')}line1` },
                { commandLine, type: 'data', data: 'line2' },
                { commandLine, type: 'data', data: 'line3' },
                { commandLine, type: 'end' },
            ]);
        });
        test('multi-line command comment followed by long second command', async () => {
            const commandLine = '# comment: foo\ncat << EOT\nline1\nline2\nline3\nEOT';
            const subCommandLine1 = '# comment: foo';
            const subCommandLine2 = 'cat << EOT\nline1\nline2\nline3\nEOT';
            const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), undefined);
            const startedExecution = await startExecutionAwaitObject(subCommandLine1);
            strictEqual(startedExecution, apiRequestedExecution.value);
            si.emitData(`${vsc('C')}`);
            si.endShellExecution(cmdLine(subCommandLine1), 0);
            si.startShellExecution(cmdLine(subCommandLine2), undefined);
            si.emitData(`${vsc('C')}line1`);
            si.emitData('line2');
            si.emitData('line3');
            const endedExecution = await endExecutionAwaitObject(subCommandLine2);
            strictEqual(startedExecution, endedExecution);
            assertTrackedEvents([
                { commandLine, type: 'start' },
                { commandLine, type: 'data', data: `${vsc('C')}` },
                { commandLine, type: 'data', data: `${vsc('C')}line1` },
                { commandLine, type: 'data', data: 'line2' },
                { commandLine, type: 'data', data: 'line3' },
                { commandLine, type: 'end' },
            ]);
        });
        test('4 multi-line commands with output', async () => {
            const commandLine = 'echo "\nfoo"\ngit commit -m "hello\n\nworld"\ncat << EOT\nline1\nline2\nline3\nEOT\n{\necho "foo"\n}';
            const subCommandLine1 = 'echo "\nfoo"';
            const subCommandLine2 = 'git commit -m "hello\n\nworld"';
            const subCommandLine3 = 'cat << EOT\nline1\nline2\nline3\nEOT';
            const subCommandLine4 = '{\necho "foo"\n}';
            const apiRequestedExecution = si.requestNewShellExecution(cmdLine(commandLine), undefined);
            const startedExecution = await startExecutionAwaitObject(subCommandLine1);
            strictEqual(startedExecution, apiRequestedExecution.value);
            si.emitData(`${vsc('C')}foo`);
            si.endShellExecution(cmdLine(subCommandLine1), 0);
            si.startShellExecution(cmdLine(subCommandLine2), undefined);
            si.emitData(`${vsc('C')} 2 files changed, 61 insertions(+), 2 deletions(-)`);
            si.endShellExecution(cmdLine(subCommandLine2), 0);
            si.startShellExecution(cmdLine(subCommandLine3), undefined);
            si.emitData(`${vsc('C')}line1`);
            si.emitData('line2');
            si.emitData('line3');
            si.endShellExecution(cmdLine(subCommandLine3), 0);
            si.emitData(`${vsc('C')}foo`);
            si.startShellExecution(cmdLine(subCommandLine4), undefined);
            const endedExecution = await endExecutionAwaitObject(subCommandLine4);
            strictEqual(startedExecution, endedExecution);
            assertTrackedEvents([
                { commandLine, type: 'start' },
                { commandLine, type: 'data', data: `${vsc('C')}foo` },
                { commandLine, type: 'data', data: `${vsc('C')} 2 files changed, 61 insertions(+), 2 deletions(-)` },
                { commandLine, type: 'data', data: `${vsc('C')}line1` },
                { commandLine, type: 'data', data: 'line2' },
                { commandLine, type: 'data', data: 'line3' },
                { commandLine, type: 'data', data: `${vsc('C')}foo` },
                { commandLine, type: 'end' },
            ]);
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRlcm1pbmFsU2hlbGxJbnRlZ3JhdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2NvbW1vbi9leHRIb3N0VGVybWluYWxTaGVsbEludGVncmF0aW9uLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDbkcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGtDQUFrQyxDQUFDO0FBQzNELE9BQU8sRUFBRSwyQ0FBMkMsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzNGLE9BQU8sRUFBRSxlQUFlLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUV0RSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFbkUsU0FBUyxPQUFPLENBQUMsS0FBYTtJQUM3QixPQUFPLE1BQU0sQ0FBQyxNQUFNLENBQUM7UUFDcEIsVUFBVSxFQUFFLDJDQUEyQyxDQUFDLElBQUk7UUFDNUQsS0FBSztRQUNMLFNBQVMsRUFBRSxJQUFJO0tBQ2YsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQUNELFNBQVMsU0FBUyxDQUFDLEtBQWlEO0lBQ25FLElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFLENBQUM7UUFDL0IsT0FBTyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkIsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUNELFNBQVMsR0FBRyxDQUFDLElBQVk7SUFDeEIsT0FBTyxZQUFZLElBQUksTUFBTSxDQUFDO0FBQy9CLENBQUM7QUFFRCxNQUFNLGVBQWUsR0FBRyxrQkFB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