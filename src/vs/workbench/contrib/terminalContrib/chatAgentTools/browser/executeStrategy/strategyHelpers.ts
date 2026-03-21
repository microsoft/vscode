/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise } from '../../../../../../base/common/async.js';
import { DisposableStore, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import type { IMarker as IXtermMarker } from '@xterm/xterm';

/**
 * Sets up a recreating start marker which is resilient to prompts that clear/re-render (eg. transient
 * or powerlevel10k style prompts). The marker is recreated at the cursor position whenever the
 * existing marker is disposed. The caller is responsible for adding the startMarker to the store.
 */
export function setupRecreatingStartMarker(
	xterm: { raw: { registerMarker(): IXtermMarker | undefined } },
	startMarker: MutableDisposable<IXtermMarker>,
	fire: (marker: IXtermMarker | undefined) => void,
	store: DisposableStore,
	log?: (message: string) => void,
): void {
	const markerListener = new MutableDisposable<IDisposable>();
	const recreateStartMarker = () => {
		if (store.isDisposed) {
			return;
		}
		const marker = xterm.raw.registerMarker();
		startMarker.value = marker ?? undefined;
		fire(marker);
		if (!marker) {
			markerListener.clear();
			return;
		}
		markerListener.value = marker.onDispose(() => {
			log?.('Start marker was disposed, recreating');
			recreateStartMarker();
		});
	};
	recreateStartMarker();
	store.add(toDisposable(() => {
		markerListener.dispose();
		startMarker.clear();
		fire(undefined);
	}));
	store.add(startMarker);
}

export function createAltBufferPromise(
	xterm: { raw: { buffer: { active: unknown; alternate: unknown; onBufferChange: (callback: () => void) => IDisposable } } },
	store: DisposableStore,
	log?: (message: string) => void,
): Promise<void> {
	const deferred = new DeferredPromise<void>();
	const complete = () => {
		if (!deferred.isSettled) {
			log?.('Detected alternate buffer entry');
			deferred.complete();
		}
	};

	if (xterm.raw.buffer.active === xterm.raw.buffer.alternate) {
		complete();
	} else {
		store.add(xterm.raw.buffer.onBufferChange(() => {
			if (xterm.raw.buffer.active === xterm.raw.buffer.alternate) {
				complete();
			}
		}));
	}

	return deferred.p;
}

/**
 * Strips the command echo and trailing prompt lines from marker-based terminal output.
 * Without shell integration (or when `getOutput()` is unavailable), `getContentsAsText`
 * captures the entire terminal buffer between the start and end markers, which includes:
 * 1. The command echo line (what `sendText` wrote)
 * 2. The actual command output
 * 3. The next shell prompt line(s)
 *
 * This function removes (1) and (3) to isolate the actual output.
 */
export function stripCommandEchoAndPrompt(output: string, commandLine: string): string {
	const lines = output.split('\n');

	// Strip leading lines that are part of the command echo. The start marker
	// is placed at the cursor before sendText, so the first captured line(s)
	// contain the prompt + command text, possibly wrapped across terminal columns.
	let startIndex = 0;
	const trimmedCommand = commandLine.trim();
	if (trimmedCommand.length > 0) {
		// Use a short prefix of the command for matching — enough to be unique
		// but handles terminal wrapping where lines are fragments.
		const commandPrefix = trimmedCommand.substring(0, Math.min(30, trimmedCommand.length));

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Check if this line contains the beginning of the command (handles
			// prompt prefix like `user@host:dir] $ <command>` on the first line)
			if (line.includes(commandPrefix)) {
				startIndex = i + 1;
				continue;
			}

			// For continuation lines of a wrapped command: if we already matched
			// the first echo line, keep consuming lines whose content is clearly
			// part of the wrapped command (e.g. long env var assignments, paths
			// with slashes, or sandbox wrapper fragments). We require the line to
			// end WITHOUT a newline-induced break in a word, so it must look like
			// a proper continuation — not regular command output.
			if (startIndex > 0 && i === startIndex) {
				const lineContent = line.trim();
				// A continuation line of a wrapped command typically contains
				// path separators, env var assignments, or quoted strings — not
				// plain output text. Also require it to appear in the command.
				if (lineContent.length > 0 && trimmedCommand.includes(lineContent) &&
					(/[\/\\=]/.test(lineContent) || /^['"]/.test(lineContent))) {
					startIndex = i + 1;
					continue;
				}
			}

			break;
		}
	}

	// Strip trailing lines that are part of the next shell prompt. Prompts may
	// span multiple lines due to terminal column wrapping. We strip from the
	// bottom any line that is either:
	// - Empty/whitespace
	// - Ends with a prompt character ($, >, #, %)
	// - Looks like a shell prompt (contains ] $ or user@host patterns)
	let endIndex = lines.length;
	while (endIndex > startIndex) {
		const line = lines[endIndex - 1].trimEnd();
		if (
			line.length === 0 ||
			/[>$#%]\s*$/.test(line) ||
			/\]\s*\$/.test(line) ||
			/\w+@[\w-]+:/.test(line) ||
			/^\[?\s*\w+@/.test(line)
		) {
			endIndex--;
		} else {
			break;
		}
	}

	return lines.slice(startIndex, endIndex).join('\n');
}
