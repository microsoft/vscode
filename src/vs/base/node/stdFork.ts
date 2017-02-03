/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import os = require('os');
import net = require('net');
import cp = require('child_process');
import uri from 'vs/base/common/uri';

export interface IForkOpts {
	cwd?: string;
	env?: any;
	encoding?: string;
	execArgv?: string[];
}

function makeRandomHexString(length: number): string {
	let chars = ['0', '1', '2', '3', '4', '5', '6', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
	let result = '';
	for (let i = 0; i < length; i++) {
		let idx = Math.floor(chars.length * Math.random());
		result += chars[idx];
	}
	return result;
}

function generatePipeName(): string {
	let randomName = 'vscode-' + makeRandomHexString(40);
	if (process.platform === 'win32') {
		return '\\\\.\\pipe\\' + randomName + '-sock';
	}

	// Mac/Unix: use socket file
	return path.join(os.tmpdir(), randomName + '.sock');
}

function generatePatchedEnv(env: any, stdInPipeName: string, stdOutPipeName: string, stdErrPipeName: string): any {
	// Set the two unique pipe names and the electron flag as process env

	let newEnv: any = {};
	for (let key in env) {
		newEnv[key] = env[key];
	}

	newEnv['STDIN_PIPE_NAME'] = stdInPipeName;
	newEnv['STDOUT_PIPE_NAME'] = stdOutPipeName;
	newEnv['STDERR_PIPE_NAME'] = stdErrPipeName;
	newEnv['ELECTRON_RUN_AS_NODE'] = '1';
	newEnv['ELECTRON_NO_ASAR'] = '1';

	return newEnv;
}

export function fork(modulePath: string, args: string[], options: IForkOpts, callback: (error: any, cp: cp.ChildProcess) => void): void {

	let callbackCalled = false;
	let resolve = (result: cp.ChildProcess) => {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(null, result);
	};
	let reject = (err: any) => {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(err, null);
	};

	// Generate three unique pipe names
	let stdInPipeName = generatePipeName();
	let stdOutPipeName = generatePipeName();
	let stdErrPipeName = generatePipeName();

	let newEnv = generatePatchedEnv(options.env || process.env, stdInPipeName, stdOutPipeName, stdErrPipeName);

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

		stdOutStream.once('data', (chunk: Buffer) => {
			// The child process is sending me the `ready` chunk, time to connect to the stdin pipe
			childProcess.stdin = <any>net.connect(stdInPipeName);

			// From now on the childProcess.stdout is available for reading
			childProcess.stdout = stdOutStream;

			resolve(childProcess);
		});
	});
	stdOutServer.listen(stdOutPipeName);

	let serverClosed = false;
	let closeServer = () => {
		if (serverClosed) {
			return;
		}

		serverClosed = true;
		process.removeListener('exit', closeServer);
		stdOutServer.close();
		stdErrServer.close();
	};

	// Create the process
	let bootstrapperPath = (uri.parse(require.toUrl('./stdForkStart.js')).fsPath);
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

	// On vscode exit still close server #7758
	process.once('exit', closeServer);
}