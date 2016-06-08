/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

var fs = require('fs');
var ptyJs = require('pty.js');

// The pty process needs to be run in its own child process to get around maxing out CPU on Mac,
// see https://github.com/electron/electron/issues/38

var ptyProcess = ptyJs.fork(process.env.PTYSHELL, getArgs(), {
	name: fs.existsSync('/usr/share/terminfo/x/xterm-256color') ? 'xterm-256color' : 'xterm',
	cwd: process.env.PTYCWD
});

ptyProcess.on('data', function (data) {
	process.send(data);
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

function getArgs() {
	var args = [];
	var i = 0;
	while (process.env['PTYSHELLARG' + i]) {
		args.push(process.env['PTYSHELLARG' + i]);
		i++;
	}
	return args;
}