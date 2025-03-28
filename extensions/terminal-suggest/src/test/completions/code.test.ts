/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import codeCompletionSpec from '../../completions/code';
import { testPaths, type ISuiteSpec, type ITestSpec } from '../helpers';
import codeInsidersCompletionSpec from '../../completions/code-insiders';

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

export const codeTestSuite: ISuiteSpec = {
	name: 'code',
	completionSpecs: codeCompletionSpec,
	availableCommands: 'code',
	testSpecs: createCodeTestSpecs('code')
};
