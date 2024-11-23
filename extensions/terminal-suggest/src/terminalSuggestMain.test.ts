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
	suite('No available commands', () => {
		createTestCase('|', [], 'neither', availableSpecs, []);
	});
	suite('Available commands', () => {
		createTestCase('|', availableCommands, 'neither', availableSpecs, availableCommands);
		createTestCase('c|', availableCommands, 'neither', availableSpecs, availableCommands);
		createTestCase('ls && c|', availableCommands, 'neither', availableSpecs, availableCommands);
		createTestCase('cd |', ['~', '-'], 'folders', availableSpecs, availableCommands);
		createTestCase('code|', ['code', 'code-insiders'], 'neither', availableSpecs, availableCommands);
		createTestCase('code |', codeOptions, 'neither', availableSpecs, availableCommands);
		createTestCase('code --locale |', ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'], 'neither', availableSpecs, availableCommands);
		createTestCase('code --diff |', [], 'files', availableSpecs, availableCommands);
		createTestCase('code -di|', codeOptions.filter(o => o.startsWith('di')), 'neither', availableSpecs, availableCommands);
		createTestCase('code --diff ./file1 |', [], 'files', availableSpecs, availableCommands);
		createTestCase('code --merge |', [], 'files', availableSpecs, availableCommands);
		createTestCase('code --merge ./file1 ./file2 |', [], 'files', availableSpecs, availableCommands);
		createTestCase('code --merge ./file1 ./file2 ./base |', [], 'files', availableSpecs, availableCommands);
		createTestCase('code --goto |', [], 'files', availableSpecs, availableCommands);
		createTestCase('code --user-data-dir |', [], 'folders', availableSpecs, availableCommands);
		createTestCase('code --profile |', [], 'neither', availableSpecs, availableCommands);
		createTestCase('code --install-extension |', [], 'neither', availableSpecs, availableCommands);
		createTestCase('code --uninstall-extension |', [], 'neither', availableSpecs, availableCommands);
		createTestCase('code --log |', ['critical', 'error', 'warn', 'info', 'debug', 'trace', 'off'], 'neither', availableSpecs, availableCommands);
		createTestCase('code --sync |', ['on', 'off'], 'neither', availableSpecs, availableCommands);
		createTestCase('code --extensions-dir |', [], 'folders', availableSpecs, availableCommands);
		createTestCase('code --list-extensions |', codeOptions, 'neither', availableSpecs, availableCommands);
		createTestCase('code --show-versions |', codeOptions, 'neither', availableSpecs, availableCommands);
		createTestCase('code --category |', ['azure', 'data science', 'debuggers', 'extension packs', 'education', 'formatters', 'keymaps', 'language packs', 'linters', 'machine learning', 'notebooks', 'programming languages', 'scm providers', 'snippets', 'testing', 'themes', 'visualization', 'other'], 'neither', availableSpecs, availableCommands);
		createTestCase('code --category a|', ['azure'], 'neither', availableSpecs, availableCommands);
		createTestCase('code-insiders --list-extensions |', codeOptions, 'neither', availableSpecs, availableCommands);
		createTestCase('code-insiders --show-versions |', codeOptions, 'neither', availableSpecs, availableCommands);
		createTestCase('code-insiders --category |', ['azure', 'data science', 'debuggers', 'extension packs', 'education', 'formatters', 'keymaps', 'language packs', 'linters', 'machine learning', 'notebooks', 'programming languages', 'scm providers', 'snippets', 'testing', 'themes', 'visualization', 'other'], 'neither', availableSpecs, availableCommands);
		createTestCase('code-insiders --category a|', ['azure'], 'neither', availableSpecs, availableCommands);
	});
	suite('Cursor not at the end of the line', () => {
		createTestCase('code | --locale', codeOptions, 'neither', availableSpecs, availableCommands);
		createTestCase('code --locale | && ls', ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'], 'neither', availableSpecs, availableCommands);
		createTestCase('code-insiders | --locale', codeOptions, 'neither', availableSpecs, availableCommands);
		createTestCase('code-insiders --locale | && ls', ['bg', 'de', 'en', 'es', 'fr', 'hu', 'it', 'ja', 'ko', 'pt-br', 'ru', 'tr', 'zh-CN', 'zh-TW'], 'neither', availableSpecs, availableCommands);
	});
});

function createTestCase(commandLineWithCursor: string, expectedCompletionLabels: string[], resourcesRequested: 'files' | 'folders' | 'both' | 'neither', availableSpecs: Fig.Spec[], availableCommands: string[]): void {
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
