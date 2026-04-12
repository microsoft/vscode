/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { DeferredPromise, RunOnceScheduler } from '../../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
export async function waitForIdle(onData, idleDurationMs) {
    // This is basically Event.debounce but with an initial event to trigger the debounce
    // immediately
    const store = new DisposableStore();
    const deferred = new DeferredPromise();
    const scheduler = store.add(new RunOnceScheduler(() => deferred.complete(), idleDurationMs));
    store.add(onData(() => scheduler.schedule()));
    scheduler.schedule();
    return deferred.p.finally(() => store.dispose());
}
/**
 * Detects if the given text content appears to end with a common prompt pattern.
 */
export function detectsCommonPromptPattern(cursorLine) {
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
export async function waitForIdleWithPromptHeuristics(onData, instance, idlePollIntervalMs, extendedTimeoutMs) {
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
        }
        catch (error) {
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
    }
    catch (error) {
        return { detected: false, reason: `Extended timeout reached. Error reading terminal content: ${error}` };
    }
}
/**
 * Tracks the terminal for being idle on a prompt input. This must be called before `executeCommand`
 * is called.
 */
export async function trackIdleOnPrompt(instance, idleDurationMs, store, promptFallbackMs) {
    const idleOnPrompt = new DeferredPromise();
    const onData = instance.onData;
    const scheduler = store.add(new RunOnceScheduler(() => {
        idleOnPrompt.complete();
    }, idleDurationMs));
    let state = 0 /* TerminalState.Initial */;
    // Fallback in case prompt sequences are not seen but the terminal goes idle.
    const promptFallbackScheduler = store.add(new RunOnceScheduler(() => {
        if (state === 2 /* TerminalState.Executing */ || state === 3 /* TerminalState.PromptAfterExecuting */) {
            promptFallbackScheduler.cancel();
            return;
        }
        state = 3 /* TerminalState.PromptAfterExecuting */;
        scheduler.schedule();
    }, promptFallbackMs ?? 1000));
    // Only schedule when a prompt sequence (A) is seen after an execute sequence (C). This prevents
    // cases where the command is executed before the prompt is written. While not perfect, sitting
    // on an A without a C following shortly after is a very good indicator that the command is done
    // and the terminal is idle. Note that D is treated as a signal for executed since shell
    // integration sometimes lacks the C sequence either due to limitations in the integation or the
    // required hooks aren't available.
    let TerminalState;
    (function (TerminalState) {
        TerminalState[TerminalState["Initial"] = 0] = "Initial";
        TerminalState[TerminalState["Prompt"] = 1] = "Prompt";
        TerminalState[TerminalState["Executing"] = 2] = "Executing";
        TerminalState[TerminalState["PromptAfterExecuting"] = 3] = "PromptAfterExecuting";
    })(TerminalState || (TerminalState = {}));
    store.add(onData(e => {
        // Update state
        // p10k fires C as `133;C;`
        const matches = e.matchAll(/(?:\x1b\]|\x9d)[16]33;(?<type>[ACD])(?:;.*)?(?:\x1b\\|\x07|\x9c)/g);
        for (const match of matches) {
            if (match.groups?.type === 'A') {
                if (state === 0 /* TerminalState.Initial */) {
                    state = 1 /* TerminalState.Prompt */;
                }
                else if (state === 2 /* TerminalState.Executing */) {
                    state = 3 /* TerminalState.PromptAfterExecuting */;
                }
            }
            else if (match.groups?.type === 'C' || match.groups?.type === 'D') {
                state = 2 /* TerminalState.Executing */;
            }
        }
        // Re-schedule on every data event as we're tracking data idle
        if (state === 3 /* TerminalState.PromptAfterExecuting */) {
            promptFallbackScheduler.cancel();
            scheduler.schedule();
        }
        else {
            scheduler.cancel();
            if (state === 0 /* TerminalState.Initial */ || state === 1 /* TerminalState.Prompt */) {
                promptFallbackScheduler.schedule();
            }
            else {
                promptFallbackScheduler.cancel();
            }
        }
    }));
    return idleOnPrompt.p;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXhlY3V0ZVN0cmF0ZWd5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXRBZ2VudFRvb2xzL2Jyb3dzZXIvZXhlY3V0ZVN0cmF0ZWd5L2V4ZWN1dGVTdHJhdGVneS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFHM0YsT0FBTyxFQUFFLGVBQWUsRUFBb0IsTUFBTSw0Q0FBNEMsQ0FBQztBQTBCL0YsTUFBTSxDQUFDLEtBQUssVUFBVSxXQUFXLENBQUMsTUFBc0IsRUFBRSxjQUFzQjtJQUMvRSxxRkFBcUY7SUFDckYsY0FBYztJQUNkLE1BQU0sS0FBSyxHQUFHLElBQUksZUFBZSxFQUFFLENBQUM7SUFDcEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxlQUFlLEVBQVEsQ0FBQztJQUM3QyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7SUFDN0YsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUM5QyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7SUFDckIsT0FBTyxRQUFRLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztBQUNsRCxDQUFDO0FBYUQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsVUFBa0I7SUFDNUQsSUFBSSxVQUFVLENBQUMsSUFB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