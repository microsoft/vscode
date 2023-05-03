/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalQuickFixInternalOptions, ITerminalCommandMatchResult, ITerminalQuickFixCommandAction, TerminalQuickFixActionInternal, TerminalQuickFixType } from 'vs/workbench/contrib/terminalContrib/quickFix/browser/quickFix';

export const GitCommandLineRegex = /git/;
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

export const enum QuickFixSource {
	Builtin = 'builtin'
}

export function gitSimilar(): ITerminalQuickFixInternalOptions {
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
		getQuickFixes: (matchResult: ITerminalCommandMatchResult) => {
			const regexMatch = matchResult.outputMatch?.regexMatch[0];
			if (!regexMatch || !matchResult.outputMatch) {
				return;
			}
			const actions: TerminalQuickFixActionInternal[] = [];
			const startIndex = matchResult.outputMatch.outputLines.findIndex(l => l.includes(regexMatch)) + 1;
			const results = matchResult.outputMatch.outputLines.map(r => r.trim());
			for (let i = startIndex; i < results.length; i++) {
				const fixedCommand = results[i];
				if (fixedCommand) {
					actions.push({
						id: 'Git Similar',
						type: TerminalQuickFixType.Command,
						terminalCommand: matchResult.commandLine.replace(/git\s+[^\s]+/, () => `git ${fixedCommand}`),
						addNewLine: true,
						source: QuickFixSource.Builtin
					});
				}
			}
			return actions;
		}
	};
}

export function gitTwoDashes(): ITerminalQuickFixInternalOptions {
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
		getQuickFixes: (matchResult: ITerminalCommandMatchResult) => {
			const problemArg = matchResult?.outputMatch?.regexMatch?.[1];
			if (!problemArg) {
				return;
			}
			return {
				type: TerminalQuickFixType.Command,
				id: 'Git Two Dashes',
				terminalCommand: matchResult.commandLine.replace(` -${problemArg}`, () => ` --${problemArg}`),
				addNewLine: true,
				source: QuickFixSource.Builtin
			};
		}
	};
}
export function freePort(terminalInstance?: Partial<ITerminalInstance>): ITerminalQuickFixInternalOptions {
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
		getQuickFixes: (matchResult: ITerminalCommandMatchResult) => {
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
				source: QuickFixSource.Builtin,
				run: async () => {
					await terminalInstance?.freePortKillProcess?.(port, matchResult.commandLine);
				}
			};
		}
	};
}

export function gitPushSetUpstream(): ITerminalQuickFixInternalOptions {
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
		getQuickFixes: (matchResult: ITerminalCommandMatchResult) => {
			const matches = matchResult.outputMatch;
			const commandToRun = 'git push --set-upstream origin ${group:branchName}';
			if (!matches) {
				return;
			}
			const groups = matches.regexMatch.groups;
			if (!groups) {
				return;
			}
			const actions: TerminalQuickFixActionInternal[] = [];
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
					type: TerminalQuickFixType.Command,
					id: 'Git Push Set Upstream',
					terminalCommand: fixedCommand,
					addNewLine: true,
					source: QuickFixSource.Builtin
				});
				return actions;
			}
			return;
		}
	};
}

export function gitCreatePr(): ITerminalQuickFixInternalOptions {
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
		getQuickFixes: (matchResult: ITerminalCommandMatchResult) => {
			const link = matchResult?.outputMatch?.regexMatch?.groups?.link;
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
				source: QuickFixSource.Builtin
			};
		}
	};
}

export function pwshGeneralError(): ITerminalQuickFixInternalOptions {
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
		getQuickFixes: (matchResult: ITerminalCommandMatchResult) => {
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
			const result: ITerminalQuickFixCommandAction[] = [];
			for (const suggestion of suggestions) {
				result.push({
					id: 'Pwsh General Error',
					type: TerminalQuickFixType.Command,
					terminalCommand: suggestion,
					source: QuickFixSource.Builtin
				});
			}
			return result;
		}
	};
}

export function pwshUnixCommandNotFoundError(): ITerminalQuickFixInternalOptions {
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
		getQuickFixes: (matchResult: ITerminalCommandMatchResult) => {
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
			const result: ITerminalQuickFixCommandAction[] = [];
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
						type: TerminalQuickFixType.Command,
						terminalCommand: installCommand,
						source: QuickFixSource.Builtin
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
						type: TerminalQuickFixType.Command,
						terminalCommand: line.trim(),
						source: QuickFixSource.Builtin
					});
				}
			}
			return result;
		}
	};
}
