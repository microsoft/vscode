/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ContextualMatchResult, ICommandAction, ITerminalContextualActionOptions, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';

export const GitCommandLineRegex = /git/;
export const GitPushCommandLineRegex = /git\s+push/;
export const AnyCommandLineRegex = /.{4,}/;
export const GitSimilarOutputRegex = getRegexForWrappedLines(['most', 'similar', 'command', 'is'], ['([^\\s]{3,})'], undefined, true);
export const FreePortOutputRegex = getRegexForWrappedLines(['address', 'already', 'in', 'use'], [['\\d', '\\.', '\\d', '\\.', '\\d', '\\.', '\\d', ':', '(\\d\\d\\d\\d)'].join('\\s*')]);
export const GitPushOutputRegex = getRegexForWrappedLines(['git', 'push', '--set-upstream', 'origin'], ['([^\\s]+)'], undefined, true);
export const GitCreatePrOutputRegex = getRegexForWrappedLines(['pull', 'request', 'for', 'on', 'GitHub', 'by', 'visiting:', 'remote:'], [`'([^\\s]+)'`, '\\s+(https:.+pull.+)\\s+'], 3);

function getRegexForWrappedLines(words: string[], unbrokenPatterns: string[] = [], insertionIndex?: number, endRequired?: boolean): RegExp {
	const endPattern = unbrokenPatterns[unbrokenPatterns.length - 1];
	let regex;
	// words may get split when the line wraps
	const wordRegexes = words.map(word => word.split('').join('\\s*'));
	// words and patterns should have at least one space between them
	if (insertionIndex) {
		regex = [...wordRegexes.slice(0, insertionIndex)].join('\\s+') + '\\s+' + unbrokenPatterns[0] + '\\s+' + [...wordRegexes.slice(insertionIndex)].join('\\s+');
		if (endPattern) {
			regex += endPattern;
		}
	} else {
		// it's at the end
		regex = [...wordRegexes, ...unbrokenPatterns].join('\\s+');
	}
	if (endRequired) {
		// pattern terminates at the first space
		regex += '\\s+';
	}
	console.log('regular expression', new RegExp(regex));
	return new RegExp(regex);
}

export function gitSimilarCommand(): ITerminalContextualActionOptions {
	return {
		commandLineMatcher: GitCommandLineRegex,
		outputMatcher: { lineMatcher: GitSimilarOutputRegex, anchor: 'bottom' },
		actionName: (matchResult: ContextualMatchResult) => matchResult.outputMatch ? `Run git ${matchResult.outputMatch[1]}` : ``,
		exitCode: 1,
		getActions: (matchResult: ContextualMatchResult, command: ITerminalCommand) => {
			const actions: ICommandAction[] = [];
			const fixedCommand = matchResult?.outputMatch?.[1];
			if (!fixedCommand) {
				return;
			}
			const label = localize("terminal.gitSimilarCommand", "Run git {0}", fixedCommand);
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.gitSimilarCommand', label, enabled: true,
				commandToRunInTerminal: `git ${fixedCommand}`,
				addNewLine: true,
				run: () => { }
			});
			return actions;
		}
	};
}
export function freePort(terminalInstance?: Partial<ITerminalInstance>): ITerminalContextualActionOptions {
	return {
		actionName: (matchResult: ContextualMatchResult) => matchResult.outputMatch ? `Free port ${matchResult.outputMatch[1]}` : '',
		commandLineMatcher: AnyCommandLineRegex,
		outputMatcher: { lineMatcher: FreePortOutputRegex, anchor: 'bottom' },
		exitCode: 1,
		getActions: (matchResult: ContextualMatchResult, command: ITerminalCommand) => {
			const port = matchResult?.outputMatch?.[1];
			if (!port) {
				return;
			}
			const actions: ICommandAction[] = [];
			const label = localize("terminal.freePort", "Free port {0}", port);
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.freePort', label, enabled: true,
				run: async () => {
					await terminalInstance?.freePortKillProcess?.(port);
				},
				commandToRunInTerminal: command.command,
				addNewLine: false
			});
			return actions;
		}
	};
}
export function gitPushSetUpstream(): ITerminalContextualActionOptions {
	return {
		actionName: (matchResult: ContextualMatchResult) => matchResult.outputMatch ? `Git push ${matchResult.outputMatch[1]}` : '',
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: { lineMatcher: GitPushOutputRegex, anchor: 'bottom' },
		exitCode: 128,
		getActions: (matchResult: ContextualMatchResult, command: ITerminalCommand) => {
			const branch = matchResult?.outputMatch?.[1];
			if (!branch) {
				return;
			}
			const actions: ICommandAction[] = [];
			const label = localize("terminal.gitPush", "Git push {0}", branch);
			command.command = `git push --set-upstream origin ${branch}`;
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.gitPush', label, enabled: true,
				commandToRunInTerminal: command.command,
				addNewLine: true,
				run: () => { }
			});
			return actions;
		}
	};
}

export function gitCreatePr(openerService: IOpenerService): ITerminalContextualActionOptions {
	return {
		actionName: (matchResult: ContextualMatchResult) => matchResult.outputMatch ? `Create PR for ${matchResult.outputMatch[1]}` : '',
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: { lineMatcher: GitCreatePrOutputRegex, anchor: 'bottom' },
		exitCode: 0,
		getActions: (matchResult: ContextualMatchResult, command?: ITerminalCommand) => {
			if (!command) {
				return;
			}
			const branch = matchResult?.outputMatch?.[1];
			const link = matchResult?.outputMatch?.[2];
			if (!branch || !link) {
				return;
			}
			const actions: IAction[] = [];
			const label = localize("terminal.gitCreatePr", "Create PR");
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.gitCreatePr', label, enabled: true,
				run: () => openerService.open(link)
			});
			return actions;
		}
	};
}
