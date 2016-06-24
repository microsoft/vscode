/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var fs = require('fs');
var os = require('os');
var path = require('path');
var ptyJs = require('pty.js');

// The pty process needs to be run in its own child process to get around maxing out CPU on Mac,
// see https://github.com/electron/electron/issues/38

var name;
if (os.platform() === 'win32') {
	name = path.basename(process.env.PTYSHELL);
} else {
	name = fs.existsSync('/usr/share/terminfo/x/xterm-256color') ? 'xterm-256color' : 'xterm';
}

var ptyProcess = ptyJs.fork(process.env.PTYSHELL, getArgs(), {
	name: name,
	cwd: process.env.PTYCWD
});
var currentTitle = '';

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

setupPlanB(process.env.PTYPID);
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

function setupPlanB(parentPid) {
	setInterval(function () {
		try {
			process.kill(parentPid, 0); // throws an exception if the main process doesn't exist anymore.
		} catch (e) {
			process.exit();
		}
	}, 5000);
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