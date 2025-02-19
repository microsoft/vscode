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
	['chdir', 'Change the current directory'],
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
	['readonly', 'Mark variables as read-only'],
	['rehash', 'Recompute command hash table'],
	['sched', 'Schedule commands'],
	['setcap', 'Set capabilities'],
	['shift', 'Shift positional parameters'],
	['source', 'Source a file'],
	['stat', 'Display file status'],
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
	['whence', 'Locate a command'],
	['where', 'Locate a command'],
	['which', 'Locate a command'],
	['zcompile', 'Compile functions'],
	['zformat', 'Format strings'],
	['zftp', 'Zsh FTP client'],
	['zparseopts', 'Parse options'],
	['zprof', 'Zsh profiler'],
	['zsocket', 'Zsh socket interface'],
	['zstyle', 'Define styles']
]);

const execAsync = promisify(exec);
let zshBuiltinsCommandDescriptionsCache = new Map<string, { description: string; args: string | undefined }>();
async function createCommandDescriptionsCache(): Promise<void> {
	const cachedCommandDescriptions: Map<string, { shortDescription?: string; description: string; args: string | undefined }> = new Map();
	let output = '';

	try {
		output = await execAsync('man zshbuiltins').then(r => r.stdout);
	} catch {
	}

	if (output) {
		// Strip all backspaces from the output
		output = output.replace(/.\x08/g, '');
		const lines = output.split('\n');

		let currentCommand: string | undefined;
		let currentDescription: string[] = [];
		let currentArgs: string | undefined;
		let commandSectionStarted = false; // Flag to ensure we ignore unrelated lines at the start

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Detect command names (lines starting with exactly 7 spaces)
			const cmdMatch = line.match(/^\s{7}(\S+)(?:\s+(.*))?/);
			if (cmdMatch?.length && cmdMatch.length > 1) {
				commandSectionStarted = true; // Now we know we're in the right section

				// Store the previous command before moving on to the new one
				if (currentCommand && currentDescription.join(' ').trim().length) {
					const shortDescription = shortDescriptions.get(currentCommand);
					const description = currentDescription.join(' ').trim();
					const args = `${currentCommand} ${currentArgs}`;
					if (shortDescription) {
						cachedCommandDescriptions.set(currentCommand, {
							shortDescription,
							description,
							args
						});
					} else {
						cachedCommandDescriptions.set(currentCommand, {
							description,
							args
						});
					}
				}

				// Start a new command entry
				currentCommand = cmdMatch[1];
				currentArgs = cmdMatch[2];
				currentDescription = []; // Reset description for the new command
			}
			// Capture description lines (14 spaces indentation) only if we have detected a command section
			else if (commandSectionStarted && currentCommand && line.match(/^\s{14}/)) {
				currentDescription.push(line.trim());
			}
		}

		// Store the last command in the loop
		if (currentCommand && currentDescription.join(' ').trim().length) {
			cachedCommandDescriptions.set(currentCommand, {
				description: currentDescription.join(' ').trim(),
				args: currentArgs ? `${currentCommand} ${currentArgs}` : undefined
			});
		}
	}

	zshBuiltinsCommandDescriptionsCache = cachedCommandDescriptions;
}


const main = async () => {
	try {
		await createCommandDescriptionsCache();
		console.log('created command descriptions cache with ', zshBuiltinsCommandDescriptionsCache.size, 'entries');
		// Save the cache to a JSON file
		const cacheFilePath = path.join(__dirname, '../src/shell/zshBuiltinsCache.json');
		const cacheObject = Object.fromEntries(zshBuiltinsCommandDescriptionsCache);
		await fs.writeFile(cacheFilePath, JSON.stringify(cacheObject, null, 2), 'utf8');
		console.log('saved command descriptions cache to zshBuiltinsCache.json with ', Object.keys(cacheObject).length, 'entries');
	} catch (error) {
		console.error('Error:', error);
	}
};

main();
