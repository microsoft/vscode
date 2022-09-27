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
export const AnyCommandLineRegex = /.+/;
export const GitSimilarOutputRegex = /most similar command is\s*([^\s]{3,})/;
export const FreePortOutputRegex = /address already in use \d\.\d\.\d\.\d:(\d\d\d\d)|Unable to bind [^ ]*:(\d+)|can't listen on port (\d+)|listen EADDRINUSE [^ ]*:(\d+)/;
export const GitPushOutputRegex = /git push --set-upstream origin ([^\s]+)/;
// The previous line starts with "Create a pull request for \'([^\s]+)\' on GitHub by visiting:\s*",
// it's safe to assume it's a github pull request if the URL includes `/pull/`
export const GitCreatePrOutputRegex = /remote:\s*(https:\/\/github\.com\/.+\/.+\/pull\/new\/.+)/;

export function gitSimilarCommand(): ITerminalQuickFixOptions {
	return {
		commandLineMatcher: GitCommandLineRegex,
		outputMatcher: {
			lineMatcher: GitSimilarOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 3
		},
		exitStatus: false,
		getQuickFixes: (matchResult: QuickFixMatchResult, command: ITerminalCommand) => {
			const actions: ITerminalQuickFixAction[] = [];
			const fixedCommand = matchResult?.outputMatch?.[1];
			if (!fixedCommand) {
				return;
			}
			const commandToRunInTerminal = `git ${fixedCommand}`;
			const label = localize("terminal.runCommand", "Run: {0}", commandToRunInTerminal);
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.gitSimilarCommand', label, enabled: true,
				commandToRunInTerminal,
				addNewLine: true,
				run: () => { }
			});
			return actions;
		}
	};
}
export function freePort(terminalInstance?: Partial<ITerminalInstance>): ITerminalQuickFixOptions {
	return {
		commandLineMatcher: AnyCommandLineRegex,
		// TODO: Support free port on Windows https://github.com/microsoft/vscode/issues/161775
		outputMatcher: isWindows ? undefined : {
			lineMatcher: FreePortOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 20
		},
		exitStatus: false,
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
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: {
			lineMatcher: GitPushOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 5
		},
		exitStatus: false,
		getQuickFixes: (matchResult: QuickFixMatchResult, command: ITerminalCommand) => {
			const branch = matchResult?.outputMatch?.[1];
			if (!branch) {
				return;
			}
			const actions: ITerminalQuickFixAction[] = [];
			const commandToRunInTerminal = `git push --set-upstream origin ${branch}`;
			const label = localize("terminal.runCommand", "Run: {0}", commandToRunInTerminal);
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.gitPush', label, enabled: true,
				commandToRunInTerminal,
				addNewLine: true,
				run: () => { }
			});
			return actions;
		}
	};
}

export function gitCreatePr(openerService: IOpenerService): ITerminalQuickFixOptions {
	return {
		commandLineMatcher: GitPushCommandLineRegex,
		outputMatcher: {
			lineMatcher: GitCreatePrOutputRegex,
			anchor: 'bottom',
			offset: 0,
			length: 5
		},
		exitStatus: true,
		getQuickFixes: (matchResult: QuickFixMatchResult, command?: ITerminalCommand) => {
			if (!command) {
				return;
			}
			const link = matchResult?.outputMatch?.[1];
			if (!link) {
				return;
			}
			const actions: IAction[] = [];
			const label = localize("terminal.openLink", "Open link: {0}", link);
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.gitCreatePr', label, enabled: true,
				run: () => openerService.open(link)
			});
			return actions;
		}
	};
}
