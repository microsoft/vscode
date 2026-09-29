/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Terminal, type TerminalShellExecution, type TerminalShellExecutionCommandLine, type TerminalShellExecutionStartEvent } from 'vscode';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { InternalTerminalShellIntegration } from '../../common/extHostTerminalShellIntegration.js';
import { Emitter } from '../../../../base/common/event.js';
import { TerminalShellExecutionCommandLineConfidence } from '../../common/extHostTypes.js';
import { deepStrictEqual, notStrictEqual, strictEqual } from 'assert';
import type { URI } from '../../../../base/common/uri.js';
import { DeferredPromise } from '../../../../base/common/async.js';

function cmdLine(value: string): TerminalShellExecutionCommandLine {
	return Object.freeze({
		confidence: TerminalShellExecutionCommandLineConfidence.High,
		value,
		isTrusted: true,
	});
}
function asCmdLine(value: string | TerminalShellExecutionCommandLine): TerminalShellExecutionCommandLine {
	if (typeof value === 'string') {
		return cmdLine(value);
	}
	return value;
}
function vsc(data: string) {
	return `\x1b]633;${data}\x07`;
}

const testCommandLine = 'echo hello world';
const testCommandLine2 = 'echo goodbye world';

interface ITrackedEvent {
	type: 'start' | 'data' | 'end';
	commandLine: string;
	data?: string;
}

suite('InternalTerminalShellIntegration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let si: InternalTerminalShellIntegration;
	let terminal: Terminal;
	let onDidStartTerminalShellExecution: Emitter<TerminalShellExecutionStartEvent>;
	let trackedEvents: ITrackedEvent[];
	let readIteratorsFlushed: Promise<void>[];

	async function startExecutionAwaitObject(commandLine: string | TerminalShellExecutionCommandLine, cwd?: URI): Promise<TerminalShellExecution> {
		return await new Promise<TerminalShellExecution>(r => {
			store.add(onDidStartTerminalShellExecution.event(e => {
				r(e.execution);
			}));
			si.startShellExecution(asCmdLine(commandLine), cwd);
		});
	}

	async function endExecutionAwaitObject(commandLine: string | TerminalShellExecutionCommandLine): Promise<TerminalShellExecution> {
		return await new Promise<TerminalShellExecution>(r => {
			store.add(si.onDidRequestEndExecution(e => r(e.execution)));
			si.endShellExecution(asCmdLine(commandLine), 0);
		});
	}

	async function emitData(data: string): Promise<void> {
		// AsyncIterableObjects are initialized in a microtask, this doesn't matter in practice
		// since the events will always come through in different events.
		await new Promise<void>(r => queueMicrotask(r));
		si.emitData(data);
	}

	function assertTrackedEvents(expected: ITrackedEvent[]) {
		deepStrictEqual(trackedEvents, expected);
	}

	function assertNonDataTrackedEvents(expected: ITrackedEvent[]) {
		deepStrictEqual(trackedEvents.filter(e => e.type !== 'data'), expected);
	}

	function assertDataTrackedEvents(expected: ITrackedEvent[]) {
		deepStrictEqual(trackedEvents.filter(e => e.type === 'data'), expected);
	}

	setup(() => {
		// eslint-disable-next-line local/code-no-any-casts
		terminal = Symbol('testTerminal') as any;
		onDidStartTerminalShellExecution = store.add(new Emitter());
		si = store.add(new InternalTerminalShellIntegration(terminal, true, onDidStartTerminalShellExecution));

		trackedEvents = [];
		readIteratorsFlushed = [];
		store.add(onDidStartTerminalShellExecution.event(async e => {
			trackedEvents.push({
				type: 'start',
				commandLine: e.execution.commandLine.value,
			});
			const stream = e.execution.read();
			const readIteratorsFlushedDeferred = new DeferredPromise<void>();
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
		const endedExecution = await new Promise<TerminalShellExecution>(r => {
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
