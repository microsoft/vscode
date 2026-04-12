/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IRunCommandExecutionService } from '../../../platform/commands/common/runCommandExecutionService';
import { ILogService } from '../../../platform/log/common/logService';
import { IWorkbenchService } from '../../../platform/workbench/common/workbenchService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { LanguageModelTextPart, LanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { commandUri } from '../../linkify/common/commands';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';

interface IVSCodeCmdToolToolInput {
	commandId: string;
	name: string;
	args: any[];
	skipCheck?: boolean;
}

/** Commands that are read-only / have no side effects and can run without user confirmation. */
const noConfirmationCommands = new Set([
	'github.copilot.debug.collectDiagnostics',
]);

class VSCodeCmdTool implements vscode.LanguageModelTool<IVSCodeCmdToolToolInput> {

	public static readonly toolName = ToolName.RunVscodeCmd;

	constructor(
		@IRunCommandExecutionService private readonly _commandService: IRunCommandExecutionService,
		@IWorkbenchService private readonly _workbenchService: IWorkbenchService,
		@ILogService private readonly _logService: ILogService
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IVSCodeCmdToolToolInput>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const command = options.input.commandId;
		const args = options.input.args ?? [];

		if (!options.input.skipCheck) {
			const allCommands = (await this._workbenchService.getAllCommands(/* filterByPreCondition */true));
			const commandItem = allCommands.find(commandItem => commandItem.command === command);
			if (!commandItem) {
				// Try again but without filtering by preconditions to see if the command exists at all
				const allCommandsNoFilter = (await this._workbenchService.getAllCommands(/* filterByPreCondition */false));
				const commandItemNoFilter = allCommandsNoFilter.find(commandItem => commandItem.command === command);
				if (commandItemNoFilter) {
					return new LanguageModelToolResult([new LanguageModelTextPart(`Command \`${options.input.name}\` exists, but its preconditions are not currently met. Ask the user to try running it manually via the command palette.`)]);
				} else {
					return new LanguageModelToolResult([new LanguageModelTextPart(`Failed to find command \`${options.input.name}\`.`)]);
				}
			}
		}

		try {
			const result = await this._commandService.executeCommand(command, ...args);
			let textPart: LanguageModelTextPart;
			if (result === undefined || result === null) {
				textPart = new LanguageModelTextPart(`Finished running command \`${options.input.name}\`.`);
			} else if (typeof result === 'string') {
				textPart = new LanguageModelTextPart(`Finished running command \`${options.input.name}\` with result:\n\n${result}`);
			} else {
				let serializedResult: string;
				try {
					serializedResult = JSON.stringify(result);
				} catch {
					serializedResult = String(result);
				}
				textPart = new LanguageModelTextPart(`Finished running command \`${options.input.name}\` with result:\n\n${serializedResult}`);
			}
			return new LanguageModelToolResult([textPart]);
		} catch (error) {
			this._logService.error(`[VSCodeCmdTool] ${error}`);
			return new LanguageModelToolResult([new LanguageModelTextPart(`Failed to run command \`${options.input.name}\`.`)]);
		}
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IVSCodeCmdToolToolInput>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		const commandId = options.input.commandId;
		if (!commandId) {
			throw new Error('Command ID undefined');
		}

		const invocationMessage = l10n.t`Running command \`${options.input.name}\``;

		if (noConfirmationCommands.has(commandId)) {
			return { invocationMessage };
		}

		const quickOpenCommand = 'workbench.action.quickOpen';
		// Populate the Quick Open box with command ID rather than command name to avoid issues where Copilot didn't use the precise name,
		// or when the Copilot response language (Spanish, French, etc.) might be different here than the UI one.
		const commandStr = commandUri(quickOpenCommand, ['>' + commandId]);
		const hasArguments = !!options.input.args?.length;
		const markdownString = new MarkdownString();
		markdownString.appendMarkdown(l10n.t(`Copilot will execute the [{0}]({1}) (\`{2}\`) command.`, options.input.name, commandStr, options.input.commandId));
		if (hasArguments) {
			markdownString.appendMarkdown(`\n\n${l10n.t('Arguments')}:\n\n`);
			markdownString.appendCodeblock(JSON.stringify(options.input.args, undefined, 2), 'json');
		}
		markdownString.isTrusted = { enabledCommands: [quickOpenCommand] };
		return {
			invocationMessage,
			confirmationMessages: {
				title: l10n.t`Run Command \`${options.input.name}\` (\`${options.input.commandId}\`)?`,
				message: markdownString,
				approveCombination: {
					message: hasArguments
						? l10n.t`Allow running command \`${options.input.commandId}\` with specific arguments`
						: l10n.t`Allow running command \`${options.input.commandId}\` without arguments`,
					arguments: hasArguments ? JSON.stringify(options.input.args) : undefined,
				},
			},
		};
	}
}

ToolRegistry.registerTool(VSCodeCmdTool);
