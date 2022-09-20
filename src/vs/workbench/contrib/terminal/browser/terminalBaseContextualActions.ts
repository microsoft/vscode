/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ContextualMatchResult, ITerminalContextualActionOptions, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalCommand } from 'vs/workbench/contrib/terminal/common/terminal';

export const GitCommandLineRegex = /git/;
export const GitPushCommandLineRegex = /git\s+push/;
export const AnyCommandLineRegex = /.{4,}/;

export const GitSimilarOutputRegex = /most similar command is\s+([^\s]{3,})\s+/;
export const FreePortOutputRegex = /address already in use\s*(\d\.\s*){3}(\d\s*):((\d\s*){3}\d)\s+/;
export const GitPushOutputRegex = /git push --set-upstream origin (.*)\s+/;
export const GitCreatePrOutputRegex = /Create\s+a\s+pull\s+request\s+for\s+\'(.+)\'\s+on\s+GitHub\s+by\s+visiting\s*:\s+remote:\s+(https:.+pull.+)\s+/;

export function gitSimilarCommand(terminalInstance: Partial<ITerminalInstance>): ITerminalContextualActionOptions {
	return {
		commandLineMatcher: GitCommandLineRegex,
		outputMatcher: { lineMatcher: GitSimilarOutputRegex, anchor: 'bottom' },
		actionName: (matchResult: ContextualMatchResult) => matchResult.outputMatch ? `Run git ${matchResult.outputMatch[1]}` : ``,
		exitCode: 1,
		getActions: (matchResult: ContextualMatchResult, command: ITerminalCommand) => {
			const actions: IAction[] = [];
			const fixedCommand = matchResult?.outputMatch?.[1];
			if (!fixedCommand) {
				return;
			}
			const label = localize("terminal.gitSimilarCommand", "Run git {0}", fixedCommand);
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.gitSimilarCommand', label, enabled: true,
				run: () => {
					command.command = `git ${fixedCommand}`;
					terminalInstance.sendText?.(command.command, true);
				}
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
			const port = matchResult?.outputMatch?.[3];
			if (!port) {
				return;
			}
			const actions: IAction[] = [];
			const label = localize("terminal.freePort", "Free port {0}", port);
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.freePort', label, enabled: true,
				run: async () => {
					await terminalInstance?.freePortKillProcess?.(port);
					terminalInstance?.sendText?.(command.command, false);
				}
			});
			return actions;
		}
	};
}
export function gitPushSetUpstream(terminalInstance: Partial<ITerminalInstance>): ITerminalContextualActionOptions {
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
			const actions: IAction[] = [];
			const label = localize("terminal.gitPush", "Git push {0}", branch);
			command.command = `git push --set-upstream origin ${branch}`;
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.gitPush', label, enabled: true,
				run: () => terminalInstance.sendText?.(command.command, true)
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
