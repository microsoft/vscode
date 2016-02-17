/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import uri from 'vs/base/common/uri';

const rootPath = path.dirname(uri.parse(require.toUrl('')).fsPath);
const packageJsonPath = path.join(rootPath, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

class ArgParser {

	constructor(private argv: string[]) {}

	hasFlag(flag, alias): boolean {
		return (flag && this.argv.indexOf('--' + flag) >= 0)
			|| (alias && this.argv.indexOf('-' + alias) >= 0);
	}

	help(): string {
		const executable = 'code' + (os.platform() === 'win32' ? '.exe' : '');

		return `Visual Studio Code v${ packageJson.version }

Usage: ${ executable } [arguments] [paths...]

Options:
	-h, --help     Print usage.
	--locale       Use a specific locale.
	-n             Force a new instance of Code.
	-v, --version  Print version.`;
	}
}

export function main(argv: string[]) {
	const argParser = new ArgParser(argv);

	if (argParser.hasFlag('help', 'h')) {
		console.log(argParser.help());
	} else if (argParser.hasFlag('version', 'v')) {
		console.log(packageJson.version);
	} else {
		delete process.env['ATOM_SHELL_INTERNAL_RUN_AS_NODE'];
		spawn(process.execPath, process.argv.slice(2), { detached: true, stdio: 'ignore' });
	}

	process.exit(0);
}

main(process.argv.slice(2));
