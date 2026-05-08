/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { Command } from 'commander';
import { buildCliHost, SOTA_PATHS } from '../cliHost';

export function configCommand(): Command {
	const cmd = new Command('config');
	cmd.description('Read or write Son of Anton config.');

	cmd.command('get [key]')
		.description('Print a config value (or all values if no key).')
		.action(async (key?: string) => {
			const host = buildCliHost();
			if (key) {
				const value = host.config.get(key);
				if (value === undefined) {
					process.stdout.write('(unset)\n');
				} else {
					process.stdout.write(JSON.stringify(value, null, 2) + '\n');
				}
				return;
			}
			if (fs.existsSync(SOTA_PATHS.config)) {
				process.stdout.write(fs.readFileSync(SOTA_PATHS.config, 'utf-8'));
				if (!process.stdout.write('\n')) {
					// best-effort newline so terminals don't swallow the prompt
				}
			} else {
				process.stdout.write('{}\n');
			}
		});

	cmd.command('set <key> <value>')
		.description('Set a config value (parsed as JSON; falls back to string).')
		.action(async (key: string, value: string) => {
			const host = buildCliHost();
			let parsed: unknown;
			try {
				parsed = JSON.parse(value);
			} catch {
				parsed = value;
			}
			await host.config.update?.(key, parsed);
			process.stdout.write(`Set ${key}.\n`);
		});

	return cmd;
}
