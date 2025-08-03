/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, RunOnceScheduler } from '../../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../../base/common/cancellation.js';
import type { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import type { ITerminalInstance } from '../../../../terminal/browser/terminal.js';

export interface ITerminalExecuteStrategy {
	readonly type: 'rich' | 'basic' | 'none';
	/**
	 * Executes a command line and gets a result designed to be passed directly to an LLM. The
	 * result will include information about the exit code.
	 */
	execute(commandLine: string, token: CancellationToken): Promise<ITerminalExecuteStrategyResult>;
}

export interface ITerminalExecuteStrategyResult {
	output: string | undefined;
	additionalInformation?: string;
	exitCode?: number;
	error?: string;
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

/**
 * Tracks the terminal for being idle on a prompt input. This must be called before `executeCommand`
 * is called.
 */
export async function trackIdleOnPrompt(
	instance: ITerminalInstance,
	idleDurationMs: number,
	store: DisposableStore,
): Promise<void> {
	const idleOnPrompt = new DeferredPromise<void>();
	const onData = instance.onData;
	const scheduler = store.add(new RunOnceScheduler(() => {
		idleOnPrompt.complete();
	}, idleDurationMs));
	// Only schedule when a prompt sequence (A) is seen after an execute sequence (C). This prevents
	// cases where the command is executed before the prompt is written. While not perfect, sitting
	// on an A without a C following shortly after is a very good indicator that the command is done
	// and the terminal is idle. Note that D is treated as a signal for executed since shell
	// integration sometimes lacks the C sequence either due to limitations in the integation or the
	// required hooks aren't available.
	const enum TerminalState {
		Initial,
		Prompt,
		Executing,
		PromptAfterExecuting,
	}
	let state: TerminalState = TerminalState.Initial;
	store.add(onData(e => {
		// Update state
		// p10k fires C as `133;C;`
		const matches = e.matchAll(/(?:\x1b\]|\x9d)[16]33;(?<type>[ACD])(?:;.*)?(?:\x1b\\|\x07|\x9c)/g);
		for (const match of matches) {
			if (match.groups?.type === 'A') {
				if (state === TerminalState.Initial) {
					state = TerminalState.Prompt;
				} else if (state === TerminalState.Executing) {
					state = TerminalState.PromptAfterExecuting;
				}
			} else if (match.groups?.type === 'C' || match.groups?.type === 'D') {
				state = TerminalState.Executing;
			}
		}
		// Re-schedule on every data event as we're tracking data idle
		if (state === TerminalState.PromptAfterExecuting) {
			scheduler.schedule();
		} else {
			scheduler.cancel();
		}
	}));
	return idleOnPrompt.p;
}
