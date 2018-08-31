/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Logger from './logger';
import * as temp from './temp';
import path = require('path');
import fs = require('fs');
import cp = require('child_process');

export interface IForkOptions {
	cwd?: string;
	execArgv?: string[];
}

const getRootTempDir = (() => {
	let dir: string | undefined;
	return () => {
		if (!dir) {
			dir = temp.getTempFile(`vscode-typescript`);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir);
			}
		}
		return dir;
	};
})();

export function getTempFile(prefix: string): string {
	return path.join(getRootTempDir(), `${prefix}-${temp.makeRandomHexString(20)}.tmp`);
}

function generatePatchedEnv(env: any): any {
	const newEnv = Object.assign({}, env);

	// Set the two unique pipe names and the electron flag as process env
	newEnv['ELECTRON_RUN_AS_NODE'] = '1';

	// Ensure we always have a PATH set
	newEnv['PATH'] = newEnv['PATH'] || process.env.PATH;
	return newEnv;
}

export function fork(
	modulePath: string,
	args: string[],
	options: IForkOptions,
	logger: Logger
): cp.ChildProcess {
	const newEnv = generatePatchedEnv(process.env);
	newEnv['NODE_PATH'] = path.join(modulePath, '..', '..', '..');

	// Create the process
	logger.info('Forking TSServer', `PATH: ${newEnv['PATH']} `);

	return cp.fork(modulePath, args, {
		silent: true,
		cwd: options.cwd,
		env: newEnv,
		execArgv: options.execArgv
	});
}
