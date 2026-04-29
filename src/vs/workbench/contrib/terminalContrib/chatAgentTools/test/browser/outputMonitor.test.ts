/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { detectsGenericPressAnyKeyPattern, detectsHighConfidenceInputPattern, detectsInputRequiredPattern, detectsNonInteractiveHelpPattern, detectsVSCodeTaskFinishMessage, getLastLine, matchTerminalPromptOption, OutputMonitor } from '../../browser/tools/monitoring/outputMonitor.js';
import { CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IExecution, IPollingResult, OutputMonitorState } from '../../browser/tools/monitoring/types.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { IToolInvocationContext } from '../../../../chat/common/tools/languageModelToolsService.js';
import { LocalChatSessionUri } from '../../../../chat/common/model/chatUri.js';
import { isNumber } from '../../../../../../base/common/types.js';

suite('OutputMonitor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let monitor: OutputMonitor;
	let execution: IExecution;
	let cts: CancellationTokenSource;
	let instantiationService: TestInstantiationService;
	let sendTextCalled: boolean;
	let dataEmitter: Emitter<string>;

	setup(() => {
		sendTextCalled = false;
		dataEmitter = new Emitter<string>();
		execution = {
			getOutput: () => 'test output',
			isActive: async () => false,
			instance: {
				instanceId: 1,
				sendText: async (text?: string) => {
					sendTextCalled = true;
				},
				onDidInputData: dataEmitter.event,
				onDisposed: Event.None,
				onData: dataEmitter.event,
				focus: () => { },
				// eslint-disable-next-line local/code-no-any-casts
				registerMarker: () => ({ id: 1 } as any)
			},
			sessionResource: LocalChatSessionUri.forSession('1')
		};
		instantiationService = new TestInstantiationService();

		instantiationService.stub(ITerminalLogService, new NullLogService());
		cts = new CancellationTokenSource();
	});

	teardown(() => {
		cts.dispose();
	});

	test('startMonitoring returns immediately when polling succeeds', async () => {
		return runWithFakedTimers({}, async () => {
			// Simulate output change after first poll
			let callCount = 0;
			execution.getOutput = () => {
				callCount++;
				return callCount > 1 ? 'changed output' : 'test output';
			};
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
			assert.strictEqual(pollingResult.output, 'changed output');
			assert.strictEqual(sendTextCalled, false, 'sendText should not be called');
		});
	});

	test('startMonitoring returns cancelled when token is cancelled', async () => {
		return runWithFakedTimers({}, async () => {
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			cts.cancel();
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Cancelled);
		});
	});
	test('startMonitoring returns idle when isActive is false', async () => {
		return runWithFakedTimers({}, async () => {
			execution.isActive = async () => false;
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
		});
	});

	test('startMonitoring works when isActive is undefined', async () => {
		return runWithFakedTimers({}, async () => {
			// Simulate output change after first poll
			let callCount = 0;
			execution.getOutput = () => {
				callCount++;
				return callCount > 1 ? 'changed output' : 'test output';
			};
			delete execution.isActive;
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
		});
	});

	test('non-interactive help completes without prompting', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'press h + enter to show help';
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
			assert.strictEqual(pollingResult?.output, 'press h + enter to show help');
		});
	});

	test('monitor can be disposed twice without error', async () => {
		return runWithFakedTimers({}, async () => {
			// Simulate output change after first poll
			let callCount = 0;
			execution.getOutput = () => {
				callCount++;
				return callCount > 1 ? 'changed output' : 'test output';
			};
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
			monitor.dispose();
			monitor.dispose();
		});
	});
	test('timeout prompt unanswered → continues polling and completes when idle', async () => {
		return runWithFakedTimers({}, async () => {
			// Poller: first pass times out, second pass goes idle
			let pass = 0;
			const timeoutThenIdle = async (): Promise<IPollingResult> => {
				pass++;
				return pass === 1
					? { state: OutputMonitorState.Timeout, output: execution.getOutput() }
					: { state: OutputMonitorState.Idle, output: execution.getOutput() };
			};

			monitor = store.add(
				instantiationService.createInstance(
					OutputMonitor,
					execution,
					timeoutThenIdle,
					createTestContext('1'),
					cts.token,
					'test command'
				)
			);

			await Event.toPromise(monitor.onDidFinishCommand);

			const res = monitor.pollingResult!;
			assert.strictEqual(res.state, OutputMonitorState.Idle);
			assert.strictEqual(res.output, 'test output');
			assert.ok(isNumber(res.pollDurationMs));
		});
	});

	test('press any key fires onDidDetectInputNeeded and stops polling', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'Press any key to continue...';
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;

			assert.strictEqual(inputNeededFired, true, 'onDidDetectInputNeeded should fire for press any key');
			assert.strictEqual(sendTextCalled, false, 'sendText should not be called');
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
			assert.strictEqual(pollingResult?.output, 'Press any key to continue...');
		});
	});

	test('onDidDetectInputNeeded fires for input-required patterns in foreground mode', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'Continue? (y/n) ';
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;

			assert.strictEqual(inputNeededFired, true, 'onDidDetectInputNeeded should fire for input-required pattern');
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
			assert.strictEqual(pollingResult?.output, 'Continue? (y/n) ', 'output should be returned');
			assert.strictEqual(sendTextCalled, false, 'no elicitation or auto-reply should send text');
		});
	});

	test('onDidDetectInputNeeded fires for newline-terminated input-required patterns in foreground mode', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'Continue? (y/n) \n';
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;

			assert.strictEqual(inputNeededFired, true, 'onDidDetectInputNeeded should fire for newline-terminated input-required pattern');
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
			assert.strictEqual(pollingResult?.output, 'Continue? (y/n) \n', 'output should be returned');
			assert.strictEqual(sendTextCalled, false, 'no elicitation or auto-reply should send text');
		});
	});

	test('onDidDetectInputNeeded does not fire for non-input output', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'Build complete successfully';
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			assert.strictEqual(inputNeededFired, false, 'onDidDetectInputNeeded should not fire for non-input output');
		});
	});

	test('non-interactive help on the last line stops monitoring before custom polling', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'Build complete successfully\npress h + enter to show help';
			let customPollCalled = false;
			const pollFn = async (): Promise<IPollingResult | undefined> => {
				customPollCalled = true;
				return { state: OutputMonitorState.Idle, output: 'custom poll output' };
			};
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, pollFn, createTestContext('1'), cts.token, 'test command'));

			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;

			assert.strictEqual(customPollCalled, false, 'custom poller should not run when help text is on the last line');
			assert.strictEqual(pollingResult?.state, OutputMonitorState.Idle);
			assert.strictEqual(pollingResult?.output, 'Build complete successfully\npress h + enter to show help');
		});
	});

	test('non-interactive help on a non-final line does not stop custom polling', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'press h + enter to show help\nBuild complete successfully';
			let customPollCalled = false;
			const pollFn = async (): Promise<IPollingResult | undefined> => {
				customPollCalled = true;
				return { state: OutputMonitorState.Idle, output: 'custom poll output' };
			};
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, pollFn, createTestContext('1'), cts.token, 'test command'));

			await Event.toPromise(monitor.onDidFinishCommand);
			const pollingResult = monitor.pollingResult;

			assert.strictEqual(customPollCalled, true, 'custom poller should still run when help text is not on the last line');
			assert.strictEqual(pollingResult?.output, 'custom poll output');
		});
	});

	suite('getLastLine', () => {
		test('trims trailing line breaks before returning the last line', () => {
			assert.strictEqual(getLastLine('Password:\n'), 'Password:');
			assert.strictEqual(getLastLine('Continue? (y/n) \n'), 'Continue? (y/n) ');
		});

		test('preserves the final visual line across bare carriage returns', () => {
			assert.strictEqual(getLastLine('Downloading package metadata\r'), 'Downloading package metadata');
			assert.strictEqual(getLastLine('25%\r50%\rPassword:'), 'Password:');
		});
	});

	suite('detectsInputRequiredPattern', () => {
		test('detects yes/no confirmation prompts (pairs and variants)', () => {
			assert.strictEqual(detectsInputRequiredPattern('Continue? (y/N) '), true);
			assert.strictEqual(detectsInputRequiredPattern('Continue? (y/n) '), true);
			assert.strictEqual(detectsInputRequiredPattern('Overwrite file? [Y/n] '), true);
			assert.strictEqual(detectsInputRequiredPattern('Are you sure? (Y/N) '), true);
			assert.strictEqual(detectsInputRequiredPattern('Delete files? [y/N] '), true);
			assert.strictEqual(detectsInputRequiredPattern('Proceed? (yes/no) '), true);
			assert.strictEqual(detectsInputRequiredPattern('Proceed? [no/yes] '), true);
			assert.strictEqual(detectsInputRequiredPattern('Continue? y/n '), true);
			assert.strictEqual(detectsInputRequiredPattern('Overwrite: yes/no '), true);

			// No match if there's a response already
			assert.strictEqual(detectsInputRequiredPattern('Continue? (y/N) y'), false);
			assert.strictEqual(detectsInputRequiredPattern('Continue? (y/n) n'), false);
			assert.strictEqual(detectsInputRequiredPattern('Overwrite file? [Y/n] N'), false);
			assert.strictEqual(detectsInputRequiredPattern('Are you sure? (Y/N) Y'), false);
			assert.strictEqual(detectsInputRequiredPattern('Delete files? [y/N] y'), false);
			assert.strictEqual(detectsInputRequiredPattern('Continue? y/n y\/n'), false);
			assert.strictEqual(detectsInputRequiredPattern('Overwrite: yes/no yes\/n'), false);
		});

		test('detects PowerShell multi-option confirmation line', () => {
			assert.strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): '),
				true
			);
			// also matches without default suffix
			assert.strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [N] No '),
				true
			);

			// No match if there's a response already
			assert.strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): Y'),
				false
			);
			assert.strictEqual(
				detectsInputRequiredPattern('[Y] Yes  [N] No N'),
				false
			);
		});
		test('PowerShell regex does not cause catastrophic backtracking (ReDoS)', () => {
			// Pathological input: many spaces not followed by a bracket.
			// With the old overlapping regex this would hang; it must return promptly.
			const start = performance.now();
			const pathological = '[Y] Yes' + ' '.repeat(200) + 'x';
			detectsInputRequiredPattern(pathological);
			const elapsed = performance.now() - start;
			assert.ok(elapsed < 500, `Regex took ${elapsed}ms on pathological input, expected < 500ms`);
		});
		test('Line ends with colon', () => {
			assert.strictEqual(detectsInputRequiredPattern('Enter your name: '), true);
			assert.strictEqual(detectsInputRequiredPattern('Password: '), true);
			assert.strictEqual(detectsInputRequiredPattern('File to overwrite: '), true);

			// Non-prompts: a trailing colon without a following space is typical of normal
			// command output (headers, log lines ending with ':' before a newline) and must
			// not be treated as an input prompt.
			assert.strictEqual(detectsInputRequiredPattern('Running tests:'), false);
			assert.strictEqual(detectsInputRequiredPattern('Results:\n'), false);
			assert.strictEqual(detectsInputRequiredPattern('Summary:'), false);
		});

		test('detects prompts with parenthesized default values', () => {
			assert.strictEqual(detectsInputRequiredPattern('package name: (test) '), true);
			assert.strictEqual(detectsInputRequiredPattern('version: (1.0.0) '), true);
			assert.strictEqual(detectsInputRequiredPattern('entry point: (index.js) '), true);
			assert.strictEqual(detectsInputRequiredPattern('license: (ISC) '), true);
		});

		test('detects trailing questions', () => {
			assert.strictEqual(detectsInputRequiredPattern('Continue? '), true);
			assert.strictEqual(detectsInputRequiredPattern('Proceed?   '), true);
			assert.strictEqual(detectsInputRequiredPattern('Are you sure? '), true);

			// Non-prompts: a trailing '?' without a following space is typical of
			// normal command output (log lines, error messages) and must not be
			// treated as an input prompt.
			assert.strictEqual(detectsInputRequiredPattern('Continue?'), false);
			assert.strictEqual(detectsInputRequiredPattern('Are you sure?\n'), false);
			assert.strictEqual(detectsInputRequiredPattern('What happened?'), false);
		});

		test('detects press any key prompts', () => {
			assert.strictEqual(detectsInputRequiredPattern('Press any key to continue...'), true);
			assert.strictEqual(detectsInputRequiredPattern('Press a key'), true);
		});

		test('detects non-interactive help prompts without treating them as input', () => {
			assert.strictEqual(detectsInputRequiredPattern('press h + enter to show help'), false);
			assert.strictEqual(detectsInputRequiredPattern('press h to show help'), false);
			assert.strictEqual(detectsNonInteractiveHelpPattern('press h + enter to show help'), true);
			assert.strictEqual(detectsNonInteractiveHelpPattern('press h to show help'), true);
			assert.strictEqual(detectsNonInteractiveHelpPattern('press h to show commands'), true);
			assert.strictEqual(detectsNonInteractiveHelpPattern('press ? to see commands'), true);
			assert.strictEqual(detectsNonInteractiveHelpPattern('press ? + enter for options'), true);
			assert.strictEqual(detectsNonInteractiveHelpPattern('type h + enter to show help'), true);
			assert.strictEqual(detectsNonInteractiveHelpPattern('hit ? for help'), true);
			assert.strictEqual(detectsNonInteractiveHelpPattern('type h to see options'), true);
			assert.strictEqual(detectsInputRequiredPattern('press o to open the app'), false);
			assert.strictEqual(detectsNonInteractiveHelpPattern('press o to open the app'), true);
			assert.strictEqual(detectsInputRequiredPattern('press r to restart the server'), false);
			assert.strictEqual(detectsNonInteractiveHelpPattern('press r to restart the server'), true);
			assert.strictEqual(detectsInputRequiredPattern('press q to quit'), false);
			assert.strictEqual(detectsNonInteractiveHelpPattern('press q to quit'), true);
			assert.strictEqual(detectsInputRequiredPattern('press u to show server url'), false);
			assert.strictEqual(detectsNonInteractiveHelpPattern('press u to show server url'), true);
		});
	});

	suite('detectsHighConfidenceInputPattern', () => {
		test('matches y/n and PowerShell prompts', () => {
			assert.strictEqual(detectsHighConfidenceInputPattern('Continue? (y/N) '), true);
			assert.strictEqual(detectsHighConfidenceInputPattern('Overwrite file? [Y/n] '), true);
			assert.strictEqual(detectsHighConfidenceInputPattern('[Y] Yes  [N] No '), true);
			assert.strictEqual(detectsHighConfidenceInputPattern('[Y] Yes  [A] Yes to All  [N] No  [L] No to All  [S] Suspend  [?] Help (default is "Y"): '), true);
		});
		test('matches password and press-any-key prompts', () => {
			assert.strictEqual(detectsHighConfidenceInputPattern('Password: '), true);
			assert.strictEqual(detectsHighConfidenceInputPattern('Press any key to continue...'), true);
		});
		test('matches parenthesized defaults', () => {
			assert.strictEqual(detectsHighConfidenceInputPattern('package name: (test) '), true);
			assert.strictEqual(detectsHighConfidenceInputPattern('version: (1.0.0) '), true);
		});
		test('matches (END) pager', () => {
			assert.strictEqual(detectsHighConfidenceInputPattern('(END)'), true);
		});
		test('does NOT match bare colon prompts (too broad for fast-path)', () => {
			assert.strictEqual(detectsHighConfidenceInputPattern('Enter your name: '), false);
			assert.strictEqual(detectsHighConfidenceInputPattern('File to overwrite: '), false);
			assert.strictEqual(detectsHighConfidenceInputPattern('Building project: '), false);
			assert.strictEqual(detectsHighConfidenceInputPattern('Running tests:'), false);
		});
		test('does NOT match bare question prompts (too broad for fast-path)', () => {
			assert.strictEqual(detectsHighConfidenceInputPattern('Continue? '), false);
			assert.strictEqual(detectsHighConfidenceInputPattern('Are you sure? '), false);
			assert.strictEqual(detectsHighConfidenceInputPattern('What happened?'), false);
		});
	});

	suite('matchTerminalPromptOption', () => {
		test('matches suggested option case-insensitively', () => {
			assert.deepStrictEqual(matchTerminalPromptOption(['Y', 'n'], 'y'), { option: 'Y', index: 0 });
			assert.deepStrictEqual(matchTerminalPromptOption(['y', 'N'], 'n'), { option: 'N', index: 1 });
		});

		test('strips quotes and trailing punctuation', () => {
			assert.deepStrictEqual(matchTerminalPromptOption(['Y', 'n'], '"y"'), { option: 'Y', index: 0 });
			assert.deepStrictEqual(matchTerminalPromptOption(['yes', 'no'], 'no.'), { option: 'no', index: 1 });
		});

		test('handles bracketed options like [Y]', () => {
			assert.deepStrictEqual(matchTerminalPromptOption(['Y', 'n'], '[y]'), { option: 'Y', index: 0 });
			assert.deepStrictEqual(matchTerminalPromptOption(['y', 'N'], '(n)'), { option: 'N', index: 1 });
		});

		test('handles default suffixes by using first token', () => {
			assert.deepStrictEqual(matchTerminalPromptOption(['Y', 'n'], 'Y (default)'), { option: 'Y', index: 0 });
			assert.deepStrictEqual(matchTerminalPromptOption(['Enter'], 'Enter to continue'), { option: 'Enter', index: 0 });
		});
	});

	suite('detectsVSCodeTaskFinishMessage', () => {
		test('detects VS Code task completion messages', () => {
			assert.strictEqual(detectsVSCodeTaskFinishMessage('Press any key to close the terminal.'), true);
			assert.strictEqual(detectsVSCodeTaskFinishMessage('Terminal will be reused by tasks, press any key to close it.'), true);
			assert.strictEqual(detectsVSCodeTaskFinishMessage('The terminal will be reused by tasks. Press any key to close. Please provide the required input to the terminal.'), true);
			// Case insensitive
			assert.strictEqual(detectsVSCodeTaskFinishMessage('press any key to close the terminal.'), true);
			assert.strictEqual(detectsVSCodeTaskFinishMessage('PRESS ANY KEY TO CLOSE THE TERMINAL.'), true);
			// With " * " prefix (VS Code adds this to task messages)
			assert.strictEqual(detectsVSCodeTaskFinishMessage(' *  Terminal will be reused by tasks, press any key to close it.'), true);
			assert.strictEqual(detectsVSCodeTaskFinishMessage(' *  Press any key to close the terminal.'), true);
		});

		test('does not match generic press any key messages', () => {
			// Regular script messages should NOT be matched
			assert.strictEqual(detectsVSCodeTaskFinishMessage('Press any key to continue...'), false);
			assert.strictEqual(detectsVSCodeTaskFinishMessage('Press any key to exit'), false);
			assert.strictEqual(detectsVSCodeTaskFinishMessage('Press any key'), false);
		});

		test('does not match other prompts', () => {
			assert.strictEqual(detectsVSCodeTaskFinishMessage('Continue? (y/n)'), false);
			assert.strictEqual(detectsVSCodeTaskFinishMessage('Password:'), false);
			assert.strictEqual(detectsVSCodeTaskFinishMessage('press h to show help'), false);
		});
	});

	suite('disposable leak regression', () => {
		test('disposing before timeout(0) fires does not leak idle input listener', async () => {
			// Regression: disposing immediately (before the deferred _startMonitoring fires)
			// must not leak the FunctionDisposable created by onDidInputData.
			// The CTS must be cancelled synchronously so that when timeout(0) fires and
			// _setupIdleInputListener runs, isCancellationRequested is already true.
			return runWithFakedTimers({}, async () => {
				monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
				// Dispose immediately, before the deferred _startMonitoring callback fires.
				monitor.dispose();
				await new Promise<void>(resolve => setTimeout(resolve, 0));
				// ensureNoDisposablesAreLeakedInTestSuite will catch any leaked disposable.
			});
		});

		test('disposing after monitoring completes does not leak idle input listener', async () => {
			// Verifies the finally block in _startMonitoring clears _userInputListener before
			// firing onDidFinishCommand. Any undisposed FunctionDisposable from onDidInputData
			// would be caught by ensureNoDisposablesAreLeakedInTestSuite.
			return runWithFakedTimers({}, async () => {
				execution.isActive = async () => false;
				monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
				await Event.toPromise(monitor.onDidFinishCommand);
				monitor.dispose();
			});
		});

		test('disposing while monitoring is in-flight still resolves onDidFinishCommand', async () => {
			// Regression: if dispose() races the async _startMonitoring loop, the loop's
			// finally block fires onDidFinishCommand AFTER super.dispose() has already
			// torn down the emitter. Consumers awaiting Event.toPromise(onDidFinishCommand)
			// would never resolve and the agent would hang on the run_in_terminal call.
			//
			// Fix: dispose() must fire onDidFinishCommand synchronously, before the
			// emitter is disposed. It must also surface a Cancelled pollingResult so
			// consumers that read monitor.pollingResult after awaiting the event see a
			// defined value rather than undefined.
			return runWithFakedTimers({}, async () => {
				monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));
				const finished = Event.toPromise(monitor.onDidFinishCommand);
				// Dispose immediately, before the deferred _startMonitoring even starts.
				monitor.dispose();
				// Must resolve — would hang prior to the synchronous-fire-on-dispose fix.
				await finished;
				assert.ok(monitor.pollingResult, 'pollingResult should be defined after dispose-induced finish');
				assert.strictEqual(monitor.pollingResult!.state, OutputMonitorState.Cancelled);
			});
		});
	});

	suite('detectsGenericPressAnyKeyPattern', () => {
		test('detects generic press any key prompts from scripts', () => {
			assert.strictEqual(detectsGenericPressAnyKeyPattern('Press any key to continue...'), true);
			assert.strictEqual(detectsGenericPressAnyKeyPattern('Press any key to exit'), true);
			assert.strictEqual(detectsGenericPressAnyKeyPattern('Press any key'), true);
			assert.strictEqual(detectsGenericPressAnyKeyPattern('press a key to continue'), true);
			// Case insensitive
			assert.strictEqual(detectsGenericPressAnyKeyPattern('PRESS ANY KEY TO CONTINUE'), true);
		});

		test('does not match VS Code task finish messages', () => {
			// These should be handled by detectsVSCodeTaskFinishMessage, not this function
			assert.strictEqual(detectsGenericPressAnyKeyPattern('Press any key to close the terminal.'), false);
			assert.strictEqual(detectsGenericPressAnyKeyPattern('Terminal will be reused by tasks, press any key to close it.'), false);
			// With " * " prefix
			assert.strictEqual(detectsGenericPressAnyKeyPattern(' *  Terminal will be reused by tasks, press any key to close it.'), false);
			assert.strictEqual(detectsGenericPressAnyKeyPattern(' *  Press any key to close the terminal.'), false);
		});

		test('does not match other prompts', () => {
			assert.strictEqual(detectsGenericPressAnyKeyPattern('Continue? (y/n)'), false);
			assert.strictEqual(detectsGenericPressAnyKeyPattern('Password:'), false);
			assert.strictEqual(detectsGenericPressAnyKeyPattern('press h to show help'), false);
		});
	});

});
function createTestContext(id: string): IToolInvocationContext {
	return { sessionResource: LocalChatSessionUri.forSession(id) };
}
