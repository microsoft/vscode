/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import URI from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';

const boostrapPath = URI.parse(require.toUrl('bootstrap')).fsPath;

function _spawnSharedProcess(): cp.ChildProcess {
	const env = assign({}, process.env, {
		AMD_ENTRYPOINT: 'vs/code/node/sharedProcessMain'
	});

	const result = cp.fork(boostrapPath, ['--type=SharedProcess'], { env });

	// handshake
	result.once('message', () => result.send('hey'));

	return result;
}

let spawnCount = 0;

export function spawnSharedProcess(accessor: ServicesAccessor): IDisposable {
	let child: cp.ChildProcess;

	const spawn = () => {
		if (++spawnCount > 10) {
			return;
		}

		child = _spawnSharedProcess();
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