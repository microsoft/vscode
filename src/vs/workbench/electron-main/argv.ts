/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as minimist from 'minimist';
import pkg from './package';

export interface ParsedArgs extends minimist.ParsedArgs {
	help: boolean;
	version: boolean;
	wait: boolean;
	diff: boolean;
	goto: boolean;
	'new-window': boolean;
	'reuse-window': boolean;
	locale: string;
	'user-data-dir': string;
	performance: boolean;
	verbose: boolean;
	logExtensionHostCommunication: boolean;
	'disable-extensions': boolean;
	extensionHomePath: string;
	extensionDevelopmentPath: string;
	extensionTestsPath: string;
	timestamp: string;
	debugBrkPluginHost: string;
	debugPluginHost: string;
}

const options: minimist.Opts = {
	string: [
		'locale',
		'user-data-dir',
		'extensionHomePath',
		'extensionDevelopmentPath',
		'extensionTestsPath',
		'timestamp'
	],
	boolean: [
		'help',
		'version',
		'wait',
		'diff',
		'goto',
		'new-window',
		'reuse-window',
		'performance',
		'verbose',
		'logExtensionHostCommunication',
		'disable-extensions'
	],
	alias: {
		help: 'h',
		version: 'v',
		wait: 'w',
		diff: 'd',
		goto: 'g',
		'new-window': 'n',
		'reuse-window': 'r',
		performance: 'p',
		'disable-extensions': 'disableExtensions'
	}
};

export function parseArgs(args: string[]) {
	return minimist(args, options) as ParsedArgs;
}

const executable = 'code' + (os.platform() === 'win32' ? '.exe' : '');
const indent = '  ';
export const helpMessage = `Visual Studio Code v${ pkg.version }

Usage: ${ executable } [arguments] [paths...]

Options:
${ indent }-d, --diff            Open a diff editor. Requires to pass two file paths
${ indent }                      as arguments.
${ indent }--disable-extensions  Disable all installed extensions.
${ indent }-g, --goto            Open the file at path at the line and column (add
${ indent }                      :line[:column] to path).
${ indent }-h, --help            Print usage.
${ indent }--locale <locale>     The locale to use (e.g. en-US or zh-TW).
${ indent }-n, --new-window      Force a new instance of Code.
${ indent }-r, --reuse-window    Force opening a file or folder in the last active
${ indent }                      window.
${ indent }--user-data-dir <dir> Specifies the directory that user data is kept in,
${ indent }                      useful when running as root.
${ indent }-v, --version         Print version.
${ indent }-w, --wait            Wait for the window to be closed before returning.`;
