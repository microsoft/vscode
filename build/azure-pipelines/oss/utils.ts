/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Parse CLI arguments of the form `--key value` into a Record.
 * If the next token after a `--key` is another `--`-prefixed flag (or there
 * is no next token), the key is treated as a boolean flag with value `'true'`.
 */
export function parseArgs(argv: string[]): Record<string, string> {
	const args: Record<string, string> = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i].startsWith('--')) {
			const key = argv[i].substring(2);
			if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
				args[key] = argv[i + 1];
				i++;
			} else {
				args[key] = 'true';
			}
		}
	}
	return args;
}
