/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);
let zshBuiltinsCommandDescriptionsCache = new Map<string, { description: string; args: string | undefined }>();
async function createCommandDescriptionsCache(): Promise<void> {
	const cachedCommandDescriptions: Map<string, { description: string; args: string | undefined }> = new Map();
	let output = '';
	try {
		output = await execAsync('man zshbuiltins').then(r => r.stdout);
	} catch {
	}

	if (output) {
		// Strip all backspaces from the output
		output = output.replace(/.\x08/g, '');
		const lines = output.split('\n');

		let command: string | undefined;
		let description: string[] = [];
		let args: string | undefined;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			// Detect command names (lines starting with exactly 7 spaces)
			const cmdMatch = line.match(/^\s{7}(\S+)(?:\s+(.*))?/);
			if (cmdMatch?.length && cmdMatch.length > 1) {
				command = cmdMatch[1];
				args = cmdMatch[2];

				// Store the previous command, args, and its description
				if (command && description.length) {
					cachedCommandDescriptions.set(command, { description: description.join(' ').trim(), args });
				}

				// Capture the new command name
				command = cmdMatch[1];
				description = [];
				// Move to the next line to check for description
				continue;
			}

			// Capture description lines (14 spaces indentation)
			if (command && line.match(/^\s{14}/)) {
				description.push(line.trim());
			}
		}
		// Store the last command, its args, and description
		if (command && description.length) {
			cachedCommandDescriptions.set(command, { description: description.join(' ').trim(), args });
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
