/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');
import assert = require('assert');

import * as arrays from 'vs/base/common/arrays';

import { RipgrepParser } from 'vs/workbench/services/search/node/ripgrepTextSearch';
import { ISerializedFileMatch } from 'vs/workbench/services/search/node/search';


suite('RipgrepParser', () => {
	const rootFolder = '/workspace';
	const fileSectionEnd = '\n';

	function getFileLine(relativePath: string): string {
		return `\u001b\[m${relativePath}\u001b\[m`;
	}

	function getMatchLine(lineNum: number, matchParts: string[]): string {
		let matchLine = `\u001b\[m${lineNum}\u001b\[m:` +
			`${matchParts.shift()}${RipgrepParser.MATCH_START_MARKER}${matchParts.shift()}${RipgrepParser.MATCH_END_MARKER}${matchParts.shift()}`;

		while (matchParts.length) {
			matchLine += `${RipgrepParser.MATCH_START_MARKER}${matchParts.shift()}${RipgrepParser.MATCH_END_MARKER}${matchParts.shift() || ''}`;
		}

		return matchLine;
	}

	function parseInput(inputChunks: string[]): ISerializedFileMatch[] {
		const matches: ISerializedFileMatch[] = [];
		const rgp = new RipgrepParser(1e6, rootFolder);
		rgp.on('result', (match: ISerializedFileMatch) => {
			matches.push(match);
		});

		inputChunks.forEach(chunk => rgp.handleData(chunk));
		rgp.flush();

		return matches;
	}

	function halve(str: string) {
		const halfIdx = Math.floor(str.length / 2);
		return [str.substr(0, halfIdx), str.substr(halfIdx)];
	}

	function arrayOfChars(str: string) {
		const chars = [];
		for (let char of str) {
			chars.push(char);
		}

		return chars;
	}

	test('Parses one chunk', () => {
		const input = [
			[getFileLine('a.txt'), getMatchLine(1, ['before', 'match', 'after']), getMatchLine(2, ['before', 'match', 'after']), fileSectionEnd].join('\n')
		];

		const results = parseInput(input);
		assert.equal(results.length, 1);
		assert.deepEqual(results[0],
			<ISerializedFileMatch>{
				numMatches: 2,
				path: path.join(rootFolder, 'a.txt'),
				lineMatches: [
					{
						lineNumber: 0,
						preview: 'beforematchafter',
						offsetAndLengths: [[6, 5]]
					},
					{
						lineNumber: 1,
						preview: 'beforematchafter',
						offsetAndLengths: [[6, 5]]
					}
				]
			});
	});

	test('Parses multiple chunks broken at file sections', () => {
		const input = [
			[getFileLine('a.txt'), getMatchLine(1, ['before', 'match', 'after']), getMatchLine(2, ['before', 'match', 'after']), fileSectionEnd].join('\n'),
			[getFileLine('b.txt'), getMatchLine(1, ['before', 'match', 'after']), getMatchLine(2, ['before', 'match', 'after']), fileSectionEnd].join('\n'),
			[getFileLine('c.txt'), getMatchLine(1, ['before', 'match', 'after']), getMatchLine(2, ['before', 'match', 'after']), fileSectionEnd].join('\n')
		];

		const results = parseInput(input);
		assert.equal(results.length, 3);
		results.forEach(fileResult => assert.equal(fileResult.numMatches, 2));
	});

	const singleLineChunks = [
		getFileLine('a.txt'),
		getMatchLine(1, ['before', 'match', 'after']),
		getMatchLine(2, ['before', 'match', 'after']),
		fileSectionEnd,
		getFileLine('b.txt'),
		getMatchLine(1, ['before', 'match', 'after']),
		getMatchLine(2, ['before', 'match', 'after']),
		fileSectionEnd,
		getFileLine('c.txt'),
		getMatchLine(1, ['before', 'match', 'after']),
		getMatchLine(2, ['before', 'match', 'after']),
		fileSectionEnd
	];

	test('Parses multiple chunks broken at each line', () => {
		const input = singleLineChunks.map(chunk => chunk + '\n');

		const results = parseInput(input);
		assert.equal(results.length, 3);
		results.forEach(fileResult => assert.equal(fileResult.numMatches, 2));
	});

	test('Parses multiple chunks broken in the middle of each line', () => {
		const input = arrays.flatten(singleLineChunks
			.map(chunk => chunk + '\n')
			.map(halve));

		const results = parseInput(input);
		assert.equal(results.length, 3);
		results.forEach(fileResult => assert.equal(fileResult.numMatches, 2));
	});

	test('Parses multiple chunks broken at each character', () => {
		const input = arrays.flatten(singleLineChunks
			.map(chunk => chunk + '\n')
			.map(arrayOfChars));

		const results = parseInput(input);
		assert.equal(results.length, 3);
		results.forEach(fileResult => assert.equal(fileResult.numMatches, 2));
	});

	test('Parses chunks broken before newline', () => {
		const input = singleLineChunks
			.map(chunk => '\n' + chunk);

		const results = parseInput(input);
		assert.equal(results.length, 3);
		results.forEach(fileResult => assert.equal(fileResult.numMatches, 2));
	});
});