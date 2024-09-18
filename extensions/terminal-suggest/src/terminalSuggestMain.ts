/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { promisify } from 'util';
import { exec } from 'child_process';

const builtinCommands: string[] = ['cd', 'ls', 'which', 'echo'];
const execPromise = promisify(exec);

// Initialize a map to store command flags and their <label,description> pairs
const commandToFlags = new Map<string, Map<string, string>>();

// Function to get command flags by spawning a process
async function getCommandFlags(command: string): Promise<Map<string, string> | undefined> {
	// Check if the flags are already cached in the commandToFlags map
	if (commandToFlags.has(command)) {
		return commandToFlags.get(command);
	}

	try {
		// Try to get flags using `command --help`
		const { stdout: helpOutput } = await execPromise(`${command} --help`);
		const flags = parseFlagsFromHelpOutput(helpOutput);

		// Cache the flags in the commandToFlags map
		commandToFlags.set(command, flags);

		return flags;
	} catch (error) {
		try {
			// If `--help` fails, fallback to man pages
			const { stdout: manOutput } = await execPromise(`man ${command}`);
			const flags = parseFlagsFromManOutput(manOutput);
			if (flags) {
				// Cache the flags in the commandToFlags map
				commandToFlags.set(command, flags);
			}
			return flags;
		} catch (err) {
			console.error(`Failed to get flags for ${command}:`, err);
			return;
		}
	}
}

// Helper function to parse flags from the `--help` output
function parseFlagsFromHelpOutput(helpOutput: string): Map<string, string> {
	const flags = new Map<string, string>();

	// Example of how you can extract flags (this can be modified based on different outputs)
	const flagRegex = /(--?\w[\w-]*)\s+([^-]*)/g;
	let match;
	while ((match = flagRegex.exec(helpOutput)) !== null) {
		const flag = match[1];
		const description = match[2].trim();
		flags.set(flag, description);
	}

	return flags;
}

// Helper function to parse flags from man page output
function parseFlagsFromManOutput(manOutput: string): Map<string, string> | undefined {
	const flags: Map<string, string> = new Map();

	// Similar to help parsing, but for man pages
	const flagRegex = /(--?\w[\w-]*)\s+([^-]*)/g;
	let match;
	while ((match = flagRegex.exec(manOutput)) !== null) {
		const flag = match[1];
		const description = match[2].trim();
		flags.set(flag, description);
	}

	return flags?.size ? flags : undefined;
}

(vscode as any).window.registerTerminalCompletionProvider({
	async provideTerminalCompletions(terminal: vscode.Terminal, terminalContext: { shellType: string; commandLine: string }, token: vscode.CancellationToken) {
		// Early cancellation check
		if (token.isCancellationRequested) {
			return;
		}

		// Skip PowerShell terminals
		if (terminalContext.shellType === 'pwsh' || terminalContext.shellType === 'python') {
			return;
		}

		const commandsInPath = await getCommandsInPath();
		builtinCommands.forEach(command => commandsInPath.add(command));
		const commandLine = terminalContext.commandLine;
		const results: vscode.TerminalCompletionItem[] = [];

		for (const command of commandsInPath) {
			const matchFound = fuzzyMatch(commandLine, command);
			const commandMatch = commandsInPath.has(commandLine.trim()) && commandLine.length > commandLine.trim().length;
			if (!matchFound && !commandMatch) {
				continue;
			}

			if (matchFound && !commandMatch) {
				results.push({
					label: command,
					kind: (vscode as any).TerminalCompletionItemKind.Method,
					detail: 'Fuzzy match',
					documentation: 'This is a test',
				});
			} else if (commandMatch) {
				// Retrieve flags from help or man page if not already cached
				const flags = await getCommandFlags(commandLine.trim());
				// If no flags found, show files or directories
				if (!flags?.size) {
					console.log('no flags for command match');
					return;
					// Logic to display files or directories (this part is a placeholder)
				} else {
					console.log('flags ', flags.size);
					// Add flags to the terminal completion results
					for (const [label, description] of flags.entries()) {
						if (results.length > 100) {
							break;
						}
						results.push({
							// todo: this is a hack so it doesn't get filtered out by simpleCompletionModel
							label: commandLine + label,
							kind: (vscode as any).TerminalCompletionItemKind.Flag,
							detail: description,
							documentation: description,
						});
					}
				}
			}
		}

		// Return the completion results or undefined if no results
		return results.length ? results : undefined;
	}
});


async function getCommandsInPath(): Promise<Set<string>> {
	const paths = process.env.PATH?.split(':') || [];
	const executables = new Set<string>();

	for (const path of paths) {
		try {
			const files = await vscode.workspace.fs.readDirectory(vscode.Uri.file(path));
			for (const [file, fileType] of files) {
				if (fileType === vscode.FileType.File) {
					executables.add(file);
				}
			}
		} catch (e) {
			// Ignore errors for directories that can't be read
			continue;
		}
	}

	return executables;
}

function fuzzyMatch(input: string, completion: string): boolean {
	// Normalize both input and completion to lower case for case-insensitive matching
	const normalizedInput = input.toLowerCase();
	const normalizedCompletion = completion.toLowerCase();

	let inputIndex = 0;
	let completionIndex = 0;

	// Iterate over the completion string
	while (inputIndex < normalizedInput.length && completionIndex < normalizedCompletion.length) {
		// If the characters match, move to the next character in the input
		if (normalizedInput[inputIndex] === normalizedCompletion[completionIndex]) {
			inputIndex++;
		}
		// Always move to the next character in the completion string
		completionIndex++;
	}

	// If we've matched all characters in the input, return true (fuzzy match found)
	return inputIndex === normalizedInput.length;
}


