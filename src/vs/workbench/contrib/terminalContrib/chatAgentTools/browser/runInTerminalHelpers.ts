/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Separator } from '../../../../../base/common/actions.js';
import { posix as pathPosix, win32 as pathWin32 } from '../../../../../base/common/path.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { removeAnsiEscapeCodes } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import type { TerminalNewAutoApproveButtonData } from '../../../chat/browser/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import type { ToolConfirmationAction } from '../../../chat/common/languageModelToolsService.js';
import type { ICommandApprovalResultWithReason } from './commandLineAutoApprover.js';

export function isPowerShell(envShell: string, os: OperatingSystem): boolean {
	if (os === OperatingSystem.Windows) {
		return /^(?:powershell|pwsh)(?:-preview)?$/i.test(pathWin32.basename(envShell).replace(/\.exe$/i, ''));

	}
	return /^(?:powershell|pwsh)(?:-preview)?$/.test(pathPosix.basename(envShell));
}

// Maximum output length to prevent context overflow
const MAX_OUTPUT_LENGTH = 60000; // ~60KB limit to keep context manageable
const TRUNCATION_MESSAGE = '\n\n[... MIDDLE OF OUTPUT TRUNCATED ...]\n\n';

export function sanitizeTerminalOutput(output: string): string {
	let sanitized = removeAnsiEscapeCodes(output)
		// Trim trailing \r\n characters
		.trimEnd();

	// Truncate if output is too long to prevent context overflow
	if (sanitized.length > MAX_OUTPUT_LENGTH) {
		const truncationMessageLength = TRUNCATION_MESSAGE.length;
		const availableLength = MAX_OUTPUT_LENGTH - truncationMessageLength;
		const startLength = Math.floor(availableLength * 0.4); // Keep 40% from start
		const endLength = availableLength - startLength; // Keep 60% from end

		const startPortion = sanitized.substring(0, startLength);
		const endPortion = sanitized.substring(sanitized.length - endLength);

		sanitized = startPortion + TRUNCATION_MESSAGE + endPortion;
	}

	return sanitized;
}

export function generateAutoApproveActions(commandLine: string, subCommands: string[], autoApproveResult: { subCommandResults: ICommandApprovalResultWithReason[]; commandLineResult: ICommandApprovalResultWithReason }): ToolConfirmationAction[] {
	const actions: ToolConfirmationAction[] = [];

	// We shouldn't offer configuring rules for commands that are explicitly denied since it
	// wouldn't get auto approved with a new rule
	const canCreateAutoApproval = autoApproveResult.subCommandResults.some(e => e.result !== 'denied') || autoApproveResult.commandLineResult.result === 'denied';
	if (canCreateAutoApproval) {
		const unapprovedSubCommands = subCommands.filter((_, index) => {
			return autoApproveResult.subCommandResults[index].result !== 'approved';
		});

		// For each unapproved sub-command (within the overall command line), decide whether to
		// suggest just the commnad or sub-command (with that sub-command line) to always allow.
		const commandsWithSubcommands = new Set(['git', 'npm', 'yarn', 'docker', 'kubectl', 'cargo', 'dotnet', 'mvn', 'gradle']);
		const commandsWithSubSubCommands = new Set(['npm run', 'yarn run']);
		const subCommandsToSuggest = Array.from(new Set(unapprovedSubCommands.map(command => {
			const parts = command.trim().split(/\s+/);
			const baseCommand = parts[0].toLowerCase();
			const baseSubCommand = parts.length > 1 ? `${parts[0]} ${parts[1]}`.toLowerCase() : '';

			if (commandsWithSubSubCommands.has(baseSubCommand) && parts.length >= 3 && !parts[2].startsWith('-')) {
				return `${parts[0]} ${parts[1]} ${parts[2]}`;
			} else if (commandsWithSubcommands.has(baseCommand) && parts.length >= 2 && !parts[1].startsWith('-')) {
				return `${parts[0]} ${parts[1]}`;
			} else {
				return parts[0];
			}
		})));

		if (subCommandsToSuggest.length > 0) {
			let subCommandLabel: string;
			if (subCommandsToSuggest.length === 1) {
				subCommandLabel = localize('autoApprove.baseCommandSingle', 'Always Allow Command: {0}', subCommandsToSuggest[0]);
			} else {
				const commandSeparated = subCommandsToSuggest.join(', ');
				subCommandLabel = localize('autoApprove.baseCommand', 'Always Allow Commands: {0}', commandSeparated);
			}

			actions.push({
				label: subCommandLabel,
				data: {
					type: 'newRule',
					rule: subCommandsToSuggest.map(key => ({
						key,
						value: true
					}))
				} satisfies TerminalNewAutoApproveButtonData
			});
		}

		// Allow exact command line, don't do this if it's just the first sub-command's first
		// word
		const firstSubcommandFirstWord = unapprovedSubCommands.length > 0 ? unapprovedSubCommands[0].split(' ')[0] : '';
		if (firstSubcommandFirstWord !== commandLine) {
			actions.push({
				label: localize('autoApprove.exactCommand', 'Always Allow Exact Command Line'),
				data: {
					type: 'newRule',
					rule: {
						key: commandLine,
						value: {
							approve: true,
							matchCommandLine: true
						}
					}
				} satisfies TerminalNewAutoApproveButtonData
			});
		}
	}

	if (actions.length > 0) {
		actions.push(new Separator());
	}

	// Always show configure option
	actions.push({
		label: localize('autoApprove.configure', 'Configure Auto Approve...'),
		data: {
			type: 'configure'
		} satisfies TerminalNewAutoApproveButtonData
	});

	return actions;
}
