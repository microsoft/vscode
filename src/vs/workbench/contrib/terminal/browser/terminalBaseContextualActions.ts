/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction } from 'vs/base/common/actions';
import { localize } from 'vs/nls';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { ContextualMatchResult, ITerminalContextualActionOptions, ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { ITerminalCommand, ITerminalProcessManager } from 'vs/workbench/contrib/terminal/common/terminal';

export function gitSimilarCommand(terminalInstance: ITerminalInstance): ITerminalContextualActionOptions {
	return {
		commandLineMatcher: /git.*/,
		outputMatcher: { lineMatcher: /.*The most similar command is\s*(.*)\s*/, anchor: 'bottom', length: 2 },
		actionName: (matchResult: ContextualMatchResult) => matchResult.outputMatch ? `Run git ${matchResult.outputMatch[1]}` : ``,
		exitCode: 1,
		getActions: (matchResult: ContextualMatchResult, command: ITerminalCommand) => {
			const actions: IAction[] = [];
			const fixedCommand = matchResult?.outputMatch?.[1];
			if (!fixedCommand) {
				return;
			}
			const label = localize("terminal.fixGitCommand", "Run git {0}", fixedCommand);
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.fixGitCommand', label, enabled: true,
				run: () => {
					command.command = `git ${fixedCommand}`;
					terminalInstance.sendText(command.command, true);
				}
			});
			return actions;
		}
	};
}
export function freePort(processManager: ITerminalProcessManager): ITerminalContextualActionOptions {
	return {
		actionName: (matchResult: ContextualMatchResult) => matchResult.outputMatch ? `Free port ${matchResult.outputMatch[1]}` : '',
		commandLineMatcher: /.+/,
		outputMatcher: { lineMatcher: /.*address already in use \d\.\d.\d\.\d:(\d\d\d\d).*/ },
		exitCode: 1,
		getActions: (matchResult: ContextualMatchResult, command: ITerminalCommand) => {
			const port = matchResult?.outputMatch?.[1];
			if (!port) {
				return;
			}
			const actions: IAction[] = [];
			const label = localize("terminal.freePort", "Free port {0}", port);
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.freePort', label, enabled: true,
				run: async () => await processManager.freePortKillProcess(port)
			});
			return actions;
		}
	};
}
export function gitPushSetUpstream(terminalInstance: ITerminalInstance): ITerminalContextualActionOptions {
	return {
		actionName: (matchResult: ContextualMatchResult) => matchResult.outputMatch ? `Git push ${matchResult.outputMatch[1]}` : '',
		commandLineMatcher: /git push/,
		outputMatcher: { lineMatcher: /.*git push --set-upstream origin (.*)\s.*/ },
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
				run: () => terminalInstance.sendText(command.command, true)
			});
			return actions;
		}
	};
}

export function gitCreatePr(openerService: IOpenerService): ITerminalContextualActionOptions {
	return {
		actionName: (matchResult: ContextualMatchResult) => matchResult.outputMatch ? `Create PR for ${matchResult.outputMatch[1]}` : '',
		commandLineMatcher: /.*git push.*/,
		outputMatcher: { lineMatcher: /.*Create a pull request for \'(.+)\' on GitHub by visiting:\s+remote:\s+(https:.+pull.+)\s+/ },
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
			const label = localize("terminal.createPR", "Create PR");
			actions.push({
				class: undefined, tooltip: label, id: 'terminal.createPR', label, enabled: true,
				run: () => openerService.open(link)
			});
			return actions;
		}
	};
}
