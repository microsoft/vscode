/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';

export interface ISharedProcessOptions {
	allowOutput?: boolean;
	debugPort?: number;
}

const boostrapPath = URI.parse(require.toUrl('bootstrap')).fsPath;

function _spawnSharedProcess(options: ISharedProcessOptions): cp.ChildProcess {
	const execArgv = [];
	const env = assign({}, process.env, {
		AMD_ENTRYPOINT: 'vs/code/node/sharedProcessMain'
	});

	if (options.allowOutput) {
		env['VSCODE_ALLOW_IO'] = 'true';
	}

	if (options.debugPort) {
		execArgv.push(`--debug=${options.debugPort}`);
	}

	const result = cp.fork(boostrapPath, ['--type=SharedProcess'], { env, execArgv });

	// handshake
	result.once('message', () => result.send('hey'));

	return result;
}

export function spawnSharedProcess(options: ISharedProcessOptions = {}): IDisposable {
	let spawnCount = 0;
	let child: cp.ChildProcess;

	const spawn = () => {
		if (++spawnCount > 10) {
			return;
		}

		child = _spawnSharedProcess(options);
		child.on('exit', spawn);
	};

	spawn();

	return {
		dispose: () => {
			if (child) {
				child.removeListener('exit', spawn);
				child.kill();
				child = null;
			}
		}
	};
}