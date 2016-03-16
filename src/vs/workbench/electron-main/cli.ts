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
		const indent = '  ';
		return `Visual Studio Code v${ packageJson.version }

Usage: ${ executable } [arguments] [paths...]

Options:
${ indent }-d, --diff            Open a diff editor. Requires to pass two file paths
${ indent }                      as arguments.
${ indent }--disable-extensions  Disable all installed extensions.
${ indent }-g, --goto            Open the file at path at the line and column (add
${ indent }                      :line[:column] to path).
${ indent }-h, --help            Print usage.
${ indent }--locale=LOCALE       The locale to use (e.g. en-US or zh-TW).
${ indent }-n, --new-window      Force a new instance of Code.
${ indent }-r, --reuse-window    Force opening a file or folder in the last active
${ indent }                      window.
${ indent }-v, --version         Print version.
${ indent }-w, --wait            Wait for the window to be closed before returning.`;
	}
}

export function main(argv: string[]) {
	const argParser = new ArgParser(argv);
	let exit = true;

	if (argParser.hasFlag('help', 'h')) {
		console.log(argParser.help());
	} else if (argParser.hasFlag('version', 'v')) {
		console.log(packageJson.version);
	} else {
		delete process.env['ATOM_SHELL_INTERNAL_RUN_AS_NODE'];
		if (argParser.hasFlag('wait', 'w')) {
			exit = false;

			let child = spawn(process.execPath, process.argv.slice(2), { stdio: 'ignore' });
			child.on('exit', process.exit);
		} else {
			spawn(process.execPath, process.argv.slice(2), { detached: true, stdio: 'ignore' });
		}
	}

	if (exit) {
		process.exit(0);
	}
}

main(process.argv.slice(2));
