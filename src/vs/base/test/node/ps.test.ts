/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { JS_FILENAME_PATTERN, parseTopMemoryOutput } from '../../node/ps.js';

suite('Process Utils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('top memory output parsing (issue #194322)', () => {

		test('should parse pid and memory rows with size suffixes', () => {
			const stdout = [
				'Processes: 687 total, 2 running, 685 sleeping, 6580 threads ',
				'2026/08/17 10:48:10',
				'Load Avg: 3.17, 3.30, 3.39 ',
				'CPU usage: 9.15% user, 12.63% sys, 78.21% idle ',
				'SharedLibs: 314M resident, 88M data, 67M linkedit.',
				'PhysMem: 15G used (3376M wired, 6110M compressor), 146M unused.',
				'',
				'PID    MEM ',
				'99314  35M  ',
				'99068  13M  ',
				'98594  1024K ',
				'98573  2G   ',
				''
			].join('\n');
			deepStrictEqual([...parseTopMemoryOutput(stdout).entries()], [
				[99314, 35 * 1024 ** 2],
				[99068, 13 * 1024 ** 2],
				[98594, 1024 * 1024],
				[98573, 2 * 1024 ** 3]
			]);
		});

		test('should handle the compressed memory marker (+)', () => {
			deepStrictEqual([...parseTopMemoryOutput('1234  128M+').entries()], [[1234, 128 * 1024 ** 2]]);
		});

		test('should handle decimal values', () => {
			deepStrictEqual([...parseTopMemoryOutput('1234  1.5G').entries()], [[1234, 1.5 * 1024 ** 3]]);
		});

		test('should round fractional byte values', () => {
			// 0.1M is 104857.6 bytes
			deepStrictEqual([...parseTopMemoryOutput('1234  0.1M').entries()], [[1234, 104858]]);
		});

		test('should handle values without a suffix as bytes', () => {
			deepStrictEqual([...parseTopMemoryOutput('1234  512').entries()], [[1234, 512]]);
		});

		test('should ignore the header and global statistic lines', () => {
			const stdout = [
				'Networks: packets: 45854157/49G in, 114271254/122G out.',
				'Disks: 57576600/1553G read, 15101956/416G written.',
				'',
				'PID    MEM ',
				'8184   332M'
			].join('\n');
			deepStrictEqual([...parseTopMemoryOutput(stdout).entries()], [[8184, 332 * 1024 ** 2]]);
		});
	});

	suite('JS file regex', () => {

		function findJsFiles(cmd: string): string[] {
			const matches: string[] = [];
			let match;
			while ((match = JS_FILENAME_PATTERN.exec(cmd)) !== null) {
				matches.push(match[0]);
			}
			return matches;
		}

		test('should match simple .js files', () => {
			deepStrictEqual(findJsFiles('node bootstrap.js'), ['bootstrap.js']);
		});

		test('should match multiple .js files', () => {
			deepStrictEqual(findJsFiles('node server.js --require helper.js'), ['server.js', 'helper.js']);
		});

		test('should match .js files with hyphens', () => {
			deepStrictEqual(findJsFiles('node my-script.js'), ['my-script.js']);
		});

		test('should not match .json files', () => {
			deepStrictEqual(findJsFiles('cat package.json'), []);
		});

		test('should not match .js prefix in .json extension (regression test for \\b fix)', () => {
			// Without the \b word boundary, the regex would incorrectly match "package.js" from "package.json"
			deepStrictEqual(findJsFiles('node --config tsconfig.json'), []);
			deepStrictEqual(findJsFiles('eslint.json'), []);
		});

		test('should not match .jsx files', () => {
			deepStrictEqual(findJsFiles('node component.jsx'), []);
		});

		test('should match .js but not .json in same command', () => {
			deepStrictEqual(findJsFiles('node app.js --config settings.json'), ['app.js']);
		});

		test('should not match partial matches inside other extensions', () => {
			deepStrictEqual(findJsFiles('file.jsmith'), []);
		});

		test('should match .js at end of command', () => {
			deepStrictEqual(findJsFiles('/path/to/script.js'), ['script.js']);
		});
	});
});

