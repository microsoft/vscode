/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type { ICompletionResource } from '../types';
import { execHelper, getAliasesHelper } from './common';
import { type ExecOptionsWithStringEncoding } from 'node:child_process';
import { fishBuiltinsCommandDescriptionsCache } from './fishBuiltinsCache';

const commandDescriptionsCache: Map<string, { shortDescription?: string; description: string; args: string | undefined }> | undefined = parseCache(fishBuiltinsCommandDescriptionsCache);

export async function getFishGlobals(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	return [
		...await getAliases(options),
		...await getBuiltins(options, existingCommands),
	];
}

async function getBuiltins(options: ExecOptionsWithStringEncoding, existingCommands?: Set<string>): Promise<(string | ICompletionResource)[]> {
	const compgenOutput = await execHelper('fish -c "builtin -n"', options);
	const filter = (cmd: string) => cmd && !existingCommands?.has(cmd);
	const builtins: string[] = compgenOutput.split('\n').filter(filter);
	const completions: ICompletionResource[] = [];

	// If we have a populated cache, use it
	if (commandDescriptionsCache && commandDescriptionsCache.size > 0) {
		for (const cmd of builtins) {
			const result = getCommandDescription(cmd);
			if (result) {
				completions.push({
					label: { label: cmd, description: result.description },
					detail: result.args,
					documentation: new vscode.MarkdownString(result.documentation),
					kind: vscode.TerminalCompletionItemKind.Method
				});
			} else {
				completions.push({
					label: cmd,
					kind: vscode.TerminalCompletionItemKind.Method
				});
			}
		}
		return completions;
	}

	// Fallback to dynamically fetching help (this happens when cache is empty)
	for (const cmd of builtins) {
		try {
			const helpOutput = (await execHelper(`fish -c "${cmd} --help 2>&1"`, options))?.trim();
			if (helpOutput && !helpOutput.includes('No help for function') && !helpOutput.includes('See the web documentation')) {
				const { description, args, documentation } = extractFishCommandDetails(helpOutput);
				completions.push({
					label: { label: cmd, description },
					detail: args,
					documentation: new vscode.MarkdownString(documentation),
					kind: vscode.TerminalCompletionItemKind.Method
				});
			} else {
				completions.push({
					label: cmd,
					kind: vscode.TerminalCompletionItemKind.Method
				});
			}
		} catch {
			// Ignore errors and continue with the next command
			completions.push({
				label: cmd,
				kind: vscode.TerminalCompletionItemKind.Method
			});
		}
	}

	return completions;
}

function extractFishCommandDetails(helpText: string): { description?: string; args?: string; documentation?: string } {
	// Remove ANSI escape codes for bold and colors
	const cleanHelpText = cleanupText(helpText);

	// Extract the first line as args and extract description from the remaining content
	const lines = cleanHelpText.split('\n');
	const args = lines[0]?.trim();

	// Get the first sentence as the short description
	const remainingText = lines.slice(1).join('\n').trim();
	const firstPeriodIndex = remainingText.indexOf('.');
	const description = firstPeriodIndex > 0 ?
		remainingText.substring(0, firstPeriodIndex + 1).trim() :
		remainingText.substring(0, 50).trim();

	return {
		description,
		args,
		documentation: remainingText
	};
}

/**
 * Cleans up text from terminal control sequences and formatting artifacts
 */
function cleanupText(text: string): string {
	// Remove ANSI escape codes
	let cleanedText = text.replace(/\x1b\[\d+m/g, '');

	// Remove backspace sequences (like a\bb which tries to print a, move back, print b)
	const backspaceRegex = /.\x08./g;
	while (backspaceRegex.test(cleanedText)) {
		cleanedText = cleanedText.replace(backspaceRegex, match => match.charAt(2));
	}

	// Remove any remaining backspaces and their preceding characters
	cleanedText = cleanedText.replace(/.\x08/g, '');

	// Remove underscores that are used for formatting in some fish help output
	cleanedText = cleanedText.replace(/_\b/g, '');

	return cleanedText;
}

export function getCommandDescription(command: string): { documentation?: string; description?: string; args?: string | undefined } | undefined {
	if (!commandDescriptionsCache) {
		return undefined;
	}
	const result = commandDescriptionsCache.get(command);
	if (!result) {
		return undefined;
	}

	if (result.shortDescription) {
		return {
			description: result.shortDescription,
			args: result.args,
			documentation: result.description
		};
	} else {
		return {
			description: result.description,
			args: result.args,
			documentation: result.description
		};
	}
}

function parseCache(cache: Object): Map<string, { shortDescription?: string; description: string; args: string | undefined }> | undefined {
	if (!cache) {
		return undefined;
	}
	const result = new Map<string, { shortDescription?: string; description: string; args: string | undefined }>();
	for (const [key, value] of Object.entries(cache)) {
		result.set(key, value);
	}
	return result;
}

async function getAliases(options: ExecOptionsWithStringEncoding): Promise<ICompletionResource[]> {
	return getAliasesHelper('fish', ['-ic', 'alias'], /^alias (?<alias>[a-zA-Z0-9\.:-]+) (?<resolved>.+)$/, options);
}
