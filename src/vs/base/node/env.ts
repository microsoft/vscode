/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import platform = require('vs/base/common/platform');
import { TPromise } from 'vs/base/common/winjs.base';
import cp = require('child_process');

export interface IEnv {
	[key: string]: string;
}

export function getUserEnvironment(): TPromise<IEnv> {
	if (platform.isWindows) {
		return TPromise.as({});
	}

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

			let result: IEnv = Object.create(null);

			buffer.split('\n').forEach(line => {
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

			c(result);
		});
	});
}
