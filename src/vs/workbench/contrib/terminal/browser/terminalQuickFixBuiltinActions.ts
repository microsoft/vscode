/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IInternalOptions, ITerminalCommandMatchResult, TerminalQuickFixActionInternal } from 'vs/platform/terminal/common/xterm/terminalQuickFix';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { TerminalQuickFixType } from 'vs/workbench/contrib/terminal/browser/widgets/terminalQuickFixMenuItems';

export const GitCommandLineRegex = /git/;
export const GitPushCommandLineRegex = /git\s+push/;
export const GitTwoDashesRegex = /error: did you mean `--(.+)` \(with two dashes\)\?/;
const AnyCommandLineRegex = /.+/;
export const GitSimilarOutputRegex = /(?:(most similar (command|commands) (is|are)))((\n\s*(?<fixedCommand>[^\s]+))+)/m;
export const FreePortOutputRegex = /address already in use (0\.0\.0\.0|127\.0\.0\.1|localhost|::):(?<portNumber>\d{4,5})|Unable to bind [^ ]*:(\d{4,5})|can't listen on port (\d{4,5})|listen EADDRINUSE [^ ]*:(\d{4,5})/;
export const GitPushOutputRegex = /git push --set-upstream origin (?<branchName>[^\s]+)/;
// The previous line starts with "Create a pull request for \'([^\s]+)\' on GitHub by visiting:\s*"
// it's safe to assume it's a github pull request if the URL includes `/pull/`
export const GitCreatePrOutputRegex = /remote:\s*(?<link>https:\/\/github\.com\/.+\/.+\/pull\/new\/.+)/;

export function gitSimilar(): IInternalOptions {
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
			if (!matchResult?.outputMatch) {
				return;
			}
			const actions: TerminalQuickFixActionInternal[] = [];
			const results = matchResult.outputMatch.regexMatch[0].split('\n').map(r => r.trim());
			for (let i = 1; i < results.length; i++) {
				const fixedCommand = results[i];
				if (fixedCommand) {
					actions.push({
						id: 'Git Similar',
						type: TerminalQuickFixType.Command,
						terminalCommand: matchResult.commandLine.replace(/git\s+[^\s]+/, () => `git ${fixedCommand}`),
						addNewLine: true,
						source: 'builtin'
					});
				}
			}
			return actions;
		}
	};
}

export function gitTwoDashes(): IInternalOptions {
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
				source: 'builtin'
			};
		}
	};
}
export function freePort(terminalInstance?: Partial<ITerminalInstance>): IInternalOptions {
	return {
		id: 'Free Port',
		type: 'internal',
		commandLineMatcher: AnyCommandLineRegex,
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
				class: TerminalQuickFixType.Port,
				tooltip: label,
				id: 'Free Port',
				label,
				enabled: true,
				run: async () => {
					await terminalInstance?.freePortKillProcess?.(port, matchResult.commandLine);
				}
			};
		}
	};
}

export function gitPushSetUpstream(): IInternalOptions {
	return {
		id: 'Git Push Set Upstream',
		type: 'internal',
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: {
			lineMatcher: GitPushOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 5
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
					type: 'command',
					id: 'Git Push Set Upstream',
					terminalCommand: fixedCommand,
					addNewLine: true,
					source: 'builtin'
				});
				return actions;
			}
			return;
		}
	};
}

export function gitCreatePr(): IInternalOptions {
	return {
		id: 'Git Create Pr',
		type: 'internal',
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: {
			lineMatcher: GitCreatePrOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 5
		},
		commandExitResult: 'success',
		getQuickFixes: (matchResult: ITerminalCommandMatchResult) => {
			const link = matchResult?.outputMatch?.regexMatch?.groups?.link;
			if (!link) {
				return;
			}
			const label = localize("terminal.createPR", "Create PR {0}", link);
			return {
				class: undefined,
				tooltip: label,
				id: 'Git Create Pr',
				label,
				enabled: true,
				type: 'opener',
				uri: URI.parse(link),
				run: () => { }
			};
		}
	};
}
