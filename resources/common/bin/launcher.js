/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* global process */

var packageJson = require('../../../package.json');
var os = require('os');
var spawn = require('child_process').spawn;
var yargs = require('yargs');

function parseArgs() {
	var executable = 'code' + (os.platform() == 'win32' ? '.exe' : '');
	var options = yargs(process.argv.slice(1));
	options.usage(
		'Visual Studio Code v' + packageJson.version + '\n' +
		'\n' +
		'Usage: ' + executable + ' [arguments] [path]');
	options.alias('h', 'help').boolean('h').describe('h', 'Print usage.');
	options.string('locale').describe('locale', 'Use a specific locale.');
	options.boolean('n').describe('n', 'Force a new instance of code.');
	options.alias('v', 'version').boolean('v').describe('v', 'Print version.');

	var args = options.argv;
	if (args.help) {
		process.stdout.write(options.help());
		process.exit(0);
	}
	if (args.version) {
		process.stdout.write(packageJson.version + '\n');
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
