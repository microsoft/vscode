/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import 'mocha';
import { availableSpecs, getCompletionItemsFromSpecs } from './terminalSuggestMain';

suite('Terminal Suggest', () => {
	const availableCommands = new Set(['cd', 'code', 'code-insiders', 'ls', 'pwd']);
	suiteSetup(async function () {

	});
	suiteTeardown(async function () {
	});

	suite('prefix: c', () => {
		createTestCase(`No available commands:`, 'c|', [], 'neither', availableSpecs, new Set());
		createTestCase('Available commands', 'c|', ['cd', 'code', 'code-insiders'], 'neither', availableSpecs, availableCommands);
		createTestCase('Available commands, prior command on the line', 'ls && c|', ['cd', 'code', 'code-insiders'], 'neither', availableSpecs, availableCommands);
	});
});

function createTestCase(name: string, commandLineWithCursor: string, expectedSpecs: string[], resourcesRequested: 'files' | 'folders' | 'both' | 'neither', availableSpecs: Fig.Spec[], availableCommands: Set<string>): void {
	const commandLine = commandLineWithCursor.split('|')[0];
	const cursorPosition = commandLineWithCursor.indexOf('|');
	const prefix = commandLine.slice(0, cursorPosition).split(' ').pop() || '';
	const filesRequested = resourcesRequested === 'files' || resourcesRequested === 'both';
	const foldersRequested = resourcesRequested === 'folders' || resourcesRequested === 'both';
	test(name, function () {
		const result = getCompletionItemsFromSpecs(availableSpecs, { commandLine, cursorPosition }, availableCommands, prefix);
		assert(arraysEqual(result.items.map(i => i.label), expectedSpecs));
		assert(result.filesRequested === filesRequested);
		assert(result.foldersRequested === foldersRequested);
	});
}

function arraysEqual(a: string[], b: string[]) {
	if (a.length !== b.length) {
		return false;
	}
	const sortedA = [...a].sort();
	const sortedB = [...b].sort();
	return sortedA.every((value, index) => value === sortedB[index]);
}
