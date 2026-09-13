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
			'sed --in-plac "s/foo/bar/" file.txt',
			'sed --in-p=.bak "s/foo/bar/" file.txt',
			'sed --i "s/foo/bar/" file.txt',
			'sed --in "s/foo/bar/" file.txt',
			'sed --in- "s/foo/bar/" file.txt',
			'sed \'--in-place=../outside/*\' "s/foo/bar/" file.txt',
			'sed "$(echo -i)" "s/foo/bar/" file.txt',
			'sed !!:1 "s/foo/bar/" file.txt',
			'sed -{i,n} "s/foo/bar/" file.txt',
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

	test('extracts generated backup targets', () => {
		assert.deepStrictEqual({
			suffix: parser.extractFileWrites('sed -i.bak "s/foo/bar/" file.txt'),
			directory: parser.extractFileWrites('sed --in-place=../outside/* "s/foo/bar/" file.txt'),
			quotedOption: parser.extractFileWrites('sed \'--in-place=../outside/*\' "s/foo/bar/" file.txt'),
			abbreviated: parser.extractFileWrites('sed --in-plac=.bak "s/foo/bar/" file.txt'),
			repeated: parser.extractFileWrites('sed --in-place=.bak --in-p=../outside/* "s/foo/bar/" file.txt'),
			optionTerminator: parser.extractFileWrites('sed --in-place=../outside/* -e "s/foo/bar/" -- --in-place=.bak file.txt'),
		}, {
			suffix: ['file.txt', 'file.txt.bak'],
			directory: ['file.txt', '../outside/file.txt'],
			quotedOption: ['file.txt', '../outside/file.txt'],
			abbreviated: ['file.txt', 'file.txt.bak'],
			repeated: ['file.txt', '../outside/file.txt'],
			optionTerminator: ['--in-place=.bak', 'file.txt', '../outside/--in-place=.bak', '../outside/file.txt'],
		});
	});

	test('extracts quoted BSD backup suffix and file target', () => {
		assert.deepStrictEqual({
			singleQuoted: parser.extractFileWrites('sed -i \'.bak\' "s/foo/bar/" file.txt'),
			doubleQuoted: parser.extractFileWrites('sed -i ".bak" "s/foo/bar/" file.txt'),
		}, {
			singleQuoted: ['file.txt', 'file.txt.bak'],
			doubleQuoted: ['file.txt', 'file.txt.bak'],
		});
	});

	test('preserves runtime expansion metadata for file and backup targets', () => {
		assert.deepStrictEqual({
			quotedWildcard: parser.extractFileWriteDetails('sed -i "s/foo/bar/" \'safe-*\''),
			expandedFile: parser.extractFileWriteDetails('sed -i "s/foo/bar/" ~/../outside/file.txt'),
			expandedBackup: parser.extractFileWriteDetails('sed --in-place=$HOME/../outside/* "s/foo/bar/" file.txt'),
		}, {
			quotedWildcard: [{ path: 'safe-*', hasUnquotedPathExpansion: false }],
			expandedFile: [{ path: '~/../outside/file.txt', hasUnquotedPathExpansion: true }],
			expandedBackup: [
				{ path: 'file.txt', hasUnquotedPathExpansion: false },
				{ path: '$HOME/../outside/file.txt', hasUnquotedPathExpansion: true },
			],
		});
	});

	test('extracts file targets when an option is expanded at runtime', () => {
		assert.deepStrictEqual({
			substitution: parser.extractFileWrites('sed "$(echo -i)" "s/foo/bar/" /outside/file.txt'),
			history: parser.extractFileWrites('sed !!:1 "s/foo/bar/" /outside/file.txt'),
			combined: parser.extractFileWrites('sed -"$(echo i)" "s/foo/bar/" /outside/file.txt'),
			dynamicBackup: parser.extractFileWrites('sed "${HOME:+--in-place=$HOME/*}" "s/foo/bar/" .bashrc'),
			braceExpansion: parser.extractFileWrites('sed -{i,n} "s/foo/bar/" /outside/file.txt'),
			afterLineLength: parser.extractFileWrites('sed -l 70 -{i,n} "s/foo/bar/" /outside/file.txt'),
			afterLongLineLength: parser.extractFileWrites('sed --line-length 70 -{i,n} "s/foo/bar/" /outside/file.txt'),
		}, {
			substitution: ['s/foo/bar/', '/outside/file.txt', '$SED_IN_PLACE_OPTION'],
			history: ['s/foo/bar/', '/outside/file.txt', '$SED_IN_PLACE_OPTION'],
			combined: ['/outside/file.txt', '$SED_IN_PLACE_OPTION'],
			dynamicBackup: ['s/foo/bar/', '.bashrc', '$SED_IN_PLACE_OPTION'],
			braceExpansion: ['/outside/file.txt', '$SED_IN_PLACE_OPTION'],
			afterLineLength: ['s/foo/bar/', '/outside/file.txt', '$SED_IN_PLACE_OPTION'],
			afterLongLineLength: ['s/foo/bar/', '/outside/file.txt', '$SED_IN_PLACE_OPTION'],
		});
	});
});
