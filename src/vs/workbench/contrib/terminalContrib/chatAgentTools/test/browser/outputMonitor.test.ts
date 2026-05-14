/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { detectsGenericPressAnyKeyPattern, detectsHighConfidenceInputPattern, detectsInputRequiredPattern, detectsLikelyInputRequiredPattern, detectsNonInteractiveHelpPattern, detectsSensitiveInputPrompt, detectsVSCodeTaskFinishMessage, getLastLine, matchTerminalPromptOption, OutputMonitor } from '../../browser/tools/monitoring/outputMonitor.js';
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

	// Regression for #315476 (Family 1 — broad-fallback log lines): before the
	// fix, `_handleIdleState`'s call to `detectsInputRequiredPattern` matched any
	// line ending in ': ' or '? ' and fired `onDidDetectInputNeeded`. The strict
	// path no longer carries those fallbacks, so log-shaped output ending in
	// ': ' / '? ' must not raise the wrapper. The broad fallbacks still live in
	// `detectsLikelyInputRequiredPattern` and are gated to `_waitForIdle`'s
	// `recentlyIdle && isActive === true` branch, which does NOT fire the
	// onDidDetectInputNeeded event.
	test('onDidDetectInputNeeded does NOT fire for log lines ending in colon-space (regression for #315476 Family 1)', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'Last Command: ';
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			assert.strictEqual(inputNeededFired, false, 'log-shaped output ending in ": " must not raise the input-needed wrapper');
		});
	});

	test('onDidDetectInputNeeded does NOT fire for lines ending in question-mark-space (regression for #315476 Family 1)', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'Loading? ';
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			assert.strictEqual(inputNeededFired, false, 'log-shaped output ending in "? " must not raise the input-needed wrapper');
		});
	});

	// Regression for #315476 (Family 2 — oh-my-zsh / bash __git_ps1 prompts):
	// the `\s*`→`\s+` tightener in detectsHighConfidenceInputPattern's
	// parenthesized-default rule means `git:(main) ` no longer matches.
	test('onDidDetectInputNeeded does NOT fire for oh-my-zsh git-aware shell prompts (regression for #315476 Family 2)', async () => {
		return runWithFakedTimers({}, async () => {
			// allow-any-unicode-next-line
			execution.getOutput = () => '➜  myrepo git:(main) ';
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			assert.strictEqual(inputNeededFired, false, 'oh-my-zsh shell prompts must not raise the input-needed wrapper');
		});
	});

	// Positive counterpart to the Family 1 regression tests above: the broad
	// fallback patterns `: ` / `? ` are still legitimate input prompts when the
	// execution is actively running (e.g. an interactive script genuinely paused
	// at a prompt). With `execution.isActive() === true`, `_handleIdleState`
	// must re-evaluate the broad pattern and fire `onDidDetectInputNeeded`.
	// Without this re-check, splitting the strict and broad patterns into two
	// functions would have caused legitimate prompts to be silently swallowed
	// in any path that relied on the broad fallback.
	test('onDidDetectInputNeeded DOES fire for broad-pattern lines when execution is active (issue #315476 review feedback)', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'Enter your name: ';
			execution.isActive = async () => true;
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			assert.strictEqual(inputNeededFired, true, 'broad pattern under isActive===true must fire onDidDetectInputNeeded');
		});
	});

	// TOCTOU regression (review feedback on PR #315485): the user-input guard
	// at the top of `_handleIdleState` is checked BEFORE `await
	// this._execution.isActive()`. If the user types during that await, the
	// guard's flag flips to true mid-await but execution still falls through
	// past the original check. Without a post-await re-check, we would fire
	// `onDidDetectInputNeeded` despite the user already having provided
	// input — re-pausing the agent loop on already-consumed prompts.
	//
	// Test design notes (review feedback on PR #315485): the suite-level
	// `dataEmitter` wires BOTH `onDidInputData` AND `onData` to the same
	// emitter. Firing it from `isActive` would also pump `onData`, keep
	// `_waitForIdle`'s `hasReceivedData=true`, reset its
	// `consecutiveIdleEvents`, and prevent the loop from ever reaching Idle —
	// `_handleIdleState` would never run and the test would pass for the wrong
	// reason (timeout state). We therefore use a SEPARATE `inputEmitter`
	// wired only to `onDidInputData`, so firing input during the
	// `isActive()` await flips `_userInputtedSinceIdleDetected` without
	// polluting the polling loop. `_setupIdleInputListener` is what
	// subscribes to `onDidInputData`; that subscription happens when
	// `_waitForIdle` returns Idle, before `_handleIdleState` runs. Earlier
	// `isActive()` calls inside `_waitForIdle` fire into a not-yet-subscribed
	// emitter (no-op for flag state), and `_setupIdleInputListener` resets
	// the flag to false anyway — so the only fire that matters is the one
	// inside `_handleIdleState`'s own `await isActive()`, which is exactly
	// what we want this test to exercise.
	test('onDidDetectInputNeeded does NOT fire if user types during the isActive() await (TOCTOU regression)', async () => {
		return runWithFakedTimers({}, async () => {
			const inputEmitter = store.add(new Emitter<string>());
			execution.getOutput = () => 'Enter your name: ';
			execution.instance = {
				...execution.instance,
				onDidInputData: inputEmitter.event,
			};
			// `isActive` is called by both `_waitForIdle` (per-poll) and
			// `_handleIdleState` (once per visit, on the broad branch).
			// We fire `inputEmitter` from each call. Earlier calls during
			// `_waitForIdle` fire into a not-yet-subscribed listener; the
			// fire that matters is the one inside `_handleIdleState`'s own
			// `await isActive()`, AFTER `_setupIdleInputListener` subscribed
			// during the Idle transition. With the TOCTOU guard, that fire
			// flips `_userInputtedSinceIdleDetected` to true mid-await, and
			// the post-await re-check returns `{ shouldContinuePolling: true }`
			// without firing `onDidDetectInputNeeded`. Without the guard, the
			// broad branch falls through and `_onDidDetectInputNeeded.fire()`
			// runs → assertion fails.
			//
			// `_handleIdleState`'s `shouldContinuePolling: true` reroutes the
			// state machine back to PollingForIdle, which would loop forever
			// here (broad pattern + isActive=true keep producing Idle
			// transitions). We cancel the token after enough cycles for the
			// regression to manifest if the guard is missing — a couple of
			// idle-handler visits is more than enough.
			let isActiveCalls = 0;
			execution.isActive = async () => {
				isActiveCalls++;
				inputEmitter.fire('y');
				if (isActiveCalls >= 6) {
					cts.cancel();
				}
				return true;
			};
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			assert.strictEqual(inputNeededFired, false, 'must re-check user-input guard after the isActive() await; firing here would re-pause the agent on input the user already provided');
			// Sanity: we MUST have entered the broad-pattern branch's
			// `await isActive()` for this test to mean anything. Without
			// at least one call we'd be passing trivially via the
			// pre-existing top-of-method guard or the high-confidence
			// fast-path, neither of which exercises the new TOCTOU re-check.
			assert.ok(isActiveCalls >= 1, `expected isActive() to be called from the broad-pattern branch (got ${isActiveCalls})`);
		});
	});

	test('sensitive prompt fires onDidDetectSensitiveInputNeeded and not onDidDetectInputNeeded', async () => {
		return runWithFakedTimers({}, async () => {
			execution.getOutput = () => 'Password: ';
			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			let sensitiveFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));
			store.add(monitor.onDidDetectSensitiveInputNeeded(() => { sensitiveFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);

			assert.strictEqual(sensitiveFired, true, 'onDidDetectSensitiveInputNeeded should fire for sensitive prompts');
			assert.strictEqual(inputNeededFired, false, 'onDidDetectInputNeeded must not fire for sensitive prompts so the secret is not routed to the agent');
		});
	});

	test('detectsSensitiveInputPrompt matches common secret prompts', () => {
		assert.strictEqual(detectsSensitiveInputPrompt('Password: '), true);
		assert.strictEqual(detectsSensitiveInputPrompt('[sudo] password for jdoe: '), true);
		assert.strictEqual(detectsSensitiveInputPrompt('Passphrase for key /Users/foo/.ssh/id_rsa: '), true);
		assert.strictEqual(detectsSensitiveInputPrompt('Enter your API key: '), true);
		assert.strictEqual(detectsSensitiveInputPrompt('Token: '), true);
		assert.strictEqual(detectsSensitiveInputPrompt('Verification code: '), true);
		assert.strictEqual(detectsSensitiveInputPrompt('Enter OTP: '), true);
		assert.strictEqual(detectsSensitiveInputPrompt('One-time code: '), true);
		assert.strictEqual(detectsSensitiveInputPrompt('Enter your 2FA code: '), true);
		assert.strictEqual(detectsSensitiveInputPrompt('Enter MFA code: '), true);

		assert.strictEqual(detectsSensitiveInputPrompt('Continue? (y/n) '), false);
		assert.strictEqual(detectsSensitiveInputPrompt('Press any key to continue...'), false);
		assert.strictEqual(detectsSensitiveInputPrompt('Enter your name: '), false);
		assert.strictEqual(detectsSensitiveInputPrompt('package name: (test_npm_init) '), false);
	});

	test('extended timeout with isActive fires onDidDetectInputNeeded', async () => {
		return runWithFakedTimers({}, async () => {
			// Simulate a process that stays active with output that doesn't
			// match any input-required pattern — the extended timeout should
			// fire onDidDetectInputNeeded so the agent can assess the output.
			execution.isActive = async () => true;
			execution.getOutput = () => 'Some unrecognised prompt waiting for input';

			monitor = store.add(instantiationService.createInstance(OutputMonitor, execution, undefined, createTestContext('1'), cts.token, 'test command'));

			let inputNeededFired = false;
			store.add(monitor.onDidDetectInputNeeded(() => { inputNeededFired = true; }));

			await Event.toPromise(monitor.onDidFinishCommand);
			assert.strictEqual(inputNeededFired, true, 'onDidDetectInputNeeded should fire on extended timeout with active process');
			assert.strictEqual(monitor.pollingResult?.state, OutputMonitorState.Cancelled);
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
		test('Line ends with colon (strict path)', () => {
			// `Password: ` is recognised by the strict `password\s*:?\s*$` rule.
			assert.strictEqual(detectsInputRequiredPattern('Password: '), true);

			// Generic colon-prefix prompts like `Enter your name: ` or
			// `File to overwrite: ` are NOT recognised by the strict path because
			// they are syntactically indistinguishable from log/status output like
			// `Last Command: ` or `[INFO] Starting: ` (see issue #315476). They are
			// still matched by `detectsLikelyInputRequiredPattern` from a call site
			// that has independent evidence the command is consuming stdin
			// (e.g. `isActive === true`); see the suite below.
			assert.strictEqual(detectsInputRequiredPattern('Enter your name: '), false);
			assert.strictEqual(detectsInputRequiredPattern('File to overwrite: '), false);

			// Non-prompts: a trailing colon without a following space is typical of normal
			// command output (headers, log lines ending with ':' before a newline) and must
			// not be treated as an input prompt.
			assert.strictEqual(detectsInputRequiredPattern('Running tests:'), false);
			assert.strictEqual(detectsInputRequiredPattern('Results:\n'), false);
			assert.strictEqual(detectsInputRequiredPattern('Summary:'), false);

			// Regression cases for issue #315476: log/status output that the previous
			// broad `/: +$/` fallback misclassified as a waiting prompt, pausing the
			// agent loop on benign output.
			assert.strictEqual(detectsInputRequiredPattern('Last Command: '), false);
			assert.strictEqual(detectsInputRequiredPattern('[INFO] Starting: '), false);
			assert.strictEqual(detectsInputRequiredPattern('find: /tmp/x: No such file: '), false);
			assert.strictEqual(detectsInputRequiredPattern('error: subprocess returned: '), false);
			assert.strictEqual(detectsInputRequiredPattern('2025-05-09 12:34:56 INFO Starting: '), false);
		});

		test('detects prompts with parenthesized default values', () => {
			assert.strictEqual(detectsInputRequiredPattern('package name: (test) '), true);
			assert.strictEqual(detectsInputRequiredPattern('version: (1.0.0) '), true);
			assert.strictEqual(detectsInputRequiredPattern('entry point: (index.js) '), true);
			assert.strictEqual(detectsInputRequiredPattern('license: (ISC) '), true);
		});

		test('does NOT match git-aware shell prompts (regression for #315476)', () => {
			// oh-my-zsh's robbyrussell theme renders a prompt of the form
			// allow-any-unicode-next-line
			// `➜  <repo> git:(<branch>) ` after every command. Without requiring
			// at least one space between `:` and `(` in the parenthesized-default
			// rule, every shell prompt return would be mistaken for an input prompt
			// and pause the agent loop on every benign command.
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('➜  myrepo git:(main) '), false);
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('➜  vscode git:(ba-work/output-monitor) '), false);
			// bash with __git_ps1 in PROMPT_COMMAND uses a similar shape.
			assert.strictEqual(detectsInputRequiredPattern('[user@host ~/myrepo (main)]$ '), false);
			// And the looser variant:
			// allow-any-unicode-next-line
			assert.strictEqual(detectsLikelyInputRequiredPattern('➜  myrepo git:(main) '), false);
		});

		test('detects chevron prompts from prompts/enquirer/inquirer libraries', () => {
			// vitest / npm-style "prompts" library uses U+203A SINGLE RIGHT-POINTING ANGLE QUOTATION MARK
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('? Do you want to install jsdom? ›'), true);
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('? Do you want to install jsdom? › '), true);
			// inquirer / enquirer uses U+276F HEAVY RIGHT-POINTING ANGLE QUOTATION MARK
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('? Pick a color ❯ '), true);
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('? Pick a color ❯'), true);
			// Other chevron variants prefixed with '?'
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('? Project name ▸ '), true);
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('? Choose ▶ '), true);

			// No match if the user has already typed a response after the chevron
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('? Do you want to install jsdom? › yes'), false);
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('? Pick a color ❯ red'), false);

			// No match for chevrons in normal output without a leading '?'
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('  feature/foo ❯ main'), false);
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('Project name ▸ '), false);

			// No match when '?' appears mid-line (not as a prompt prefix)
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('What happened? ›'), false);

			// Match when prompt is prefixed with ANSI escape codes (colored output)
			// allow-any-unicode-next-line
			assert.strictEqual(detectsInputRequiredPattern('\x1b[32m? Choose a framework \x1b[0m›'), true);
		});

		test('trailing questions (strict path does not match bare `?` prompts)', () => {
			// Bare trailing-question prompts like `Continue? ` are NOT matched by the
			// strict path. They are matched by the broad fallback in
			// `detectsLikelyInputRequiredPattern` (see suite below), which is only
			// safe to call when the caller has independent evidence the command is
			// still running and consuming stdin.
			assert.strictEqual(detectsInputRequiredPattern('Continue? '), false);
			assert.strictEqual(detectsInputRequiredPattern('Proceed?   '), false);
			assert.strictEqual(detectsInputRequiredPattern('Are you sure? '), false);

			// Non-prompts: a trailing '?' without a following space is typical of
			// normal command output (log lines, error messages) and must not be
			// treated as an input prompt under either function.
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
		test('delegates to detectsHighConfidenceInputPattern (strict-set parity)', () => {
			// Every input that detectsHighConfidenceInputPattern accepts MUST also be
			// accepted by detectsInputRequiredPattern. This pins the contract that the
			// strict path is a superset of the high-confidence path; if a future regex
			// change in detectsHighConfidenceInputPattern breaks this, both call sites
			// (`_handleIdleState`) regress simultaneously and we want to know.
			const strictSet = [
				'Continue? (y/N) ',
				'Overwrite file? [Y/n] ',
				'Password: ',
				'Press any key to continue...',
				'package name: (test) ',
				'(END)',
			];
			for (const line of strictSet) {
				assert.strictEqual(detectsHighConfidenceInputPattern(line), true, `precondition: ${JSON.stringify(line)} should match high-confidence`);
				assert.strictEqual(detectsInputRequiredPattern(line), true, `delegation: ${JSON.stringify(line)} should match strict`);
			}
		});
	});

	suite('detectsLikelyInputRequiredPattern', () => {
		// This function is the strict set PLUS broad colon/question fallbacks. The
		// fallbacks knowingly produce false positives on log-shaped output and are
		// only safe to call from a site with independent evidence the command is
		// still consuming stdin (e.g. `_waitForIdle` gated on `isActive === true`).
		test('matches the same prompts the strict path matches', () => {
			assert.strictEqual(detectsLikelyInputRequiredPattern('Continue? (y/N) '), true);
			assert.strictEqual(detectsLikelyInputRequiredPattern('Password: '), true);
			assert.strictEqual(detectsLikelyInputRequiredPattern('package name: (test) '), true);
			assert.strictEqual(detectsLikelyInputRequiredPattern('Press any key to continue...'), true);
		});
		test('matches bare colon and question-mark prompts the strict path skips', () => {
			assert.strictEqual(detectsLikelyInputRequiredPattern('Enter your name: '), true);
			assert.strictEqual(detectsLikelyInputRequiredPattern('File to overwrite: '), true);
			assert.strictEqual(detectsLikelyInputRequiredPattern('Continue? '), true);
			assert.strictEqual(detectsLikelyInputRequiredPattern('Are you sure? '), true);
		});
		test('still rejects clear non-prompt shapes', () => {
			assert.strictEqual(detectsLikelyInputRequiredPattern('Running tests:'), false);
			assert.strictEqual(detectsLikelyInputRequiredPattern('Continue?'), false);
			assert.strictEqual(detectsLikelyInputRequiredPattern('Are you sure?\n'), false);
		});
		test('documents known false positives on log-shaped output (caller-side guard required)', () => {
			// These match the broad fallback because they are syntactically
			// indistinguishable from real prompts. Issue #315476 documents why the
			// `_handleIdleState` call site no longer invokes this function on
			// finished commands; the `_waitForIdle` site remains gated on
			// `isActive === true`.
			assert.strictEqual(detectsLikelyInputRequiredPattern('Last Command: '), true);
			assert.strictEqual(detectsLikelyInputRequiredPattern('[INFO] Starting: '), true);
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
			// xterm's translateToString(trimRight=true) strips trailing whitespace from
			// non-wrapped buffer lines, so a real `Password: ` prompt is captured as
			// `Password:` with no trailing space (e.g. when running `sudo su`).
			assert.strictEqual(detectsHighConfidenceInputPattern('Password:'), true);
			// The colon is required: a bare line ending with the word "password" should
			// not match (avoids false positives on log/help output that mentions the word).
			assert.strictEqual(detectsHighConfidenceInputPattern('Enter your password'), false);
			assert.strictEqual(detectsHighConfidenceInputPattern('Press any key to continue...'), true);
		});
		test('matches parenthesized defaults', () => {
			// npm-init / yarn-init style prompts: real input prompt with a default value.
			// The space between `:` and `(` is what distinguishes these from shell prompts.
			assert.strictEqual(detectsHighConfidenceInputPattern('package name: (test) '), true);
			assert.strictEqual(detectsHighConfidenceInputPattern('version: (1.0.0) '), true);
			assert.strictEqual(detectsHighConfidenceInputPattern('description: (a thing) '), true);
			// Extra whitespace between `:` and `(` still matches (multiple spaces, tab).
			assert.strictEqual(detectsHighConfidenceInputPattern('license:  (MIT) '), true);
			assert.strictEqual(detectsHighConfidenceInputPattern('author:\t(none) '), true);
			// Multi-word default in the parens still matches.
			assert.strictEqual(detectsHighConfidenceInputPattern('repository: (github.com/foo/bar) '), true);
		});
		test('does NOT match git-aware shell prompts (regression: oh-my-zsh, bash __git_ps1)', () => {
			// allow-any-unicode-next-line
			// oh-my-zsh's robbyrussell theme renders `➜  <repo> git:(<branch>) ` after
			// every command. Without the `\s+` (rather than `\s*`) requirement between
			// `:` and `(` in the parenthesized-default rule, every shell prompt return
			// would be mistaken for an input-needed prompt. See microsoft/vscode#315476.
			// allow-any-unicode-next-line
			assert.strictEqual(detectsHighConfidenceInputPattern('➜  myrepo git:(main) '), false);
			// allow-any-unicode-next-line
			assert.strictEqual(detectsHighConfidenceInputPattern('➜  vscode git:(ba-work/output-monitor) '), false);
			// bash with __git_ps1 in PROMPT_COMMAND uses a similar shape with no space.
			assert.strictEqual(detectsHighConfidenceInputPattern('[user@host ~/myrepo (main)]$ '), false);
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
