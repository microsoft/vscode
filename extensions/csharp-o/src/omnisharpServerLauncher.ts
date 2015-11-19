/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {exists as fileExists} from 'fs';
import {spawn, ChildProcess} from 'child_process';
import {workspace} from 'vscode';
import {satisfies} from 'semver';
import {join} from 'path';

var omnisharpEnv = 'OMNISHARP';
var isWindows = /^win/.test(process.platform);

export default function launch(cwd: string, args: string[]):Promise < { process: ChildProcess, command: string } > {

	return new Promise((resolve, reject) => {

		try {
			(isWindows ? launchWindows(cwd, args) : launchNix(cwd, args)).then(value => {

				// async error - when target not not ENEOT
				value.process.on('error', reject);

				// success after a short freeing event loop
				setTimeout(function () {
					resolve(value);
				}, 0);
			}, err => {
				reject(err);
			});

		} catch (err) {
			reject(err);
		}
	});
}

function launchWindows(cwd: string, args: string[]): Promise<{ process: ChildProcess, command: string }> {
	return getOmnisharpPath().then(command => {

		args = args.slice(0);
		args.unshift(command);
		args = [[
			'/s',
			'/c',
			'"' + args.map(arg => /^[^"].* .*[^"]/.test(arg) ? `"${arg}"` : arg).join(' ') + '"'
		].join(' ')];

		let process = spawn('cmd', args, <any>{
			windowsVerbatimArguments: true,
			detached: false,
			// env: details.env,
			cwd: cwd
		});

		return {
			process,
			command
		};
	});
}

function launchNix(cwd: string, args: string[]): Promise<{ process: ChildProcess, command: string }>{

	return new Promise((resolve, reject) => {
		hasMono('>=4.0.1').then(hasIt => {
			if (!hasIt) {
				reject(new Error('Cannot start Omnisharp because Mono version >=4.0.1 is required. See http://go.microsoft.com/fwlink/?linkID=534832#_20001'));
			} else {
				resolve();
			}
		});
	}).then(_ => {
		return getOmnisharpPath();
	}).then(command => {
		let process = spawn(command, args, {
			detached: false,
			// env: details.env,
			cwd
		});

		return {
			process,
			command
		}
	});
}

function getOmnisharpPath(): Promise<string> {

	let pathCandidate: string;

	let config = workspace.getConfiguration();
	if (config.has('csharp.omnisharp')) {
		// form config
		pathCandidate = config.get<string>('csharp.omnisharp');

	} else if (typeof process.env[omnisharpEnv] === 'string') {
		// form enviroment variable
		console.warn('[deprecated] use workspace or user settings with "csharp.omnisharp":"/path/to/omnisharp"');
		pathCandidate = process.env[omnisharpEnv];

	} else {
		// bundled version of Omnisharp
		pathCandidate = join(__dirname, '../bin/omnisharp')
		if (isWindows) {
			pathCandidate += '.cmd';
		}
	}

	return new Promise<string>((resolve, reject) => {
		fileExists(pathCandidate, localExists => {
			if (localExists) {
				resolve(pathCandidate);
			} else {
				reject('OmniSharp does not exist at location: ' + pathCandidate);
			}
		});
	});
}

const versionRegexp = /(\d+\.\d+\.\d+)/;

export function hasMono(range?: string): Promise<boolean> {

	return new Promise<boolean>((resolve, reject) => {
		let childprocess: ChildProcess;
		try {
			childprocess = spawn('mono', ['--version']);
		} catch (e) {
			return resolve(false);
		}

		childprocess.on('error', function (err: any) {
			resolve(false);
		});

		let stdout = '';
		childprocess.stdout.on('data', (data: NodeBuffer) => {
			stdout += data.toString();
		});

		childprocess.stdout.on('close', () => {
			let match = versionRegexp.exec(stdout),
				ret: boolean;

			if (!match) {
				ret = false;
			} else if (!range) {
				ret = true;
			} else {
				ret = satisfies(match[1], range);
			}

			resolve(ret);
		});
	});
}