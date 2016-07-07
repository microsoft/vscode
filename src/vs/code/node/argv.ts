/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as minimist from 'minimist';
import { localize } from 'vs/nls';

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
	debugBrkFileWatcherPort: string;
	'disable-extensions': boolean;
	extensionHomePath: string;
	extensionDevelopmentPath: string;
	extensionTestsPath: string;
	timestamp: string;
	debugBrkPluginHost: string;
	debugPluginHost: string;
	'list-extensions': boolean;
	'install-extension': string | string[];
	'uninstall-extension': string | string[];
}

const options: minimist.Opts = {
	string: [
		'locale',
		'user-data-dir',
		'extensionHomePath',
		'extensionDevelopmentPath',
		'extensionTestsPath',
		'timestamp',
		'install-extension',
		'uninstall-extension'
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
		'disable-extensions',
		'list-extensions'
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

export function parseArgs(args: string[]): ParsedArgs {
	return minimist(args, options) as ParsedArgs;
}

const executable = 'code' + (os.platform() === 'win32' ? '.exe' : '');

export const optionsHelp: { [name: string]: string; } = {
	'-d, --diff': localize('diff', "Open a diff editor. Requires to pass two file paths as arguments."),
	'--disable-extensions': localize('disableExtensions', "Disable all installed extensions."),
	'-g, --goto': localize('goto', "Open the file at path at the line and column (add :line[:column] to path)."),
	'--locale <locale>': localize('locale', "The locale to use (e.g. en-US or zh-TW)."),
	'-n, --new-window': localize('newWindow', "Force a new instance of Code."),
	'-r, --reuse-window': localize('reuseWindow', "Force opening a file or folder in the last active window."),
	'--user-data-dir <dir>': localize('userDataDir', "Specifies the directory that user data is kept in, useful when running as root."),
	'--verbose': localize('verbose', "Print verbose output (implies --wait)."),
	'-w, --wait': localize('wait', "Wait for the window to be closed before returning."),
	'--list-extensions': localize('listExtensions', "List the installed extensions."),
	'--install-extension <ext>': localize('installExtension', "Installs an extension."),
	'--uninstall-extension <ext>': localize('uninstallExtension', "Uninstalls an extension."),
	'-v, --version': localize('version', "Print version."),
	'-h, --help': localize('help', "Print usage.")
};

export function formatOptions(options: { [name: string]: string; }, columns: number): string {
	let keys = Object.keys(options);
	let argLength = Math.max.apply(null, keys.map(k => k.length)) + 2/*left padding*/ + 1/*right padding*/;
	if (columns - argLength < 25) {
		// Use a condensed version on narrow terminals
		return keys.reduce((r, key) => r.concat([`  ${ key }`, `      ${ options[key] }`]), []).join('\n');
	}
	let descriptionColumns = columns - argLength - 1;
	let result = '';
	keys.forEach(k => {
		let wrappedDescription = wrapText(options[k], descriptionColumns);
		let keyPadding = (<any>' ').repeat(argLength - k.length - 2/*left padding*/);
		if (result.length > 0) {
			result += '\n';
		}
		result += '  ' + k + keyPadding + wrappedDescription[0];
		for (var i = 1; i < wrappedDescription.length; i++) {
			result += '\n' + (<any>' ').repeat(argLength) + wrappedDescription[i];
		}
	});
	return result;
}

function wrapText(text: string, columns: number) : string[] {
	let lines = [];
	while (text.length) {
		let index = text.length < columns ? text.length : text.lastIndexOf(' ', columns);
		let line = text.slice(0, index).trim();
		text = text.slice(index);
		lines.push(line);
	}
	return lines;
}

export function buildHelpMessage(version: string): string {
	let columns = (<any>process.stdout).isTTY ? (<any>process.stdout).columns : 80;
	return `Visual Studio Code v${ version }


Usage: ${ executable } [arguments] [paths...]

Options:
${formatOptions(optionsHelp, columns)}`;
}