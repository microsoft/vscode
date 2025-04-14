/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import codeCompletionSpec from '../../completions/code';
import { testPaths, type ISuiteSpec, type ITestSpec } from '../helpers';
import codeInsidersCompletionSpec from '../../completions/code-insiders';
import codeTunnelCompletionSpec from '../../completions/code-tunnel';

export const codeSpecOptionsAndSubcommands = [
	'-a <folder>',
	'-d <file> <file>',
	'-g <file:line[:character]>',
	'-h',
	'-m <path1> <path2> <base> <result>',
	'-n',
	'-r',
	'-s',
	'-v',
	'-w',
	'-',
	'--add <folder>',
	'--category <category>',
	'--diff <file> <file>',
	'--disable-extension <extension-id>',
	'--disable-extensions',
	'--disable-gpu',
	'--enable-proposed-api',
	'--extensions-dir <dir>',
	'--goto <file:line[:character]>',
	'--help',
	'--inspect-brk-extensions <port>',
	'--inspect-extensions <port>',
	'--install-extension <extension-id[@version] | path-to-vsix>',
	'--list-extensions',
	'--locale <locale>',
	'--locate-shell-integration-path <shell>',
	'--log <level>',
	'--max-memory <memory>',
	'--merge <path1> <path2> <base> <result>',
	'--new-window',
	'--pre-release',
	'--prof-startup',
	'--profile <settingsProfileName>',
	'--reuse-window',
	'--show-versions',
	'--status',
	'--sync <sync>',
	'--telemetry',
	'--uninstall-extension <extension-id>',
	'--user-data-dir <dir>',
	'--verbose',
	'--version',
	'--wait',
	'tunnel',
	'serve-web',
	'help',
	'status',
	'version'
];

export function createCodeTestSpecs(executable: string): ITestSpec[] {
	const localeOptions = ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'];
	const categoryOptions = ['azure', 'data science', 'debuggers', 'extension packs', 'education', 'formatters', 'keymaps', 'language packs', 'linters', 'machine learning', 'notebooks', 'programming languages', 'scm providers', 'snippets', 'testing', 'themes', 'visualization', 'other'];
	const logOptions = ['critical', 'error', 'warn', 'info', 'debug', 'trace', 'off'];
	const syncOptions = ['on', 'off'];

	const typingTests: ITestSpec[] = [];
	for (let i = 1; i < executable.length; i++) {
		const expectedCompletions = [{ label: executable, description: executable === codeCompletionSpec.name ? (codeCompletionSpec as any).description : (codeInsidersCompletionSpec as any).description }];
		const input = `${executable.slice(0, i)}|`;
		typingTests.push({ input, expectedCompletions, expectedResourceRequests: input.endsWith(' ') ? undefined : { type: 'both', cwd: testPaths.cwd } });
	}

	return [
		// Typing the command
		...typingTests,

		// Basic arguments
		{ input: `${executable} |`, expectedCompletions: codeSpecOptionsAndSubcommands, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: `${executable} --locale |`, expectedCompletions: localeOptions },
		{ input: `${executable} --diff |`, expectedResourceRequests: { type: 'files', cwd: testPaths.cwd } },
		{ input: `${executable} --diff ./file1 |`, expectedResourceRequests: { type: 'files', cwd: testPaths.cwd } },
		{ input: `${executable} --merge |`, expectedResourceRequests: { type: 'files', cwd: testPaths.cwd } },
		{ input: `${executable} --merge ./file1 ./file2 |`, expectedResourceRequests: { type: 'files', cwd: testPaths.cwd } },
		{ input: `${executable} --merge ./file1 ./file2 ./base |`, expectedResourceRequests: { type: 'files', cwd: testPaths.cwd } },
		{ input: `${executable} --goto |`, expectedResourceRequests: { type: 'files', cwd: testPaths.cwd } },
		{ input: `${executable} --user-data-dir |`, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: `${executable} --profile |` },
		{ input: `${executable} --install-extension |`, expectedCompletions: [executable], expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: `${executable} --uninstall-extension |`, expectedCompletions: [executable] },
		{ input: `${executable} --disable-extension |`, expectedCompletions: [executable] },
		{ input: `${executable} --log |`, expectedCompletions: logOptions },
		{ input: `${executable} --sync |`, expectedCompletions: syncOptions },
		{ input: `${executable} --extensions-dir |`, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		{ input: `${executable} --list-extensions |`, expectedCompletions: codeSpecOptionsAndSubcommands.filter(c => c !== '--list-extensions'), expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: `${executable} --show-versions |`, expectedCompletions: codeSpecOptionsAndSubcommands.filter(c => c !== '--show-versions'), expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: `${executable} --category |`, expectedCompletions: categoryOptions },
		{ input: `${executable} --category a|`, expectedCompletions: categoryOptions },

		// Middle of command
		{ input: `${executable} | --locale`, expectedCompletions: codeSpecOptionsAndSubcommands, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
	];
}

export function createCodeTunnelTestSpecs(executable: string): ITestSpec[] {
	const subcommandAndFlags: string[] = [
		'-',
		'--add <folder>',
		'--category <category>',
		'--cli-data-dir <cli_data_dir>',
		'--diff <file> <file>',
		'--disable-extension <extension-id>',
		'--disable-extensions',
		'--disable-gpu',
		'--enable-proposed-api',
		'--extensions-dir [<extensions_dir>]',
		'--goto <file:line[:character]>',
		'--help',
		'--inspect-brk-extensions <port>',
		'--inspect-extensions <port>',
		'--install-extension <extension-id[@version] | path-to-vsix>',
		'--list-extensions',
		'--locale <locale>',
		'--locate-shell-integration-path <shell>',
		'--log [<log>]',
		'--max-memory <memory>',
		'--merge <path1> <path2> <base> <result>',
		'--new-window',
		'--pre-release',
		'--prof-startup',
		'--profile <settingsProfileName>',
		'--reuse-window',
		'--show-versions',
		'--status',
		'--sync <sync>',
		'--telemetry',
		'--uninstall-extension <extension-id>',
		'--use-version [<use_version>]',
		'--user-data-dir [<user_data_dir>]',
		'--verbose',
		'--version',
		'--wait',
		'-a <folder>',
		'-d <file> <file>',
		'-g <file:line[:character]>',
		'-h',
		'-m <path1> <path2> <base> <result>',
		'-n',
		'-r',
		'-s',
		'-v',
		'-w',
		'ext',
		'help',
		'serve-web',
		'status',
		'tunnel',
		'version'
	];
	const tunnelSubcommandsAndFlags: string[] = [
		'--accept-server-license-terms',
		'--cli-data-dir <cli_data_dir>',
		'--extensions-dir [<extensions_dir>]',
		'--help',
		'--install-extension [<install_extension>]',
		'--log [<log>]',
		'--name [<name>]',
		'--no-sleep',
		'--random-name',
		'--server-data-dir [<server_data_dir>]',
		'--use-version [<use_version>]',
		'--user-data-dir [<user_data_dir>]',
		'--verbose',
		'-h',
		'help',
		'kill',
		'prune',
		'rename <name>',
		'restart',
		'service',
		'status',
		'unregister',
		'user',
	];

	const helpSubcommands: string[] = [
		'help',
		'kill',
		'prune',
		'rename',
		'restart',
		'service',
		'status',
		'unregister',
		'user'
	];
	const serveWebSubcommandsAndFlags: string[] = [
		'--accept-server-license-terms',
		'--cli-data-dir <cli_data_dir>',
		'--connection-token [<connection_token>]',
		'--connection-token-file [<connection_token_file>]',
		'--help',
		'--host [<host>]',
		'--log [<log>]',
		'--port [<port>]',
		'--server-base-path [<server_base_path>]',
		'--server-data-dir [<server_data_dir>]',
		'--socket-path [<socket_path>]',
		'--verbose',
		'--without-connection-token',
		'-h'
	];

	const extSubcommands: string[] = [
		'install [<ext-id | id>]',
		'list',
		'uninstall [<ext-id | id>]',
		'update'
	];

	const commonFlags: string[] = [
		'--cli-data-dir <cli_data_dir>',
		'--log [<log>]',
		'--verbose',
		'--help',
		'-h'
	];

	const typingTests: ITestSpec[] = [];
	for (let i = 1; i < executable.length; i++) {
		const expectedCompletions = [{ label: executable, description: executable === codeCompletionSpec.name || executable === codeTunnelCompletionSpec.name ? (codeCompletionSpec as any).description : (codeInsidersCompletionSpec as any).description }];
		const input = `${executable.slice(0, i)}|`;
		typingTests.push({ input, expectedCompletions, expectedResourceRequests: input.endsWith(' ') ? undefined : { type: 'both', cwd: testPaths.cwd } });
	}

	return [
		...typingTests,
		{ input: `${executable} |`, expectedCompletions: subcommandAndFlags, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		{ input: `${executable} tunnel |`, expectedCompletions: tunnelSubcommandsAndFlags },
		{ input: `${executable} tunnel user |`, expectedCompletions: ['help', 'login', 'logout', 'show'] },
		{ input: `${executable} tunnel prune |`, expectedCompletions: [...commonFlags] },
		{ input: `${executable} tunnel kill |`, expectedCompletions: [...commonFlags] },
		{ input: `${executable} tunnel restart |`, expectedCompletions: [...commonFlags] },
		{ input: `${executable} tunnel status |`, expectedCompletions: [...commonFlags] },
		{ input: `${executable} tunnel rename |`, expectedCompletions: [...commonFlags] },
		{ input: `${executable} tunnel unregister |`, expectedCompletions: [...commonFlags] },
		{ input: `${executable} tunnel service |`, expectedCompletions: [...commonFlags, 'help', 'install', 'log', 'uninstall'] },
		{ input: `${executable} tunnel help |`, expectedCompletions: helpSubcommands },
		{ input: `${executable} serve-web |`, expectedCompletions: serveWebSubcommandsAndFlags },
		{ input: `${executable} ext |`, expectedCompletions: extSubcommands },
		{ input: `${executable} ext list |`, expectedCompletions: [...commonFlags, '--category [<category>]', '--show-versions'] },
		{ input: `${executable} ext install |`, expectedCompletions: [...commonFlags, '--pre-release', '--donot-include-pack-and-dependencies', '--force'] },
		{ input: `${executable} ext update |`, expectedCompletions: [...commonFlags] },
		{ input: `${executable} status |`, expectedCompletions: commonFlags },
		{ input: `${executable} version |`, expectedCompletions: commonFlags },

	];
}

export const codeTestSuite: ISuiteSpec = {
	name: 'code',
	completionSpecs: codeCompletionSpec,
	availableCommands: 'code',
	testSpecs: createCodeTestSpecs('code')
};

export const codeTunnelTestSuite: ISuiteSpec = {
	name: 'code-tunnel',
	completionSpecs: codeTunnelCompletionSpec,
	availableCommands: 'code-tunnel',
	testSpecs: createCodeTunnelTestSpecs('code-tunnel')
};
