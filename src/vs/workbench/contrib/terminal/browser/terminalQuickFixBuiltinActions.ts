/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { isWindows } from 'vs/base/common/platform';
import { localize } from 'vs/nls';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { QuickFixMatchResult, ITerminalQuickFixAction, ITerminalQuickFixOptions, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';

export const GitCommandLineRegex = /git/;
export const GitPushCommandLineRegex = /git\s+push/;
export const AnyCommandLineRegex = /.{4,}/;
export const GitSimilarOutputRegex = /most similar command is\s+([^\s]{3,})/;
export const FreePortOutputRegex = /address already in use \d\.\d\.\d\.\d:(\d\d\d\d)\s+|Unable to bind [^ ]*:(\d+)|can't listen on port (\d+)|listen EADDRINUSE [^ ]*:(\d+)/;
export const GitPushOutputRegex = /git push --set-upstream origin ([^\s]+)\s+/;
export const GitCreatePrOutputRegex = /Create a pull request for \'([^\s]+)\' on GitHub by visiting:\s+remote:\s+(https:.+pull.+)\s+/;

export function gitSimilarCommand(): ITerminalQuickFixOptions {
	return {
		commandLineMatcher: GitCommandLineRegex,
		outputMatcher: { lineMatcher: GitSimilarOutputRegex, anchor: 'bottom' },
		quickFixLabel: (matchResult: QuickFixMatchResult) => matchResult.outputMatch ? `Run git ${matchResult.outputMatch[1]}` : ``,
		exitStatus: false,
		getQuickFixes: (matchResult: QuickFixMatchResult, command: ITerminalCommand) => {
			const actions: ITerminalQuickFixAction[] = [];
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
export function freePort(terminalInstance?: Partial<ITerminalInstance>): ITerminalQuickFixOptions {
	return {
		quickFixLabel: (matchResult: QuickFixMatchResult) => matchResult.outputMatch ? `Free port ${matchResult.outputMatch[1]}` : '',
		commandLineMatcher: AnyCommandLineRegex,
		outputMatcher: !isWindows ? { lineMatcher: FreePortOutputRegex, anchor: 'bottom' } : undefined,
		getQuickFixes: (matchResult: QuickFixMatchResult, command: ITerminalCommand) => {
			const port = matchResult?.outputMatch?.[1];
			if (!port) {
				return;
			}
			const actions: ITerminalQuickFixAction[] = [];
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
export function gitPushSetUpstream(): ITerminalQuickFixOptions {
	return {
		quickFixLabel: (matchResult: QuickFixMatchResult) => matchResult.outputMatch ? `Git push ${matchResult.outputMatch[1]}` : '',
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: { lineMatcher: GitPushOutputRegex, anchor: 'bottom' },
		exitStatus: false,
		getQuickFixes: (matchResult: QuickFixMatchResult, command: ITerminalCommand) => {
			const branch = matchResult?.outputMatch?.[1];
			if (!branch) {
				return;
			}
			const actions: ITerminalQuickFixAction[] = [];
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

export function gitCreatePr(openerService: IOpenerService): ITerminalQuickFixOptions {
	return {
		quickFixLabel: (matchResult: QuickFixMatchResult) => matchResult.outputMatch ? `Create PR for ${matchResult.outputMatch[1]}` : '',
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: { lineMatcher: GitCreatePrOutputRegex, anchor: 'bottom' },
		exitStatus: true,
		getQuickFixes: (matchResult: QuickFixMatchResult, command?: ITerminalCommand) => {
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
