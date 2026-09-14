/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SedFileWriteParser } from '../../../common/autoApprove/sedFileWriteParser.js';

suite('SedFileWriteParser', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const parser = new SedFileWriteParser();

	test('detects supported in-place options', () => {
		const commandLines = [
			'sed -i "s/foo/bar/" file.txt',
			'sed -I "s/foo/bar/" file.txt',
			'sed -ni "s/foo/bar/" file.txt',
			'sed -i.bak "s/foo/bar/" file.txt',
			'sed -i \'\' "s/foo/bar/" file.txt',
			'sed --in-place "s/foo/bar/" file.txt',
			'sed --in-place=.bak "s/foo/bar/" file.txt',
		];
		assert.deepStrictEqual(commandLines.map(commandLine => parser.canHandle(commandLine)), commandLines.map(() => true));
	});

	test('does not classify non-in-place commands', () => {
		const commandLines = [
			'sed "s/foo/bar/" file.txt',
			'sed -n "s/foo/bar/p" file.txt',
			'echo sed -i file.txt',
		];
		assert.deepStrictEqual(commandLines.map(commandLine => parser.canHandle(commandLine)), commandLines.map(() => false));
	});

	test('extracts in-place file targets', () => {
		assert.deepStrictEqual({
			single: parser.extractFileWrites('sed -i "s/foo/bar/" file.txt'),
			multiple: parser.extractFileWrites('sed -i "s/foo/bar/" file1.txt file2.txt'),
			bsd: parser.extractFileWrites('sed -i \'\' "s/foo/bar/" file.txt'),
		}, {
			single: ['file.txt'],
			multiple: ['file1.txt', 'file2.txt'],
			bsd: ['file.txt'],
		});
	});
});
