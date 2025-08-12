/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { OperatingSystem } from '../../../../../base/common/platform.js';
import { splitCommandLineIntoSubCommands } from './subCommands.js';
import { isPowerShell } from './runInTerminalHelpers.js';

/**
 * Represents a sub-command with metadata about whether it's a redirection target
 */
export interface ISubCommandInfo {
	command: string;
	isRedirectionTarget: boolean;
	redirectionType?: 'input' | 'output' | 'error' | 'all';
}

/**
 * Split command line into sub-commands with additional metadata for auto-approval purposes.
 * This function identifies which sub-commands are likely file redirection targets and should
 * not require individual approval.
 */
export function splitCommandLineForAutoApproval(commandLine: string, envShell: string, envOS: OperatingSystem): ISubCommandInfo[] {
	const subCommands = splitCommandLineIntoSubCommands(commandLine, envShell, envOS);
	const result: ISubCommandInfo[] = [];
	
	// Get the redirection patterns for this shell
	const redirectionPatterns = getRedirectionPatterns(envShell, envOS);
	
	for (let i = 0; i < subCommands.length; i++) {
		const subCommand = subCommands[i];
		
		// Check if the previous part of the original command ended with a redirection operator
		// by looking for the current sub-command in the original and checking what precedes it
		const isRedirectionTarget = isLikelyRedirectionTarget(subCommand, commandLine, redirectionPatterns);
		
		result.push({
			command: subCommand,
			isRedirectionTarget,
			redirectionType: isRedirectionTarget ? getRedirectionType(subCommand, commandLine, redirectionPatterns) : undefined
		});
	}
	
	return result;
}

/**
 * Get redirection patterns for the given shell
 */
function getRedirectionPatterns(envShell: string, envOS: OperatingSystem): string[] {
	const envShellWithoutExe = envShell.replace(/\.exe$/, '');
	
	if (isPowerShell(envShell, envOS)) {
		// PowerShell redirection patterns
		return [
			...Array.from({ length: 6 }, (_, i) => `${i + 1}>`), // 1>, 2>, ..., 6>
			...Array.from({ length: 6 }, (_, i) => `${i + 1}>>`), // 1>>, 2>>, ..., 6>>
			'*>', '*>>', '>', '>>', '<'
		];
	} else {
		// POSIX shell redirection patterns (bash, zsh, sh)
		const patterns = [
			...Array.from({ length: 9 }, (_, i) => `${i + 1}>`), // 1>, 2>, ..., 9>
			...Array.from({ length: 9 }, (_, i) => `${i + 1}>>`), // 1>>, 2>>, ..., 9>>
			'&>', '&>>', '>', '>>', '<', '0<'
		];
		
		if (envShellWithoutExe === 'zsh') {
			patterns.push('>|', '>!'); // zsh-specific
		}
		
		return patterns;
	}
}

/**
 * Check if a sub-command is likely a file redirection target by examining the original command
 */
function isLikelyRedirectionTarget(subCommand: string, originalCommand: string, redirectionPatterns: string[]): boolean {
	// Find where this sub-command appears in the original command
	const subCommandIndex = originalCommand.indexOf(subCommand);
	if (subCommandIndex === -1) {
		return false;
	}
	
	// Look at what precedes this sub-command
	const beforeSubCommand = originalCommand.substring(0, subCommandIndex).trim();
	
	// Check if it ends with any redirection operator
	for (const pattern of redirectionPatterns) {
		if (beforeSubCommand.endsWith(pattern)) {
			return true;
		}
		// Also check with space before the pattern
		if (beforeSubCommand.endsWith(` ${pattern}`)) {
			return true;
		}
	}
	
	return false;
}

/**
 * Determine the type of redirection
 */
function getRedirectionType(subCommand: string, originalCommand: string, redirectionPatterns: string[]): 'input' | 'output' | 'error' | 'all' | undefined {
	const subCommandIndex = originalCommand.indexOf(subCommand);
	if (subCommandIndex === -1) {
		return undefined;
	}
	
	const beforeSubCommand = originalCommand.substring(0, subCommandIndex).trim();
	
	// Check for input redirection
	if (beforeSubCommand.endsWith('<') || beforeSubCommand.endsWith('0<')) {
		return 'input';
	}
	
	// Check for error redirection
	if (beforeSubCommand.endsWith('2>') || beforeSubCommand.endsWith('2>>')) {
		return 'error';
	}
	
	// Check for all streams redirection
	if (beforeSubCommand.endsWith('&>') || beforeSubCommand.endsWith('&>>') || beforeSubCommand.endsWith('*>') || beforeSubCommand.endsWith('*>>')) {
		return 'all';
	}
	
	// Default to output redirection for >, >>, 1>, 1>>, etc.
	return 'output';
}