/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import 'mocha';
import { availableSpecs, getCompletionItemsFromSpecs } from './terminalSuggestMain';

const availableCommands = ['cd', 'code', 'code-insiders', 'c++', 'c.test', 'dir', 'ls'];
const codeOptions = ['-', '--add', '--category', '--diff', '--disable-extension', '--disable-extensions', '--disable-gpu', '--enable-proposed-api', '--extensions-dir', '--goto', '--help', '--inspect-brk-extensions', '--inspect-extensions', '--install-extension', '--list-extensions', '--locale', '--log', '--max-memory', '--merge', '--new-window', '--pre-release', '--prof-startup', '--profile', '--reuse-window', '--show-versions', '--status', '--sync', '--telemetry', '--uninstall-extension', '--user-data-dir', '--verbose', '--version', '--wait', '-a', '-d', '-g', '-h', '-m', '-n', '-r', '-s', '-v', '-w'];
const localeOptions = ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'];
const categoryOptions = ['azure', 'data science', 'debuggers', 'extension packs', 'education', 'formatters', 'keymaps', 'language packs', 'linters', 'machine learning', 'notebooks', 'programming languages', 'scm providers', 'snippets', 'testing', 'themes', 'visualization', 'other'];
const logOptions = ['critical', 'error', 'warn', 'info', 'debug', 'trace', 'off'];
const syncOptions = ['on', 'off'];

const testSpecs: ITestSpec[] = [
	{ input: '|', expectedCompletionLabels: availableCommands, resourcesRequested: 'both' },
	{ input: 'c|', expectedCompletionLabels: availableCommands.filter(c => c.startsWith('c')) },
	{ input: 'ls && c|', expectedCompletionLabels: availableCommands.filter(c => c.startsWith('c')) },
	{ input: 'cd |', expectedCompletionLabels: ['~', '-'], resourcesRequested: 'folders' },
	{ input: 'cd .|', resourcesRequested: 'folders' },
	{ input: 'cd ..|', resourcesRequested: 'folders' },
	{ input: 'code|', expectedCompletionLabels: ['code', 'code-insiders'] },
	{ input: 'code-insiders|', expectedCompletionLabels: ['code-insiders'] },
	{ input: 'code |', expectedCompletionLabels: codeOptions },
	{ input: 'code --locale |', expectedCompletionLabels: localeOptions },
	{ input: 'code --diff |', resourcesRequested: 'files' },
	{ input: 'code -di|', expectedCompletionLabels: codeOptions.filter(o => o.startsWith('di')), resourcesRequested: 'both' },
	{ input: 'code --diff ./file1 |', resourcesRequested: 'files' },
	{ input: 'code --merge |', resourcesRequested: 'files' },
	{ input: 'code --merge ./file1 ./file2 |', resourcesRequested: 'files' },
	{ input: 'code --merge ./file1 ./file2 ./base |', resourcesRequested: 'files' },
	{ input: 'code --goto |', resourcesRequested: 'files' },
	{ input: 'code --user-data-dir |', resourcesRequested: 'folders' },
	{ input: 'code --profile |' },
	{ input: 'code --install-extension |' },
	{ input: 'code --uninstall-extension |' },
	{ input: 'code --log |', expectedCompletionLabels: logOptions },
	{ input: 'code --sync |', expectedCompletionLabels: syncOptions },
	{ input: 'code --extensions-dir |', resourcesRequested: 'folders' },
	{ input: 'code --list-extensions |', expectedCompletionLabels: codeOptions },
	{ input: 'code --show-versions |', expectedCompletionLabels: codeOptions },
	{ input: 'code --category |', expectedCompletionLabels: categoryOptions },
	{ input: 'code --category a|', expectedCompletionLabels: categoryOptions.filter(c => c.startsWith('a')) },
	{ input: 'code-insiders --list-extensions |', expectedCompletionLabels: codeOptions },
	{ input: 'code-insiders --show-versions |', expectedCompletionLabels: codeOptions },
	{ input: 'code-insiders --category |', expectedCompletionLabels: categoryOptions },
	{ input: 'code-insiders --category a|', expectedCompletionLabels: categoryOptions.filter(c => c.startsWith('a')) },
	{ input: 'code-insiders --category azure |' },
	{ input: 'code | --locale', expectedCompletionLabels: codeOptions },
	{ input: 'code --locale | && ls', expectedCompletionLabels: localeOptions },
	{ input: 'code-insiders | --locale', expectedCompletionLabels: codeOptions },
	{ input: 'code-insiders --locale | && ls', expectedCompletionLabels: localeOptions }
];

interface ITestSpec {
	input: string;
	expectedCompletionLabels?: string[];
	resourcesRequested?: 'files' | 'folders' | 'both';
}

suite('Terminal Suggest', () => {
	for (const testSpec of testSpecs) {
		test(testSpec.input, () => {
			const commandLine = testSpec.input.split('|')[0];
			const cursorPosition = testSpec.input.indexOf('|');
			const prefix = commandLine.slice(0, cursorPosition).split(' ').at(-1) || '';
			const filesRequested = testSpec.resourcesRequested === 'files' || testSpec.resourcesRequested === 'both';
			const foldersRequested = testSpec.resourcesRequested === 'folders' || testSpec.resourcesRequested === 'both';
			const result = getCompletionItemsFromSpecs(availableSpecs, { commandLine, cursorPosition }, availableCommands, prefix);
			deepStrictEqual(result.items.map(i => i.label).sort(), (testSpec.expectedCompletionLabels ?? []).sort());
			strictEqual(result.filesRequested, filesRequested);
			strictEqual(result.foldersRequested, foldersRequested);
		});
	}
});
