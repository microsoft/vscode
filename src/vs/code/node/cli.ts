/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawn } from 'child_process';
import { TPromise } from 'vs/base/common/winjs.base';
import { assign } from 'vs/base/common/objects';
import { parseArgs, helpMessage, ParsedArgs } from 'vs/code/node/argv';
import pkg from 'vs/platform/package';

function shouldSpawnCliProcess(argv: ParsedArgs): boolean {
	return argv['list-extensions'] || !!argv['install-extension'];
}

interface IMainCli {
	main: (argv: ParsedArgs) => TPromise<void>;
}

export function main(args: string[]): TPromise<void> {
	const argv = parseArgs(args);

	if (argv.help) {
		console.log(helpMessage);
	} else if (argv.version) {
		console.log(pkg.version);
	} else if (shouldSpawnCliProcess(argv)) {
		const mainCli = new TPromise<IMainCli>(c => require(['vs/code/node/cliProcessMain'], c));
		return mainCli.then(cli => cli.main(argv));
	} else {
		const env = assign({}, process.env, {
			// this will signal Code that it was spawned from this module
			'VSCODE_CLI': '1',
			'ELECTRON_NO_ATTACH_CONSOLE': '1'
		});
		delete env['ATOM_SHELL_INTERNAL_RUN_AS_NODE'];

		const child = spawn(process.execPath, args, {
			detached: true,
			stdio: 'ignore',
			env
		});

		if (argv.wait) {
			return new TPromise<void>(c => child.once('exit', ()=> c(null)));
		}
	}

	return TPromise.as(null);
}

main(process.argv.slice(2))
	.then(() => process.exit(0))
	.then(null, err => {
		console.error(err.stack ? err.stack : err);
		process.exit(1);
	});
