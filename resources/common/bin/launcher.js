/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* global process */

var packageJson = require('../../../package.json');
var os = require('os');
var spawn = require('child_process').spawn;

function ArgParser(args) {
	this.args = args;
}

ArgParser.prototype.hasFlag = function (flag, alias) {
	return (flag && this.args.indexOf('--' + flag) >= 0) ||
		(alias && this.args.indexOf('-' + alias) >= 0);
}

ArgParser.prototype.printHelp = function () {
	var executable = 'code' + (os.platform() == 'win32' ? '.exe' : '');
	console.log(
		'Visual Studio Code v' + packageJson.version + '\n' +
		'\n' +
		'Usage: ' + executable + ' [arguments] [paths...]\n' +
		'\n' +
		'Options:\n' +
		'  -h, --help     Print usage.\n' +
		'  --locale       Use a specific locale.\n' +
		'  -n             Force a new instance of code.\n' +
		'  -v, --version  Print version.');
}

function parseArgs() {
	var argParser = new ArgParser(process.argv.slice(2));
	if (argParser.hasFlag('help', 'h')) {
		argParser.printHelp();
		process.exit(0);
	}
	if (argParser.hasFlag('version', 'v')) {
		console.log(packageJson.version);
		process.exit(0);
	}
}

function launchCode() {
	delete process.env['ATOM_SHELL_INTERNAL_RUN_AS_NODE'];
	spawn(process.env['VSCODE_PATH'], process.argv.slice(2), { detached: true, stdio: 'ignore' });
}

function main() {
	parseArgs();
	launchCode();
	process.exit(0);
}

main();
