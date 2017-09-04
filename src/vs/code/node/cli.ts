/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { TPromise } from 'vs/base/common/winjs.base';
import { assign } from 'vs/base/common/objects';
import { parseCLIProcessArgv, buildHelpMessage } from 'vs/platform/environment/node/argv';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import product from 'vs/platform/node/product';
import pkg from 'vs/platform/node/package';

import * as fs from 'fs';
import * as paths from 'path';
import * as os from 'os';

function shouldSpawnCliProcess(argv: ParsedArgs): boolean {
	return argv['list-extensions'] || !!argv['install-extension'] || !!argv['uninstall-extension'];
}

interface IMainCli {
	main: (argv: ParsedArgs) => TPromise<void>;
}

export function main(argv: string[]): TPromise<void> {
	let args: ParsedArgs;

	try {
		args = parseCLIProcessArgv(argv);
	} catch (err) {
		console.error(err.message);
		return TPromise.as(null);
	}

	if (args.help) {
		console.log(buildHelpMessage(product.nameLong, product.applicationName, pkg.version));
	} else if (args.version) {
		console.log(`${pkg.version}\n${product.commit}`);
	} else if (shouldSpawnCliProcess(args)) {
		const mainCli = new TPromise<IMainCli>(c => require(['vs/code/node/cliProcessMain'], c));
		return mainCli.then(cli => cli.main(args));
	} else {
		const env = assign({}, process.env, {
			// this will signal Code that it was spawned from this module
			'VSCODE_CLI': '1',
			'ELECTRON_NO_ATTACH_CONSOLE': '1'
		});

		delete env['ELECTRON_RUN_AS_NODE'];

		if (args.verbose) {
			env['ELECTRON_ENABLE_LOGGING'] = '1';
		}

		// If we are started with --wait create a random temporary file
		// and pass it over to the starting instance. We can use this file
		// to wait for it to be deleted to monitor that the edited file
		// is closed and then exit the waiting process.
		let waitMarkerFilePath: string;
		if (args.wait) {
			let waitMarkerError: Error;
			const randomTmpFile = paths.join(os.tmpdir(), Math.random().toString(36).replace(/[^a-z]+/g, '').substr(0, 10));
			try {
				fs.writeFileSync(randomTmpFile, '');
				waitMarkerFilePath = randomTmpFile;
				argv.push('--waitMarkerFilePath', waitMarkerFilePath);
			} catch (error) {
				waitMarkerError = error;
			}

			if (args.verbose) {
				if (waitMarkerError) {
					console.error(`Failed to create marker file for --wait: ${waitMarkerError.toString()}`);
				} else {
					console.log(`Marker file for --wait created: ${waitMarkerFilePath}`);
				}
			}
		}

		const options = {
			detached: true,
			env
		};

		if (!args.verbose) {
			options['stdio'] = 'ignore';
		}

		const child = spawn(process.execPath, argv.slice(2), options);

		if (args.verbose) {
			child.stdout.on('data', (data: Buffer) => console.log(data.toString('utf8').trim()));
			child.stderr.on('data', (data: Buffer) => console.log(data.toString('utf8').trim()));
		}

		if (args.verbose) {
			return new TPromise<void>(c => child.once('exit', () => c(null)));
		}

		if (args.wait && waitMarkerFilePath) {
			return new TPromise<void>(c => {

				// Complete when process exits
				child.once('exit', () => c(null));

				// Complete when wait marker file is deleted
				const interval = setInterval(() => {
					fs.exists(waitMarkerFilePath, exists => {
						if (!exists) {
							clearInterval(interval);
							c(null);
						}
					});
				}, 1000);
			});
		}
	}

	return TPromise.as(null);
}

function eventuallyExit(code: number): void {
	setTimeout(() => process.exit(code), 0);
}

main(process.argv)
	.then(() => eventuallyExit(0))
	.then(null, err => {
		console.error(err.stack ? err.stack : err);
		eventuallyExit(1);
	});
