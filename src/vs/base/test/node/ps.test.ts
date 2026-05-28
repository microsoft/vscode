/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
import { JS_FILENAME_PATTERN } from '../../node/ps.js';

suite('Process Utils', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

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

