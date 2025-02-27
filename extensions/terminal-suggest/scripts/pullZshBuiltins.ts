/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { platform } from 'os';

if (platform() === 'win32') {
	console.error('\x1b[31mThis command is not supported on Windows\x1b[0m');
	process.exit(1);
}

const latestZshVersion = 5.9;

const shortDescriptions: Map<string, string> = new Map([
	['.', 'Source a file'],
	[':', 'No effect'],
	['alias', 'Define or view aliases'],
	['autoload', 'Autoload a function'],
	['bg', 'Put a job in the background'],
	['bindkey', 'Manipulate keymap names'],
	['break', 'Exit from a loop'],
	['builtin', 'Executes a builtin'],
	['bye', 'Exit the shell'],
	['cap', 'Manipulating POSIX capability sets'],
	['cd', 'Change the current directory'],
	['chdir', 'Change the current directory'],
	['clone', 'Clone shell onto another terminal'],
	['command', 'Execute a command'],
	['comparguments', 'Complete arguments'],
	['compcall', 'Complete call'],
	['compctl', 'Complete control'],
	['compdescribe', 'Complete describe'],
	['compfiles', 'Complete files'],
	['compgroups', 'Complete groups'],
	['compquote', 'Complete quote'],
	['comptags', 'Complete tags'],
	['comptry', 'Complete try'],
	['compvalues', 'Complete values'],
	['continue', 'Resume the next loop iteration'],
	['declare', 'Set or display parameter attributes/values'],
	['dirs', 'Interact with directory stack'],
	['disable', 'Disable shell features'],
	['disown', 'Remove job from job table'],
	['echo', 'Write on standard output'],
	['echotc', 'Echo terminal capabilities'],
	['echoti', 'Echo terminal info'],
	['emulate', 'Emulate a shell'],
	['enable', 'Enable shell features'],
	['eval', 'Execute arguments in shell'],
	['exec', 'Replace shell with command'],
	['exit', 'Exit the shell'],
	['export', 'Export to environment'],
	['false', 'Return exit status of 1'],
	['fc', 'Fix command'],
	['fg', 'Put a job in the foreground'],
	['float', 'Floating point arithmetic'],
	['functions', 'List functions'],
	['getcap', 'Get capabilities'],
	['getln', 'Get line from buffer'],
	['getopts', 'Parse positional parameters'],
	['hash', 'Remember command locations'],
	['history', 'Command history'],
	['integer', 'Integer arithmetic'],
	['jobs', 'List active jobs'],
	['kill', 'Send a signal to a process'],
	['let', 'Evaluate arithmetic expression'],
	['limit', 'Set or display resource limits'],
	['local', 'Create a local variable'],
	['logout', 'Exit the shell'],
	['noglob', 'Disable filename expansion'],
	['popd', 'Remove directory from stack'],
	['print', 'Print arguments'],
	['printf', 'Format and print data'],
	['pushd', 'Add directory to stack'],
	['pushln', 'Push arguments onto the buffer'],
	['pwd', 'Print working directory'],
	['r', 'Re-execute command'],
	['read', 'Read a line from input'],
	['readonly', 'Mark variables as read-only'],
	['rehash', 'Recompute command hash table'],
	['return', 'Return from a function'],
	['sched', 'Schedule commands'],
	['set', 'Set shell options'],
	['setcap', 'Set capabilities'],
	['setopt', 'Set shell options'],
	['shift', 'Shift positional parameters'],
	['source', 'Source a file'],
	['stat', 'Display file status'],
	['suspend', 'Suspend the shell'],
	['test', 'Evaluate a conditional expression'],
	['times', 'Display shell times'],
	['trap', 'Set signal handlers'],
	['true', 'Return exit status of 0'],
	['ttyctl', 'Control terminal attributes'],
	['type', 'Describe a command'],
	['typeset', 'Set or display parameter attributes/values'],
	['ulimit', 'Set or display resource limits'],
	['umask', 'Set file creation mask'],
	['unalias', 'Removes aliases'],
	['unfunction', 'Remove function definition'],
	['unhash', 'Remove command from hash table'],
	['unlimit', 'Remove resource limits'],
	['unset', 'Unset values and attributes of variables'],
	['unsetopt', 'Unset shell options'],
	['vared', 'Edit shell variables'],
	['wait', 'Wait for a process'],
	['whence', 'Locate a command'],
	['where', 'Locate a command'],
	['which', 'Locate a command'],
	['zcompile', 'Compile functions'],
	['zformat', 'Format strings'],
	['zftp', 'Zsh FTP client'],
	['zle', 'Zsh line editor'],
	['zmodload', 'Load a module'],
	['zparseopts', 'Parse options'],
	['zprof', 'Zsh profiler'],
	['zpty', 'Zsh pseudo terminal'],
	['zregexparse', 'Parse regex'],
	['zsocket', 'Zsh socket interface'],
	['zstyle', 'Define styles'],
	['ztcp', 'Manipulate TCP sockets'],
]);

const execAsync = promisify(exec);

interface ICommandDetails {
	description: string;
	args: string | undefined;
	shortDescription?: string;
}
let zshBuiltinsCommandDescriptionsCache = new Map<string, ICommandDetails>();
async function createCommandDescriptionsCache(): Promise<void> {
	const cachedCommandDescriptions: Map<string, { shortDescription?: string; description: string; args: string | undefined }> = new Map();
	let output = '';
	const zshVersionOutput = await execAsync('zsh --version').then(r => r.stdout);
	const zshVersionMatch = zshVersionOutput.match(/zsh (\d+\.\d+)/);
	if (!zshVersionMatch) {
		console.error('\x1b[31mFailed to determine zsh version\x1b[0m');
		process.exit(1);
	}
	const zshVersion = parseFloat(zshVersionMatch[1]);
	if (zshVersion < latestZshVersion) {
		console.error(`\x1b[31mZsh version must be ${latestZshVersion} or higher\x1b[0m`);
		process.exit(1);
	}
	try {
		output = await execAsync('pandoc --from man --to markdown --wrap=none < $(man -w zshbuiltins)').then(r => r.stdout);
	} catch {
	}

	const commands: Map<string, string[]> = new Map();
	const commandRegex = /^\*\*(?<command>[a-z\.:]+)\*\*(?:\s\*.+\*)?(?:\s\\\[.+\\\])?$/;
	if (output) {
		const lines = output.split('\n');
		let currentCommand: string | undefined;
		let currentCommandStart = 0;
		let seenOutput = false;
		let i = 0;
		for (; i < lines.length; i++) {
			if (!currentCommand || seenOutput) {
				const match = lines[i].match(commandRegex);
				if (match?.groups?.command) {
					if (currentCommand) {
						commands.set(currentCommand, lines.slice(currentCommandStart, i));
					}
					currentCommand = match.groups.command;
					currentCommandStart = i;
					seenOutput = false;
				}
			}
			if (!currentCommand) {
				continue;
			}
			// There may be several examples of usage
			if (!seenOutput) {
				seenOutput = lines[i].length > 0 && !lines[i].match(commandRegex);
			}
		}
		if (currentCommand) {
			commands.set(currentCommand, lines.slice(currentCommandStart, i - 1));
		}
	}

	if (commands.size === 0) {
		console.error('\x1b[31mFailed to parse command descriptions\x1b[30m');
		process.exit(1);
	}

	for (const [command, lines] of commands) {
		const shortDescription = shortDescriptions.get(command);
		let argsEnd = 0;
		try {
			while (true) {
				const line = lines[++argsEnd];
				if (line.trim().length > 0 && !line.match(commandRegex)) {
					break;
				}
			}
		} catch (e) {
			console.log(e);
		}
		const formattedArgs = lines.slice(0, argsEnd - 1).join('\n');
		const args = (await execAsync(`pandoc --from markdown --to plain <<< "${formattedArgs}"`)).stdout.trim();
		const description = lines.slice(argsEnd).map(e => formatLineAsMarkdown(e)).join('\n').trim();
		if (shortDescription) {
			cachedCommandDescriptions.set(command, {
				shortDescription,
				description,
				args
			});
		} else {
			cachedCommandDescriptions.set(command, {
				description,
				args
			});
		}
	}

	zshBuiltinsCommandDescriptionsCache = cachedCommandDescriptions;
}

function formatLineAsMarkdown(text: string): string {
	// Detect any inline code blocks which use the form `code' (backtick, single quote) and convert
	// them to standard markdown `code` (backtick, backtick). This doesn't attempt to remove
	// formatting inside the code blocks. We probably need to use the original .troff format to do
	// this
	const formattedText = text.replace(/\\`([^']+)\\'/g, '`$1`');
	return formattedText;
}

const main = async () => {
	try {
		await createCommandDescriptionsCache();
		console.log('created command descriptions cache with ', zshBuiltinsCommandDescriptionsCache.size, 'entries');

		const missingShortDescription: string[] = [];
		for (const [command, entry] of zshBuiltinsCommandDescriptionsCache.entries()) {
			if (entry.shortDescription === undefined) {
				missingShortDescription.push(command);
			}
		}
		if (missingShortDescription.length > 0) {
			console.log('\x1b[31mmissing short description for commands:\n' + missingShortDescription.join('\n') + '\x1b[0m');
		}

		// Save the cache to a TypeScript file
		const cacheFilePath = path.join(__dirname, '../src/shell/zshBuiltinsCache.ts');
		const cacheObject = Object.fromEntries(zshBuiltinsCommandDescriptionsCache);
		const tsContent = `${copyright}\n\nexport const zshBuiltinsCommandDescriptionsCache = ${JSON.stringify(cacheObject, null, 2)} as const;`;
		await fs.writeFile(cacheFilePath, tsContent, 'utf8');
		console.log('saved command descriptions cache to zshBuiltinsCache.ts with ', Object.keys(cacheObject).length, 'entries');
	} catch (error) {
		console.error('Error:', error);
	}
};

const copyright = `
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/`;

main();
