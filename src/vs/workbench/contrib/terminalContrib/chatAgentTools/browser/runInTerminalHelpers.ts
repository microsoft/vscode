/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Separator } from '../../../../../base/common/actions.js';
import { posix as pathPosix, win32 as pathWin32 } from '../../../../../base/common/path.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { escapeRegExpCharacters } from '../../../../../base/common/strings.js';
import { localize } from '../../../../../nls.js';
import { suggestAutoApproveRuleKeys } from '../../../../../platform/terminal/common/autoApprove/suggestAutoApproveRules.js';
import type { TerminalNewAutoApproveButtonData } from '../../../chat/browser/widget/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import type { ToolConfirmationAction } from '../../../chat/common/tools/languageModelToolsService.js';
import type { ICommandApprovalResultWithReason } from './tools/commandLineAnalyzer/autoApprove/commandLineAutoApprover.js';
import { isAutoApproveRule } from './tools/commandLineAnalyzer/commandLineAnalyzer.js';

export function isPowerShell(envShell: string, os: OperatingSystem): boolean {
	if (os === OperatingSystem.Windows) {
		return /^(?:powershell|pwsh)(?:-preview)?$/i.test(pathWin32.basename(envShell).replace(/\.exe$/i, ''));

	}
	return /^(?:powershell|pwsh)(?:-preview)?$/.test(pathPosix.basename(envShell));
}

export function isWindowsPowerShell(envShell: string): boolean {
	return envShell.endsWith('System32\\WindowsPowerShell\\v1.0\\powershell.exe');
}

export function isZsh(envShell: string, os: OperatingSystem): boolean {
	if (os === OperatingSystem.Windows) {
		return /^zsh(?:\.exe)?$/i.test(pathWin32.basename(envShell));
	}
	return /^zsh$/.test(pathPosix.basename(envShell));
}

export function isBash(envShell: string, os: OperatingSystem): boolean {
	if (os === OperatingSystem.Windows) {
		return /^bash(?:\.exe)?$/i.test(pathWin32.basename(envShell));
	}
	return /^bash$/.test(pathPosix.basename(envShell));
}

export function isFish(envShell: string, os: OperatingSystem): boolean {
	if (os === OperatingSystem.Windows) {
		return /^fish(?:\.exe)?$/i.test(pathWin32.basename(envShell));
	}
	return /^fish$/.test(pathPosix.basename(envShell));
}

export const TRUNCATION_MESSAGE = '\n\n[... PREVIOUS OUTPUT TRUNCATED ...]\n\n';

export function truncateOutputKeepingTail(output: string, maxLength: number): string {
	if (output.length <= maxLength) {
		return output;
	}
	const truncationMessageLength = TRUNCATION_MESSAGE.length;
	if (truncationMessageLength >= maxLength) {
		return TRUNCATION_MESSAGE.slice(TRUNCATION_MESSAGE.length - maxLength);
	}
	const availableLength = maxLength - truncationMessageLength;
	const endPortion = output.slice(-availableLength);
	return TRUNCATION_MESSAGE + endPortion;
}

/**
 * Normalizes command text for UI display by removing unnecessary quote and forward slash
 * escaping artifacts (for example: \" \' \/) commonly produced in streamed tool-call JSON.
 */
export function normalizeTerminalCommandForDisplay(commandLine: string): string {
	return commandLine.replace(/\\(["'\/])/g, '$1');
}

/**
 * Builds a single-line display string for a terminal command, suitable for UI messages.
 * Normalizes escape artifacts, collapses newlines to spaces, and truncates to 80 characters.
 */
export function buildCommandDisplayText(command: string): string {
	const normalized = normalizeTerminalCommandForDisplay(command).replace(/\r\n|\r|\n/g, ' ');
	return normalized.length > 80 ? normalized.substring(0, 77) + '...' : normalized;
}

/**
 * Normalizes a terminal command for execution by collapsing newlines to spaces.
 * This prevents multi-line input from being sent as multiple commands via sendText.
 */
export function normalizeCommandForExecution(command: string): string {
	return command.replace(/\r\n|\r|\n/g, ' ').trim();
}

/**
 * Whether a command spans multiple lines (heredoc, multi-statement block, etc.).
 * Multi-line commands must be sent verbatim through bracketed paste mode so the
 * shell treats them as a single paste instead of executing each line as it
 * arrives.
 *
 * Bare line continuations (`\` immediately before a newline) are **not**
 * considered multi-line because the shell joins them into a single logical
 * line. Only newlines that are *not* preceded by a backslash count.
 */
export function isMultilineCommand(command: string): boolean {
	// Normalize all line-ending variants to \n, then check for a newline
	// that is not preceded by a backslash (i.e. not a line continuation).
	const normalized = command.replace(/\r\n|\r/g, '\n');
	return /(?<!\\)\n/.test(normalized);
}

export function generateAutoApproveActions(commandLine: string, subCommands: string[], autoApproveResult: { subCommandResults: ICommandApprovalResultWithReason[]; commandLineResult: ICommandApprovalResultWithReason }): ToolConfirmationAction[] {
	const actions: ToolConfirmationAction[] = [];

	// We shouldn't offer configuring rules for commands that are explicitly denied since it
	// wouldn't get auto approved with a new rule
	const canCreateAutoApproval = (
		autoApproveResult.subCommandResults.every(e => e.result !== 'denied') &&
		autoApproveResult.commandLineResult.result !== 'denied'
	);
	if (canCreateAutoApproval) {
		const unapprovedSubCommands = subCommands.filter((_, index) => {
			return autoApproveResult.subCommandResults[index].result !== 'approved';
		});

		const { subCommandKeys: subCommandsToSuggest, offerExactCommandLine } = suggestAutoApproveRuleKeys(commandLine, unapprovedSubCommands);

		if (subCommandsToSuggest.length > 0) {
			let subCommandLabel: string;
			if (subCommandsToSuggest.length === 1) {
				subCommandLabel = `\`${subCommandsToSuggest[0]} \u2026\``;
			} else {
				subCommandLabel = `Commands ${subCommandsToSuggest.map(e => `\`${e} \u2026\``).join(', ')}`;
			}

			actions.push({
				label: `Allow ${subCommandLabel} in this Session`,
				data: {
					type: 'newRule',
					rule: subCommandsToSuggest.map(key => ({
						key,
						value: true,
						scope: 'session'
					}))
				} satisfies TerminalNewAutoApproveButtonData
			});
			actions.push({
				label: `Allow ${subCommandLabel} in this Workspace`,
				data: {
					type: 'newRule',
					rule: subCommandsToSuggest.map(key => ({
						key,
						value: true,
						scope: 'workspace'
					}))
				} satisfies TerminalNewAutoApproveButtonData
			});
			actions.push({
				label: `Always Allow ${subCommandLabel}`,
				data: {
					type: 'newRule',
					rule: subCommandsToSuggest.map(key => ({
						key,
						value: true,
						scope: 'user'
					}))
				} satisfies TerminalNewAutoApproveButtonData
			});
		}

		if (actions.length > 0) {
			actions.push(new Separator());
		}

		if (offerExactCommandLine) {
			actions.push({
				label: localize('autoApprove.exactCommand1', 'Allow Exact Command Line in this Session'),
				data: {
					type: 'newRule',
					rule: {
						key: `/^${escapeRegExpCharacters(commandLine)}$/`,
						value: {
							approve: true,
							matchCommandLine: true
						},
						scope: 'session'
					}
				} satisfies TerminalNewAutoApproveButtonData
			});
			actions.push({
				label: localize('autoApprove.exactCommand2', 'Allow Exact Command Line in this Workspace'),
				data: {
					type: 'newRule',
					rule: {
						key: `/^${escapeRegExpCharacters(commandLine)}$/`,
						value: {
							approve: true,
							matchCommandLine: true
						},
						scope: 'workspace'
					}
				} satisfies TerminalNewAutoApproveButtonData
			});
			actions.push({
				label: localize('autoApprove.exactCommand', 'Always Allow Exact Command Line'),
				data: {
					type: 'newRule',
					rule: {
						key: `/^${escapeRegExpCharacters(commandLine)}$/`,
						value: {
							approve: true,
							matchCommandLine: true
						},
						scope: 'user'
					}
				} satisfies TerminalNewAutoApproveButtonData
			});
		}
	}

	if (actions.length > 0) {
		actions.push(new Separator());
	}


	// Allow all commands for this session
	actions.push({
		label: localize('allowSession', 'Allow All Commands in this Session'),
		tooltip: localize('allowSessionTooltip', 'Allow this tool to run in this session without confirmation.'),
		data: {
			type: 'sessionApproval'
		} satisfies TerminalNewAutoApproveButtonData
	});

	actions.push(new Separator());

	// Always show configure option
	actions.push({
		label: localize('autoApprove.configure', 'Configure Auto Approve...'),
		data: {
			type: 'configure'
		} satisfies TerminalNewAutoApproveButtonData
	});

	return actions;
}

export function dedupeRules(rules: ICommandApprovalResultWithReason[]): ICommandApprovalResultWithReason[] {
	return rules.filter((result, index, array) => {
		if (!isAutoApproveRule(result.rule)) {
			return false;
		}
		const sourceText = result.rule.sourceText;
		return array.findIndex(r => isAutoApproveRule(r.rule) && r.rule.sourceText === sourceText) === index;
	});
}

export interface IExtractedCdPrefix {
	/** The directory path that was extracted from the cd command */
	directory: string;
	/** The command to run after the cd */
	command: string;
}

/**
 * Extracts a cd prefix from a command line, returning the directory and remaining command.
 * Does not check if the directory matches the current cwd - just extracts the pattern.
 */
export function extractCdPrefix(commandLine: string, shell: string, os: OperatingSystem): IExtractedCdPrefix | undefined {
	const isPwsh = isPowerShell(shell, os);

	const cdPrefixMatch = commandLine.match(
		isPwsh
			? /^(?:cd(?: \/d)?|Set-Location(?: -Path)?) (?<dir>[^\s]+) ?(?:&&|;)\s+(?<suffix>.+)$/i
			: /^cd (?<dir>[^\s]+) &&\s+(?<suffix>.+)$/
	);
	const cdDir = cdPrefixMatch?.groups?.dir;
	const cdSuffix = cdPrefixMatch?.groups?.suffix;
	if (cdDir && cdSuffix) {
		// Remove any surrounding quotes
		let cdDirPath = cdDir;
		if (cdDirPath.startsWith('"') && cdDirPath.endsWith('"')) {
			cdDirPath = cdDirPath.slice(1, -1);
		}
		return { directory: cdDirPath, command: cdSuffix };
	}
	return undefined;
}
