/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import uri from 'vs/base/common/uri';
import { assign } from 'vs/base/common/objects';
import { parseArgs } from './argv';

const rootPath = path.dirname(uri.parse(require.toUrl('')).fsPath);
const packageJsonPath = path.join(rootPath, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const executable = 'code' + (os.platform() === 'win32' ? '.exe' : '');
const indent = '  ';
const help = `Visual Studio Code v${ packageJson.version }

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
${ indent }--user-data-dir=DIR   Specifies the directory that user data is kept in,
${ indent }                      useful when running as root.
${ indent }-v, --version         Print version.
${ indent }-w, --wait            Wait for the window to be closed before returning.`;

export function main(args: string[]) {
	const argv = parseArgs(args);

	if (argv.help) {
		console.log(help);
	} else if (argv.version) {
		console.log(packageJson.version);
	} else {
		const env = assign({}, process.env);
		delete env['ATOM_SHELL_INTERNAL_RUN_AS_NODE'];

		const child = spawn(process.execPath, args, {
			detached: true,
			stdio: 'ignore',
			env
		});

		if (argv.wait) {
			child.on('exit', process.exit);
			return;
		}
	}

	process.exit(0);
}

main(process.argv.slice(2));
