/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { analyzeSedCommand } from '../../common/sedCommandAnalyzer.js';

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
			'sed "s/foo/bar/" "-\\inside.txt"',
		];

		assert.deepStrictEqual(
			commands.map(command => analyzeSedCommand(command)),
			commands.map(() => ({ kind: 'safe' })),
		);
	});

	test('identifies static semantic in-place options', () => {
		const commands = [
			'sed -i "s/foo/bar/" file.txt',
			'sed -I .bak "s/foo/bar/" file.txt',
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
			commands.map(command => analyzeSedCommand(command).kind),
			[
				'inPlace',
				'inPlace',
				'inPlace',
				'inPlace',
				'inPlace',
				'inPlace',
				'inPlace',
				'inPlace',
				'inPlace',
				'inPlace',
				'inPlace',
				'inPlace',
				'requiresConfirmation',
				'inPlace',
				'requiresConfirmation',
			],
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
			commands.map(command => analyzeSedCommand(command)),
			commands.map(() => ({ kind: 'requiresConfirmation' })),
		);
	});

	test('extracts the union of static GNU and BSD write destinations', () => {
		const cases = [
			['sed -i "s/foo/bar/" file.txt', ['file.txt']],
			['sed -i.bak "s/foo/bar/" file.txt', ['file.txt', 'file.txt.bak']],
			['sed --in-place "s/foo/bar/" file.txt', ['file.txt']],
			['sed --in-place=.bak "s/foo/bar/" file.txt', ['file.txt', 'file.txt.bak']],
			['sed -i "" "s/foo/bar/" file.txt', ['s/foo/bar/', 'file.txt']],
			['sed -i json "s/foo/bar/" package.', ['s/foo/bar/', 'package.', 'package.json']],
			['sed -I .json "s/foo/bar/" package', ['package', 'package.json']],
			['sed -i\'../outside/*\' "s/foo/bar/" inside.txt', ['inside.txt', '../outside/inside.txt', 'inside.txt../outside/*']],
			['sed -i "s/foo/bar/" file1.txt file2.txt', ['file1.txt', 'file2.txt', 'file2.txts/foo/bar/']],
			['sed --in-place -e "s/foo/bar/" file.txt', ['file.txt']],
			['sed -i -x "s/foo/bar/" file.txt', ['file.txt', 'file.txt-x']],
		] as const;

		assert.deepStrictEqual(
			cases.map(([commandLine]) => analyzeSedCommand(commandLine)),
			cases.map(([, fileWrites]) => ({ kind: 'inPlace', fileWrites: [...fileWrites] })),
		);
	});

	test('decodes backslashes according to the shell dialect', () => {
		assert.deepStrictEqual({
			bashUnquoted: analyzeSedCommand('sed --in-place "s/foo/bar/" \\/etc/config', 'bash'),
			bashDoubleQuotedLiteral: analyzeSedCommand('sed --in-place "s/foo/bar/" "path\\q"', 'bash'),
			bashDoubleQuotedEscapedExpansion: analyzeSedCommand('sed --in-place "s/foo/bar/" "path\\$FILE"', 'bash'),
			bashDoubleQuotedWindowsPath: analyzeSedCommand('sed --in-place "s/foo/bar/" "C:\\outside\\file.txt"', 'bash'),
			powerShellPath: analyzeSedCommand('sed --in-place "s/foo/bar/" C:\\outside\\file.txt', 'powershell'),
			powerShellUppercase: analyzeSedCommand('SED -i "s/foo/bar/" file.txt', 'powershell'),
			powerShellUppercaseExe: analyzeSedCommand('SED.EXE -i "s/foo/bar/" file.txt', 'powershell'),
		}, {
			bashUnquoted: { kind: 'inPlace', fileWrites: ['/etc/config'] },
			bashDoubleQuotedLiteral: { kind: 'inPlace', fileWrites: ['path\\q'] },
			bashDoubleQuotedEscapedExpansion: { kind: 'inPlace', fileWrites: ['path$FILE'] },
			bashDoubleQuotedWindowsPath: { kind: 'inPlace', fileWrites: ['C:\\outside\\file.txt'] },
			powerShellPath: { kind: 'inPlace', fileWrites: ['C:\\outside\\file.txt'] },
			powerShellUppercase: { kind: 'inPlace', fileWrites: ['file.txt'] },
			powerShellUppercaseExe: { kind: 'inPlace', fileWrites: ['file.txt'] },
		});
	});

	test('requires confirmation when static destinations cannot be determined', () => {
		const commands = [
			'sed -i "s/foo/bar/"',
			'sed --follow-symlinks -i "s/foo/bar/" link.txt',
			'sed --in-place --expr="s/foo/bar/" outside.txt',
			'sed --in-place --fi=script.sed outside.txt',
			'sed -i.bak "-e" $ARGS inside.txt',
			'sed --in-place --file "$SCRIPT" inside.txt',
		];

		assert.deepStrictEqual(
			commands.map(command => analyzeSedCommand(command)),
			commands.map(() => ({ kind: 'requiresConfirmation' })),
		);
	});
});
