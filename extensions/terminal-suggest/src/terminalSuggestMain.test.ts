/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import 'mocha';
import { availableSpecs, getCompletionItemsFromSpecs } from './terminalSuggestMain';

const availableCommands = ['cd', 'code', 'code-insiders'];
const codeOptions = ['-', '--add', '--category', '--diff', '--disable-extension', '--disable-extensions', '--disable-gpu', '--enable-proposed-api', '--extensions-dir', '--goto', '--help', '--inspect-brk-extensions', '--inspect-extensions', '--install-extension', '--list-extensions', '--locale', '--log', '--max-memory', '--merge', '--new-window', '--pre-release', '--prof-startup', '--profile', '--reuse-window', '--show-versions', '--status', '--sync', '--telemetry', '--uninstall-extension', '--user-data-dir', '--verbose', '--version', '--wait', '-a', '-d', '-g', '-h', '-m', '-n', '-r', '-s', '-v', '-w'];

const testSpecs: ITestSpec[] = [
	{ input: '|', expectedCompletionLabels: availableCommands },
	{ input: 'c|', expectedCompletionLabels: availableCommands },
	{ input: 'ls && c|', expectedCompletionLabels: availableCommands },
	{ input: 'cd |', expectedCompletionLabels: ['~', '-'], resourcesRequested: 'folders' },
	{ input: 'code|', expectedCompletionLabels: ['code-insiders'] },
	{ input: 'code-insiders|', expectedCompletionLabels: [] },
	{ input: 'code |', expectedCompletionLabels: codeOptions },
	{ input: 'code --locale |', expectedCompletionLabels: ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'] },
	{ input: 'code --diff |', expectedCompletionLabels: [], resourcesRequested: 'files' },
	{ input: 'code -di|', expectedCompletionLabels: codeOptions.filter(o => o.startsWith('di')) },
	{ input: 'code --diff ./file1 |', expectedCompletionLabels: [], resourcesRequested: 'files' },
	{ input: 'code --merge |', expectedCompletionLabels: [], resourcesRequested: 'files' },
	{ input: 'code --merge ./file1 ./file2 |', expectedCompletionLabels: [], resourcesRequested: 'files' },
	{ input: 'code --merge ./file1 ./file2 ./base |', expectedCompletionLabels: [], resourcesRequested: 'files' },
	{ input: 'code --goto |', expectedCompletionLabels: [], resourcesRequested: 'files' },
	{ input: 'code --user-data-dir |', expectedCompletionLabels: [], resourcesRequested: 'folders' },
	{ input: 'code --profile |', expectedCompletionLabels: [] },
	{ input: 'code --install-extension |', expectedCompletionLabels: [] },
	{ input: 'code --uninstall-extension |', expectedCompletionLabels: [] },
	{ input: 'code --log |', expectedCompletionLabels: ['critical', 'error', 'warn', 'info', 'debug', 'trace', 'off'] },
	{ input: 'code --sync |', expectedCompletionLabels: ['on', 'off'] },
	{ input: 'code --extensions-dir |', expectedCompletionLabels: [], resourcesRequested: 'folders' },
	{ input: 'code --list-extensions |', expectedCompletionLabels: codeOptions },
	{ input: 'code --show-versions |', expectedCompletionLabels: codeOptions },
	{ input: 'code --category |', expectedCompletionLabels: ['azure', 'data science', 'debuggers', 'extension packs', 'education', 'formatters', 'keymaps', 'language packs', 'linters', 'machine learning', 'notebooks', 'programming languages', 'scm providers', 'snippets', 'testing', 'themes', 'visualization', 'other'] },
	{ input: 'code --category a|', expectedCompletionLabels: ['azure'] },
	{ input: 'code-insiders --list-extensions |', expectedCompletionLabels: codeOptions },
	{ input: 'code-insiders --show-versions |', expectedCompletionLabels: codeOptions },
	{ input: 'code-insiders --category |', expectedCompletionLabels: ['azure', 'data science', 'debuggers', 'extension packs', 'education', 'formatters', 'keymaps', 'language packs', 'linters', 'machine learning', 'notebooks', 'programming languages', 'scm providers', 'snippets', 'testing', 'themes', 'visualization', 'other'] },
	{ input: 'code-insiders --category a|', expectedCompletionLabels: ['azure'] },
	{ input: 'code-insiders --category azure |', expectedCompletionLabels: [] },
	{ input: 'code | --locale', expectedCompletionLabels: codeOptions },
	{ input: 'code --locale | && ls', expectedCompletionLabels: ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'] },
	{ input: 'code-insiders | --locale', expectedCompletionLabels: codeOptions },
	{ input: 'code-insiders --locale | && ls', expectedCompletionLabels: ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'] }
];

interface ITestSpec {
	input: string;
	expectedCompletionLabels: string[];
	resourcesRequested?: 'files' | 'folders' | 'both';
}

suite('Terminal Suggest', () => {
	for (const testSpec of testSpecs) {
		test(testSpec.input, () => {
			const commandLine = testSpec.input.split('|')[0];
			const cursorPosition = testSpec.input.indexOf('|');
			const prefix = commandLine.slice(0, cursorPosition).split(' ').pop() || '';
			const filesRequested = testSpec.resourcesRequested === 'files' || testSpec.resourcesRequested === 'both';
			const foldersRequested = testSpec.resourcesRequested === 'folders' || testSpec.resourcesRequested === 'both';
			const result = getCompletionItemsFromSpecs(availableSpecs, { commandLine, cursorPosition }, availableCommands, prefix);
			deepStrictEqual(result.items.map(i => i.label).sort(), testSpec.expectedCompletionLabels.sort());
			strictEqual(result.filesRequested, filesRequested);
			strictEqual(result.foldersRequested, foldersRequested);
		});
	}
});
