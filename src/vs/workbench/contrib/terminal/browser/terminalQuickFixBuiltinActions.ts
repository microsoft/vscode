/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { IInternalOptions, ITerminalCommandMatchResult, TerminalQuickFixActionInternal, TerminalQuickFixType } from 'vs/platform/terminal/common/xterm/terminalQuickFix';
import { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';

export const GitCommandLineRegex = /git/;
export const GitPushCommandLineRegex = /git\s+push/;
export const GitTwoDashesRegex = /error: did you mean `--(.+)` \(with two dashes\)\?/;
export const GitSimilarOutputRegex = /(?:(most similar (command|commands) (is|are)))((\n\s*(?<fixedCommand>[^\s]+))+)/m;
export const FreePortOutputRegex = /(?:address already in use (?:0\.0\.0\.0|127\.0\.0\.1|localhost|::):|Unable to bind [^ ]*:|can't listen on port |listen EADDRINUSE [^ ]*:)(?<portNumber>\d{4,5})/;
export const GitPushOutputRegex = /git push --set-upstream origin (?<branchName>[^\s]+)/;
// The previous line starts with "Create a pull request for \'([^\s]+)\' on GitHub by visiting:\s*"
// it's safe to assume it's a github pull request if the URL includes `/pull/`
export const GitCreatePrOutputRegex = /remote:\s*(?<link>https:\/\/github\.com\/.+\/.+\/pull\/new\/.+)/;

export const enum QuickFixSource {
	Builtin = 'builtin'
}

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
						source: QuickFixSource.Builtin
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
				source: QuickFixSource.Builtin
			};
		}
	};
}
export function freePort(terminalInstance?: Partial<ITerminalInstance>): IInternalOptions {
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
