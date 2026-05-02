/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../../nls.js';
import { IToolInvocationContext } from '../../../../../chat/common/tools/languageModelToolsService.js';
import { ITaskService } from '../../../../../tasks/common/taskService.js';
import { ILinkLocation } from '../../taskHelpers.js';
import { IExecution, IPollingResult, OutputMonitorState, PollingConsts } from './types.js';
import { ITerminalLogService } from '../../../../../../../platform/terminal/common/terminal.js';

export interface IOutputMonitor extends Disposable {
	readonly pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
	readonly outputMonitorTelemetryCounters: IOutputMonitorTelemetryCounters;

	readonly onDidFinishCommand: Event<void>;
	readonly onDidDetectInputNeeded: Event<void>;
}

export interface IOutputMonitorTelemetryCounters {
	inputToolManualAcceptCount: number;
	inputToolManualRejectCount: number;
	inputToolManualChars: number;
	inputToolAutoAcceptCount: number;
	inputToolAutoChars: number;
	inputToolManualShownCount: number;
	inputToolFreeFormInputShownCount: number;
	inputToolFreeFormInputCount: number;
}

/**
 * Returns the last visible line from terminal output after trimming trailing line breaks.
 */
export function getLastLine(output: string | undefined): string {
	if (!output) {
		return '';
	}
	const trimmedOutput = output.replace(/[\r\n]+$/, '');
	if (!trimmedOutput) {
		return '';
	}
	const lastLineFeed = trimmedOutput.lastIndexOf('\n');
	const lastLine = lastLineFeed === -1 ? trimmedOutput : trimmedOutput.slice(lastLineFeed + 1);
	const lastCarriageReturn = lastLine.lastIndexOf('\r');
	return lastCarriageReturn === -1 ? lastLine : lastLine.slice(lastCarriageReturn + 1);
}

export class OutputMonitor extends Disposable implements IOutputMonitor {
	private _state: OutputMonitorState = OutputMonitorState.PollingForIdle;
	get state(): OutputMonitorState { return this._state; }

	private _formatLastLineForLog(output: string | undefined): string {
		if (!output) {
			return '<empty>';
		}
		const lastLine = getLastLine(output).trimEnd();
		if (!lastLine) {
			return '<empty>';
		}
		// Avoid logging potentially sensitive values from common secret prompts.
		if (this._isSensitivePrompt(lastLine)) {
			return '<redacted>';
		}
		// Keep logs bounded.
		return lastLine.length > 200 ? lastLine.slice(0, 200) + '…' : lastLine;
	}

	private _pollingResult: IPollingResult & { pollDurationMs: number } | undefined;
	get pollingResult(): IPollingResult & { pollDurationMs: number } | undefined { return this._pollingResult; }

	/**
	 * Flag to track if user has inputted since idle was detected.
	 * This is used to skip showing prompts if the user already provided input.
	 */
	private _userInputtedSinceIdleDetected = false;
	private readonly _userInputListener = this._register(new MutableDisposable<IDisposable>());

	private readonly _outputMonitorTelemetryCounters: IOutputMonitorTelemetryCounters = {
		inputToolManualAcceptCount: 0,
		inputToolManualRejectCount: 0,
		inputToolManualChars: 0,
		inputToolAutoAcceptCount: 0,
		inputToolAutoChars: 0,
		inputToolManualShownCount: 0,
		inputToolFreeFormInputShownCount: 0,
		inputToolFreeFormInputCount: 0,
	};
	get outputMonitorTelemetryCounters(): Readonly<IOutputMonitorTelemetryCounters> { return this._outputMonitorTelemetryCounters; }

	private readonly _onDidFinishCommand = this._register(new Emitter<void>());
	readonly onDidFinishCommand: Event<void> = this._onDidFinishCommand.event;

	private readonly _onDidDetectInputNeeded = this._register(new Emitter<void>());
	readonly onDidDetectInputNeeded: Event<void> = this._onDidDetectInputNeeded.event;

	private _asyncMode = false;
	private _command = '';
	private _invocationContext: IToolInvocationContext | undefined;
	private _currentMonitoringCts: CancellationTokenSource | undefined;
	/**
	 * Tracks whether onDidFinishCommand has fired so the event is delivered at
	 * most once. The event must fire synchronously during dispose so consumers
	 * awaiting `Event.toPromise(onDidFinishCommand)` are unblocked before the
	 * underlying emitter is torn down by super.dispose().
	 */
	private _didFinish = false;

	private _fireFinishedOnce(): void {
		if (this._didFinish) {
			return;
		}
		this._didFinish = true;
		this._onDidFinishCommand.fire();
	}

	override dispose(): void {
		// Deliver onDidFinishCommand to consumers BEFORE super.dispose() tears
		// down the emitter. Field-initialized disposables (including
		// _onDidFinishCommand) are registered before any disposable added in
		// the constructor body and are disposed first by DisposableStore in
		// insertion order. Without this override, consumers awaiting
		// `Event.toPromise(onDidFinishCommand)` would race with emitter
		// teardown and hang when dispose lands while _startMonitoring is still
		// in flight.
		if (!this._didFinish) {
			// Synthesize a Cancelled pollingResult so consumers that read
			// `monitor.pollingResult` after awaiting onDidFinishCommand always
			// see a defined value with the output collected so far.
			this._pollingResult ??= {
				state: OutputMonitorState.Cancelled,
				output: this._execution.getOutput(),
				pollDurationMs: 0,
				resources: undefined,
			};
		}
		this._fireFinishedOnce();
		super.dispose();
	}

	constructor(
		private readonly _execution: IExecution,
		private readonly _pollFn: ((execution: IExecution, token: CancellationToken, taskService: ITaskService) => Promise<IPollingResult | undefined>) | undefined,
		invocationContext: IToolInvocationContext | undefined,
		token: CancellationToken,
		command: string,
		@ITaskService private readonly _taskService: ITaskService,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
	) {
		super();

		this._command = command;
		this._invocationContext = invocationContext;

		// Create the CTS synchronously so it is available for cancellation if the
		// OutputMonitor is disposed before the deferred _startMonitoring fires.
		// The registered disposable must cancel (not just dispose) the CTS so that
		// the async monitoring loop's token becomes isCancellationRequested=true and
		// the loop exits promptly — CancellationTokenSource.dispose() alone does
		// not set isCancellationRequested.
		const cts = new CancellationTokenSource(token);
		this._currentMonitoringCts = cts;
		this._register(toDisposable(() => {
			this._currentMonitoringCts?.cancel();
			this._currentMonitoringCts?.dispose();
		}));

		// Start async to ensure listeners are set up.
		// Capture `cts` locally so that if continueMonitoringAsync replaces
		// _currentMonitoringCts before this fires, we detect the replacement
		// and avoid starting a duplicate monitoring loop. _startMonitoring
		// handles a cancelled token correctly by firing onDidFinishCommand in
		// its finally block, so we always call it when we're still the current
		// CTS (even if the token has since been cancelled).
		timeout(0).then(() => {
			if (this._currentMonitoringCts !== cts) {
				return;
			}
			this._startMonitoring(command, invocationContext, cts.token);
		});
	}

	private async _startMonitoring(
		command: string,
		invocationContext: IToolInvocationContext | undefined,
		token: CancellationToken
	): Promise<void> {
		const pollStartTime = Date.now();

		let resources;
		let output;

		let extended = false;
		try {
			while (!token.isCancellationRequested) {
				switch (this._state) {
					case OutputMonitorState.PollingForIdle: {
						this._logService.trace(`OutputMonitor: Entering PollingForIdle (extended=${extended})`);
						this._state = await this._waitForIdle(this._execution, extended, token);
						this._logService.trace(`OutputMonitor: PollingForIdle completed -> state=${OutputMonitorState[this._state]}`);
						continue;
					}
					case OutputMonitorState.Timeout: {
						this._logService.trace(`OutputMonitor: Entering Timeout state (extended=${extended})`);
						const shouldContinuePolling = await this._handleTimeoutState(command, invocationContext, extended, token);
						if (shouldContinuePolling) {
							extended = true;
							this._state = OutputMonitorState.PollingForIdle;
							continue;
						} else if (this._asyncMode) {
							// In async mode, wait for new data instead of stopping on timeout
							this._logService.trace('OutputMonitor: Async mode - timeout reached, waiting for new terminal data');
							extended = false;
							await this._waitForNewData(token);
							if (token.isCancellationRequested) {
								break;
							}
							this._state = OutputMonitorState.PollingForIdle;
							continue;
						} else {
							break;
						}
					}
					case OutputMonitorState.Cancelled:
						break;
					case OutputMonitorState.Idle: {
						this._logService.trace('OutputMonitor: Entering Idle handler');
						const idleResult = await this._handleIdleState(token);
						if (idleResult.shouldContinuePolling) {
							this._logService.trace('OutputMonitor: Idle handler -> continue polling');
							this._state = OutputMonitorState.PollingForIdle;
							continue;
						} else if (this._asyncMode) {
							// In async mode, wait for new terminal data before monitoring again.
							// This avoids expensive LLM calls while the terminal sits idle.
							this._logService.trace('OutputMonitor: Async mode - waiting for new terminal data before next monitoring cycle');
							await this._waitForNewData(token);
							if (token.isCancellationRequested) {
								break;
							}
							this._state = OutputMonitorState.PollingForIdle;
							continue;
						} else {
							this._logService.trace(`OutputMonitor: Idle handler -> stop polling (hasResources=${!!idleResult.resources}, outputLen=${idleResult.output?.length ?? 0})`);
							resources = idleResult.resources;
							output = idleResult.output;
						}
						break;
					}
				}
				if (this._state === OutputMonitorState.Idle || this._state === OutputMonitorState.Cancelled || this._state === OutputMonitorState.Timeout) {
					break;
				}
			}

			if (token.isCancellationRequested) {
				this._state = OutputMonitorState.Cancelled;
			}
		} finally {
			this._logService.trace(`OutputMonitor: Monitoring finished (state=${OutputMonitorState[this._state]}, duration=${Date.now() - pollStartTime}ms)`);
			this._pollingResult = {
				state: this._state,
				output: output ?? this._execution.getOutput(),
				pollDurationMs: Date.now() - pollStartTime,
				resources
			};
			// Clean up idle input listener if still active
			this._userInputListener.clear();
			// Fire at most once. If dispose() already fired the event synchronously
			// (e.g. the monitor was torn down before this async loop reached its
			// finally), skip firing on a potentially disposed emitter.
			this._fireFinishedOnce();
		}
	}

	/**
	 * Continues monitoring in background mode with a new cancellation token.
	 * In background mode, the monitor re-polls for idle and handles prompts
	 * whenever new terminal data arrives, rather than stopping after the first
	 * idle detection. Resource cost is bounded because the monitor only wakes
	 * on new terminal data (via {@link _waitForNewData}) and each idle cycle
	 * is capped by the standard polling timeouts.
	 */
	continueMonitoringAsync(token: CancellationToken): void {
		this._asyncMode = true;
		// Cancel and dispose any in-progress monitoring run to avoid two concurrent loops.
		// Cancel before dispose so that onCancellationRequested handlers fire and pending
		// promises (e.g. _waitForNewData) resolve properly.
		const currentMonitoringCts = this._currentMonitoringCts;
		currentMonitoringCts?.cancel();
		currentMonitoringCts?.dispose();
		this._currentMonitoringCts = new CancellationTokenSource(token);
		this._state = OutputMonitorState.PollingForIdle;
		this._startMonitoring(this._command, this._invocationContext, this._currentMonitoringCts.token);
	}

	/**
	 * Waits for new terminal data or cancellation. Used in background mode
	 * to avoid polling and LLM calls while the terminal is quiet.
	 */
	private _waitForNewData(token: CancellationToken): Promise<void> {
		return new Promise<void>(resolve => {
			if (token.isCancellationRequested) {
				resolve();
				return;
			}
			const cleanup = () => {
				dataListener.dispose();
				tokenListener.dispose();
				disposedListener.dispose();
			};
			const dataListener = this._execution.instance.onData(() => {
				cleanup();
				resolve();
			});
			const tokenListener = token.onCancellationRequested(() => {
				cleanup();
				resolve();
			});
			// Resolve when the terminal instance is disposed to avoid waiting forever
			const disposedListener = this._execution.instance.onDisposed(() => {
				cleanup();
				resolve();
			});
		});
	}


	private async _handleIdleState(token: CancellationToken): Promise<{ resources?: ILinkLocation[]; shouldContinuePolling: boolean; output?: string }> {
		const output = this._execution.getOutput();

		// Use only the tail of the output for logging and task-finish detection,
		// but keep line-oriented prompt detectors scoped to the last line.
		const outputTail = output.slice(-1000);
		const outputLastLine = getLastLine(outputTail);
		this._logService.trace(`OutputMonitor: Idle output summary: len=${output.length}, lastLine=${this._formatLastLineForLog(outputTail)}`);

		if (detectsNonInteractiveHelpPattern(outputLastLine)) {
			this._logService.trace('OutputMonitor: Idle -> non-interactive help pattern detected, stopping');
			return { shouldContinuePolling: false, output };
		}

		// Check for VS Code's task finish messages (like "press any key to close the terminal").
		// If the execution is a task and the output contains a VS Code task finish message,
		// always treat it as a stop signal regardless of task active state (which can be stale).
		const isTask = this._execution.task !== undefined;
		if (isTask && detectsVSCodeTaskFinishMessage(outputTail)) {
			this._logService.trace('OutputMonitor: Idle -> VS Code task finish message detected, stopping');
			// Task is finished, ignore the "press any key to close" message
			return { shouldContinuePolling: false, output };
		}

		// Check for generic "press any key" prompts from scripts.
		// Only shown for non-task executions since task finish messages are handled above.
		if (!isTask && detectsGenericPressAnyKeyPattern(outputTail)) {
			this._logService.trace('OutputMonitor: Idle -> generic "press any key" detected, signaling agent');
			this._onDidDetectInputNeeded.fire();
			this._cleanupIdleInputListener();
			return { shouldContinuePolling: false, output };
		}

		// Check if user already inputted since idle was detected (before we even got here)
		if (this._userInputtedSinceIdleDetected) {
			this._logService.trace('OutputMonitor: User input detected since idle; skipping prompt and continuing polling');
			this._cleanupIdleInputListener();
			return { shouldContinuePolling: true };
		}

		// In async mode, use regex-based detection for input-required patterns
		// (passwords, [Y/n], etc.) and signal the agent to handle via send_to_terminal.
		if (this._asyncMode) {
			if (detectsInputRequiredPattern(outputLastLine)) {
				this._logService.trace('OutputMonitor: Async mode - input-required pattern detected, signaling agent');
				this._onDidDetectInputNeeded.fire();
			}
			this._cleanupIdleInputListener();
			return { shouldContinuePolling: false, output };
		}

		// Use regex-based detection for input-required patterns (passwords, [Y/n], etc.)
		// In foreground mode, fire the event so the race in runInTerminalTool can pick it
		// up and return control to the agent (which uses send_to_terminal to provide input).
		// No elicitation UI is shown — the agent handles it autonomously.
		if (detectsInputRequiredPattern(outputLastLine)) {
			this._logService.trace('OutputMonitor: Input-required pattern detected, signaling agent');
			this._onDidDetectInputNeeded.fire();
			this._cleanupIdleInputListener();
			return { shouldContinuePolling: false, output };
		}

		// Clean up input listener before custom poll
		this._cleanupIdleInputListener();

		// Let custom poller override if provided
		const custom = await this._pollFn?.(this._execution, token, this._taskService);
		this._logService.trace(`OutputMonitor: Custom poller result: ${custom ? 'provided' : 'none'}`);
		const resources = custom?.resources;
		return { resources, shouldContinuePolling: false, output: custom?.output ?? output };
	}

	private async _handleTimeoutState(_command: string, _invocationContext: IToolInvocationContext | undefined, _extended: boolean, _token: CancellationToken): Promise<boolean> {
		if (_extended) {
			// Extended polling (2 minutes) expired while the process was still
			// running. Rather than silently cancelling, signal that input may be
			// needed so the agent sees the current output and can decide how to
			// proceed (e.g. answer an unrecognised interactive prompt).
			this._logService.info('OutputMonitor: Extended polling timeout reached after 2 minutes, signaling potential input needed');
			this._onDidDetectInputNeeded.fire();
			this._state = OutputMonitorState.Cancelled;
			return false;
		}
		// Continue polling with exponential backoff
		return true;
	}

	/**
	 * Single bounded polling pass that returns when:
	 *  - terminal becomes inactive/idle, or
	 *  - timeout window elapses.
	 */
	private async _waitForIdle(
		execution: IExecution,
		extendedPolling: boolean,
		token: CancellationToken,
	): Promise<OutputMonitorState> {

		const maxWaitMs = extendedPolling ? PollingConsts.ExtendedPollingMaxDuration : PollingConsts.FirstPollingMaxDuration;
		const maxInterval = PollingConsts.MaxPollingIntervalDuration;
		let currentInterval = PollingConsts.MinPollingDuration;
		let waited = 0;
		let consecutiveIdleEvents = 0;
		let hasReceivedData = false;
		const onDataDisposable = execution.instance.onData((_data) => {
			hasReceivedData = true;
		});

		try {
			while (!token.isCancellationRequested && waited < maxWaitMs) {
				const waitTime = Math.min(currentInterval, maxWaitMs - waited);
				try {
					await timeout(waitTime, token);
				} catch (err) {
					if (token.isCancellationRequested) {
						return OutputMonitorState.Cancelled;
					}
					throw err;
				}
				waited += waitTime;
				currentInterval = Math.min(currentInterval * 2, maxInterval);
				const currentOutput = execution.getOutput();
				const currentTail = currentOutput.slice(-1000);
				const currentLastLine = getLastLine(currentTail);

				if (detectsNonInteractiveHelpPattern(currentLastLine)) {
					this._logService.trace(`OutputMonitor: waitForIdle -> non-interactive help detected (waited=${waited}ms)`);
					this._state = OutputMonitorState.Idle;
					this._setupIdleInputListener();
					return this._state;
				}

				// Only fast-path on high-confidence patterns (y/n, password, (END), etc.).
				// Broad patterns like bare ":" or "?" are checked later in _handleIdleState
				// after the terminal has naturally gone idle, avoiding false positives on
				// normal command output that happens to end with those characters.
				const promptResult = detectsHighConfidenceInputPattern(currentLastLine);
				if (promptResult) {
					this._logService.trace(`OutputMonitor: waitForIdle -> high-confidence input pattern detected (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentTail)})`);
					this._state = OutputMonitorState.Idle;
					this._setupIdleInputListener();
					return this._state;
				}

				if (hasReceivedData) {
					consecutiveIdleEvents = 0;
					hasReceivedData = false;
				} else {
					consecutiveIdleEvents++;
				}

				const recentlyIdle = consecutiveIdleEvents >= PollingConsts.MinIdleEvents;
				const isActive = execution.isActive ? await execution.isActive() : undefined;
				this._logService.trace(`OutputMonitor: waitForIdle check: waited=${waited}ms, recentlyIdle=${recentlyIdle}, isActive=${isActive}`);
				if (recentlyIdle && isActive !== true) {
					this._logService.trace(`OutputMonitor: waitForIdle -> recentlyIdle && !active (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentTail)})`);
					this._state = OutputMonitorState.Idle;
					this._setupIdleInputListener();
					return this._state;
				}

				// When the terminal has been idle (no new data) but the execution is
				// still reported as active (e.g. task-backed executions), check the
				// broader input-required heuristics. These patterns are too noisy to
				// use during active output, but once the terminal has settled they
				// reliably indicate an interactive prompt like "Enter your name: ".
				if (recentlyIdle && isActive === true && detectsInputRequiredPattern(currentLastLine)) {
					this._logService.trace(`OutputMonitor: waitForIdle -> broad input pattern detected while active+idle (waited=${waited}ms, lastLine=${this._formatLastLineForLog(currentTail)})`);
					this._state = OutputMonitorState.Idle;
					this._setupIdleInputListener();
					return this._state;
				}
			}
		} finally {
			onDataDisposable.dispose();
		}

		if (token.isCancellationRequested) {
			return OutputMonitorState.Cancelled;
		}

		return OutputMonitorState.Timeout;
	}

	/**
	 * Sets up a listener for user input that triggers immediately when idle is detected.
	 * This ensures we catch any input that happens between idle detection and prompt creation.
	 */
	private _setupIdleInputListener(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._userInputtedSinceIdleDetected = false;
		this._logService.trace('OutputMonitor: Setting up idle input listener');

		// Set up new listener (MutableDisposable auto-disposes previous)
		this._userInputListener.value = this._execution.instance.onDidInputData(() => {
			this._userInputtedSinceIdleDetected = true;
			this._logService.trace('OutputMonitor: Detected user terminal input while idle');
		});
	}

	/**
	 * Cleans up the idle input listener and resets the flag.
	 */
	private _cleanupIdleInputListener(): void {
		this._userInputtedSinceIdleDetected = false;
		this._userInputListener.clear();
	}

	private _isSensitivePrompt(prompt: string): boolean {
		return /(password|passphrase|token|api\s*key|secret)/i.test(prompt);
	}
}

export function matchTerminalPromptOption(options: readonly string[], suggestedOption: string): { option: string | undefined; index: number } {
	const normalize = (value: string) => value.replace(/['"`]/g, '').trim().replace(/[.,:;]+$/, '');

	const normalizedSuggestion = normalize(suggestedOption);
	if (!normalizedSuggestion) {
		return { option: undefined, index: -1 };
	}

	const candidates: string[] = [normalizedSuggestion];
	const firstWhitespaceToken = normalizedSuggestion.split(/\s+/)[0];
	if (firstWhitespaceToken && firstWhitespaceToken !== normalizedSuggestion) {
		candidates.push(firstWhitespaceToken);
	}
	const firstAlphaNum = normalizedSuggestion.match(/[A-Za-z0-9]+/);
	if (firstAlphaNum?.[0] && firstAlphaNum[0] !== normalizedSuggestion && firstAlphaNum[0] !== firstWhitespaceToken) {
		candidates.push(firstAlphaNum[0]);
	}

	for (const candidate of candidates) {
		const exactIndex = options.findIndex(opt => normalize(opt) === candidate);
		if (exactIndex !== -1) {
			return { option: options[exactIndex], index: exactIndex };
		}
		const lowerCandidate = candidate.toLowerCase();
		const ciIndex = options.findIndex(opt => normalize(opt).toLowerCase() === lowerCandidate);
		if (ciIndex !== -1) {
			return { option: options[ciIndex], index: ciIndex };
		}
	}

	return { option: undefined, index: -1 };
}

/**
 * High-confidence patterns that reliably indicate the terminal is waiting for
 * input. These are safe to use as a fast-path in `_waitForIdle` to skip normal
 * idle detection, because they are specific enough to avoid false positives on
 * normal command output (build logs, headers, etc.).
 */
export function detectsHighConfidenceInputPattern(cursorLine: string): boolean {
	return [
		// PowerShell-style multi-option line (supports [?] Help and optional default suffix) ending
		// in whitespace.  Uses [^\[]* to match each label (everything up to the next bracket),
		// ensuring linear-time matching with no nested quantifiers that could cause ReDoS.
		/\s*(?:\[[^\]]\][^\[]*)+(?:\(default is\s+"[^"]+"\):)?\s+$/,
		// Bracketed/parenthesized yes/no pairs at end of line: (y/n), [Y/n], (yes/no), [no/yes]
		/(?:\(|\[)\s*(?:y(?:es)?\s*\/\s*n(?:o)?|n(?:o)?\s*\/\s*y(?:es)?)\s*(?:\]|\))\s+$/i,
		// Same as above but allows a preceding '?' or ':' and optional wrappers e.g.
		// "Continue? (y/n)" or "Overwrite: [yes/no]"
		/[?:]\s*(?:\(|\[)?\s*y(?:es)?\s*\/\s*n(?:o)?\s*(?:\]|\))?\s+$/i,
		// Confirmation prompts ending with (y) followed by trailing space, e.g. "Ok to proceed? (y) "
		// The trailing space indicates the cursor is positioned after the prompt awaiting input, as
		// opposed to normal command output that happens to contain "(y)" followed by a newline.
		/\(y\) +$/i,
		// Prompt with parenthesized default value e.g. "package name: (test) " or "version: (1.0.0) "
		/:\s*\([^)]*\) +$/,
		// Line contains (END) which is common in pagers
		/\(END\)$/,
		// Password prompt (must be followed by optional colon and trailing space to indicate
		// an active prompt; otherwise normal output containing the word "password" would match).
		/password:? +$/i,
		// "Press a key" or "Press any key"
		/press a(?:ny)? key/i,
		// Interactive prompt libraries (prompts, enquirer, inquirer) prefix the prompt with
		// '? ' at the start of the line and end with a distinctive chevron character
		// followed by optional trailing whitespace where the cursor is awaiting input.
		// Anchoring the '?' to the start of the line (after optional whitespace/ANSI
		// escapes) avoids false positives from normal output that contains both a '?'
		// allow-any-unicode-next-line
		// and a chevron (e.g. "What happened? ›").
		// Examples:
		//   "? Do you want to install jsdom? <chevron>"  (prompts)
		//   "? Pick a color <chevron> "                  (enquirer)
		// allow-any-unicode-next-line
		/^(?:\s|\x1b\[[0-9;]*m)*\?.*[›❯▸▶]\s*$/,
	].some(e => e.test(cursorLine));
}

/**
 * Full set of input-required patterns including broader heuristics (bare `:` and
 * `?` with trailing space). These may produce false positives on normal command
 * output, so they should only be used **after** the terminal has been confirmed
 * idle through normal polling (consecutive idle events with no data). In
 * `_waitForIdle`, these are checked only when `recentlyIdle` is true (to handle
 * active executions that are actually waiting for input). For the unconditional
 * fast-path, use {@link detectsHighConfidenceInputPattern} instead.
 */
export function detectsInputRequiredPattern(cursorLine: string): boolean {
	if (detectsHighConfidenceInputPattern(cursorLine)) {
		return true;
	}
	return [
		// Line ends with ':' followed by at least one space. The trailing space indicates a
		// waiting prompt (cursor positioned after the colon). A bare ':\n' at end of buffer is
		// usually non-prompt output (e.g. a header or log line) and must not match.
		// NOTE: This is a broad pattern — only use after confirming idle state via polling.
		/: +$/,
		// Line ends with '?' followed by at least one space (optionally followed by a
		// parenthesized hint like "Continue? (yes/no) "). Requiring trailing space avoids
		// matching arbitrary command output where a line happens to end with '?'.
		// NOTE: This is a broad pattern — only use after confirming idle state via polling.
		/\? *(?:\([a-z\s]+\))? +$/i,
	].some(e => e.test(cursorLine));
}

export function detectsNonInteractiveHelpPattern(cursorLine: string): boolean {
	return [
		/press [h?]\s*(?:\+\s*enter)?\s*to (?:show|open|display|get|see)\s*(?:available )?(?:help|commands|options)/i,
		/press h\s*(?:or\s*\?)?\s*(?:\+\s*enter)?\s*for (?:help|commands|options)/i,
		/press \?\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:help|commands|options|list)/i,
		/type\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
		/hit\s*[h?]\s*(?:\+\s*enter)?\s*(?:for|to see|to show)\s*(?:help|commands|options)/i,
		/press o\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:open|launch)(?:\s*(?:the )?(?:app|application|browser)|\s+in\s+(?:the\s+)?browser)?/i,
		/press r\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:restart|reload|refresh)(?:\s*(?:the )?(?:server|dev server|service))?/i,
		/press q\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:quit|exit|stop)(?:\s*(?:the )?(?:server|app|process))?/i,
		/press u\s*(?:\+\s*enter)?\s*(?:to|for)?\s*(?:show|print|display)\s*(?:the )?(?:server )?urls?/i
	].some(e => e.test(cursorLine));
}

/**
 * Localized task finish messages from VS Code's terminalTaskSystem.
 * These are the same strings used when tasks complete.
 */
const taskFinishMessages = [
	// "Terminal will be reused by tasks, press any key to close it."
	localize('closeTerminal', "Terminal will be reused by tasks, press any key to close it."),
	localize('reuseTerminal', "Terminal will be reused by tasks, press any key to close it."),
	// "Press any key to close the terminal." (with exit code placeholder removed for matching)
	localize('exitCode.closeTerminal', "Press any key to close the terminal."),
	localize('exitCode.reuseTerminal', "Press any key to close the terminal."),
	// Punctuation variant: "The terminal will be reused by tasks. Press any key to close."
	localize('reuseTerminal.pressClose', "The terminal will be reused by tasks. Press any key to close."),
];

const normalizedTaskFinishMessages = taskFinishMessages.map(msg =>
	msg.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, '').toLowerCase()
);

/**
 * Detects VS Code's specific task completion messages like:
 * - "Press any key to close the terminal."
 * - "Terminal will be reused by tasks, press any key to close it."
 * These appear when a task finishes and should be ignored if the task is done.
 * Note: These messages may be prefixed with " * " by VS Code and may have line wrapping
 * that can split words across lines (e.g., "t\no" instead of "to").
 */
export function detectsVSCodeTaskFinishMessage(cursorLine: string): boolean {
	// Be tolerant to whitespace, punctuation, and line wrapping that can split words mid-word.
	const compact = cursorLine.replace(/[\s.,:;!?"'`()[\]{}<>\-_/\\]+/g, '').toLowerCase();
	return normalizedTaskFinishMessages.some(msg => compact.includes(msg));
}

/**
 * Detects generic "press any key" prompts from scripts (not VS Code task messages).
 * These should prompt the user to interact with the terminal.
 */
export function detectsGenericPressAnyKeyPattern(cursorLine: string): boolean {
	// Match "press any key" but exclude VS Code task-specific messages
	if (detectsVSCodeTaskFinishMessage(cursorLine)) {
		return false;
	}
	return /press a(?:ny)? key/i.test(cursorLine);
}
