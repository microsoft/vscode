/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as cp from 'child_process';
import { assign } from 'vs/base/common/objects';
import { generateUuid } from 'vs/base/common/uuid';
import { TPromise } from 'vs/base/common/winjs.base';
import { isWindows } from 'vs/base/common/platform';


function getUnixShellEnvironment(): TPromise<typeof process.env> {
	const promise = new TPromise((c, e) => {
		const runAsNode = process.env['ELECTRON_RUN_AS_NODE'];
		const noAttach = process.env['ELECTRON_NO_ATTACH_CONSOLE'];
		const mark = generateUuid().replace(/-/g, '').substr(0, 12);
		const regex = new RegExp(mark + '(.*)' + mark);

		const env = assign({}, process.env, {
			ELECTRON_RUN_AS_NODE: '1',
			ELECTRON_NO_ATTACH_CONSOLE: '1'
		});

		const command = `'${process.execPath}' -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
		const child = cp.spawn(process.env.SHELL, ['-ilc', command], {
			detached: true,
			stdio: ['ignore', 'pipe', process.stderr],
			env
		});

		const buffers: Buffer[] = [];
		child.on('error', () => c({}));
		child.stdout.on('data', b => buffers.push(b as Buffer));

		child.on('close', (code: number, signal: any) => {
			if (code !== 0) {
				return e(new Error('Failed to get environment'));
			}

			const raw = Buffer.concat(buffers).toString('utf8');
			const match = regex.exec(raw);
			const rawStripped = match ? match[1] : '{}';

			try {
				const env = JSON.parse(rawStripped);

				if (runAsNode) {
					env['ELECTRON_RUN_AS_NODE'] = runAsNode;
				} else {
					delete env['ELECTRON_RUN_AS_NODE'];
				}

				if (noAttach) {
					env['ELECTRON_NO_ATTACH_CONSOLE'] = noAttach;
				} else {
					delete env['ELECTRON_NO_ATTACH_CONSOLE'];
				}

				c(env);
			} catch (err) {
				e(err);
			}
		});
	});

	// swallow errors
	return promise.then(null, () => ({}));
}


let _shellEnv: TPromise<typeof process.env>;

/**
 * We need to get the environment from a user's shell.
 * This should only be done when Code itself is not launched
 * from within a shell.
 */
export function getShellEnvironment(): TPromise<typeof process.env> {
	if (_shellEnv === undefined) {
		if (isWindows) {
			_shellEnv = TPromise.as({});
		} else if (process.env['VSCODE_CLI'] === '1') {
			_shellEnv = TPromise.as({});
		} else {
			_shellEnv = getUnixShellEnvironment();
		}
	}
	return _shellEnv;
}
