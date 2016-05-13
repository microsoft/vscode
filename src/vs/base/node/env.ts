/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import cp = require('child_process');

export interface IEnv {
	[key: string]: string;
}

export function getUnixUserEnvironment(): TPromise<IEnv> {
	return new TPromise((c, e) => {
		let child = cp.spawn(process.env.SHELL, ['-ilc', 'env'], {
			detached: true,
			stdio: ['ignore', 'pipe', process.stderr],
		});

		child.stdout.setEncoding('utf8');
		child.on('error', () => c({}));

		let buffer = '';
		child.stdout.on('data', (d: string) => { buffer += d; });

		child.on('close', (code: number, signal: any) => {
			if (code !== 0) {
				return c({});
			}

			c(parseEnvOutput(buffer));
		});
	});
}

/**
 * Parse output from `env`, attempting to retain any multiple-line variables.
 * Exported for use in tests.
 */
export function parseEnvOutput(output: string): IEnv {
	let result: IEnv = Object.create(null);
	let vars = output.split('\n');

	// Rejoin lines to the preceeding line if it doesn't look like the line is a new variable
	let current = 0;
	for (let i = 1; i < vars.length; i++) {
		if (vars[i].match(/^[\w_][\w\d_]*=/) === null) {
			vars[current] += `\n${vars[i]}`;
		} else {
			vars[++current] = vars[i];
		}
	}

	// Trim any remaining vars that had been moved
	vars.length = current + 1;

	// Turn the array into a map
	vars.forEach(line => {
		let pos = line.indexOf('=');
		if (pos > 0) {
			let key = line.substring(0, pos);
			let value = line.substring(pos + 1);

			if (!key || typeof result[key] === 'string') {
				return;
			}

			result[key] = value;
		}
	});

	return result;
}
