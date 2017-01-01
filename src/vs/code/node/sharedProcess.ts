/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { TPromise } from 'vs/base/common/winjs.base';

export interface ISharedProcessInitData {
	args: ParsedArgs;
}

export interface ISharedProcessOptions {
	allowOutput?: boolean;
	debugPort?: number;
}

const boostrapPath = URI.parse(require.toUrl('bootstrap')).fsPath;

function _spawnSharedProcess(initData: ISharedProcessInitData, options: ISharedProcessOptions): cp.ChildProcess {
	const execArgv: string[] = [];
	const env = assign({}, process.env, {
		AMD_ENTRYPOINT: 'vs/code/node/sharedProcessMain',
		ELECTRON_NO_ASAR: '1'
	});

	if (options.allowOutput) {
		env['VSCODE_ALLOW_IO'] = 'true';
	}

	if (options.debugPort) {
		execArgv.push(`--debug=${options.debugPort}`);
	}

	const result = cp.fork(boostrapPath, ['--type=SharedProcess'], { env, execArgv });

	return result;
}

export function spawnSharedProcess(initData: ISharedProcessInitData, options: ISharedProcessOptions = {}): TPromise<IDisposable> {
	let spawnCount = 0;
	let child: cp.ChildProcess;

	let promise: TPromise<IDisposable>;

	const spawn = () => {
		if (++spawnCount > 10) {
			return;
		}

		child = _spawnSharedProcess(initData, options);
		promise = new TPromise<IDisposable>((c, e) => {
			// handshake
			child.once('message', () => {
				child.send(initData);
				c({
					dispose: () => {
						if (child) {
							child.removeListener('exit', spawn);
							child.kill();
							child = null;
						}
					}
				});
			});
		});
		child.on('exit', spawn);
	};

	spawn();

	return promise;
}