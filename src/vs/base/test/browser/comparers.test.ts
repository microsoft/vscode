/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	compareFileNames,
	compareFileNamesUnicode,
	compareFileNamesNumeric,
	compareFileNamesUpper,
	compareFileNamesLower,
	compareFileNamesMixed,
	compareFileExtensionsUnicode,
	compareFileExtensionsNumeric,
	compareFileExtensionsUpper,
	compareFileExtensionsLower,
	compareFileExtensionsMixed,
	compareCaseUpperFirst,
	compareCaseLowerFirst,
} from 'vs/base/common/comparers';
import * as assert from 'assert';

suite('Comparers', () => {

	test('compareFileNames', () => {
		assert(compareFileNames === compareFileNamesNumeric, 'export alias is working as expected');
	});

	test('compareFileNamesUnicode', () => {

		assert(compareFileNamesUnicode('', '') === 0, 'empty strings are equal');
		assert(compareFileNamesUnicode('.', '_') < 0, 'dot comes before underscore');
		assert(compareFileNamesUnicode('.', 'A') < 0, 'dot comes before uppercase letters');
		assert(compareFileNamesUnicode('.', 'a') < 0, 'dot comes before lowercase letters');
		assert(compareFileNamesUnicode('_', 'A') > 0, 'underscore comes after uppercase letters');
		assert(compareFileNamesUnicode('_', 'a') < 0, 'underscore comes before lowercase letters');
		assert(compareFileNamesUnicode('.exe', 'a.aaa') < 0, 'dotfile sorts before regular file');
		assert(compareFileNamesUnicode('aggregate.go', 'aggregate_repo.go') < 0, 'filenames with underscores sort after');
		assert(compareFileNamesUnicode('z', 'Á') < 0, 'all characters with accents sort after regular characters');
		assert(compareFileNamesUnicode('Z', 'a') < 0, 'all capital letters sort before all lowercase letters');
		assert(compareFileNamesUnicode('art.b', 'art.a.b') > 0, 'the whole filename is compared at once');

	});

	test('compareFileNamesUpper', () => {

		// same-case basic comparisons
		assert(compareFileNamesUpper(null, null) === 0, 'null should be equal');
		assert(compareFileNamesUpper(null, 'abc') < 0, 'null should come before real values');
		assert(compareFileNamesUpper('', '') === 0, 'empty should be equal');
		assert(compareFileNamesUpper('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileNamesUpper('a', 'â') === 'a'.localeCompare('â'), 'the same lowercase letter with an accent should compare according to the locale');
		assert(compareFileNamesUpper('A', 'Â') === 'A'.localeCompare('Â'), 'the same uppercase letter with an accent should compare according to the locale');
		assert(compareFileNamesUpper('art', 'artichoke') < 0, 'shorter names sort before longer names with the same root');

		// mixed-case basic comparisons
		assert(compareFileNamesUpper('Z', 'a') < 0, 'all uppercase letters sort before all lowercase letters');
		assert(compareFileNamesUpper('a', 'A') > 0, 'the same letter sorts uppercase before');
		assert(compareFileNamesUpper('â', 'Â') > 0, 'the same accented letter sorts uppercase before');
		assert(compareFileNamesUpper('art', 'Art') > 0, 'the same word sorts uppercase before');
		assert(compareFileNamesUpper('art', 'Artichoke') > 0, 'a longer uppercase word that starts with the same lowercase word sorts uppercase before');
		assert(compareFileNamesUpper('artichoke', 'Art') > 0, 'a longer lowercase word that starts with the same uppercase word sorts uppercase before');
		assert(compareFileNamesUpper('école', 'École') > 0, 'accented words sort uppercase before');
		assert(compareFileNamesUpper('a.MD', 'A.md') > 0, 'files with uppercase names sort first, regardless of extension case');

		// same-case dotfile comparisons
		assert(compareFileNamesUpper('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileNamesUpper('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
		assert(compareFileNamesUpper('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
		assert(compareFileNamesUpper('.env', '.gitattributes') < 0, 'dotfiles sort in alphabetical order');
		assert(compareFileNamesUpper('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
		assert(compareFileNamesUpper('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
		assert(compareFileNamesUpper('.aaa_env', '.aaa.env') < 0, 'and underscore in a dotfile name will sort before a dot');

		// mixed-case dotfile comparisons
		assert(compareFileNamesUpper('A.MD', '.md') > 0, 'dotfiles are non-case and sort before uppercase files');
		assert(compareFileNamesUpper('a.md', '.MD') > 0, 'dotfiles are non-case and sort before lowercase files');
		assert(compareFileNamesUpper('.MD', '.gitattributes') > 0, 'dotfiles are non-case, regardless of the case after the dot');

		// same-case numeric comparisons
		assert(compareFileNamesUpper('abc2.txt', 'abc10.txt') > 0, 'filenames with numbers sort alphabetically, not numerically');

		// mixed-case numeric comparisons
		assert(compareFileNamesUpper('abc2.txt', 'Abc10.txt') > 0, 'uppercase sorts before lowercase, even if numerically after');

		// comparisons that depend on comparing names before extensions
		assert(compareFileNamesUpper('bbb.aaa', 'aaa.bbb') > 0, 'files with extensions are compared first by filename');
		assert(compareFileNamesUpper('aggregate.go', 'aggregate_repo.go') < 0, 'shorter filenames sort before longer names even though dot sorts after underscore');

	});

	test('compareFileNamesLower', () => {

		// same-case basic comparisons
		assert(compareFileNamesLower(null, null) === 0, 'null should be equal');
		assert(compareFileNamesLower(null, 'abc') < 0, 'null should come before real values');
		assert(compareFileNamesLower('', '') === 0, 'empty should be equal');
		assert(compareFileNamesLower('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileNamesLower('a', 'â') === 'a'.localeCompare('â'), 'the same lowercase letter with an accent should compare according to the locale');
		assert(compareFileNamesLower('A', 'Â') === 'A'.localeCompare('Â'), 'the same uppercase letter with an accent should compare according to the locale');
		assert(compareFileNamesLower('art', 'artichoke') < 0, 'shorter names sort before longer names with the same root');

		// mixed-case basic comparisons
		assert(compareFileNamesLower('Z', 'a') > 0, 'all lowercase letters sort before all uppercase letters');
		assert(compareFileNamesLower('a', 'A') < 0, 'the same letter sorts lowercase before');
		assert(compareFileNamesLower('â', 'Â') < 0, 'the same accented letter sorts lowercase before');
		assert(compareFileNamesLower('art', 'Art') < 0, 'the same word sorts lowercase before');
		assert(compareFileNamesLower('art', 'Artichoke') < 0, 'a longer uppercase word that starts with the same lowercase word sorts lowercase before');
		assert(compareFileNamesLower('artichoke', 'Art') < 0, 'a longer lowercase word that starts with the same uppercase word sorts lowercase before');
		assert(compareFileNamesLower('école', 'École') < 0, 'accented words sort lowercase before');
		assert(compareFileNamesLower('a.MD', 'A.md') < 0, 'files with lowercase names sort first, regardless of extension case');

		// same-case dotfile comparisons
		assert(compareFileNamesLower('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileNamesLower('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
		assert(compareFileNamesLower('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
		assert(compareFileNamesLower('.env', '.gitattributes') < 0, 'dotfiles sort in alphabetical order');
		assert(compareFileNamesLower('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
		assert(compareFileNamesLower('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
		assert(compareFileNamesLower('.aaa_env', '.aaa.env') < 0, 'and underscore in a dotfile name will sort before a dot');

		// mixed-case dotfile comparisons
		assert(compareFileNamesLower('A.MD', '.md') > 0, 'dotfiles are non-case and sort before uppercase files');
		assert(compareFileNamesLower('a.md', '.MD') > 0, 'dotfiles are non-case and sort before lowercase files');
		assert(compareFileNamesLower('.md', '.Gitattributes') > 0, 'dotfiles are non-case, regardless of the case after the dot');

		// same-case numeric comparisons
		assert(compareFileNamesLower('abc2.txt', 'abc10.txt') > 0, 'filenames with numbers sort alphabetically, not numerically');

		// mixed-case numeric comparisons
		assert(compareFileNamesLower('abc10.txt', 'Abc2.txt') < 0, 'lowercase sorts before uppercase, even if numerically after');

		// comparisons that depend on comparing names before extensions
		assert(compareFileNamesLower('bbb.aaa', 'aaa.bbb') > 0, 'files with extensions are compared first by filename');
		assert(compareFileNamesLower('aggregate.go', 'aggregate_repo.go') < 0, 'shorter filenames sort before longer names even though dot sorts after underscore');

	});

	test('compareFileNamesMixed', () => {

		// same-case basic comparisons
		assert(compareFileNamesMixed(null, null) === 0, 'null should be equal');
		assert(compareFileNamesMixed(null, 'abc') < 0, 'null should come before real values');
		assert(compareFileNamesMixed('', '') === 0, 'empty should be equal');
		assert(compareFileNamesMixed('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileNamesMixed('a', 'â') === 'a'.localeCompare('â'), 'the same lowercase letter with an accent should compare according to the locale');
		assert(compareFileNamesMixed('A', 'Â') === 'A'.localeCompare('Â'), 'the same uppercase letter with an accent should compare according to the locale');
		assert(compareFileNamesMixed('art', 'artichoke') < 0, 'shorter names sort before longer names with the same root');

		// mixed-case basic comparisons
		assert(compareFileNamesMixed('z', 'A') > 0, 'z comes is after A');
		assert(compareFileNamesMixed('Z', 'a') > 0, 'Z comes after a');
		assert(compareFileNamesMixed('a', 'A') === 'a'.localeCompare('A'), 'the same letter sorts by locale');
		assert(compareFileNamesMixed('â', 'Â') === 'â'.localeCompare('Â'), 'the same accented letter sorts by locale');
		assert(compareFileNamesMixed('art', 'Art') === 'art'.localeCompare('Art'), 'the same word sorts by locale');
		assert(compareFileNamesMixed('art', 'Artichoke') < 0, 'a longer uppercase word that starts with the same lowercase word sorts shortest first');
		assert(compareFileNamesMixed('artichoke', 'Art') > 0, 'a longer lowercase word that starts with the same uppercase word sorts shortest first');
		assert(compareFileNamesMixed('école', 'École') === 'école'.localeCompare('École'), 'the same accented words sort by locale');
		assert(compareFileNamesMixed('a.MD', 'A.md') === 'a'.localeCompare('A'), 'files different case names sort by name locale comparison');

		// same-case dotfile comparisons
		assert(compareFileNamesMixed('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileNamesMixed('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
		assert(compareFileNamesMixed('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
		assert(compareFileNamesMixed('.env', '.gitattributes') < 0, 'dotfiles sort in alphabetical order');
		assert(compareFileNamesMixed('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
		assert(compareFileNamesMixed('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
		assert(compareFileNamesMixed('.aaa_env', '.aaa.env') < 0, 'and underscore in a dotfile name will sort before a dot');

		// mixed-case dotfile comparisons
		assert(compareFileNamesMixed('A.MD', '.md') > 0, 'dotfiles sort before uppercase files');
		assert(compareFileNamesMixed('a.md', '.MD') > 0, 'dotfiles sort before lowercase files');
		assert(compareFileNamesMixed('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');

		// same-case numeric comparisons
		assert(compareFileNamesMixed('abc2.txt', 'abc10.txt') === 'abc2'.localeCompare('abc10', undefined, { numeric: false }),
			'filenames with numbers sort alphabetically, not numerically');

		// mixed-case numeric comparisons
		assert(compareFileNamesMixed('abc10.txt', 'Abc2.txt') === 'abc10'.localeCompare('Abc2', undefined, { numeric: false }),
			'mixed-case names with numbers sort alphabetically by locale');

		// comparisons that depend on comparing names before extensions
		assert(compareFileNamesMixed('bbb.aaa', 'aaa.bbb') > 0, 'files with extensions are compared first by filename');
		assert(compareFileNamesMixed('aggregate.go', 'aggregate_repo.go') < 0, 'shorter filenames sort before longer names even though dot sorts after underscore');

	});

	test('compareFileNamesNumeric', () => {

		// same-case basic comparisons
		assert(compareFileNamesNumeric(null, null) === 0, 'null should be equal');
		assert(compareFileNamesNumeric(null, 'abc') < 0, 'null should come before real values');
		assert(compareFileNamesNumeric('', '') === 0, 'empty should be equal');
		assert(compareFileNamesNumeric('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileNamesNumeric('a', 'â') === 'a'.localeCompare('â'), 'the same lowercase letter with an accent should compare according to the locale');
		assert(compareFileNamesNumeric('A', 'Â') === 'A'.localeCompare('Â'), 'the same uppercase letter with an accent should compare according to the locale');
		assert(compareFileNamesNumeric('art', 'artichoke') < 0, 'shorter names sort before longer names with the same root');

		// mixed-case basic comparisons
		assert(compareFileNamesNumeric('z', 'A') > 0, 'z comes is after A');
		assert(compareFileNamesNumeric('Z', 'a') > 0, 'Z comes after a');
		assert(compareFileNamesNumeric('a', 'A') === 'a'.localeCompare('A'), 'the same letter sorts by locale');
		assert(compareFileNamesNumeric('â', 'Â') === 'â'.localeCompare('Â'), 'the same accented letter sorts by locale');
		assert(compareFileNamesNumeric('art', 'Art') === 'art'.localeCompare('Art'), 'the same word sorts by locale');
		assert(compareFileNamesNumeric('art', 'Artichoke') < 0, 'a longer uppercase word that starts with the same lowercase word sorts shortest first');
		assert(compareFileNamesNumeric('artichoke', 'Art') > 0, 'a longer lowercase word that starts with the same uppercase word sorts shortest first');
		assert(compareFileNamesNumeric('école', 'École') === 'école'.localeCompare('École'), 'the same accented words sort by locale');
		assert(compareFileNamesNumeric('a.MD', 'A.md') === 'a'.localeCompare('A'), 'files different case names sort by name locale comparison');

		// same-case dotfile comparisons
		assert(compareFileNamesNumeric('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileNamesNumeric('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
		assert(compareFileNamesNumeric('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
		assert(compareFileNamesNumeric('.env', '.gitattributes') < 0, 'dotfiles sort in alphabetical order');
		assert(compareFileNamesNumeric('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
		assert(compareFileNamesNumeric('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
		assert(compareFileNamesNumeric('.aaa_env', '.aaa.env') < 0, 'and underscore in a dotfile name will sort before a dot');

		// mixed-case dotfile comparisons
		assert(compareFileNamesNumeric('A.MD', '.md') > 0, 'dotfiles sort before uppercase files');
		assert(compareFileNamesNumeric('a.md', '.MD') > 0, 'dotfiles sort before lowercase files');
		assert(compareFileNamesNumeric('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');

		// same-case numeric comparisons
		assert(compareFileNamesNumeric('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order');
		assert(compareFileNamesNumeric('abc02.txt', 'abc002.txt') < 0, 'filenames with equivalent numbers and leading zeros sort shortest string first');
		assert(compareFileNamesNumeric('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
		assert(compareFileNamesNumeric('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
		assert(compareFileNamesNumeric('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');

		// mixed-case numeric comparisons
		assert(compareFileNamesNumeric('art01', 'Art01') === 'art01'.localeCompare('Art01', undefined, { numeric: true }),
			'a numerically equivalent word of a different case compares numerically based on locale');

		// comparisons that depend on comparing names then extensions
		assert(compareFileNamesNumeric('bbb.aaa', 'aaa.bbb') > 0, 'files with extensions are compared first by filename');
		assert(compareFileNamesNumeric('aggregate.go', 'aggregate_repo.go') < 0, 'shorter filenames sort before longer names even though dot sorts after underscore');

	});

	test('compareFileExtensionsUnicode', () => {

		assert(compareFileExtensionsUnicode('', '') === 0, 'empty strings are equal');
		assert(compareFileExtensionsUnicode('.', '_') < 0, 'dot comes before underscore');
		assert(compareFileExtensionsUnicode('b', 'a.exe') < 0, 'names with no extension come before names with extensions');
		assert(compareFileExtensionsUnicode('a.b', 'b.a') > 0, 'names sort by extension then filename');
		assert(compareFileExtensionsUnicode('a.exe', 'b.exe') < 0, 'if equal extensions, filenames should be compared');
		assert(compareFileExtensionsUnicode('.exe', 'a.aaa') < 0, 'dotfile sorts before non-dotfile');
		assert(compareFileExtensionsUnicode('aggregate.go', 'aggregate_repo.go') < 0, 'filenames with underscores sort as expected');
		assert(compareFileExtensionsUnicode('z', 'Á') < 0, 'all characters with accents sort after regular characters');
		assert(compareFileExtensionsUnicode('Z', 'a') < 0, 'all capital letters sort before all lowercase letters');
		assert(compareFileExtensionsUnicode('art.b', 'art.a.b') < 0, 'extensions are compared separately from names');

	});

	test('compareFileExtensionsNumeric', () => {

		// same-case basic comparisons
		assert(compareFileExtensionsNumeric(null, null) === 0, 'null should be equal');
		assert(compareFileExtensionsNumeric(null, '.abc') < 0, 'null should come before dotfiles');
		assert(compareFileExtensionsNumeric(null, 'abc') < 0, 'null should come before real files without extensions');
		assert(compareFileExtensionsNumeric('', '') === 0, 'empty should be equal');
		assert(compareFileExtensionsNumeric('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileExtensionsNumeric('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileExtensionsNumeric('file.ext', 'file.ext') === 0, 'equal full filenames should be equal');
		assert(compareFileExtensionsNumeric('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');

		// mixed-case basic comparisons
		assert(compareFileExtensionsNumeric('z', 'A') > 0, 'z comes after A');
		assert(compareFileExtensionsNumeric('Z', 'a') > 0, 'Z comes after a');
		assert(compareFileExtensionsNumeric('a', 'A') === 'a'.localeCompare('A'), 'the same letter sorts by locale');
		assert(compareFileExtensionsNumeric('â', 'Â') === 'â'.localeCompare('Â'), 'the same accented letter sorts by locale');
		assert(compareFileExtensionsNumeric('art', 'Art') === 'art'.localeCompare('Art'), 'the same word sorts by locale');
		assert(compareFileExtensionsNumeric('art', 'Artichoke') < 0, 'a longer uppercase word that starts with the same lowercase word sorts shortest first');
		assert(compareFileExtensionsNumeric('artichoke', 'Art') > 0, 'a longer lowercase word that starts with the same uppercase word sorts shortest first');
		assert(compareFileExtensionsNumeric('école', 'École') === 'école'.localeCompare('École'), 'the same accented words sort by locale');

		// same-case dotfile comparisons
		assert(compareFileExtensionsNumeric('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileExtensionsNumeric('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
		assert(compareFileExtensionsNumeric('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
		assert(compareFileExtensionsNumeric('.env', '.gitattributes') < 0, 'dotfiles sort in alphabetical order');
		assert(compareFileExtensionsNumeric('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
		assert(compareFileExtensionsNumeric('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
		assert(compareFileExtensionsNumeric('.aaa_env', '.aaa.env') < 0, 'and underscore in a dotfile name will sort before a dot');

		// mixed-case dotfile comparisons
		assert(compareFileExtensionsNumeric('A.MD', '.md') > 0, 'dotfiles sort before uppercase files');
		assert(compareFileExtensionsNumeric('a.md', '.MD') > 0, 'dotfiles sort before lowercase files');
		assert(compareFileExtensionsNumeric('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');

		// same-case numeric comparisons
		assert(compareFileExtensionsNumeric('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order');
		assert(compareFileExtensionsNumeric('abc02.txt', 'abc002.txt') < 0, 'filenames with equivalent numbers and leading zeros sort shortest string first');
		assert(compareFileExtensionsNumeric('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
		assert(compareFileExtensionsNumeric('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
		assert(compareFileExtensionsNumeric('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');

		// mixed-case numeric comparisons
		assert(compareFileExtensionsNumeric('art01', 'Art01') === 'art01'.localeCompare('Art01', undefined, { numeric: true }),
			'a numerically equivalent word of a different case compares numerically based on locale');

		// comparisons that depend on comparing extensions then names
		assert(compareFileExtensionsNumeric('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extension first');
		assert(compareFileExtensionsNumeric('agg.go', 'aggrepo.go') < 0, 'shorter names sort before longer names');
		assert(compareFileExtensionsNumeric('agg.go', 'agg_repo.go') < 0, 'shorter names short before longer names even when the longer name contains an underscore');

		// extensions with numbers comparisons
		assert(compareFileExtensionsNumeric('abc.txt01', 'abc.txt1') > 0, 'extensions with equal numbers should be in shortest-first order');
		assert(compareFileExtensionsNumeric('abc.txt2', 'abc.txt10') < 0, 'filenames with numbers in their extensions should sort numerically when they are multiple digits long');

		// comparisons that depend on how extensions plus case are handled
		assert(compareFileExtensionsNumeric('a.MD', 'a.md') === 'MD'.localeCompare('md'), 'case differences in extensions sort by locale');
		assert(compareFileExtensionsNumeric('a.MD', 'b.md') < 0, 'when extensions are the same except for case, the files sort by name');
		assert(compareFileExtensionsNumeric('a.MD', 'A.md') === 'a'.localeCompare('A'), 'case differences in names sort by locale');


		// comparisons that depend on how case and numbers are handled
		assert(compareFileExtensionsNumeric('a10.txt', 'A2.txt') === 'a10.txt'.localeCompare('A2.txt', undefined, { numeric: true }), 'filenames with numbers and case differences sort numerically with case by locale');

	});

	test('compareFileExtensionsUpper', () => {
		// same-case basic comparisons
		assert(compareFileExtensionsUpper(null, null) === 0, 'null should be equal');
		assert(compareFileExtensionsUpper(null, '.abc') < 0, 'null should come before dotfiles');
		assert(compareFileExtensionsUpper(null, 'abc') < 0, 'null should come before real files without extensions');
		assert(compareFileExtensionsUpper('', '') === 0, 'empty should be equal');
		assert(compareFileExtensionsUpper('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileExtensionsUpper('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileExtensionsUpper('file.ext', 'file.ext') === 0, 'equal full filenames should be equal');
		assert(compareFileExtensionsUpper('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');

		// mixed-case basic comparisons
		assert(compareFileExtensionsUpper('z', 'A') > 0, 'uppercase A comes before lowercase z');
		assert(compareFileExtensionsUpper('Z', 'a') < 0, 'uppercase Z comes before lowercase a');
		assert(compareFileExtensionsUpper('a', 'A') > 0, 'the same letter sorts uppercase first');
		assert(compareFileExtensionsUpper('â', 'Â') > 0, 'the same accented letter sorts uppercase first');
		assert(compareFileExtensionsUpper('art', 'Art') > 0, 'the same word sorts uppercase first');
		assert(compareFileExtensionsUpper('art', 'Artichoke') > 0, 'a longer uppercase word that starts with the same lowercase word sorts uppercase first');
		assert(compareFileExtensionsUpper('artichoke', 'Art') > 0, 'a longer lowercase word that starts with the same uppercase word sorts after');
		assert(compareFileExtensionsUpper('école', 'École') > 0, 'the same accented words sort uppercase first');

		// same-case dotfile comparisons
		assert(compareFileExtensionsUpper('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileExtensionsUpper('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
		assert(compareFileExtensionsUpper('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
		assert(compareFileExtensionsUpper('.env', '.gitattributes') < 0, 'dotfiles sort in alphabetical order');
		assert(compareFileExtensionsUpper('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
		assert(compareFileExtensionsUpper('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
		assert(compareFileExtensionsUpper('.aaa_env', '.aaa.env') < 0, 'and underscore in a dotfile name will sort before a dot');

		// mixed-case dotfile comparisons
		assert(compareFileExtensionsUpper('A.MD', '.md') > 0, 'dotfiles sort before uppercase files');
		assert(compareFileExtensionsUpper('a.md', '.MD') > 0, 'dotfiles sort before lowercase files');
		assert(compareFileExtensionsUpper('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');

		// same-case numeric comparisons
		assert(compareFileExtensionsUpper('abc2.txt', 'abc10.txt') > 0, 'filenames with numbers should be in alphabetical order');
		assert(compareFileExtensionsUpper('abc02.txt', 'abc002.txt') > 0, 'filenames with equivalent numbers and leading zeros sort alphabetically');
		assert(compareFileExtensionsUpper('abc02.txt', 'abc010.txt') > 0, 'filenames with numbers that have leading zeros sort alphabetically');
		assert(compareFileExtensionsUpper('abc02.txt', 'abc010.txt') > 0, 'filenames with numbers that have leading zeros sort alphabetically');
		assert(compareFileExtensionsUpper('abc1.10.txt', 'abc1.2.txt') < 0, 'numbers with dots between sort alphabetically');

		// mixed-case numeric comparisons
		assert(compareFileExtensionsUpper('art01', 'Art01') > 0, 'a numerically equivalent word of a different case sorts uppercase first');

		// comparisons that depend on comparing extensions then names
		assert(compareFileExtensionsUpper('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extension first');
		assert(compareFileExtensionsUpper('agg.go', 'aggrepo.go') < 0, 'shorter names sort before longer names');
		assert(compareFileExtensionsUpper('agg.go', 'agg_repo.go') < 0, 'shorter names short before longer names even when the longer name contains an underscore');
		assert(compareFileExtensionsUpper('abc2.04txt', 'abc2.2txt') < 0, 'numbers around a the extension dot separator are not compared alphabetically');
		assert(compareFileExtensionsUpper('abc.02txt', 'abc.2txt') < 0, 'equivalent numbers in extensions sort alphabetically');

		// comparisons that depend on how extensions plus case are handled
		assert(compareFileExtensionsUpper('a.MD', 'a.md') === 'MD'.localeCompare('md'), 'case differences in extensions sort by locale');
		assert(compareFileExtensionsUpper('a.MD', 'b.md') < 0, 'when extensions are the same except for case, the files sort by name');
		assert(compareFileExtensionsUpper('art.MD', 'Art.MD') > 0, 'when extensions are the same, files with uppercase names sort first');
		assert(compareFileExtensionsUpper('art.MD', 'Art.md') > 0, 'when extensions are the same except in case, files with uppercase names sort first');

		// comparisons that depend on how case and numbers are handled
		assert(compareFileExtensionsUpper('a10.txt', 'A2.txt') > 0, 'filenames with numbers and case differences sort uppercase first');

	});

	test('compareFileExtensionsLower', () => {

		// same-case basic comparisons
		assert(compareFileExtensionsLower(null, null) === 0, 'null should be equal');
		assert(compareFileExtensionsLower(null, '.abc') < 0, 'null should come before dotfiles');
		assert(compareFileExtensionsLower(null, 'abc') < 0, 'null should come before real files without extensions');
		assert(compareFileExtensionsLower('', '') === 0, 'empty should be equal');
		assert(compareFileExtensionsLower('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileExtensionsLower('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileExtensionsLower('file.ext', 'file.ext') === 0, 'equal full filenames should be equal');
		assert(compareFileExtensionsLower('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');

		// mixed-case basic comparisons
		assert(compareFileExtensionsLower('z', 'A') < 0, 'uppercase A comes after lowercase z');
		assert(compareFileExtensionsLower('Z', 'a') > 0, 'uppercase Z comes after lowercase a');
		assert(compareFileExtensionsLower('a', 'A') < 0, 'the same letter sorts lowercase first');
		assert(compareFileExtensionsLower('â', 'Â') < 0, 'the same accented letter sorts lowercase first');
		assert(compareFileExtensionsLower('art', 'Art') < 0, 'the same word sorts lowercase first');
		assert(compareFileExtensionsLower('art', 'Artichoke') < 0, 'a longer uppercase word that starts with the same lowercase word sorts lowercase first');
		assert(compareFileExtensionsLower('artichoke', 'Art') < 0, 'a longer lowercase word that starts with the same uppercase word sorts before');
		assert(compareFileExtensionsLower('école', 'École') < 0, 'the same accented words sort lowercase first');

		// same-case dotfile comparisons
		assert(compareFileExtensionsLower('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileExtensionsLower('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
		assert(compareFileExtensionsLower('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
		assert(compareFileExtensionsLower('.env', '.gitattributes') < 0, 'dotfiles sort in alphabetical order');
		assert(compareFileExtensionsLower('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
		assert(compareFileExtensionsLower('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
		assert(compareFileExtensionsLower('.aaa_env', '.aaa.env') < 0, 'and underscore in a dotfile name will sort before a dot');

		// mixed-case dotfile comparisons
		assert(compareFileExtensionsLower('A.MD', '.md') > 0, 'dotfiles sort before uppercase files');
		assert(compareFileExtensionsLower('a.md', '.MD') > 0, 'dotfiles sort before lowercase files');
		assert(compareFileExtensionsLower('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');

		// same-case numeric comparisons
		assert(compareFileExtensionsLower('abc2.txt', 'abc10.txt') > 0, 'filenames with numbers should be in alphabetical order');
		assert(compareFileExtensionsLower('abc02.txt', 'abc002.txt') > 0, 'filenames with equivalent numbers and leading zeros sort alphabetically');
		assert(compareFileExtensionsLower('abc02.txt', 'abc010.txt') > 0, 'filenames with numbers that have leading zeros sort alphabetically');
		assert(compareFileExtensionsLower('abc02.txt', 'abc010.txt') > 0, 'filenames with numbers that have leading zeros sort alphabetically');
		assert(compareFileExtensionsLower('abc1.10.txt', 'abc1.2.txt') < 0, 'numbers with dots between sort alphabetically');

		// mixed-case numeric comparisons
		assert(compareFileExtensionsLower('art01', 'Art01') < 0, 'a numerically equivalent word of a different case sorts lowercase first');

		// comparisons that depend on comparing extensions then names
		assert(compareFileExtensionsLower('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extension first');
		assert(compareFileExtensionsLower('agg.go', 'aggrepo.go') < 0, 'shorter names sort before longer names');
		assert(compareFileExtensionsLower('agg.go', 'agg_repo.go') < 0, 'shorter names short before longer names even when the longer name contains an underscore');
		assert(compareFileExtensionsLower('abc2.04txt', 'abc2.2txt') < 0, 'numbers around a the extension dot separator are not compared alphabetically');
		assert(compareFileExtensionsLower('abc.02txt', 'abc.2txt') < 0, 'equivalent numbers in extensions sort alphabetically');

		// comparisons that depend on how extensions plus case are handled
		assert(compareFileExtensionsLower('a.MD', 'a.md') === 'MD'.localeCompare('md'), 'case differences in extensions are sorted by locale');
		assert(compareFileExtensionsLower('a.MD', 'b.md') < 0, 'when extensions are the same except for case, the files sort by name');
		assert(compareFileExtensionsLower('art.MD', 'Art.MD') < 0, 'when extensions are the same, files with lowercase names sort first');
		assert(compareFileExtensionsLower('art.MD', 'Art.md') < 0, 'when extensions are the same except in case, files with lowercase names sort first');

		// comparisons that depend on how case and numbers are handled
		assert(compareFileExtensionsLower('a10.txt', 'A2.txt') < 0, 'filenames with numbers and case differences sort lowercase first');

	});

	test('compareFileExtensionsMixed', () => {

		// same-case basic comparisons
		assert(compareFileExtensionsMixed(null, null) === 0, 'null should be equal');
		assert(compareFileExtensionsMixed(null, '.abc') < 0, 'null should come before dotfiles');
		assert(compareFileExtensionsMixed(null, 'abc') < 0, 'null should come before real files without extensions');
		assert(compareFileExtensionsMixed('', '') === 0, 'empty should be equal');
		assert(compareFileExtensionsMixed('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileExtensionsMixed('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileExtensionsMixed('file.ext', 'file.ext') === 0, 'equal full filenames should be equal');
		assert(compareFileExtensionsMixed('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');

		// mixed-case basic comparisons
		assert(compareFileExtensionsMixed('z', 'A') > 0, 'z comes after A');
		assert(compareFileExtensionsMixed('Z', 'a') > 0, 'Z comes after a');
		assert(compareFileExtensionsMixed('a', 'A') === 'a'.localeCompare('A'), 'the same letter sorts by locale');
		assert(compareFileExtensionsMixed('â', 'Â') === 'â'.localeCompare('Â'), 'the same accented letter sorts by locale');
		assert(compareFileExtensionsMixed('art', 'Art') === 'art'.localeCompare('Art'), 'the same word sorts by locale');
		assert(compareFileExtensionsMixed('art', 'Artichoke') < 0, 'a longer uppercase word that starts with the same lowercase word sorts shortest first');
		assert(compareFileExtensionsMixed('artichoke', 'Art') > 0, 'a longer lowercase word that starts with the same uppercase word sorts shortest first');
		assert(compareFileExtensionsMixed('école', 'École') === 'école'.localeCompare('École'), 'the same accented words sort by locale');

		// same-case dotfile comparisons
		assert(compareFileExtensionsMixed('.abc', '.abc') === 0, 'equal dotfiles should be equal');
		assert(compareFileExtensionsMixed('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
		assert(compareFileExtensionsMixed('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
		assert(compareFileExtensionsMixed('.env', '.gitattributes') < 0, 'dotfiles sort in alphabetical order');
		assert(compareFileExtensionsMixed('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
		assert(compareFileExtensionsMixed('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
		assert(compareFileExtensionsMixed('.aaa_env', '.aaa.env') < 0, 'and underscore in a dotfile name will sort before a dot');

		// mixed-case dotfile comparisons
		assert(compareFileExtensionsMixed('A.MD', '.md') > 0, 'dotfiles sort before uppercase files');
		assert(compareFileExtensionsMixed('a.md', '.MD') > 0, 'dotfiles sort before lowercase files');
		assert(compareFileExtensionsMixed('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');

		// same-case numeric comparisons
		assert(compareFileExtensionsMixed('abc2.txt', 'abc10.txt') > 0, 'filenames with numbers should be in alphabetical order');
		assert(compareFileExtensionsMixed('abc02.txt', 'abc002.txt') > 0, 'filenames with equivalent numbers and leading zeros sort alphabetically');
		assert(compareFileExtensionsMixed('abc02.txt', 'abc010.txt') > 0, 'filenames with numbers that have leading zeros sort alphabetically');
		assert(compareFileExtensionsMixed('abc02.txt', 'abc010.txt') > 0, 'filenames with numbers that have leading zeros sort alphabetically');
		assert(compareFileExtensionsMixed('abc1.10.txt', 'abc1.2.txt') < 0, 'numbers with dots between sort alphabetically');

		// mixed-case numeric comparisons
		assert(compareFileExtensionsMixed('art01', 'Art01') < 0, 'a numerically equivalent word of a different case sorts lowercase first');

		// comparisons that depend on comparing extensions then names
		assert(compareFileExtensionsMixed('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extension first');
		assert(compareFileExtensionsMixed('agg.go', 'aggrepo.go') < 0, 'shorter names sort before longer names');
		assert(compareFileExtensionsMixed('agg.go', 'agg_repo.go') < 0, 'shorter names short before longer names even when the longer name contains an underscore');
		assert(compareFileExtensionsMixed('abc2.04txt', 'abc2.2txt') < 0, 'numbers around a the extension dot separator are not compared alphabetically');
		assert(compareFileExtensionsMixed('abc.02txt', 'abc.2txt') < 0, 'equivalent numbers in extensions sort alphabetically');

		// comparisons that depend on how extensions plus case are handled
		assert(compareFileExtensionsMixed('a.MD', 'a.md') === 'MD'.localeCompare('md'), 'case differences in extensions sort by locale');
		assert(compareFileExtensionsMixed('a.MD', 'b.md') < 0, 'when extensions are the same except in case, the files sort by name');
		assert(compareFileExtensionsMixed('art.MD', 'Art.MD') === 'art'.localeCompare('Art'), 'when extensions are the same, files sort by name and locale');
		assert(compareFileExtensionsMixed('art.MD', 'Art.md') === 'art'.localeCompare('Art'), 'when extensions are the same except in case, files sort by name and locale');

		// comparisons that depend on how case and numbers are handled
		assert(compareFileExtensionsMixed('a10.txt', 'A2.txt') === 'a10'.localeCompare('A2'), 'filenames with numbers and case differences sort by locale');

	});

	test('compareCaseLowerFirst', () => {

		assert(compareCaseLowerFirst('', '') === 0, 'empty strings have equal case');
		assert(compareCaseLowerFirst('.', ',') === 0, 'punctuation characters have equal case');
		assert(compareCaseLowerFirst('1', '2') === 0, 'number characters have equal case');
		assert(compareCaseLowerFirst('\n', ' ') === 0, 'whitespace characters have equal case');
		assert(compareCaseLowerFirst('b', 'A') < 0, 'lowercase a is less than uppercase A');
		assert(compareCaseLowerFirst('a', 'b') === 0, 'two lowercase characters have equal case');
		assert(compareCaseLowerFirst('A', 'B') === 0, 'two uppercase characters have equal case');

		// assert(compareCaseLowerFirst('a', ' ') > 0, 'lowercase is greater than noncase');
		// assert(compareCaseLowerFirst('A', ' ') > 0, 'uppercase is greater than noncase');
		// assert(compareCaseLowerFirst('a', '') > 0, 'lowercase is greater than empty string');
		// assert(compareCaseLowerFirst('A', '') > 0, 'uppercase is greater than empty string');
		assert(compareCaseLowerFirst('a', ' ') === 0, 'lowercase vs noncase is treated as equal');
		assert(compareCaseLowerFirst('A', ' ') === 0, 'uppercase vs noncase is treated as equal');
		assert(compareCaseLowerFirst('a', '') === 0, 'lowercase vs empty string is treated as equal');
		assert(compareCaseLowerFirst('A', '') === 0, 'uppercase vs empty string is treated as equal');

		assert(compareCaseUpperFirst(' ', '_A') === 0, 'a leading noncase character followed by uppercase is still noncase');
		assert(compareCaseUpperFirst('1', '_a') === 0, 'a leading non-case character followed by lowercase is still noncase');

	});

	test('compareCaseUpperFirst', () => {

		assert(compareCaseUpperFirst('', '') === 0, 'empty strings have equal case');
		assert(compareCaseUpperFirst('.', ',') === 0, 'punctuation characters have equal case');
		assert(compareCaseUpperFirst('1', '2') === 0, 'number characters have equal case');
		assert(compareCaseUpperFirst('\n', ' ') === 0, 'whitespace characters have equal case');
		assert(compareCaseUpperFirst('b', 'A') > 0, 'lowercase a is less than uppercase A');
		assert(compareCaseUpperFirst('a', 'b') === 0, 'two lowercase characters have equal case');
		assert(compareCaseUpperFirst('A', 'B') === 0, 'two uppercase characters have equal case');

		// assert(compareCaseUpperFirst('a', ' ') > 0, 'lowercase is greater than noncase');
		// assert(compareCaseUpperFirst('A', ' ') > 0, 'uppercase is greater than noncase');
		// assert(compareCaseUpperFirst('a', '') > 0, 'lowercase is greater than empty string');
		// assert(compareCaseUpperFirst('A', '') > 0, 'uppercase is greater than empty string');
		assert(compareCaseUpperFirst('a', ' ') === 0, 'lowercase vs noncase is treated as equal');
		assert(compareCaseUpperFirst('A', ' ') === 0, 'uppercase vs noncase is treated as equal');
		assert(compareCaseUpperFirst('a', '') === 0, 'lowercase vs empty string is treated as equal');
		assert(compareCaseUpperFirst('A', '') === 0, 'uppercase vs empty string is treated as equal');

		assert(compareCaseUpperFirst(' ', '_A') === 0, 'a leading noncase character followed by uppercase is still noncase');
		assert(compareCaseUpperFirst('1', '_a') === 0, 'a leading non-case character followed by lowercase is still noncase');

	});

});
