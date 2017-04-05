/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import os = require('os');
import net = require('net');
import cp = require('child_process');

export interface IForkOptions {
	cwd?: string;
	env?: any;
	encoding?: string;
	execArgv?: string[];
}

export function makeRandomHexString(length: number): string {
	let chars = ['0', '1', '2', '3', '4', '5', '6', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
	let result = '';
	for (let i = 0; i < length; i++) {
		let idx = Math.floor(chars.length * Math.random());
		result += chars[idx];
	}
	return result;
}

function generatePipeName(): string {
	return getPipeName(makeRandomHexString(40));
}

export function getPipeName(name: string): string {
	const fullName = 'vscode-' + name;
	if (process.platform === 'win32') {
		return '\\\\.\\pipe\\' + fullName + '-sock';
	}

	// Mac/Unix: use socket file
	return path.join(os.tmpdir(), fullName + '.sock');
}


function generatePatchedEnv(env: any, stdInPipeName: string, stdOutPipeName: string, stdErrPipeName: string): any {
	// Set the two unique pipe names and the electron flag as process env

	var newEnv: any = {};
	for (var key in env) {
		newEnv[key] = env[key];
	}

	newEnv['STDIN_PIPE_NAME'] = stdInPipeName;
	newEnv['STDOUT_PIPE_NAME'] = stdOutPipeName;
	newEnv['STDERR_PIPE_NAME'] = stdErrPipeName;
	newEnv['ELECTRON_RUN_AS_NODE'] = '1';

	return newEnv;
}

export function fork(modulePath: string, args: string[], options: IForkOptions, callback: (error: any, cp: cp.ChildProcess | null) => void): void {

	var callbackCalled = false;
	var resolve = (result: cp.ChildProcess) => {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(null, result);
	};
	var reject = (err: any) => {
		if (callbackCalled) {
			return;
		}
		callbackCalled = true;
		callback(err, null);
	};

	// Generate three unique pipe names
	var stdInPipeName = generatePipeName();
	var stdOutPipeName = generatePipeName();
	let stdErrPipeName = generatePipeName();


	var newEnv = generatePatchedEnv(options.env || process.env, stdInPipeName, stdOutPipeName, stdErrPipeName);

	var childProcess: cp.ChildProcess;

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

	var serverClosed = false;
	var closeServer = () => {
		if (serverClosed) {
			return;
		}
		serverClosed = true;
		stdOutServer.close();
		stdErrServer.close();
	};

	// Create the process
	let bootstrapperPath = path.join(__dirname, 'electronForkStart');
	childProcess = cp.fork(bootstrapperPath, [modulePath].concat(args), <any>{
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
