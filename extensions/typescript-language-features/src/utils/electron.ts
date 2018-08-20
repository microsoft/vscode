/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Logger from './logger';
import * as temp from './temp';
import path = require('path');
import fs = require('fs');
import net = require('net');
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

function generatePipeName(): string {
	return getPipeName(temp.makeRandomHexString(40));
}

function getPipeName(name: string): string {
	const fullName = 'vscode-' + name;
	if (process.platform === 'win32') {
		return '\\\\.\\pipe\\' + fullName + '-sock';
	}

	// Mac/Unix: use socket file
	return path.join(getRootTempDir(), fullName + '.sock');
}

function generatePatchedEnv(
	env: any,
	stdInPipeName: string,
	stdOutPipeName: string,
	stdErrPipeName: string
): any {
	const newEnv = Object.assign({}, env);

	// Set the two unique pipe names and the electron flag as process env
	newEnv['STDIN_PIPE_NAME'] = stdInPipeName;
	newEnv['STDOUT_PIPE_NAME'] = stdOutPipeName;
	newEnv['STDERR_PIPE_NAME'] = stdErrPipeName;
	newEnv['ELECTRON_RUN_AS_NODE'] = '1';

	// Ensure we always have a PATH set
	newEnv['PATH'] = newEnv['PATH'] || process.env.PATH;
	return newEnv;
}

export function fork(
	modulePath: string,
	args: string[],
	options: IForkOptions,
	logger: Logger,
	callback: (error: any, cp: cp.ChildProcess | null) => void,
): void {

	let callbackCalled = false;
	const resolve = (result: cp.ChildProcess) => {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(null, result);
	};
	const reject = (err: any) => {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(err, null);
	};

	// Generate three unique pipe names
	const stdInPipeName = generatePipeName();
	const stdOutPipeName = generatePipeName();
	const stdErrPipeName = generatePipeName();


	const newEnv = generatePatchedEnv(process.env, stdInPipeName, stdOutPipeName, stdErrPipeName);
	newEnv['NODE_PATH'] = path.join(modulePath, '..', '..', '..');
	let childProcess: cp.ChildProcess;

	// Begin listening to stderr pipe
	let stdErrServer = net.createServer((stdErrStream) => {
		// From now on the childProcess.stderr is available for reading
		childProcess.stderr = stdErrStream;
	});
	stdErrServer.listen(stdErrPipeName);

	// Begin listening to stdout pipe
	let stdOutServer = net.createServer((stdOutStream) => {
		// The child process will write exactly one chunk with content `ready` when it has installed a listener to the stdin pipe

		stdOutStream.once('data', (_chunk: Buffer) => {
			// The child process is sending me the `ready` chunk, time to connect to the stdin pipe
			childProcess.stdin = <any>net.connect(stdInPipeName);

			// From now on the childProcess.stdout is available for reading
			childProcess.stdout = stdOutStream;

			resolve(childProcess);
		});
	});
	stdOutServer.listen(stdOutPipeName);

	let serverClosed = false;
	const closeServer = () => {
		if (serverClosed) {
			return;
		}
		serverClosed = true;
		stdOutServer.close();
		stdErrServer.close();
	};

	// Create the process
	logger.info('Forking TSServer', `PATH: ${newEnv['PATH']} `);

	const bootstrapperPath = require.resolve('./electronForkStart');
	childProcess = cp.fork(bootstrapperPath, [modulePath].concat(args), {
		silent: true,
		cwd: options.cwd,
		env: newEnv,
		execArgv: options.execArgv
	});

	childProcess.once('error', (err: Error) => {
		closeServer();
		reject(err);
	});

	childProcess.once('exit', (err: Error) => {
		closeServer();
		reject(err);
	});
}
