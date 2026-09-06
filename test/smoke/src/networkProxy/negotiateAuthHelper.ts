/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as readline from 'readline';
import * as kerberos from 'kerberos';

const authLogPath = process.argv[2];
if (!authLogPath) {
	throw new Error('Authentication log path is required');
}

async function main(): Promise<void> {
	const input = readline.createInterface({ input: process.stdin });
	for await (const request of input) {
		const match = /^YR (\S+)$/.exec(request);
		if (!match) {
			process.stdout.write('BH unsupported-request\n');
			continue;
		}

		try {
			const server = await kerberos.initializeServer('HTTP@localhost');
			const response = await server.step(match[1]);
			if (!server.contextComplete) {
				process.stdout.write('BH incomplete-authentication\n');
				continue;
			}

			fs.appendFileSync(authLogPath, `${server.username}\n`);
			process.stdout.write(`AF ${response || '='} ${server.username}\n`);
		} catch (error) {
			console.error(error);
			process.stdout.write('BH token-validation-failed\n');
		}
	}
}

void main();
