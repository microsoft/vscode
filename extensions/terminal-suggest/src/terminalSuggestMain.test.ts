/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import 'mocha';
import { asArray, getCompletionItemsFromSpecs } from './terminalSuggestMain';
import cdSpec from './completions/cd';
import codeCompletionSpec from './completions/code';
import codeInsidersCompletionSpec from './completions/code-insiders';

interface ISuiteSpec {
	name: string;
	completionSpecs: Fig.Spec | Fig.Spec[];
	// TODO: This seems unnecessary, ideally getCompletionItemsFromSpecs would only consider the
	//       spec's completions
	availableCommands: string | string[];
	testSpecs: ITestSpec2[];
}

interface ITestSpec2 {
	input: string;
	// TODO: Instead of expected resources we should mock the file service with a set of files to use
	expectedResourceRequests?: 'files' | 'folders' | 'both';
	expectedCompletions?: string[];
}

function createCodeTestSpecs(executable: string): ITestSpec2[] {
	const codeOptions = ['-', '--add', '--category', '--diff', '--disable-extension', '--disable-extensions', '--disable-gpu', '--enable-proposed-api', '--extensions-dir', '--goto', '--help', '--inspect-brk-extensions', '--inspect-extensions', '--install-extension', '--list-extensions', '--locale', '--log', '--max-memory', '--merge', '--new-window', '--pre-release', '--prof-startup', '--profile', '--reuse-window', '--show-versions', '--status', '--sync', '--telemetry', '--uninstall-extension', '--user-data-dir', '--verbose', '--version', '--wait', '-a', '-d', '-g', '-h', '-m', '-n', '-r', '-s', '-v', '-w'];
	const localeOptions = ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'];
	const categoryOptions = ['azure', 'data science', 'debuggers', 'extension packs', 'education', 'formatters', 'keymaps', 'language packs', 'linters', 'machine learning', 'notebooks', 'programming languages', 'scm providers', 'snippets', 'testing', 'themes', 'visualization', 'other'];
	const logOptions = ['critical', 'error', 'warn', 'info', 'debug', 'trace', 'off'];
	const syncOptions = ['on', 'off'];

	const typingTests: ITestSpec2[] = [];
	for (let i = 1; i < executable.length; i++) {
		typingTests.push({ input: `${executable.slice(0, i)}|`, expectedCompletions: [executable] });
	}

	return [
		// Typing the command
		...typingTests,

		// Basic arguments
		{ input: `${executable} |`, expectedCompletions: codeOptions },
		{ input: `${executable} --locale |`, expectedCompletions: localeOptions },
		{ input: `${executable} --diff |`, expectedResourceRequests: 'files' },
		{ input: `${executable} -di|`, expectedCompletions: codeOptions.filter(o => o.startsWith('di')), expectedResourceRequests: 'both' },
		{ input: `${executable} --diff ./file1 |`, expectedResourceRequests: 'files' },
		{ input: `${executable} --merge |`, expectedResourceRequests: 'files' },
		{ input: `${executable} --merge ./file1 ./file2 |`, expectedResourceRequests: 'files' },
		{ input: `${executable} --merge ./file1 ./file2 ./base |`, expectedResourceRequests: 'files' },
		{ input: `${executable} --goto |`, expectedResourceRequests: 'files' },
		{ input: `${executable} --user-data-dir |`, expectedResourceRequests: 'folders' },
		{ input: `${executable} --profile |` },
		{ input: `${executable} --install-extension |` },
		{ input: `${executable} --uninstall-extension |` },
		{ input: `${executable} --log |`, expectedCompletions: logOptions },
		{ input: `${executable} --sync |`, expectedCompletions: syncOptions },
		{ input: `${executable} --extensions-dir |`, expectedResourceRequests: 'folders' },
		{ input: `${executable} --list-extensions |`, expectedCompletions: codeOptions },
		{ input: `${executable} --show-versions |`, expectedCompletions: codeOptions },
		{ input: `${executable} --category |`, expectedCompletions: categoryOptions },
		{ input: `${executable} --category a|`, expectedCompletions: categoryOptions.filter(c => c.startsWith('a')) },

		// Middle of command
		{ input: `${executable} | --locale`, expectedCompletions: codeOptions },
	];
}

const testSpecs2: ISuiteSpec[] = [
	{
		name: 'cd',
		completionSpecs: cdSpec,
		availableCommands: 'cd',
		testSpecs: [
			// Typing the command
			// TODO: Shouldn't this also request file resources that contain "c" as you can run a file as a command?
			{ input: 'c|', expectedCompletions: ['cd'] },
			// TODO: Shouldn't this also request file resources that contain "cd" as you can run a file as a command?
			{ input: 'cd|', expectedCompletions: ['cd'] },

			// Basic arguments
			{ input: 'cd |', expectedCompletions: ['~', '-'], expectedResourceRequests: 'folders' },
			{ input: 'cd -|', expectedCompletions: ['-'], expectedResourceRequests: 'folders' },
			{ input: 'cd ~|', expectedCompletions: ['~'], expectedResourceRequests: 'folders' },

			// Relative paths
			{ input: 'cd s|', expectedResourceRequests: 'folders' },
			{ input: 'cd src|', expectedResourceRequests: 'folders' },
			{ input: 'cd src/|', expectedResourceRequests: 'folders' },
			{ input: 'cd .|', expectedResourceRequests: 'folders' },
			{ input: 'cd ./|', expectedResourceRequests: 'folders' },
			{ input: 'cd ./src|', expectedResourceRequests: 'folders' },
			{ input: 'cd ..|', expectedResourceRequests: 'folders' },
			{ input: 'cd ../|', expectedResourceRequests: 'folders' },
			{ input: 'cd ../sibling|', expectedResourceRequests: 'folders' },
		]
	},
	{
		name: 'code',
		completionSpecs: codeCompletionSpec,
		availableCommands: 'code',
		testSpecs: createCodeTestSpecs('code')
	},
	{
		name: 'code-insiders',
		completionSpecs: codeInsidersCompletionSpec,
		availableCommands: 'code-insiders',
		testSpecs: createCodeTestSpecs('code-insiders')
	}
];

suite('Terminal Suggest', () => {
	for (const suiteSpec of testSpecs2) {
		suite(suiteSpec.name, () => {
			const completionSpecs = asArray(suiteSpec.completionSpecs);
			const availableCommands = asArray(suiteSpec.availableCommands);
			for (const testSpec of suiteSpec.testSpecs) {
				let expectedString = testSpec.expectedCompletions ? `[${testSpec.expectedCompletions.map(e => `'${e}'`).join(', ')}]` : '[]';
				expectedString += testSpec.expectedResourceRequests ? ` + ${testSpec.expectedResourceRequests}` : '';
				test(`'${testSpec.input}' -> ${expectedString}`, () => {
					const commandLine = testSpec.input.split('|')[0];
					const cursorPosition = testSpec.input.indexOf('|');
					const prefix = commandLine.slice(0, cursorPosition).split(' ').at(-1) || '';
					const filesRequested = testSpec.expectedResourceRequests === 'files' || testSpec.expectedResourceRequests === 'both';
					const foldersRequested = testSpec.expectedResourceRequests === 'folders' || testSpec.expectedResourceRequests === 'both';

					const result = getCompletionItemsFromSpecs(completionSpecs, { commandLine, cursorPosition }, availableCommands, prefix);
					deepStrictEqual(result.items.map(i => i.label).sort(), (testSpec.expectedCompletions ?? []).sort());
					strictEqual(result.filesRequested, filesRequested);
					strictEqual(result.foldersRequested, foldersRequested);
				});
			}
		});
	}
});
