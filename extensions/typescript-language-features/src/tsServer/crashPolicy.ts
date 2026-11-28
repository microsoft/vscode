/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TypeScriptServerExitEvent } from './server';

/**
 * The service is not restarted after this many crashes within {@link crashWindowMs}.
 */
export const maxCrashesBeforeGivingUp = 5;

/**
 * Crashes older than this are forgotten, so occasional crashes in a long session never stop the service.
 */
const crashWindowMs = 60 * 60 * 1000;

/**
 * Counts unexpected TS Server exits within a sliding window. A crash loop is detected however long each run
 * of the server lasts, for example when it runs out of memory minutes after starting to load a large project.
 */
export class TsServerCrashTracker {
	private _crashTimes: number[] = [];

	/**
	 * Records a crash and returns how many crashes happened within the window, including this one.
	 */
	public recordCrash(now: number): number {
		this._crashTimes = this._crashTimes.filter(time => now - time < crashWindowMs);
		this._crashTimes.push(now);
		return this._crashTimes.length;
	}

	public reset(): void {
		this._crashTimes = [];
	}
}

/**
 * V8 aborts the process when its heap reaches `--max-old-space-size`. Node reports the abort as `SIGABRT`
 * on POSIX and as exit code 134 on Windows. Other fatal errors abort the same way, so this is a heuristic.
 */
export function isOutOfMemoryLikeExit(exit: TypeScriptServerExitEvent): boolean {
	return exit.signal === 'SIGABRT' || exit.code === 134;
}

export const enum CrashPluginState {
	/** No TS Server plugins are loaded. */
	None,
	/** Only the plugin of Copilot Chat, which is installed by default, is loaded. */
	OnlyCopilot,
	/** Plugins from other extensions are loaded. */
	Other,
}

export interface CrashPrompt {
	readonly severity: 'warning' | 'error';
	readonly mentionPlugins: boolean;
	readonly suggestMoreMemory: boolean;
	readonly offerReportIssue: boolean;
}

export interface CrashResponse {
	readonly restart: boolean;
	readonly prompt: CrashPrompt | undefined;
}

/**
 * Decides whether to restart the service after an unexpected exit and what to tell the user.
 *
 * Copilot Chat's plugin is never suggested as the cause of a crash, and a single crash with only that plugin stays
 * silent (#325405). Running out of memory and giving up on a crash loop are always shown, without blaming a plugin.
 */
export function getCrashResponse(crashCount: number, isOutOfMemory: boolean, plugins: CrashPluginState, promptOnEveryCrash: boolean): CrashResponse {
	const restart = crashCount < maxCrashesBeforeGivingUp;
	if (restart && !isOutOfMemory && !(promptOnEveryCrash && plugins !== CrashPluginState.OnlyCopilot)) {
		return { restart, prompt: undefined };
	}
	return {
		restart,
		prompt: {
			severity: restart ? 'warning' : 'error',
			mentionPlugins: plugins === CrashPluginState.Other,
			suggestMoreMemory: isOutOfMemory,
			offerReportIssue: plugins !== CrashPluginState.Other,
		},
	};
}
