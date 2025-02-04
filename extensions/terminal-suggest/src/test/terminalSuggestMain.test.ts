/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { deepStrictEqual, strictEqual } from 'assert';
import 'mocha';
import { asArray, getCompletionItemsFromSpecs } from '../terminalSuggestMain';
import cdSpec from '../completions/cd';
import codeCompletionSpec from '../completions/code';
import codeInsidersCompletionSpec from '../completions/code-insiders';
import type { Uri } from 'vscode';
import { basename } from 'path';
import { getTokenType } from '../tokens';

const fixtureDir = vscode.Uri.joinPath(vscode.Uri.file(__dirname), '../../testWorkspace');
const testCwdParent = vscode.Uri.joinPath(fixtureDir, 'parent');
const testCwd = vscode.Uri.joinPath(fixtureDir, 'parent/home');
const testCwdChild = vscode.Uri.joinPath(fixtureDir, 'parent/home/child');

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
	expectedResourceRequests?: {
		type: 'files' | 'folders' | 'both';
		cwd: Uri;
	};
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
		const input = `${executable.slice(0, i)}|`;
		typingTests.push({ input, expectedCompletions: [executable], expectedResourceRequests: input.endsWith(' ') ? undefined : { type: 'both', cwd: testCwd } });
	}

	return [
		// Typing the command
		...typingTests,

		// Basic arguments
		{ input: `${executable} |`, expectedCompletions: codeOptions },
		{ input: `${executable} --locale |`, expectedCompletions: localeOptions },
		{ input: `${executable} --diff |`, expectedResourceRequests: { type: 'files', cwd: testCwd } },
		{ input: `${executable} --diff ./file1 |`, expectedResourceRequests: { type: 'files', cwd: testCwd } },
		{ input: `${executable} --merge |`, expectedResourceRequests: { type: 'files', cwd: testCwd } },
		{ input: `${executable} --merge ./file1 ./file2 |`, expectedResourceRequests: { type: 'files', cwd: testCwd } },
		{ input: `${executable} --merge ./file1 ./file2 ./base |`, expectedResourceRequests: { type: 'files', cwd: testCwd } },
		{ input: `${executable} --goto |`, expectedResourceRequests: { type: 'files', cwd: testCwd } },
		{ input: `${executable} --user-data-dir |`, expectedResourceRequests: { type: 'folders', cwd: testCwd } },
		{ input: `${executable} --profile |`, expectedResourceRequests: { type: 'both', cwd: testCwd } },
		{ input: `${executable} --install-extension |`, expectedResourceRequests: { type: 'both', cwd: testCwd } },
		{ input: `${executable} --uninstall-extension |`, expectedResourceRequests: { type: 'both', cwd: testCwd } },
		{ input: `${executable} --log |`, expectedCompletions: logOptions },
		{ input: `${executable} --sync |`, expectedCompletions: syncOptions },
		{ input: `${executable} --extensions-dir |`, expectedResourceRequests: { type: 'folders', cwd: testCwd } },
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
		name: 'Fallback to default completions',
		completionSpecs: [],
		availableCommands: [],
		testSpecs: [
			{ input: '|', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testCwd } },
			{ input: '|.', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testCwd } },
			{ input: '|./', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testCwd } },
			{ input: 'fakecommand |', expectedCompletions: [], expectedResourceRequests: { type: 'both', cwd: testCwd } },
		]
	},
	{
		name: 'cd',
		completionSpecs: cdSpec,
		availableCommands: 'cd',
		testSpecs: [
			// Typing a path
			{ input: '.|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testCwd } },
			{ input: './|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testCwd } },
			{ input: './.|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testCwd } },
			// Typing the command
			{ input: 'c|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testCwd } },
			{ input: 'cd|', expectedCompletions: ['cd'], expectedResourceRequests: { type: 'both', cwd: testCwd } },

			// Basic arguments
			{ input: 'cd |', expectedCompletions: ['~', '-'], expectedResourceRequests: { type: 'folders', cwd: testCwd } },
			{ input: 'cd -|', expectedCompletions: ['-'], expectedResourceRequests: { type: 'folders', cwd: testCwd } },
			{ input: 'cd ~|', expectedCompletions: ['~'], expectedResourceRequests: { type: 'folders', cwd: testCwd } },

			// Relative paths
			{ input: 'cd c|', expectedResourceRequests: { type: 'folders', cwd: testCwd } },
			{ input: 'cd child|', expectedResourceRequests: { type: 'folders', cwd: testCwd } },
			{ input: 'cd .|', expectedResourceRequests: { type: 'folders', cwd: testCwd } },
			{ input: 'cd ./|', expectedResourceRequests: { type: 'folders', cwd: testCwd } },
			{ input: 'cd ./child|', expectedResourceRequests: { type: 'folders', cwd: testCwd } },
			{ input: 'cd ..|', expectedResourceRequests: { type: 'folders', cwd: testCwd } },

			// Relative directories (changes cwd due to /)
			{ input: 'cd child/|', expectedResourceRequests: { type: 'folders', cwd: testCwdChild } },
			{ input: 'cd ../|', expectedResourceRequests: { type: 'folders', cwd: testCwdParent } },
			{ input: 'cd ../sibling|', expectedResourceRequests: { type: 'folders', cwd: testCwdParent } },
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
				if (testSpec.expectedResourceRequests) {
					expectedString += ` + ${testSpec.expectedResourceRequests.type}`;
					if (testSpec.expectedResourceRequests.cwd.fsPath !== testCwd.fsPath) {
						expectedString += ` @ ${basename(testSpec.expectedResourceRequests.cwd.fsPath)}/`;
					}
				}
				test(`'${testSpec.input}' -> ${expectedString}`, async () => {
					const commandLine = testSpec.input.split('|')[0];
					const cursorPosition = testSpec.input.indexOf('|');
					const prefix = commandLine.slice(0, cursorPosition).split(' ').at(-1) || '';
					const filesRequested = testSpec.expectedResourceRequests?.type === 'files' || testSpec.expectedResourceRequests?.type === 'both';
					const foldersRequested = testSpec.expectedResourceRequests?.type === 'folders' || testSpec.expectedResourceRequests?.type === 'both';
					const terminalContext = { commandLine, cursorPosition };
					const result = await getCompletionItemsFromSpecs(completionSpecs, terminalContext, availableCommands.map(c => { return { label: c }; }), prefix, getTokenType(terminalContext, undefined), testCwd);
					deepStrictEqual(result.items.map(i => i.label).sort(), (testSpec.expectedCompletions ?? []).sort());
					strictEqual(result.filesRequested, filesRequested);
					strictEqual(result.foldersRequested, foldersRequested);
					if (testSpec.expectedResourceRequests?.cwd) {
						strictEqual(result.cwd?.fsPath, testSpec.expectedResourceRequests.cwd.fsPath);
					}
				});
			}
		});
	}
});
