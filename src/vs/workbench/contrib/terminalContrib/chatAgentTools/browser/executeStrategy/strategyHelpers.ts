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
): IDisposable {
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

	// Return a disposable that stops the recreation loop without clearing
	// the current marker. Callers should dispose this before sending a
	// command so that prompt re-renders (e.g. PSReadLine transient prompts)
	// don't move the start marker past the command output.
	return toDisposable(() => markerListener.dispose());
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
export function stripCommandEchoAndPrompt(output: string, commandLine: string, log?: (message: string) => void): string {
	log?.(`stripCommandEchoAndPrompt input: output length=${output.length}, commandLine length=${commandLine.length}`);

	const result = _stripCommandEchoAndPromptOnce(output, commandLine, log);

	// After stripping the first command echo and trailing prompt, the remaining
	// content may still contain the command re-echoed by the shell (prompt + echo).
	// This happens when the terminal buffer captures both the raw sendText output
	// and the shell's subsequent prompt + command echo. If the command appears again
	// in the remaining text, strip it one more time.
	if (result.trim().length > 0 && findCommandEcho(result, commandLine)) {
		return _stripCommandEchoAndPromptOnce(result, commandLine, log);
	}

	return result;
}

function _stripCommandEchoAndPromptOnce(output: string, commandLine: string, log?: (message: string) => void): string {
	// Strip leading lines that are part of the command echo using findCommandEcho.
	// Allow suffix matching to handle partial command echoes from getOutput()
	// where the prompt line is not included.
	const echoResult = findCommandEcho(output, commandLine, /*allowSuffixMatch*/ true);
	const lines = echoResult ? echoResult.linesAfter : output.split('\n');
	const startIndex = 0;

	// Use evidence from the prompt prefix (content before the command echo)
	// to narrow down which trailing prompt patterns to check.
	const promptBefore = echoResult?.contentBefore ?? '';
	const isUnixAt = /\w+@[\w.-]+:/.test(promptBefore);
	const isUnixHost = !isUnixAt && /[\w.-]+:\S/.test(promptBefore);
	const isUnix = isUnixAt || isUnixHost;
	const isPowerShell = /^PS\s/i.test(promptBefore);
	const isCmd = !isPowerShell && /^[A-Z]:\\/.test(promptBefore);
	const isStarship = /\u276f/.test(promptBefore);
	const isPython = />>>/.test(promptBefore);
	const knownPrompt = isUnix || isPowerShell || isCmd || isStarship || isPython;

	// Strip trailing lines that are part of the next shell prompt. Prompts may
	// span multiple lines due to terminal column wrapping. We strip from the
	// bottom any line that matches a known prompt pattern. Patterns are
	// intentionally anchored and specific to avoid stripping legitimate output
	// that happens to end with characters like $, #, %, or >.
	let endIndex = lines.length;
	let trailingStrippedCount = 0;
	const maxTrailingPromptLines = 2;
	while (endIndex > startIndex) {
		const line = lines[endIndex - 1].trimEnd();
		if (line.length === 0) {
			endIndex--;
			continue;
		}
		if (trailingStrippedCount >= maxTrailingPromptLines) {
			break;
		}

		// Complete (self-contained) prompt patterns: these have a recognizable
		// prefix and a trailing marker ($, #, >). After stripping one complete
		// prompt line, stop — lines above it are command output, not wrapped
		// prompt continuation lines.
		const isCompletePrompt =
			// Bash/zsh: user@host:path ending with $ or #
			// e.g., "user@host:~/src $ " or "root@server:/var/log# "
			((!knownPrompt || isUnixAt) && /^\s*\w+@[\w.-]+:.*[#$]\s*$/.test(line)) ||
			// hostname:path user$ or hostname:path user#
			// e.g., "dsm12-be220-abc:testWorkspace runner$"
			((!knownPrompt || isUnixHost) && /^\s*[\w.-]+:\S.*\s\w+[#$]\s*$/.test(line)) ||
			// PowerShell: PS C:\path>
			((!knownPrompt || isPowerShell) && /^PS\s+[A-Z]:\\.*>\s*$/.test(line)) ||
			// Windows cmd: C:\path>
			((!knownPrompt || isCmd) && /^[A-Z]:\\.*>\s*$/.test(line)) ||
			// Starship prompt character
			// allow-any-unicode-next-line
			((!knownPrompt || isStarship) && /\u276f\s*$/.test(line)) ||
			// Python REPL
			((!knownPrompt || isPython) && /^>>>\s*$/.test(line));

		// Fragment/partial prompt patterns: these represent pieces of a prompt
		// that wraps across multiple terminal lines due to column width.
		const isPromptFragment =
			// Wrapped fragment ending with $ or # (e.g. "er$", "ts/testWorkspace$")
			((!knownPrompt || isUnix) && /^\s*[\w/.-]+[#$]\s*$/.test(line)) ||
			// Bracketed prompt start: [ hostname:/path or [ user@host:/path
			// e.g., "[ alex@MacBook-Pro:/Users/alex/src/vscode4/extensions/vscode-api-test"
			// e.g., "[W007DV9PF9-1:~/vss/_work/1/s/extensions/vscode-api-tests/testWorkspace] cloudte"
			((!knownPrompt || isUnix) && /^\[\s*[\w.-]+(@[\w.-]+)?:[~\/]/.test(line)) ||
			// Wrapped continuation: user@host:path or hostname:path (no trailing $)
			// Only matched after we've already stripped a prompt fragment below.
			// e.g., "cloudtest@host:/mnt/vss/.../vscode-api-tes" or "dsm12-abc:testWorkspace runn"
			((!knownPrompt || isUnix) && trailingStrippedCount > 0 && /^\s*[\w][-\w.]*(@[\w.-]+)?:\S/.test(line)) ||
			// Bracketed prompt end: ...] $ or ...] #
			// e.g., "s/testWorkspace (main**) ] $ "
			((!knownPrompt || isUnix) && /\]\s*[#$]\s*$/.test(line));

		if (isCompletePrompt) {
			endIndex--;
			trailingStrippedCount++;
			break; // Complete prompt = nothing above can be prompt wrap
		} else if (isPromptFragment) {
			endIndex--;
			trailingStrippedCount++;
		} else {
			break;
		}
	}

	const result = lines.slice(startIndex, endIndex).join('\n');
	log?.(`stripCommandEchoAndPrompt result: length=${result.length} (startIndex=${startIndex}, endIndex=${endIndex}, totalLines=${lines.length})`);
	return result;
}

export function findCommandEcho(output: string, commandLine: string, allowSuffixMatch?: boolean): { contentBefore: string; linesAfter: string[] } | undefined {
	const trimmedCommand = commandLine.trim();
	if (trimmedCommand.length === 0) {
		return undefined;
	}

	// Strip newlines from the output so we can find the command as a
	// contiguous substring even when terminal wrapping splits it across lines.
	const { strippedOutput, indexMapping } = stripNewLinesAndBuildMapping(output);
	const matchIndex = strippedOutput.indexOf(trimmedCommand);

	let matchEndInStripped: number;
	let contentBefore: string;

	if (matchIndex !== -1) {
		// Full command found in the output
		contentBefore = strippedOutput.substring(0, matchIndex).trim();
		matchEndInStripped = matchIndex + trimmedCommand.length - 1;
	} else if (allowSuffixMatch) {
		// If the full command wasn't found, check if the output starts with a
		// suffix of the command. This happens when getOutput() doesn't include
		// the prompt line, so only the wrapped continuation of the command echo
		// appears at the beginning of the output.
		let suffixLen = 0;
		for (let len = trimmedCommand.length - 1; len >= 1; len--) {
			const suffix = trimmedCommand.substring(trimmedCommand.length - len);
			if (strippedOutput.startsWith(suffix)) {
				// Require the suffix to start mid-word in the command (not at
				// a word boundary). A word-boundary match like "MARKER_123"
				// matching the tail of "echo MARKER_123" is almost certainly
				// actual output, not a wrapped command continuation.
				const charBefore = trimmedCommand[trimmedCommand.length - len - 1];
				if (charBefore !== undefined && charBefore !== ' ' && charBefore !== '\t') {
					suffixLen = len;
				}
				break;
			}
		}
		if (suffixLen === 0) {
			return undefined;
		}
		contentBefore = '';
		matchEndInStripped = suffixLen - 1;
	} else {
		return undefined;
	}

	// Map the match end back to the original output position and determine
	// which line it falls on to split linesAfter.
	const originalEnd = indexMapping[matchEndInStripped];

	const lines = output.split('\n');
	let echoEndLine = 0;
	let offset = 0;
	for (let i = 0; i < lines.length; i++) {
		const lineEnd = offset + lines[i].length; // excludes the \n
		if (offset <= originalEnd && originalEnd <= lineEnd) {
			echoEndLine = i + 1;
			break;
		}
		offset = lineEnd + 1; // +1 for the \n
	}

	return {
		contentBefore,
		linesAfter: lines.slice(echoEndLine),
	};
}

export function stripNewLinesAndBuildMapping(output: string): { strippedOutput: string; indexMapping: number[] } {
	const indexMapping: number[] = [];
	const strippedChars: string[] = [];
	for (let i = 0; i < output.length; i++) {
		if (output[i] !== '\n') {
			strippedChars.push(output[i]);
			indexMapping.push(i);
		}
	}
	return { strippedOutput: strippedChars.join(''), indexMapping };
}
