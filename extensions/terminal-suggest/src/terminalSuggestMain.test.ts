/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import 'mocha';
import { availableSpecs, getCompletionItemsFromSpecs } from './terminalSuggestMain';

suite('Terminal Suggest', () => {

	const availableCommands = ['cd', 'code', 'code-insiders'];
	const codeOptions = ['-', '--add', '--category', '--diff', '--disable-extension', '--disable-extensions', '--disable-gpu', '--enable-proposed-api', '--extensions-dir', '--goto', '--help', '--inspect-brk-extensions', '--inspect-extensions', '--install-extension', '--list-extensions', '--locale', '--log', '--max-memory', '--merge', '--new-window', '--pre-release', '--prof-startup', '--profile', '--reuse-window', '--show-versions', '--status', '--sync', '--telemetry', '--uninstall-extension', '--user-data-dir', '--verbose', '--version', '--wait', '-a', '-d', '-g', '-h', '-m', '-n', '-r', '-s', '-v', '-w'];

	suite('Cursor at the end of the command line', () => {
		createTestCase('|', availableCommands, 'neither', availableSpecs);
		createTestCase('c|', availableCommands, 'neither', availableSpecs);
		createTestCase('ls && c|', availableCommands, 'neither', availableSpecs);
		createTestCase('cd |', ['~', '-'], 'folders', availableSpecs);
		createTestCase('code|', ['code-insiders'], 'neither', availableSpecs);
		createTestCase('code-insiders|', [], 'neither', availableSpecs);
		createTestCase('code |', codeOptions, 'neither', availableSpecs);
		createTestCase('code --locale |', ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'], 'neither', availableSpecs);
		createTestCase('code --diff |', [], 'files', availableSpecs);
		createTestCase('code -di|', codeOptions.filter(o => o.startsWith('di')), 'neither', availableSpecs);
		createTestCase('code --diff ./file1 |', [], 'files', availableSpecs);
		createTestCase('code --merge |', [], 'files', availableSpecs);
		createTestCase('code --merge ./file1 ./file2 |', [], 'files', availableSpecs);
		createTestCase('code --merge ./file1 ./file2 ./base |', [], 'files', availableSpecs);
		createTestCase('code --goto |', [], 'files', availableSpecs);
		createTestCase('code --user-data-dir |', [], 'folders', availableSpecs);
		createTestCase('code --profile |', [], 'neither', availableSpecs);
		createTestCase('code --install-extension |', [], 'neither', availableSpecs);
		createTestCase('code --uninstall-extension |', [], 'neither', availableSpecs);
		createTestCase('code --log |', ['critical', 'error', 'warn', 'info', 'debug', 'trace', 'off'], 'neither', availableSpecs);
		createTestCase('code --sync |', ['on', 'off'], 'neither', availableSpecs);
		createTestCase('code --extensions-dir |', [], 'folders', availableSpecs);
		createTestCase('code --list-extensions |', codeOptions, 'neither', availableSpecs);
		createTestCase('code --show-versions |', codeOptions, 'neither', availableSpecs);
		createTestCase('code --category |', ['azure', 'data science', 'debuggers', 'extension packs', 'education', 'formatters', 'keymaps', 'language packs', 'linters', 'machine learning', 'notebooks', 'programming languages', 'scm providers', 'snippets', 'testing', 'themes', 'visualization', 'other'], 'neither', availableSpecs);
		createTestCase('code --category a|', ['azure'], 'neither', availableSpecs);
		createTestCase('code-insiders --list-extensions |', codeOptions, 'neither', availableSpecs);
		createTestCase('code-insiders --show-versions |', codeOptions, 'neither', availableSpecs);
		createTestCase('code-insiders --category |', ['azure', 'data science', 'debuggers', 'extension packs', 'education', 'formatters', 'keymaps', 'language packs', 'linters', 'machine learning', 'notebooks', 'programming languages', 'scm providers', 'snippets', 'testing', 'themes', 'visualization', 'other'], 'neither', availableSpecs);
		createTestCase('code-insiders --category a|', ['azure'], 'neither', availableSpecs);
		createTestCase('code-insiders --category azure |', [], 'neither', availableSpecs);
	});
	suite('Cursor not at the end of the line', () => {
		createTestCase('code | --locale', codeOptions, 'neither', availableSpecs);
		createTestCase('code --locale | && ls', ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'], 'neither', availableSpecs);
		createTestCase('code-insiders | --locale', codeOptions, 'neither', availableSpecs);
		createTestCase('code-insiders --locale | && ls', ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'], 'neither', availableSpecs);
	});

	function createTestCase(commandLineWithCursor: string, expectedCompletionLabels: string[], resourcesRequested: 'files' | 'folders' | 'both' | 'neither', availableSpecs: Fig.Spec[]): void {
		const commandLine = commandLineWithCursor.split('|')[0];
		const cursorPosition = commandLineWithCursor.indexOf('|');
		const prefix = commandLine.slice(0, cursorPosition).split(' ').pop() || '';
		const filesRequested = resourcesRequested === 'files' || resourcesRequested === 'both';
		const foldersRequested = resourcesRequested === 'folders' || resourcesRequested === 'both';
		test(commandLineWithCursor, function () {
			const result = getCompletionItemsFromSpecs(availableSpecs, { commandLine, cursorPosition }, availableCommands, prefix);
			deepStrictEqual(result.items.map(i => i.label).sort(), expectedCompletionLabels.sort());
			strictEqual(result.filesRequested, filesRequested);
			strictEqual(result.foldersRequested, foldersRequested);
		});
	}
});

