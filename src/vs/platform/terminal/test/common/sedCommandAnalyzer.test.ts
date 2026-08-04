/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { analyzeSedCommand, SedCommandAnalysis } from '../../common/sedCommandAnalyzer.js';

suite('analyzeSedCommand', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('allows literal non-in-place commands', () => {
		const commands = [
			'echo sed -i file.txt',
			'sed "s/foo/bar/" file.txt',
			'sed -n "s/foo/bar/p" file.txt',
			'sed -E "s/(foo)/bar/" file.txt',
			'sed --quiet "s/foo/bar/p" file.txt',
			'sed --sandbox "s/foo/bar/" file.txt',
			'sed -- "$SED_OPTIONS" file.txt',
		];

		assert.deepStrictEqual(
			commands.map(analyzeSedCommand),
			commands.map(() => SedCommandAnalysis.Safe),
		);
	});

	test('requires confirmation for semantic in-place options', () => {
		const commands = [
			'sed -i "s/foo/bar/" file.txt',
			'sed -I "s/foo/bar/" file.txt',
			'sed -ni "s/foo/bar/" file.txt',
			'sed -n -i "s/foo/bar/" file.txt',
			'sed -i.bak "s/foo/bar/" file.txt',
			'sed -i \'\' "s/foo/bar/" file.txt',
			'sed --in-place "s/foo/bar/" file.txt',
			'sed --in-place=.bak "s/foo/bar/" file.txt',
			'sed --in-plac "s/foo/bar/" file.txt',
			'sed.exe -i "s/foo/bar/" file.txt',
			'sed "-i" "s/foo/bar/" file.txt',
			'sed -\\i "s/foo/bar/" file.txt',
			'sed "s/foo/bar/" -inside.txt',
			'sed -i\'../outside/*\' "s/foo/bar/" file.txt',
			'sed --follow-symlinks -i "s/foo/bar/" link.txt',
		];

		assert.deepStrictEqual(
			commands.map(analyzeSedCommand),
			commands.map(() => SedCommandAnalysis.RequiresConfirmation),
		);
	});

	test('requires confirmation for runtime-resolved option words', () => {
		const commands = [
			'sed "$SED_OPTIONS" "s/foo/bar/" file.txt',
			'sed "$(echo --in-place)" "s/foo/bar/" file.txt',
			'sed "s/foo/bar/" "$SED_OPTIONS" file.txt',
			'sed "s/foo/bar/" "$(echo --in-place)" file.txt',
			'sed -i "s/foo/bar/" *.txt',
			'sed${PATH:+} -i "s/foo/bar/" file.txt',
			'sed${PATH:+} "s/foo/bar/" file.txt',
		];

		assert.deepStrictEqual(
			commands.map(analyzeSedCommand),
			commands.map(() => SedCommandAnalysis.RequiresConfirmation),
		);
	});
});
