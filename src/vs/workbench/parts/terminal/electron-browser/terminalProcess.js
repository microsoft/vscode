/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var fs = require('fs');
var os = require('os');
var path = require('path');
var ptyJs = require('node-pty');

// The pty process needs to be run in its own child process to get around maxing out CPU on Mac,
// see https://github.com/electron/electron/issues/38

var name;
if (os.platform() === 'win32') {
	name = path.basename(process.env.PTYSHELL);
} else {
	// Using 'xterm-256color' here helps ensure that the majority of Linux distributions will use a
	// color prompt as defined in the default ~/.bashrc file.
	name = 'xterm-256color';
}
var shell = process.env.PTYSHELL;
var args = getArgs();
var cwd = process.env.PTYCWD;
var currentTitle = '';

setupPlanB(process.env.PTYPID);
cleanEnv();

var ptyProcess = ptyJs.fork(shell, args, {
	name: name,
	cwd: cwd
});

ptyProcess.on('data', function (data) {
	process.send({
		type: 'data',
		content: data
	});
});

ptyProcess.on('exit', function (exitCode) {
	process.exit(exitCode);
});

process.on('message', function (message) {
	if (message.event === 'input') {
		ptyProcess.write(message.data);
	} else if (message.event === 'resize') {
		ptyProcess.resize(message.cols, message.rows);
	}
});

sendProcessId();
setupTitlePolling();

function getArgs() {
	var args = [];
	var i = 0;
	while (process.env['PTYSHELLARG' + i]) {
		args.push(process.env['PTYSHELLARG' + i]);
		i++;
	}
	return args;
}

function cleanEnv() {
	var keys = [
		'ELECTRON_RUN_AS_NODE',
		'PTYCWD',
		'PTYPID',
		'PTYSHELL'
	];
	keys.forEach(function (key) {
		if (process.env[key]) {
			delete process.env[key];
		}
	});
	var i = 0;
	while (process.env['PTYSHELLARG' + i]) {
		delete process.env['PTYSHELLARG' + i];
	}
}

function setupPlanB(parentPid) {
	setInterval(function () {
		try {
			process.kill(parentPid, 0); // throws an exception if the main process doesn't exist anymore.
		} catch (e) {
			process.exit();
		}
	}, 5000);
}

function sendProcessId() {
	process.send({
		type: 'pid',
		content: ptyProcess.pid
	});
}

function setupTitlePolling() {
	sendProcessTitle();
	setInterval(function () {
		if (currentTitle !== ptyProcess.process) {
			sendProcessTitle();
		}
	}, 200);
}

function sendProcessTitle() {
	process.send({
		type: 'title',
		content: ptyProcess.process
	});
	currentTitle = ptyProcess.process;
}