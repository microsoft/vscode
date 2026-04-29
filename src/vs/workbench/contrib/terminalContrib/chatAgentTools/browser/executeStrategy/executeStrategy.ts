/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, RunOnceScheduler } from '../../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import type { Event } from '../../../../../../base/common/event.js';
import { DisposableStore, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import type { ITerminalLogService } from '../../../../../../platform/terminal/common/terminal.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

export interface ITerminalExecuteStrategy extends IDisposable {
	readonly type: 'rich' | 'basic' | 'none';
	/**
	 * Executes a command line and gets a result designed to be passed directly to an LLM. The
	 * result will include information about the exit code.
	 * @param commandLine The command line to execute
	 * @param token Cancellation token
	 * @param commandId Optional predefined command ID to link the command
	 * @param commandLineForMetadata Optional command line to report in terminal execution metadata.
	 * This can differ from the command line that is sent to the shell, for example when the command
	 * is wrapped for sandbox execution.
	 */
	execute(commandLine: string, token: CancellationToken, commandId?: string, commandLineForMetadata?: string): Promise<ITerminalExecuteStrategyResult>;

	readonly onDidCreateStartMarker: Event<IXtermMarker | undefined>;
}

export interface ITerminalExecuteStrategyResult {
	output: string | undefined;
	additionalInformation?: string;
	exitCode?: number;
	error?: string;
	didEnterAltBuffer?: boolean;
}

export async function waitForIdle(onData: Event<unknown>, idleDurationMs: number): Promise<void> {
	// This is basically Event.debounce but with an initial event to trigger the debounce
	// immediately
	const store = new DisposableStore();
	const deferred = new DeferredPromise<void>();
	const scheduler = store.add(new RunOnceScheduler(() => deferred.complete(), idleDurationMs));
	store.add(onData(() => scheduler.schedule()));
	scheduler.schedule();
	return deferred.p.finally(() => store.dispose());
}

export interface IPromptDetectionResult {
	/**
	 * Whether a prompt was detected.
	 */
	detected: boolean;
	/**
	 * The reason for logging.
	 */
	reason?: string;
}

/**
 * Detects if the given text content appears to end with a common prompt pattern.
 */
export function detectsCommonPromptPattern(cursorLine: string): IPromptDetectionResult {
	if (cursorLine.trim().length === 0) {
		return { detected: false, reason: 'Content is empty or contains only whitespace' };
	}

	// PowerShell prompt: PS C:\> or similar patterns
	if (/PS\s+[A-Z]:\\.*>\s*$/.test(cursorLine)) {
		return { detected: true, reason: `PowerShell prompt pattern detected: "${cursorLine}"` };
	}

	// Command Prompt: C:\path>
	if (/^[A-Z]:\\.*>\s*$/.test(cursorLine)) {
		return { detected: true, reason: `Command Prompt pattern detected: "${cursorLine}"` };
	}

	// Bash-style prompts ending with $
	if (/\$\s*$/.test(cursorLine)) {
		return { detected: true, reason: `Bash-style prompt pattern detected: "${cursorLine}"` };
	}

	// Root prompts ending with #
	if (/#\s*$/.test(cursorLine)) {
		return { detected: true, reason: `Root prompt pattern detected: "${cursorLine}"` };
	}

	// Python REPL prompt
	if (/^>>>\s*$/.test(cursorLine)) {
		return { detected: true, reason: `Python REPL prompt pattern detected: "${cursorLine}"` };
	}

	// Custom prompts ending with the starship character (\u276f)
	if (/\u276f\s*$/.test(cursorLine)) {
		return { detected: true, reason: `Starship prompt pattern detected: "${cursorLine}"` };
	}

	// Generic prompts ending with common prompt characters
	if (/[>%]\s*$/.test(cursorLine)) {
		return { detected: true, reason: `Generic prompt pattern detected: "${cursorLine}"` };
	}

	return { detected: false, reason: `No common prompt pattern found in last line: "${cursorLine}"` };
}

/**
 * Enhanced version of {@link waitForIdle} that uses prompt detection heuristics. After the terminal
 * idles for the specified period, checks if the terminal's cursor line looks like a common prompt.
 * If not, extends the timeout to give the command more time to complete.
 */
export async function waitForIdleWithPromptHeuristics(
	onData: Event<unknown>,
	instance: ITerminalInstance,
	idlePollIntervalMs: number,
	extendedTimeoutMs: number,
): Promise<IPromptDetectionResult> {
	await waitForIdle(onData, idlePollIntervalMs);

	const xterm = await instance.xtermReadyPromise;
	if (!xterm) {
		return { detected: false, reason: `Xterm not available, using ${idlePollIntervalMs}ms timeout` };
	}
	const startTime = Date.now();

	// Attempt to detect a prompt pattern after idle
	while (Date.now() - startTime < extendedTimeoutMs) {
		try {
			let content = '';
			const buffer = xterm.raw.buffer.active;
			const line = buffer.getLine(buffer.baseY + buffer.cursorY);
			if (line) {
				content = line.translateToString(true);
			}
			const promptResult = detectsCommonPromptPattern(content);
			if (promptResult.detected) {
				return promptResult;
			}
		} catch (error) {
			// Continue polling even if there's an error reading terminal content
		}
		await waitForIdle(onData, Math.min(idlePollIntervalMs, extendedTimeoutMs - (Date.now() - startTime)));
	}

	// Extended timeout reached without detecting a prompt
	try {
		let content = '';
		const buffer = xterm.raw.buffer.active;
		const line = buffer.getLine(buffer.baseY + buffer.cursorY);
		if (line) {
			content = line.translateToString(true) + '\n';
		}
		return { detected: false, reason: `Extended timeout reached without prompt detection. Last line: "${content.trim()}"` };
	} catch (error) {
		return { detected: false, reason: `Extended timeout reached. Error reading terminal content: ${error}` };
	}
}

/**
 * Tracks the terminal for being idle on a prompt input. This must be called before `executeCommand`
 * is called.
 */
export async function trackIdleOnPrompt(
	instance: ITerminalInstance,
	idleDurationMs: number,
	store: DisposableStore,
	promptFallbackMs?: number,
	logService?: ITerminalLogService,
): Promise<void> {
	const idleOnPrompt = new DeferredPromise<void>();
	const onData = instance.onData;
	const log = logService ? (msg: string) => logService.info(`trackIdleOnPrompt: ${msg}`) : undefined;

	const enum TerminalState {
		Initial,
		Prompt,
		Executing,
		PromptAfterExecuting,
	}
	const stateNames: Record<TerminalState, string> = {
		[TerminalState.Initial]: 'Initial',
		[TerminalState.Prompt]: 'Prompt',
		[TerminalState.Executing]: 'Executing',
		[TerminalState.PromptAfterExecuting]: 'PromptAfterExecuting',
	};

	let state: TerminalState = TerminalState.Initial;
	let dataEventCount = 0;

	function setState(newState: TerminalState, reason: string): void {
		if (state !== newState) {
			log?.(`State ${stateNames[state]} → ${stateNames[newState]} (${reason})`);
			state = newState;
		}
	}

	const scheduler = store.add(new RunOnceScheduler(() => {
		log?.(`Idle scheduler fired, completing (dataEvents=${dataEventCount})`);
		idleOnPrompt.complete();
	}, idleDurationMs));

	// Fallback in case prompt sequences are not seen but the terminal goes idle.
	const promptFallbackScheduler = store.add(new RunOnceScheduler(() => {
		if (state === TerminalState.Executing || state === TerminalState.PromptAfterExecuting) {
			promptFallbackScheduler.cancel();
			return;
		}
		log?.(`Prompt fallback fired (dataEvents=${dataEventCount})`);
		setState(TerminalState.PromptAfterExecuting, 'promptFallback');
		scheduler.schedule();
	}, promptFallbackMs ?? 1000));
	// Schedule an initial fallback with a longer timeout so we can detect idle
	// even when no terminal data events arrive at all (e.g. shell integration
	// is broken and the command finishes silently or hangs waiting for input).
	// Without this, if no data events fire, neither scheduler is ever triggered
	// and trackIdleOnPrompt blocks forever. We use a longer initial delay (10s)
	// to avoid falsely reporting completion for commands that are slow to start
	// producing output. Once any data arrives, the onData handler takes over
	// with the shorter promptFallbackMs interval.
	const initialFallbackScheduler = store.add(new RunOnceScheduler(() => {
		if (state === TerminalState.Executing || state === TerminalState.PromptAfterExecuting) {
			log?.(`Initial fallback fired but state is ${stateNames[state]}, skipping`);
			return;
		}
		log?.(`Initial fallback fired, no data events received`);
		setState(TerminalState.PromptAfterExecuting, 'initialFallback');
		scheduler.schedule();
	}, 10_000));
	initialFallbackScheduler.schedule();
	// Fallback for when shell integration breaks mid-command: data arrives and
	// C/D sequences transition us to Executing, but no A (prompt) sequence ever
	// follows. Both initialFallbackScheduler and promptFallbackScheduler get
	// cancelled in that state, causing a permanent hang. This scheduler is
	// rescheduled on every data event while in the Executing state, so it only
	// fires after 30s of data-idle — long enough that actively-outputting
	// commands won't be cut off, but short enough to prevent indefinite hangs
	// when shell integration breaks. When shell integration is working,
	// onCommandFinished in the rich strategy's race wins before this fires.
	const executingFallbackScheduler = store.add(new RunOnceScheduler(() => {
		if (state === TerminalState.Executing) {
			log?.(`Executing fallback fired after 30s data-idle (dataEvents=${dataEventCount})`);
			setState(TerminalState.PromptAfterExecuting, 'executingFallback');
			scheduler.schedule();
		}
	}, 30_000));
	// Only schedule when a prompt sequence (A) is seen after an execute sequence (C). This prevents
	// cases where the command is executed before the prompt is written. While not perfect, sitting
	// on an A without a C following shortly after is a very good indicator that the command is done
	// and the terminal is idle. Note that D is treated as a signal for executed since shell
	// integration sometimes lacks the C sequence either due to limitations in the integation or the
	// required hooks aren't available.
	store.add(onData(e => {
		dataEventCount++;
		// Once any data arrives, cancel the initial fallback — the data-driven
		// promptFallbackScheduler handles rescheduling from here.
		initialFallbackScheduler.cancel();
		// Update state
		// p10k fires C as `133;C;`
		const matches = e.matchAll(/(?:\x1b\]|\x9d)[16]33;(?<type>[ACD])(?:;.*)?(?:\x1b\\|\x07|\x9c)/g);
		for (const match of matches) {
			if (match.groups?.type === 'A') {
				if (state === TerminalState.Initial) {
					setState(TerminalState.Prompt, 'sequence A');
				} else if (state === TerminalState.Executing) {
					setState(TerminalState.PromptAfterExecuting, 'sequence A after executing');
					executingFallbackScheduler.cancel();
				}
			} else if (match.groups?.type === 'C' || match.groups?.type === 'D') {
				setState(TerminalState.Executing, `sequence ${match.groups?.type}`);
				executingFallbackScheduler.schedule();
			}
		}
		// Re-schedule on every data event as we're tracking data idle
		if (state === TerminalState.PromptAfterExecuting) {
			promptFallbackScheduler.cancel();
			executingFallbackScheduler.cancel();
			scheduler.schedule();
		} else {
			scheduler.cancel();
			if (state === TerminalState.Initial || state === TerminalState.Prompt) {
				promptFallbackScheduler.schedule();
			} else {
				promptFallbackScheduler.cancel();
				// Re-schedule on every data event so it only fires after 30s
				// of data-idle while in the Executing state.
				executingFallbackScheduler.schedule();
			}
		}
	}));
	return idleOnPrompt.p;
}
