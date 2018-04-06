/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as assert from 'assert';

import * as arrays from 'vs/base/common/arrays';
import * as platform from 'vs/base/common/platform';

import { RipgrepParser, getAbsoluteGlob, fixDriveC } from 'vs/workbench/services/search/node/ripgrepTextSearch';
import { ISerializedFileMatch } from 'vs/workbench/services/search/node/search';


suite('RipgrepParser', () => {
	const rootFolder = '/workspace';
	const fileSectionEnd = '\n';

	function getFileLine(relativePath: string): string {
		return `\u001b\[0m${relativePath}\u001b\[0m`;
	}

	function getMatchLine(lineNum: number, matchParts: string[]): string {
		let matchLine = `\u001b\[0m${lineNum}\u001b\[0m:` +
			`${matchParts.shift()}${RipgrepParser.MATCH_START_MARKER}${matchParts.shift()}${RipgrepParser.MATCH_END_MARKER}${matchParts.shift()}`;

		while (matchParts.length) {
			matchLine += `${RipgrepParser.MATCH_START_MARKER}${matchParts.shift()}${RipgrepParser.MATCH_END_MARKER}${matchParts.shift() || ''}`;
		}

		return matchLine;
	}

	function parseInputStrings(inputChunks: string[]): ISerializedFileMatch[] {
		return parseInput(inputChunks.map(chunk => Buffer.from(chunk)));
	}

	function parseInput(inputChunks: Buffer[]): ISerializedFileMatch[] {
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

		const results = parseInputStrings(input);
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

		const results = parseInputStrings(input);
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

		const results = parseInputStrings(input);
		assert.equal(results.length, 3);
		results.forEach(fileResult => assert.equal(fileResult.numMatches, 2));
	});

	test('Parses multiple chunks broken in the middle of each line', () => {
		const input = arrays.flatten(singleLineChunks
			.map(chunk => chunk + '\n')
			.map(halve));

		const results = parseInputStrings(input);
		assert.equal(results.length, 3);
		results.forEach(fileResult => assert.equal(fileResult.numMatches, 2));
	});

	test('Parses multiple chunks broken at each character', () => {
		const input = arrays.flatten(singleLineChunks
			.map(chunk => chunk + '\n')
			.map(arrayOfChars));

		const results = parseInputStrings(input);
		assert.equal(results.length, 3);
		results.forEach(fileResult => assert.equal(fileResult.numMatches, 2));
	});

	test('Parses chunks broken before newline', () => {
		const input = singleLineChunks
			.map(chunk => '\n' + chunk);

		const results = parseInputStrings(input);
		assert.equal(results.length, 3);
		results.forEach(fileResult => assert.equal(fileResult.numMatches, 2));
	});

	test('Parses chunks broken in the middle of a multibyte character', () => {
		const text = getFileLine('foo/bar') + '\n' + getMatchLine(0, ['before漢', 'match', 'after']) + '\n';
		const buf = new Buffer(text);

		// Split the buffer at every possible position - it should still be parsed correctly
		for (let i = 0; i < buf.length; i++) {
			const inputBufs = [
				buf.slice(0, i),
				buf.slice(i)
			];

			const results = parseInput(inputBufs);
			assert.equal(results.length, 1);
			assert.equal(results[0].lineMatches.length, 1);
			assert.deepEqual(results[0].lineMatches[0].offsetAndLengths, [[7, 5]]);
		}
	});
});

suite('RipgrepParser - etc', () => {
	function testGetAbsGlob(params: string[]): void {
		const [folder, glob, expectedResult] = params;
		assert.equal(fixDriveC(getAbsoluteGlob(folder, glob)), expectedResult, JSON.stringify(params));
	}

	test('getAbsoluteGlob_win', () => {
		if (!platform.isWindows) {
			return;
		}

		[
			['C:/foo/bar', 'glob/**', '/foo\\bar\\glob\\**'],
			['c:/', 'glob/**', '/glob\\**'],
			['C:\\foo\\bar', 'glob\\**', '/foo\\bar\\glob\\**'],
			['c:\\foo\\bar', 'glob\\**', '/foo\\bar\\glob\\**'],
			['c:\\', 'glob\\**', '/glob\\**'],
			['\\\\localhost\\c$\\foo\\bar', 'glob/**', '\\\\localhost\\c$\\foo\\bar\\glob\\**'],

			// absolute paths are not resolved further
			['c:/foo/bar', '/path/something', '/path/something'],
			['c:/foo/bar', 'c:\\project\\folder', '/project\\folder']
		].forEach(testGetAbsGlob);
	});

	test('getAbsoluteGlob_posix', () => {
		if (platform.isWindows) {
			return;
		}

		[
			['/foo/bar', 'glob/**', '/foo/bar/glob/**'],
			['/', 'glob/**', '/glob/**'],

			// absolute paths are not resolved further
			['/', '/project/folder', '/project/folder'],
		].forEach(testGetAbsGlob);
	});
});