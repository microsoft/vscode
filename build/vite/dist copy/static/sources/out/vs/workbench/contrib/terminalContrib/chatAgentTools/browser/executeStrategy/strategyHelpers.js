/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { MutableDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
/**
 * Sets up a recreating start marker which is resilient to prompts that clear/re-render (eg. transient
 * or powerlevel10k style prompts). The marker is recreated at the cursor position whenever the
 * existing marker is disposed. The caller is responsible for adding the startMarker to the store.
 */
export function setupRecreatingStartMarker(xterm, startMarker, fire, store, log) {
    const markerListener = new MutableDisposable();
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
export function createAltBufferPromise(xterm, store, log) {
    const deferred = new DeferredPromise();
    const complete = () => {
        if (!deferred.isSettled) {
            log?.('Detected alternate buffer entry');
            deferred.complete();
        }
    };
    if (xterm.raw.buffer.active === xterm.raw.buffer.alternate) {
        complete();
    }
    else {
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
export function stripCommandEchoAndPrompt(output, commandLine, log) {
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
function _stripCommandEchoAndPromptOnce(output, commandLine, log) {
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
        }
        else if (isPromptFragment) {
            endIndex--;
            trailingStrippedCount++;
        }
        else {
            break;
        }
    }
    const result = lines.slice(startIndex, endIndex).join('\n');
    log?.(`stripCommandEchoAndPrompt result: length=${result.length} (startIndex=${startIndex}, endIndex=${endIndex}, totalLines=${lines.length})`);
    return result;
}
export function findCommandEcho(output, commandLine, allowSuffixMatch) {
    const trimmedCommand = commandLine.trim();
    if (trimmedCommand.length === 0) {
        return undefined;
    }
    // Strip newlines from the output so we can find the command as a
    // contiguous substring even when terminal wrapping splits it across lines.
    const { strippedOutput, indexMapping } = stripNewLinesAndBuildMapping(output);
    const matchIndex = strippedOutput.indexOf(trimmedCommand);
    let matchEndInStripped;
    let contentBefore;
    if (matchIndex !== -1) {
        // Full command found in the output
        contentBefore = strippedOutput.substring(0, matchIndex).trim();
        matchEndInStripped = matchIndex + trimmedCommand.length - 1;
    }
    else if (allowSuffixMatch) {
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
    }
    else {
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
export function stripNewLinesAndBuildMapping(output) {
    const indexMapping = [];
    const strippedChars = [];
    for (let i = 0; i < output.length; i++) {
        if (output[i] !== '\n') {
            strippedChars.push(output[i]);
            indexMapping.push(i);
        }
    }
    return { strippedOutput: strippedChars.join(''), indexMapping };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyYXRlZ3lIZWxwZXJzLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvZXhlY3V0ZVN0cmF0ZWd5L3N0cmF0ZWd5SGVscGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDekUsT0FBTyxFQUFtQixpQkFBaUIsRUFBRSxZQUFZLEVBQW9CLE1BQU0sNENBQTRDLENBQUM7QUFHaEk7Ozs7R0FJRztBQUNILE1BQU0sVUFBVSwwQkFBMEIsQ0FDekMsS0FBOEQsRUFDOUQsV0FBNEMsRUFDNUMsSUFBZ0QsRUFDaEQsS0FBc0IsRUFDdEIsR0FBK0I7SUFFL0IsTUFBTSxjQUFjLEdBQUcsSUFBSSxpQkFBaUIsRUFBZSxDQUFDO0lBQzVELE1BQU0sbUJBQW1CLEdBQUcsR0FBRyxFQUFFO1FBQ2hDLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRSxDQUFDO1lBQ3RCLE9BQU87UUFDUixDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztRQUMxQyxXQUFXLENBQUMsS0FBSyxHQUFHLE1BQU0sSUFBSSxTQUFTLENBQUM7UUFDeEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2IsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ2IsY0FBYyxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ3ZCLE9BQU87UUFDUixDQUFDO1FBQ0QsY0FBYyxDQUFDLEtBQUssR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsRUFBRTtZQUM1QyxHQUFHLEVBQUUsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1lBQy9DLG1CQUFtQixFQUFFLENBQUM7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