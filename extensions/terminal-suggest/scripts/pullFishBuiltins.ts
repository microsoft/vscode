/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs/promises';
import * as path from 'path';
import { cleanupText, checkWindows, execAsync, copyright } from './terminalScriptHelpers';

checkWindows();

interface ICommandDetails {
	description: string;
	args: string | undefined;
	shortDescription?: string;
}

let fishBuiltinsCommandDescriptionsCache = new Map<string, ICommandDetails>();

// Fallback descriptions for commands that don't return proper help information
const fallbackDescriptions: Record<string, ICommandDetails> = {
	'[': {
		shortDescription: 'Test if a statement is true',
		description: 'Evaluate an expression and return a status of true (0) or false (non-zero). Unlike the `test` command, the `[` command requires a closing `]`.',
		args: 'EXPRESSION ]'
	},
	'break': {
		shortDescription: 'Exit the current loop',
		description: 'Terminate the execution of the nearest enclosing `while` or `for` loop and proceed with the next command after the loop.',
		args: undefined
	},
	'breakpoint': {
		shortDescription: 'Launch debug mode',
		description: 'Pause execution and launch an interactive debug prompt. This is useful for inspecting the state of a script at a specific point.',
		args: undefined
	},
	'case': {
		shortDescription: 'Match a value against patterns',
		description: 'Within a `switch` block, the `case` command specifies patterns to match against the given value, executing the associated block if a match is found.',
		args: 'PATTERN...'
	},
	'continue': {
		shortDescription: 'Skip to the next iteration of a loop',
		description: 'Within a `while` or `for` loop, `continue` skips the remaining commands in the current iteration and proceeds to the next iteration of the loop.',
		args: undefined
	},
	'else': {
		shortDescription: 'Execute commands if the previous condition was false',
		description: 'In an `if` block, the `else` section contains commands that execute if none of the preceding `if` or `else if` conditions were true.',
		args: undefined
	},
	'end': {
		shortDescription: 'Terminate a block of code',
		description: 'Conclude a block of code initiated by constructs like `if`, `switch`, `while`, `for`, or `function`.',
		args: undefined
	},
	'eval': {
		shortDescription: 'Execute arguments as a command',
		description: 'Concatenate all arguments into a single command and execute it. This allows for dynamic construction and execution of commands.',
		args: 'COMMAND...'
	},
	'false': {
		shortDescription: 'Return an unsuccessful result',
		description: 'A command that returns a non-zero exit status, indicating failure. It is often used in scripts to represent a false condition.',
		args: undefined
	},
	'realpath': {
		shortDescription: 'Resolve and print the absolute path',
		description: 'Convert each provided path to its absolute, canonical form by resolving symbolic links and relative path components.',
		args: 'PATH...'
	},
	':': {
		shortDescription: 'No operation command',
		description: 'The `:` command is a no-op (no operation) command that returns a successful (zero) exit status. It can be used as a placeholder in scripts where a command is syntactically required but no action is desired.',
		args: undefined
	},
	'test': {
		shortDescription: 'Evaluate conditional expressions',
		description: 'The `test` command evaluates conditional expressions and sets the exit status to 0 if the expression is true, and 1 if it is false. It supports various operators to evaluate expressions related to strings, numbers, and file attributes.',
		args: 'EXPRESSION'
	},
	'true': {
		shortDescription: 'Return a successful result',
		description: 'The `true` command always returns a successful (zero) exit status. It is often used in scripts and conditional statements where an unconditional success result is needed.',
		args: undefined
	},
	'printf': {
		shortDescription: 'Display formatted text',
		description: 'The `printf` command formats and prints text according to a specified format string. Unlike `echo`, `printf` does not append a newline unless explicitly included in the format.',
		args: 'FORMAT [ARGUMENT...]'
	}
};


async function createCommandDescriptionsCache(): Promise<void> {
	const cachedCommandDescriptions: Map<string, { shortDescription?: string; description: string; args: string | undefined }> = new Map();

	try {
		// Get list of all builtins
		const builtinsOutput = await execAsync('fish -c "builtin -n"').then(r => r.stdout.trim());
		const builtins = builtinsOutput.split('\n');

		console.log(`Found ${builtins.length} Fish builtin commands`);

		for (const cmd of builtins) {
			try {
				// Get help info for each builtin
				const helpOutput = await execAsync(`fish -c "${cmd} --help 2>&1"`).then(r => r.stdout);
				let set = false;
				if (helpOutput && !helpOutput.includes('No help for function') && !helpOutput.includes('See the web documentation')) {
					const cleanHelpText = cleanupText(helpOutput);

					// Split the text into lines to process
					const lines = cleanHelpText.split('\n');


					// Extract the short description, args, and full description
					const { shortDescription, args, description } = extractHelpContent(cmd, lines);

					cachedCommandDescriptions.set(cmd, {
						shortDescription,
						description,
						args
					});
					set = description !== '';
				}
				if (!set) {
					// Use fallback descriptions for commands that don't return proper help
					if (fallbackDescriptions[cmd]) {
						console.info(`Using fallback description for ${cmd}`);
						cachedCommandDescriptions.set(cmd, fallbackDescriptions[cmd]);
					} else {
						console.info(`No fallback description exists for ${cmd}`);
					}
				}
			} catch {
				// Use fallback descriptions for commands that throw an error
				if (fallbackDescriptions[cmd]) {
					console.info('Using fallback description for', cmd);
					cachedCommandDescriptions.set(cmd, fallbackDescriptions[cmd]);
				} else {
					console.info(`Error getting help for ${cmd}`);
				}
			}
		}
	} catch (e) {
		console.error('Error creating Fish builtins cache:', e);
		process.exit(1);
	}

	fishBuiltinsCommandDescriptionsCache = cachedCommandDescriptions;
}

/**
 * Extracts short description, args, and full description from help text lines
 */
function extractHelpContent(cmd: string, lines: string[]): { shortDescription: string; args: string | undefined; description: string } {
	let shortDescription = '';
	let args: string | undefined;
	let description = '';

	// Skip the first line (usually just command name and basic usage)
	let i = 1;

	// Skip any leading empty lines
	while (i < lines.length && lines[i].trim().length === 0) {
		i++;
	}

	// The next non-empty line after the command name is typically
	// either the short description or additional usage info
	const startLine = i;

	// Find where the short description starts
	if (i < lines.length) {
		// First, check if the line has a command prefix and remove it
		let firstContentLine = lines[i].trim();
		const cmdPrefixRegex = new RegExp(`^${cmd}\\s*-\\s*`, 'i');
		firstContentLine = firstContentLine.replace(cmdPrefixRegex, '');

		// First non-empty line is the short description
		shortDescription = firstContentLine;
		i++;

		// Next non-empty line (after short description) is typically args
		while (i < lines.length && lines[i].trim().length === 0) {
			i++;
		}

		if (i < lines.length) {
			// Found a line after the short description - that's our args
			args = lines[i].trim();
			i++;
		}
	}

	// Find the DESCRIPTION marker which marks the end of args section
	let descriptionIndex = -1;
	for (let j = i; j < lines.length; j++) {
		if (lines[j].trim() === 'DESCRIPTION') {
			descriptionIndex = j;
			break;
		}
	}

	// If DESCRIPTION marker is found, consider everything between i and descriptionIndex as part of args
	if (descriptionIndex > i) {
		// Combine lines from i up to (but not including) descriptionIndex
		const additionalArgs = lines.slice(i, descriptionIndex).join('\n').trim();
		if (additionalArgs) {
			args = args ? `${args}\n${additionalArgs}` : additionalArgs;
		}
		i = descriptionIndex + 1; // Move past the DESCRIPTION line
	}

	// The rest is the full description (skipping any empty lines after args)
	while (i < lines.length && lines[i].trim().length === 0) {
		i++;
	}

	// Combine the remaining lines into the full description
	description = lines.slice(Math.max(i, startLine)).join('\n').trim();

	// If description is empty, use the short description
	if (!description && shortDescription) {
		description = shortDescription;
	}

	// Extract just the first sentence for short description
	const firstPeriodIndex = shortDescription.indexOf('.');
	if (firstPeriodIndex > 0) {
		shortDescription = shortDescription.substring(0, firstPeriodIndex + 1).trim();
	} else if (shortDescription.length > 100) {
		shortDescription = shortDescription.substring(0, 100) + '...';
	}

	return {
		shortDescription,
		args,
		description
	};
}

const main = async () => {
	try {
		await createCommandDescriptionsCache();
		console.log('Created Fish command descriptions cache with', fishBuiltinsCommandDescriptionsCache.size, 'entries');

		// Save the cache to a TypeScript file
		const cacheFilePath = path.join(__dirname, '../src/shell/fishBuiltinsCache.ts');
		const cacheObject = Object.fromEntries(fishBuiltinsCommandDescriptionsCache);
		const tsContent = `${copyright}\n\nexport const fishBuiltinsCommandDescriptionsCache = ${JSON.stringify(cacheObject, null, 2)} as const;`;
		await fs.writeFile(cacheFilePath, tsContent, 'utf8');
		console.log('Saved Fish command descriptions cache to fishBuiltinsCache.ts with', Object.keys(cacheObject).length, 'entries');
	} catch (error) {
		console.error('Error:', error);
	}
};

main();
