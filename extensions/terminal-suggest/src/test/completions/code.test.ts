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
	'-m <file> <file> <base> <result>',
	'-n',
	'-r',
	'-s',
	'-v',
	'-w',
	'-',
	'--add <folder>',
	'--add-mcp <json>',
	'--category <category>',
	'--diff <file> <file>',
	'--disable-chromium-sandbox',
	'--disable-extension <extension-id>',
	'--disable-extensions',
	'--disable-gpu',
	'--disable-lcd-text',
	'--enable-proposed-api <extension-id>',
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
	'--merge <file> <file> <base> <result>',
	'--new-window',
	'--pre-release',
	'--prof-startup',
	'--profile <profileName>',
	'--remove <folder>',
	'--reuse-window',
	'--show-versions',
	'--status',
	'--sync <sync>',
	'--telemetry',
	'--transient',
	'--uninstall-extension <extension-id>',
	'--update-extensions',
	'--user-data-dir <dir>',
	'--verbose',
	'--version',
	'--wait',
	'tunnel',
	'chat [<prompt>]',
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
	const chatOptions = ['--add-file <file>', '--help', '--maximize', '--mode <mode>', '--new-window', '--reuse-window', '-a <file>', '-h', '-m <mode>', '-n', '-r'];

	const typingTests: ITestSpec[] = [];
	for (let i = 1; i < executable.length; i++) {
		const expectedCompletions = [{ label: executable, description: executable === codeCompletionSpec.name ? (codeCompletionSpec as Fig.Subcommand).description : (codeInsidersCompletionSpec as Fig.Subcommand).description }];
		const input = `${executable.slice(0, i)}|`;
		typingTests.push({ input, expectedCompletions, expectedResourceRequests: input.endsWith(' ') ? undefined : { type: 'both', cwd: testPaths.cwd } });
	}

	return [
		// Typing the command
		...typingTests,

		// Basic arguments
		{ input: `${executable} |`, expectedCompletions: codeSpecOptionsAndSubcommands, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		// Test for --remove
		{ input: `${executable} --remove |`, expectedResourceRequests: { type: 'folders', cwd: testPaths.cwd } },
		// Test for --add-mcp
		{ input: `${executable} --add-mcp |`, expectedCompletions: [] },
		// Test for --update-extensions
		{ input: `${executable} --update-extensions |`, expectedCompletions: codeSpecOptionsAndSubcommands.filter(c => c !== '--update-extensions'), expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		// Test for --disable-lcd-text
		{ input: `${executable} --disable-lcd-text |`, expectedCompletions: codeSpecOptionsAndSubcommands.filter(c => c !== '--disable-lcd-text'), expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		// Test for --disable-chromium-sandbox
		{ input: `${executable} --disable-chromium-sandbox |`, expectedCompletions: codeSpecOptionsAndSubcommands.filter(c => c !== '--disable-chromium-sandbox'), expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
		// Test for --enable-proposed-api variadic
		{ input: `${executable} --enable-proposed-api |`, expectedCompletions: [executable] },
		// Test for --log repeatable and extension-specific
		{ input: `${executable} --log |`, expectedCompletions: logOptions },
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

		// Chat subcommand tests
		{ input: `${executable} chat |`, expectedCompletions: chatOptions },
		{ input: `${executable} chat --mode |`, expectedCompletions: ['agent', 'ask', 'edit'] },
		{ input: `${executable} chat --add-file |`, expectedResourceRequests: { type: 'files', cwd: testPaths.cwd } },

		// Middle of command
		{ input: `${executable} | --locale`, expectedCompletions: codeSpecOptionsAndSubcommands, expectedResourceRequests: { type: 'both', cwd: testPaths.cwd } },
	];
}

export function createCodeTunnelTestSpecs(executable: string): ITestSpec[] {
	const subcommandAndFlags: string[] = [
		'-',
		'--add <folder>',
		'--add-mcp <json>',
		'--category <category>',
		'--cli-data-dir <cli_data_dir>',
		'--diff <file> <file>',
		'--disable-chromium-sandbox',
		'--disable-extension <extension-id>',
		'--disable-extensions',
		'--disable-gpu',
		'--disable-lcd-text',
		'--enable-proposed-api <extension-id>',
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
		'--merge <file> <file> <base> <result>',
		'--new-window',
		'--pre-release',
		'--prof-startup',
		'--profile <profileName>',
		'--remove <folder>',
		'--reuse-window',
		'--show-versions',
		'--status',
		'--sync <sync>',
		'--telemetry',
		'--transient',
		'--uninstall-extension <extension-id>',
		'--update-extensions',
		'--use-version [<use_version>]',
		'--user-data-dir [<user_data_dir>]',
		'--verbose',
		'--version',
		'--wait',
		'-a <folder>',
		'-d <file> <file>',
		'-g <file:line[:character]>',
		'-h',
		'-m <file> <file> <base> <result>',
		'-n',
		'-r',
		'-s',
		'-v',
		'-w',
		'chat [<prompt>]',
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
		const expectedCompletions = [{ label: executable, description: executable === codeCompletionSpec.name || executable === codeTunnelCompletionSpec.name ? (codeCompletionSpec as Fig.Subcommand).description : (codeInsidersCompletionSpec as Fig.Subcommand).description }];
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
		{ input: `${executable} chat |`, expectedCompletions: ['--mode <mode>', '--add-file <file>', '--help', '--maximize', '--new-window', '--reuse-window', '-m <mode>', '-a <file>', '-h', '-n', '-r'] },
		{ input: `${executable} chat --mode |`, expectedCompletions: ['agent', 'ask', 'edit'] },
		{ input: `${executable} chat --add-file |`, expectedResourceRequests: { type: 'files', cwd: testPaths.cwd } },
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
