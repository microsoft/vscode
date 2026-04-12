/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { TerminalQuickFixType } from './quickFix.js';
export const GitCommandLineRegex = /git/;
export const GitFastForwardPullOutputRegex = /and can be fast-forwarded/;
export const GitPushCommandLineRegex = /git\s+push/;
export const GitTwoDashesRegex = /error: did you mean `--(.+)` \(with two dashes\)\?/;
export const GitSimilarOutputRegex = /(?:(most similar commands? (is|are)))/;
export const FreePortOutputRegex = /(?:address already in use (?:0\.0\.0\.0|127\.0\.0\.1|localhost|::):|Unable to bind [^ ]*:|can't listen on port |listen EADDRINUSE [^ ]*:)(?<portNumber>\d{4,5})/;
export const GitPushOutputRegex = /git push --set-upstream origin (?<branchName>[^\s]+)/;
// The previous line starts with "Create a pull request for \'([^\s]+)\' on GitHub by visiting:\s*"
// it's safe to assume it's a github pull request if the URL includes `/pull/`
export const GitCreatePrOutputRegex = /remote:\s*(?<link>https:\/\/github\.com\/.+\/.+\/pull\/new\/.+)/;
export const PwshGeneralErrorOutputRegex = /Suggestion \[General\]:/;
export const PwshUnixCommandNotFoundErrorOutputRegex = /Suggestion \[cmd-not-found\]:/;
export var QuickFixSource;
(function (QuickFixSource) {
    QuickFixSource["Builtin"] = "builtin";
})(QuickFixSource || (QuickFixSource = {}));
export function gitSimilar() {
    return {
        id: 'Git Similar',
        type: 'internal',
        commandLineMatcher: GitCommandLineRegex,
        outputMatcher: {
            lineMatcher: GitSimilarOutputRegex,
            anchor: 'bottom',
            offset: 0,
            length: 10
        },
        commandExitResult: 'error',
        getQuickFixes: (matchResult) => {
            const regexMatch = matchResult.outputMatch?.regexMatch[0];
            if (!regexMatch || !matchResult.outputMatch) {
                return;
            }
            const actions = [];
            const startIndex = matchResult.outputMatch.outputLines.findIndex(l => l.includes(regexMatch)) + 1;
            const results = matchResult.outputMatch.outputLines.map(r => r.trim());
            for (let i = startIndex; i < results.length; i++) {
                const fixedCommand = results[i];
                if (fixedCommand) {
                    actions.push({
                        id: 'Git Similar',
                        type: TerminalQuickFixType.TerminalCommand,
                        terminalCommand: matchResult.commandLine.replace(/git\s+[^\s]+/, () => `git ${fixedCommand}`),
                        shouldExecute: true,
                        source: "builtin" /* QuickFixSource.Builtin */
                    });
                }
            }
            return actions;
        }
    };
}
export function gitFastForwardPull() {
    return {
        id: 'Git Fast Forward Pull',
        type: 'internal',
        commandLineMatcher: GitCommandLineRegex,
        outputMatcher: {
            lineMatcher: GitFastForwardPullOutputRegex,
            anchor: 'bottom',
            offset: 0,
            length: 8
        },
        commandExitResult: 'success',
        getQuickFixes: (matchResult) => {
            return {
                type: TerminalQuickFixType.TerminalCommand,
                id: 'Git Fast Forward Pull',
                terminalCommand: `git pull`,
                shouldExecute: true,
                source: "builtin" /* QuickFixSource.Builtin */
            };
        }
    };
}
export function gitTwoDashes() {
    return {
        id: 'Git Two Dashes',
        type: 'internal',
        commandLineMatcher: GitCommandLineRegex,
        outputMatcher: {
            lineMatcher: GitTwoDashesRegex,
            anchor: 'bottom',
            offset: 0,
            length: 2
        },
        commandExitResult: 'error',
        getQuickFixes: (matchResult) => {
            const problemArg = matchResult?.outputMatch?.regexMatch?.[1];
            if (!problemArg) {
                return;
            }
            return {
                type: TerminalQuickFixType.TerminalCommand,
                id: 'Git Two Dashes',
                terminalCommand: matchResult.commandLine.replace(` -${problemArg}`, () => ` --${problemArg}`),
                shouldExecute: true,
                source: "builtin" /* QuickFixSource.Builtin */
            };
        }
    };
}
export function freePort(runCallback) {
    return {
        id: 'Free Port',
        type: 'internal',
        commandLineMatcher: /.+/,
        outputMatcher: {
            lineMatcher: FreePortOutputRegex,
            anchor: 'bottom',
            offset: 0,
            length: 30
        },
        commandExitResult: 'error',
        getQuickFixes: (matchResult) => {
            const port = matchResult?.outputMatch?.regexMatch?.groups?.portNumber;
            if (!port) {
                return;
            }
            const label = localize("terminal.freePort", "Free port {0}", port);
            return {
                type: TerminalQuickFixType.Port,
                class: undefined,
                tooltip: label,
                id: 'Free Port',
                label,
                enabled: true,
                source: "builtin" /* QuickFixSource.Builtin */,
                run: () => runCallback(port, matchResult.commandLine)
            };
        }
    };
}
export function gitPushSetUpstream() {
    return {
        id: 'Git Push Set Upstream',
        type: 'internal',
        commandLineMatcher: GitPushCommandLineRegex,
        /**
            Example output on Windows:
            8: PS C:\Users\merogge\repos\xterm.js> git push
            7: fatal: The current branch sdjfskdjfdslkjf has no upstream branch.
            6: To push the current branch and set the remote as upstream, use
            5:
            4:	git push --set-upstream origin sdjfskdjfdslkjf
            3:
            2: To have this happen automatically for branches without a tracking
            1: upstream, see 'push.autoSetupRemote' in 'git help config'.
            0:

            Example output on macOS:
            5: meganrogge@Megans-MacBook-Pro xterm.js % git push
            4: fatal: The current branch merogge/asjdkfsjdkfsdjf has no upstream branch.
            3: To push the current branch and set the remote as upstream, use
            2:
            1:	git push --set-upstream origin merogge/asjdkfsjdkfsdjf
            0:
         */
        outputMatcher: {
            lineMatcher: GitPushOutputRegex,
            anchor: 'bottom',
            offset: 0,
            length: 8
        },
        commandExitResult: 'error',
        getQuickFixes: (matchResult) => {
            const matches = matchResult.outputMatch;
            const commandToRun = 'git push --set-upstream origin ${group:branchName}';
            if (!matches) {
                return;
            }
            const groups = matches.regexMatch.groups;
            if (!groups) {
                return;
            }
            const actions = [];
            let fixedCommand = commandToRun;
            for (const [key, value] of Object.entries(groups)) {
                const varToResolve = '${group:' + `${key}` + '}';
                if (!commandToRun.includes(varToResolve)) {
                    return [];
                }
                fixedCommand = fixedCommand.replaceAll(varToResolve, () => value);
            }
            if (fixedCommand) {
                actions.push({
                    type: TerminalQuickFixType.TerminalCommand,
                    id: 'Git Push Set Upstream',
                    terminalCommand: fixedCommand,
                    shouldExecute: true,
                    source: "builtin" /* QuickFixSource.Builtin */
                });
                return actions;
            }
            return;
        }
    };
}
export function gitCreatePr() {
    return {
        id: 'Git Create Pr',
        type: 'internal',
        commandLineMatcher: GitPushCommandLineRegex,
        // Example output:
        // ...
        // 10: remote:
        // 9:  remote: Create a pull request for 'my_branch' on GitHub by visiting:
        // 8:  remote:      https://github.com/microsoft/vscode/pull/new/my_branch
        // 7:  remote:
        // 6:  remote: GitHub found x vulnerabilities on microsoft/vscode's default branch (...). To find out more, visit:
        // 5:  remote:      https://github.com/microsoft/vscode/security/dependabot
        // 4:  remote:
        // 3:  To https://github.com/microsoft/vscode
        // 2:  * [new branch]              my_branch -> my_branch
        // 1:  Branch 'my_branch' set up to track remote branch 'my_branch' from 'origin'.
        // 0:
        outputMatcher: {
            lineMatcher: GitCreatePrOutputRegex,
            anchor: 'bottom',
            offset: 4,
            // ~6 should only be needed here for security alerts, but the git provider can customize
            // the text, so use 12 to be safe.
            length: 12
        },
        commandExitResult: 'success',
        getQuickFixes: (matchResult) => {
            const link = matchResult?.outputMatch?.regexMatch?.groups?.link?.trimEnd();
            if (!link) {
                return;
            }
            const label = localize("terminal.createPR", "Create PR {0}", link);
            return {
                id: 'Git Create Pr',
                label,
                enabled: true,
                type: TerminalQuickFixType.Opener,
                uri: URI.parse(link),
                source: "builtin" /* QuickFixSource.Builtin */
            };
        }
    };
}
export function pwshGeneralError() {
    return {
        id: 'Pwsh General Error',
        type: 'internal',
        commandLineMatcher: /.+/,
        outputMatcher: {
            lineMatcher: PwshGeneralErrorOutputRegex,
            anchor: 'bottom',
            offset: 0,
            length: 10
        },
        commandExitResult: 'error',
        getQuickFixes: (matchResult) => {
            const lines = matchResult.outputMatch?.regexMatch.input?.split('\n');
            if (!lines) {
                return;
            }
            // Find the start
            let i = 0;
            let inFeedbackProvider = false;
            for (; i < lines.length; i++) {
                if (lines[i].match(PwshGeneralErrorOutputRegex)) {
                    inFeedbackProvider = true;
                    break;
                }
            }
            if (!inFeedbackProvider) {
                return;
            }
            const suggestions = lines[i + 1].match(/The most similar commands are: (?<values>.+)./)?.groups?.values?.split(', ');
            if (!suggestions) {
                return;
            }
            const result = [];
            for (const suggestion of suggestions) {
                result.push({
                    id: 'Pwsh General Error',
                    type: TerminalQuickFixType.TerminalCommand,
                    terminalCommand: suggestion,
                    source: "builtin" /* QuickFixSource.Builtin */
                });
            }
            return result;
        }
    };
}
export function pwshUnixCommandNotFoundError() {
    return {
        id: 'Unix Command Not Found',
        type: 'internal',
        commandLineMatcher: /.+/,
        outputMatcher: {
            lineMatcher: PwshUnixCommandNotFoundErrorOutputRegex,
            anchor: 'bottom',
            offset: 0,
            length: 10
        },
        commandExitResult: 'error',
        getQuickFixes: (matchResult) => {
            const lines = matchResult.outputMatch?.regexMatch.input?.split('\n');
            if (!lines) {
                return;
            }
            // Find the start
            let i = 0;
            let inFeedbackProvider = false;
            for (; i < lines.length; i++) {
                if (lines[i].match(PwshUnixCommandNotFoundErrorOutputRegex)) {
                    inFeedbackProvider = true;
                    break;
                }
            }
            if (!inFeedbackProvider) {
                return;
            }
            // Always remove the first element as it's the "Suggestion [cmd-not-found]"" line
            const result = [];
            let inSuggestions = false;
            for (; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.length === 0) {
                    break;
                }
                const installCommand = line.match(/You also have .+ installed, you can run '(?<command>.+)' instead./)?.groups?.command;
                if (installCommand) {
                    result.push({
                        id: 'Pwsh Unix Command Not Found Error',
                        type: TerminalQuickFixType.TerminalCommand,
                        terminalCommand: installCommand,
                        source: "builtin" /* QuickFixSource.Builtin */
                    });
                    inSuggestions = false;
                    continue;
                }
                if (line.match(/Command '.+' not found, but can be installed with:/)) {
                    inSuggestions = true;
                    continue;
                }
                if (inSuggestions) {
                    result.push({
                        id: 'Pwsh Unix Command Not Found Error',
                        type: TerminalQuickFixType.TerminalCommand,
                        terminalCommand: line.trim(),
                        source: "builtin" /* QuickFixSource.Builtin */
                    });
                }
            }
            return result;
        }
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxRdWlja0ZpeEJ1aWx0aW5BY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL3F1aWNrRml4L2Jyb3dzZXIvdGVybWluYWxRdWlja0ZpeEJ1aWx0aW5BY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUF5SSxvQkFBb0IsRUFBRSxNQUFNLGVBQWUsQ0FBQztBQUU1TCxNQUFNLENBQUMsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUM7QUFDekMsTUFBTSxDQUFDLE1BQU0sNkJBQTZCLEdBQUcsMkJBQTJCLENBQUM7QUFDekUsTUFBTSxDQUFDLE1BQU0sdUJBQXVCLEdBQUcsWUFBWSxDQUFDO0FBQ3BELE1BQU0sQ0FBQyxNQUFNLGlCQUFpQixHQUFHLG9EQUFvRCxDQUFDO0FBQ3RGLE1BQU0sQ0FBQyxNQUFNLHFCQUFxQixHQUFHLHVDQUF1QyxDQUFDO0FBQzdFLE1BQU0sQ0FBQyxNQUFNLG1CQUFtQixHQUFHLGlLQUFpSyxDQUFDO0FBQ3JNLE1BQU0sQ0FBQyxNQUFNLGtCQUFrQixHQUFHLHNEQUFzRCxDQUFDO0FBQ3pGLG1HQUFtRztBQUNuRyw4RUFBOEU7QUFDOUUsTUFBTSxDQUFDLE1BQU0sc0JBQXNCLEdBQUcsaUVBQWlFLENBQUM7QUFDeEcsTUFBTSxDQUFDLE1BQU0sMkJBQTJCLEdBQUcseUJBQXlCLENBQUM7QUFDckUsTUFBTSxDQUFDLE1BQU0sdUNBQXVDLEdBQUcsK0JBQStCLENBQUM7QUFFdkYsTUFBTSxDQUFOLElBQWtCLGNBRWpCO0FBRkQsV0FBa0IsY0FBYztJQUMv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