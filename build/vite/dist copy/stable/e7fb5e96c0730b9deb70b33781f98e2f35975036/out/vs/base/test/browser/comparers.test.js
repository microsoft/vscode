/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { compareFileExtensions, compareFileExtensionsDefault, compareFileExtensionsLower, compareFileExtensionsUnicode, compareFileExtensionsUpper, compareFileNames, compareFileNamesDefault, compareFileNamesLower, compareFileNamesUnicode, compareFileNamesUpper } from '../../common/comparers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';
const compareLocale = (a, b) => a.localeCompare(b);
const compareLocaleNumeric = (a, b) => a.localeCompare(b, undefined, { numeric: true });
suite('Comparers', () => {
    test('compareFileNames', () => {
        //
        // Comparisons with the same results as compareFileNamesDefault
        //
        // name-only comparisons
        assert(compareFileNames(null, null) === 0, 'null should be equal');
        assert(compareFileNames(null, 'abc') < 0, 'null should be come before real values');
        assert(compareFileNames('', '') === 0, 'empty should be equal');
        assert(compareFileNames('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileNames('z', 'A') > 0, 'z comes after A');
        assert(compareFileNames('Z', 'a') > 0, 'Z comes after a');
        // name plus extension comparisons
        assert(compareFileNames('bbb.aaa', 'aaa.bbb') > 0, 'compares the whole name all at once by locale');
        assert(compareFileNames('aggregate.go', 'aggregate_repo.go') > 0, 'compares the whole name all at once by locale');
        // dotfile comparisons
        assert(compareFileNames('.abc', '.abc') === 0, 'equal dotfile names should be equal');
        assert(compareFileNames('.env.', '.gitattributes') < 0, 'filenames starting with dots and with extensions should still sort properly');
        assert(compareFileNames('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
        assert(compareFileNames('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
        assert(compareFileNames('.aaa_env', '.aaa.env') < 0, 'an underscore in a dotfile name will sort before a dot');
        // dotfile vs non-dotfile comparisons
        assert(compareFileNames(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileNames('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
        assert(compareFileNames('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
        assert(compareFileNames('.md', 'A.MD') < 0, 'dotfiles sort before uppercase files');
        assert(compareFileNames('.MD', 'a.md') < 0, 'dotfiles sort before lowercase files');
        // numeric comparisons
        assert(compareFileNames('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileNames('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileNames('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileNames('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order even when they are multiple digits long');
        assert(compareFileNames('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
        assert(compareFileNames('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');
        assert(compareFileNames('a.ext1', 'b.Ext1') < 0, 'if names are different and extensions with numbers are equal except for case, filenames are sorted in name order');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileNames), ['A2.txt', 'a10.txt', 'a20.txt', 'A100.txt'], 'filenames with number and case differences compare numerically');
        //
        // Comparisons with different results than compareFileNamesDefault
        //
        // name-only comparisons
        assert(compareFileNames('a', 'A') !== compareLocale('a', 'A'), 'the same letter sorts in unicode order, not by locale');
        assert(compareFileNames('â', 'Â') !== compareLocale('â', 'Â'), 'the same accented letter sorts in unicode order, not by locale');
        assert.notDeepStrictEqual(['artichoke', 'Artichoke', 'art', 'Art'].sort(compareFileNames), ['artichoke', 'Artichoke', 'art', 'Art'].sort(compareLocale), 'words with the same root and different cases do not sort in locale order');
        assert.notDeepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileNames), ['email', 'Email', 'émail', 'Émail'].sort(compareLocale), 'the same base characters with different case or accents do not sort in locale order');
        // numeric comparisons
        assert(compareFileNames('abc02.txt', 'abc002.txt') > 0, 'filenames with equivalent numbers and leading zeros sort in unicode order');
        assert(compareFileNames('abc.txt1', 'abc.txt01') > 0, 'same name plus extensions with equal numbers sort in unicode order');
        assert(compareFileNames('art01', 'Art01') !== 'art01'.localeCompare('Art01', undefined, { numeric: true }), 'a numerically equivalent word of a different case does not compare numerically based on locale');
        assert(compareFileNames('a.ext1', 'a.Ext1') > 0, 'if names are equal and extensions with numbers are equal except for case, filenames are sorted in full filename unicode order');
    });
    test('compareFileExtensions', () => {
        //
        // Comparisons with the same results as compareFileExtensionsDefault
        //
        // name-only comparisons
        assert(compareFileExtensions(null, null) === 0, 'null should be equal');
        assert(compareFileExtensions(null, 'abc') < 0, 'null should come before real files without extension');
        assert(compareFileExtensions('', '') === 0, 'empty should be equal');
        assert(compareFileExtensions('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileExtensions('z', 'A') > 0, 'z comes after A');
        assert(compareFileExtensions('Z', 'a') > 0, 'Z comes after a');
        // name plus extension comparisons
        assert(compareFileExtensions('file.ext', 'file.ext') === 0, 'equal full names should be equal');
        assert(compareFileExtensions('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
        assert(compareFileExtensions('file.aaa', 'file.bbb') < 0, 'files with equal names should be compared by extensions');
        assert(compareFileExtensions('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extensions even if filenames compare differently');
        // dotfile comparisons
        assert(compareFileExtensions('.abc', '.abc') === 0, 'equal dotfiles should be equal');
        assert(compareFileExtensions('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');
        // dotfile vs non-dotfile comparisons
        assert(compareFileExtensions(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileExtensions('.env', 'aaa.env') < 0, 'if equal extensions, filenames should be compared, empty filename should come before others');
        assert(compareFileExtensions('.MD', 'a.md') < 0, 'if extensions differ in case, files sort by extension in unicode order');
        // numeric comparisons
        assert(compareFileExtensions('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileExtensions('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileExtensions('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensions('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order even when they are multiple digits long');
        assert(compareFileExtensions('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
        assert(compareFileExtensions('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');
        assert(compareFileExtensions('abc2.txt2', 'abc1.txt10') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensions('txt.abc1', 'txt.abc1') === 0, 'equal extensions with numbers should be equal');
        assert(compareFileExtensions('txt.abc1', 'txt.abc2') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensions('txt.abc2', 'txt.abc10') < 0, 'extensions with numbers should be in numerical order even when they are multiple digits long');
        assert(compareFileExtensions('a.ext1', 'b.ext1') < 0, 'if equal extensions with numbers, names should be compared');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileExtensions), ['A2.txt', 'a10.txt', 'a20.txt', 'A100.txt'], 'filenames with number and case differences compare numerically');
        //
        // Comparisons with different results from compareFileExtensionsDefault
        //
        // name-only comparisions
        assert(compareFileExtensions('a', 'A') !== compareLocale('a', 'A'), 'the same letter of different case does not sort by locale');
        assert(compareFileExtensions('â', 'Â') !== compareLocale('â', 'Â'), 'the same accented letter of different case does not sort by locale');
        assert.notDeepStrictEqual(['artichoke', 'Artichoke', 'art', 'Art'].sort(compareFileExtensions), ['artichoke', 'Artichoke', 'art', 'Art'].sort(compareLocale), 'words with the same root and different cases do not sort in locale order');
        assert.notDeepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileExtensions), ['email', 'Email', 'émail', 'Émail'].sort((a, b) => a.localeCompare(b)), 'the same base characters with different case or accents do not sort in locale order');
        // name plus extension comparisons
        assert(compareFileExtensions('a.MD', 'a.md') < 0, 'case differences in extensions sort in unicode order');
        assert(compareFileExtensions('a.md', 'A.md') > 0, 'case differences in names sort in unicode order');
        assert(compareFileExtensions('a.md', 'b.MD') > 0, 'when extensions are the same except for case, the files sort by extension');
        assert(compareFileExtensions('aggregate.go', 'aggregate_repo.go') < 0, 'when extensions are equal, names sort in dictionary order');
        // dotfile comparisons
        assert(compareFileExtensions('.env', '.aaa.env') < 0, 'a dotfile with an extension is treated as a name plus an extension - equal extensions');
        assert(compareFileExtensions('.env', '.env.aaa') > 0, 'a dotfile with an extension is treated as a name plus an extension - unequal extensions');
        // dotfile vs non-dotfile comparisons
        assert(compareFileExtensions('.env', 'aaa') > 0, 'filenames without extensions come before dotfiles');
        assert(compareFileExtensions('.md', 'A.MD') > 0, 'a file with an uppercase extension sorts before a dotfile of the same lowercase extension');
        // numeric comparisons
        assert(compareFileExtensions('abc.txt01', 'abc.txt1') < 0, 'extensions with equal numbers sort in unicode order');
        assert(compareFileExtensions('art01', 'Art01') !== compareLocaleNumeric('art01', 'Art01'), 'a numerically equivalent word of a different case does not compare by locale');
        assert(compareFileExtensions('abc02.txt', 'abc002.txt') > 0, 'filenames with equivalent numbers and leading zeros sort in unicode order');
        assert(compareFileExtensions('txt.abc01', 'txt.abc1') < 0, 'extensions with equivalent numbers sort in unicode order');
        assert(compareFileExtensions('a.ext1', 'b.Ext1') > 0, 'if names are different and extensions with numbers are equal except for case, filenames are sorted in extension unicode order');
        assert(compareFileExtensions('a.ext1', 'a.Ext1') > 0, 'if names are equal and extensions with numbers are equal except for case, filenames are sorted in extension unicode order');
    });
    test('compareFileNamesDefault', () => {
        //
        // Comparisons with the same results as compareFileNames
        //
        // name-only comparisons
        assert(compareFileNamesDefault(null, null) === 0, 'null should be equal');
        assert(compareFileNamesDefault(null, 'abc') < 0, 'null should be come before real values');
        assert(compareFileNamesDefault('', '') === 0, 'empty should be equal');
        assert(compareFileNamesDefault('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileNamesDefault('z', 'A') > 0, 'z comes after A');
        assert(compareFileNamesDefault('Z', 'a') > 0, 'Z comes after a');
        // name plus extension comparisons
        assert(compareFileNamesDefault('file.ext', 'file.ext') === 0, 'equal full names should be equal');
        assert(compareFileNamesDefault('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
        assert(compareFileNamesDefault('file.aaa', 'file.bbb') < 0, 'files with equal names should be compared by extensions');
        assert(compareFileNamesDefault('bbb.aaa', 'aaa.bbb') > 0, 'files should be compared by names even if extensions compare differently');
        assert(compareFileNamesDefault('aggregate.go', 'aggregate_repo.go') > 0, 'compares the whole filename in locale order');
        // dotfile comparisons
        assert(compareFileNamesDefault('.abc', '.abc') === 0, 'equal dotfile names should be equal');
        assert(compareFileNamesDefault('.env.', '.gitattributes') < 0, 'filenames starting with dots and with extensions should still sort properly');
        assert(compareFileNamesDefault('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
        assert(compareFileNamesDefault('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
        assert(compareFileNamesDefault('.aaa_env', '.aaa.env') < 0, 'an underscore in a dotfile name will sort before a dot');
        // dotfile vs non-dotfile comparisons
        assert(compareFileNamesDefault(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileNamesDefault('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
        assert(compareFileNamesDefault('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
        assert(compareFileNamesDefault('.md', 'A.MD') < 0, 'dotfiles sort before uppercase files');
        assert(compareFileNamesDefault('.MD', 'a.md') < 0, 'dotfiles sort before lowercase files');
        // numeric comparisons
        assert(compareFileNamesDefault('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileNamesDefault('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileNamesDefault('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileNamesDefault('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order even when they are multiple digits long');
        assert(compareFileNamesDefault('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
        assert(compareFileNamesDefault('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');
        assert(compareFileNamesDefault('a.ext1', 'b.Ext1') < 0, 'if names are different and extensions with numbers are equal except for case, filenames are compared by full filename');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileNamesDefault), ['A2.txt', 'a10.txt', 'a20.txt', 'A100.txt'], 'filenames with number and case differences compare numerically');
        //
        // Comparisons with different results than compareFileNames
        //
        // name-only comparisons
        assert(compareFileNamesDefault('a', 'A') === compareLocale('a', 'A'), 'the same letter sorts by locale');
        assert(compareFileNamesDefault('â', 'Â') === compareLocale('â', 'Â'), 'the same accented letter sorts by locale');
        assert.deepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileNamesDefault), ['email', 'Email', 'émail', 'Émail'].sort(compareLocale), 'the same base characters with different case or accents sort in locale order');
        // numeric comparisons
        assert(compareFileNamesDefault('abc02.txt', 'abc002.txt') < 0, 'filenames with equivalent numbers and leading zeros sort shortest number first');
        assert(compareFileNamesDefault('abc.txt1', 'abc.txt01') < 0, 'same name plus extensions with equal numbers sort shortest number first');
        assert(compareFileNamesDefault('art01', 'Art01') === compareLocaleNumeric('art01', 'Art01'), 'a numerically equivalent word of a different case compares numerically based on locale');
        assert(compareFileNamesDefault('a.ext1', 'a.Ext1') === compareLocale('ext1', 'Ext1'), 'if names are equal and extensions with numbers are equal except for case, filenames are sorted in extension locale order');
    });
    test('compareFileExtensionsDefault', () => {
        //
        // Comparisons with the same result as compareFileExtensions
        //
        // name-only comparisons
        assert(compareFileExtensionsDefault(null, null) === 0, 'null should be equal');
        assert(compareFileExtensionsDefault(null, 'abc') < 0, 'null should come before real files without extensions');
        assert(compareFileExtensionsDefault('', '') === 0, 'empty should be equal');
        assert(compareFileExtensionsDefault('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileExtensionsDefault('z', 'A') > 0, 'z comes after A');
        assert(compareFileExtensionsDefault('Z', 'a') > 0, 'Z comes after a');
        // name plus extension comparisons
        assert(compareFileExtensionsDefault('file.ext', 'file.ext') === 0, 'equal full filenames should be equal');
        assert(compareFileExtensionsDefault('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
        assert(compareFileExtensionsDefault('file.aaa', 'file.bbb') < 0, 'files with equal names should be compared by extensions');
        assert(compareFileExtensionsDefault('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extension first');
        // dotfile comparisons
        assert(compareFileExtensionsDefault('.abc', '.abc') === 0, 'equal dotfiles should be equal');
        assert(compareFileExtensionsDefault('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');
        // dotfile vs non-dotfile comparisons
        assert(compareFileExtensionsDefault(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileExtensionsDefault('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
        assert(compareFileExtensionsDefault('.MD', 'a.md') < 0, 'dotfiles sort before lowercase files');
        // numeric comparisons
        assert(compareFileExtensionsDefault('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileExtensionsDefault('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileExtensionsDefault('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsDefault('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order');
        assert(compareFileExtensionsDefault('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
        assert(compareFileExtensionsDefault('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');
        assert(compareFileExtensionsDefault('abc2.txt2', 'abc1.txt10') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsDefault('txt.abc1', 'txt.abc1') === 0, 'equal extensions with numbers should be equal');
        assert(compareFileExtensionsDefault('txt.abc1', 'txt.abc2') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsDefault('txt.abc2', 'txt.abc10') < 0, 'extensions with numbers should be in numerical order even when they are multiple digits long');
        assert(compareFileExtensionsDefault('a.ext1', 'b.ext1') < 0, 'if equal extensions with numbers, full filenames should be compared');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileExtensionsDefault), ['A2.txt', 'a10.txt', 'a20.txt', 'A100.txt'], 'filenames with number and case differences compare numerically');
        //
        // Comparisons with different results than compareFileExtensions
        //
        // name-only comparisons
        assert(compareFileExtensionsDefault('a', 'A') === compareLocale('a', 'A'), 'the same letter of different case sorts by locale');
        assert(compareFileExtensionsDefault('â', 'Â') === compareLocale('â', 'Â'), 'the same accented letter of different case sorts by locale');
        assert.deepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileExtensionsDefault), ['email', 'Email', 'émail', 'Émail'].sort((a, b) => a.localeCompare(b)), 'the same base characters with different case or accents sort in locale order');
        // name plus extension comparisons
        assert(compareFileExtensionsDefault('a.MD', 'a.md') === compareLocale('MD', 'md'), 'case differences in extensions sort by locale');
        assert(compareFileExtensionsDefault('a.md', 'A.md') === compareLocale('a', 'A'), 'case differences in names sort by locale');
        assert(compareFileExtensionsDefault('a.md', 'b.MD') < 0, 'when extensions are the same except for case, the files sort by name');
        assert(compareFileExtensionsDefault('aggregate.go', 'aggregate_repo.go') > 0, 'names with the same extension sort in full filename locale order');
        // dotfile comparisons
        assert(compareFileExtensionsDefault('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
        assert(compareFileExtensionsDefault('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
        // dotfile vs non-dotfile comparisons
        assert(compareFileExtensionsDefault('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
        assert(compareFileExtensionsDefault('.md', 'A.MD') < 0, 'dotfiles sort before uppercase files');
        // numeric comparisons
        assert(compareFileExtensionsDefault('abc.txt01', 'abc.txt1') > 0, 'extensions with equal numbers should be in shortest-first order');
        assert(compareFileExtensionsDefault('art01', 'Art01') === compareLocaleNumeric('art01', 'Art01'), 'a numerically equivalent word of a different case compares numerically based on locale');
        assert(compareFileExtensionsDefault('abc02.txt', 'abc002.txt') < 0, 'filenames with equivalent numbers and leading zeros sort shortest string first');
        assert(compareFileExtensionsDefault('txt.abc01', 'txt.abc1') > 0, 'extensions with equivalent numbers sort shortest extension first');
        assert(compareFileExtensionsDefault('a.ext1', 'b.Ext1') < 0, 'if extensions with numbers are equal except for case, full filenames should be compared');
        assert(compareFileExtensionsDefault('a.ext1', 'a.Ext1') === compareLocale('a.ext1', 'a.Ext1'), 'if extensions with numbers are equal except for case, full filenames are compared in locale order');
    });
    test('compareFileNamesUpper', () => {
        //
        // Comparisons with the same results as compareFileNamesDefault
        //
        // name-only comparisons
        assert(compareFileNamesUpper(null, null) === 0, 'null should be equal');
        assert(compareFileNamesUpper(null, 'abc') < 0, 'null should be come before real values');
        assert(compareFileNamesUpper('', '') === 0, 'empty should be equal');
        assert(compareFileNamesUpper('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileNamesUpper('z', 'A') > 0, 'z comes after A');
        // name plus extension comparisons
        assert(compareFileNamesUpper('file.ext', 'file.ext') === 0, 'equal full names should be equal');
        assert(compareFileNamesUpper('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
        assert(compareFileNamesUpper('file.aaa', 'file.bbb') < 0, 'files with equal names should be compared by extensions');
        assert(compareFileNamesUpper('bbb.aaa', 'aaa.bbb') > 0, 'files should be compared by names even if extensions compare differently');
        assert(compareFileNamesUpper('aggregate.go', 'aggregate_repo.go') > 0, 'compares the full filename in locale order');
        // dotfile comparisons
        assert(compareFileNamesUpper('.abc', '.abc') === 0, 'equal dotfile names should be equal');
        assert(compareFileNamesUpper('.env.', '.gitattributes') < 0, 'filenames starting with dots and with extensions should still sort properly');
        assert(compareFileNamesUpper('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
        assert(compareFileNamesUpper('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
        assert(compareFileNamesUpper('.aaa_env', '.aaa.env') < 0, 'an underscore in a dotfile name will sort before a dot');
        // dotfile vs non-dotfile comparisons
        assert(compareFileNamesUpper(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileNamesUpper('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
        assert(compareFileNamesUpper('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
        assert(compareFileNamesUpper('.md', 'A.MD') < 0, 'dotfiles sort before uppercase files');
        assert(compareFileNamesUpper('.MD', 'a.md') < 0, 'dotfiles sort before lowercase files');
        // numeric comparisons
        assert(compareFileNamesUpper('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileNamesUpper('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileNamesUpper('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileNamesUpper('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order even when they are multiple digits long');
        assert(compareFileNamesUpper('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
        assert(compareFileNamesUpper('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');
        assert(compareFileNamesUpper('abc02.txt', 'abc002.txt') < 0, 'filenames with equivalent numbers and leading zeros sort shortest number first');
        assert(compareFileNamesUpper('abc.txt1', 'abc.txt01') < 0, 'same name plus extensions with equal numbers sort shortest number first');
        assert(compareFileNamesUpper('a.ext1', 'b.Ext1') < 0, 'different names with the equal extensions except for case are sorted by full filename');
        assert(compareFileNamesUpper('a.ext1', 'a.Ext1') === compareLocale('a.ext1', 'a.Ext1'), 'same names with equal and extensions except for case are sorted in full filename locale order');
        //
        // Comparisons with different results than compareFileNamesDefault
        //
        // name-only comparisons
        assert(compareFileNamesUpper('Z', 'a') < 0, 'Z comes before a');
        assert(compareFileNamesUpper('a', 'A') > 0, 'the same letter sorts uppercase first');
        assert(compareFileNamesUpper('â', 'Â') > 0, 'the same accented letter sorts uppercase first');
        assert.deepStrictEqual(['artichoke', 'Artichoke', 'art', 'Art'].sort(compareFileNamesUpper), ['Art', 'Artichoke', 'art', 'artichoke'], 'names with the same root and different cases sort uppercase first');
        assert.deepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileNamesUpper), ['Email', 'Émail', 'email', 'émail'], 'the same base characters with different case or accents sort uppercase first');
        // numeric comparisons
        assert(compareFileNamesUpper('art01', 'Art01') > 0, 'a numerically equivalent name of a different case compares uppercase first');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileNamesUpper), ['A2.txt', 'A100.txt', 'a10.txt', 'a20.txt'], 'filenames with number and case differences group by case then compare by number');
    });
    test('compareFileExtensionsUpper', () => {
        //
        // Comparisons with the same result as compareFileExtensionsDefault
        //
        // name-only comparisons
        assert(compareFileExtensionsUpper(null, null) === 0, 'null should be equal');
        assert(compareFileExtensionsUpper(null, 'abc') < 0, 'null should come before real files without extensions');
        assert(compareFileExtensionsUpper('', '') === 0, 'empty should be equal');
        assert(compareFileExtensionsUpper('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileExtensionsUpper('z', 'A') > 0, 'z comes after A');
        // name plus extension comparisons
        assert(compareFileExtensionsUpper('file.ext', 'file.ext') === 0, 'equal full filenames should be equal');
        assert(compareFileExtensionsUpper('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
        assert(compareFileExtensionsUpper('file.aaa', 'file.bbb') < 0, 'files with equal names should be compared by extensions');
        assert(compareFileExtensionsUpper('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extension first');
        assert(compareFileExtensionsUpper('a.md', 'b.MD') < 0, 'when extensions are the same except for case, the files sort by name');
        assert(compareFileExtensionsUpper('a.MD', 'a.md') === compareLocale('MD', 'md'), 'case differences in extensions sort by locale');
        assert(compareFileExtensionsUpper('aggregate.go', 'aggregate_repo.go') > 0, 'when extensions are equal, compares the full filename');
        // dotfile comparisons
        assert(compareFileExtensionsUpper('.abc', '.abc') === 0, 'equal dotfiles should be equal');
        assert(compareFileExtensionsUpper('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');
        assert(compareFileExtensionsUpper('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
        assert(compareFileExtensionsUpper('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
        // dotfile vs non-dotfile comparisons
        assert(compareFileExtensionsUpper(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileExtensionsUpper('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
        assert(compareFileExtensionsUpper('.MD', 'a.md') < 0, 'dotfiles sort before lowercase files');
        assert(compareFileExtensionsUpper('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
        assert(compareFileExtensionsUpper('.md', 'A.MD') < 0, 'dotfiles sort before uppercase files');
        // numeric comparisons
        assert(compareFileExtensionsUpper('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileExtensionsUpper('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileExtensionsUpper('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsUpper('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order');
        assert(compareFileExtensionsUpper('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
        assert(compareFileExtensionsUpper('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');
        assert(compareFileExtensionsUpper('abc2.txt2', 'abc1.txt10') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsUpper('txt.abc1', 'txt.abc1') === 0, 'equal extensions with numbers should be equal');
        assert(compareFileExtensionsUpper('txt.abc1', 'txt.abc2') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsUpper('txt.abc2', 'txt.abc10') < 0, 'extensions with numbers should be in numerical order even when they are multiple digits long');
        assert(compareFileExtensionsUpper('a.ext1', 'b.ext1') < 0, 'if equal extensions with numbers, full filenames should be compared');
        assert(compareFileExtensionsUpper('abc.txt01', 'abc.txt1') > 0, 'extensions with equal numbers should be in shortest-first order');
        assert(compareFileExtensionsUpper('abc02.txt', 'abc002.txt') < 0, 'filenames with equivalent numbers and leading zeros sort shortest string first');
        assert(compareFileExtensionsUpper('txt.abc01', 'txt.abc1') > 0, 'extensions with equivalent numbers sort shortest extension first');
        assert(compareFileExtensionsUpper('a.ext1', 'b.Ext1') < 0, 'different names and extensions that are equal except for case are sorted in full filename order');
        assert(compareFileExtensionsUpper('a.ext1', 'a.Ext1') === compareLocale('a.ext1', 'b.Ext1'), 'same names and extensions that are equal except for case are sorted in full filename locale order');
        //
        // Comparisons with different results than compareFileExtensionsDefault
        //
        // name-only comparisons
        assert(compareFileExtensionsUpper('Z', 'a') < 0, 'Z comes before a');
        assert(compareFileExtensionsUpper('a', 'A') > 0, 'the same letter sorts uppercase first');
        assert(compareFileExtensionsUpper('â', 'Â') > 0, 'the same accented letter sorts uppercase first');
        assert.deepStrictEqual(['artichoke', 'Artichoke', 'art', 'Art'].sort(compareFileExtensionsUpper), ['Art', 'Artichoke', 'art', 'artichoke'], 'names with the same root and different cases sort uppercase names first');
        assert.deepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileExtensionsUpper), ['Email', 'Émail', 'email', 'émail'], 'the same base characters with different case or accents sort uppercase names first');
        // name plus extension comparisons
        assert(compareFileExtensionsUpper('a.md', 'A.md') > 0, 'case differences in names sort uppercase first');
        assert(compareFileExtensionsUpper('art01', 'Art01') > 0, 'a numerically equivalent word of a different case sorts uppercase first');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileExtensionsUpper), ['A2.txt', 'A100.txt', 'a10.txt', 'a20.txt',], 'filenames with number and case differences group by case then sort by number');
    });
    test('compareFileNamesLower', () => {
        //
        // Comparisons with the same results as compareFileNamesDefault
        //
        // name-only comparisons
        assert(compareFileNamesLower(null, null) === 0, 'null should be equal');
        assert(compareFileNamesLower(null, 'abc') < 0, 'null should be come before real values');
        assert(compareFileNamesLower('', '') === 0, 'empty should be equal');
        assert(compareFileNamesLower('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileNamesLower('Z', 'a') > 0, 'Z comes after a');
        // name plus extension comparisons
        assert(compareFileNamesLower('file.ext', 'file.ext') === 0, 'equal full names should be equal');
        assert(compareFileNamesLower('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
        assert(compareFileNamesLower('file.aaa', 'file.bbb') < 0, 'files with equal names should be compared by extensions');
        assert(compareFileNamesLower('bbb.aaa', 'aaa.bbb') > 0, 'files should be compared by names even if extensions compare differently');
        assert(compareFileNamesLower('aggregate.go', 'aggregate_repo.go') > 0, 'compares full filenames');
        // dotfile comparisons
        assert(compareFileNamesLower('.abc', '.abc') === 0, 'equal dotfile names should be equal');
        assert(compareFileNamesLower('.env.', '.gitattributes') < 0, 'filenames starting with dots and with extensions should still sort properly');
        assert(compareFileNamesLower('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
        assert(compareFileNamesLower('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
        assert(compareFileNamesLower('.aaa_env', '.aaa.env') < 0, 'an underscore in a dotfile name will sort before a dot');
        // dotfile vs non-dotfile comparisons
        assert(compareFileNamesLower(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileNamesLower('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
        assert(compareFileNamesLower('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
        assert(compareFileNamesLower('.md', 'A.MD') < 0, 'dotfiles sort before uppercase files');
        assert(compareFileNamesLower('.MD', 'a.md') < 0, 'dotfiles sort before lowercase files');
        // numeric comparisons
        assert(compareFileNamesLower('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileNamesLower('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileNamesLower('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileNamesLower('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order even when they are multiple digits long');
        assert(compareFileNamesLower('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
        assert(compareFileNamesLower('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');
        assert(compareFileNamesLower('abc02.txt', 'abc002.txt') < 0, 'filenames with equivalent numbers and leading zeros sort shortest number first');
        assert(compareFileNamesLower('abc.txt1', 'abc.txt01') < 0, 'same name plus extensions with equal numbers sort shortest number first');
        assert(compareFileNamesLower('a.ext1', 'b.Ext1') < 0, 'different names and extensions that are equal except for case are sorted in full filename order');
        assert(compareFileNamesLower('a.ext1', 'a.Ext1') === compareLocale('a.ext1', 'b.Ext1'), 'same names and extensions that are equal except for case are sorted in full filename locale order');
        //
        // Comparisons with different results than compareFileNamesDefault
        //
        // name-only comparisons
        assert(compareFileNamesLower('z', 'A') < 0, 'z comes before A');
        assert(compareFileNamesLower('a', 'A') < 0, 'the same letter sorts lowercase first');
        assert(compareFileNamesLower('â', 'Â') < 0, 'the same accented letter sorts lowercase first');
        assert.deepStrictEqual(['artichoke', 'Artichoke', 'art', 'Art'].sort(compareFileNamesLower), ['art', 'artichoke', 'Art', 'Artichoke'], 'names with the same root and different cases sort lowercase first');
        assert.deepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileNamesLower), ['email', 'émail', 'Email', 'Émail'], 'the same base characters with different case or accents sort lowercase first');
        // numeric comparisons
        assert(compareFileNamesLower('art01', 'Art01') < 0, 'a numerically equivalent name of a different case compares lowercase first');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileNamesLower), ['a10.txt', 'a20.txt', 'A2.txt', 'A100.txt'], 'filenames with number and case differences group by case then compare by number');
    });
    test('compareFileExtensionsLower', () => {
        //
        // Comparisons with the same result as compareFileExtensionsDefault
        //
        // name-only comparisons
        assert(compareFileExtensionsLower(null, null) === 0, 'null should be equal');
        assert(compareFileExtensionsLower(null, 'abc') < 0, 'null should come before real files without extensions');
        assert(compareFileExtensionsLower('', '') === 0, 'empty should be equal');
        assert(compareFileExtensionsLower('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileExtensionsLower('Z', 'a') > 0, 'Z comes after a');
        // name plus extension comparisons
        assert(compareFileExtensionsLower('file.ext', 'file.ext') === 0, 'equal full filenames should be equal');
        assert(compareFileExtensionsLower('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
        assert(compareFileExtensionsLower('file.aaa', 'file.bbb') < 0, 'files with equal names should be compared by extensions');
        assert(compareFileExtensionsLower('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extension first');
        assert(compareFileExtensionsLower('a.md', 'b.MD') < 0, 'when extensions are the same except for case, the files sort by name');
        assert(compareFileExtensionsLower('a.MD', 'a.md') === compareLocale('MD', 'md'), 'case differences in extensions sort by locale');
        // dotfile comparisons
        assert(compareFileExtensionsLower('.abc', '.abc') === 0, 'equal dotfiles should be equal');
        assert(compareFileExtensionsLower('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');
        assert(compareFileExtensionsLower('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
        assert(compareFileExtensionsLower('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
        // dotfile vs non-dotfile comparisons
        assert(compareFileExtensionsLower(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileExtensionsLower('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
        assert(compareFileExtensionsLower('.MD', 'a.md') < 0, 'dotfiles sort before lowercase files');
        assert(compareFileExtensionsLower('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
        assert(compareFileExtensionsLower('.md', 'A.MD') < 0, 'dotfiles sort before uppercase files');
        // numeric comparisons
        assert(compareFileExtensionsLower('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileExtensionsLower('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileExtensionsLower('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsLower('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order');
        assert(compareFileExtensionsLower('abc02.txt', 'abc010.txt') < 0, 'filenames with numbers that have leading zeros sort numerically');
        assert(compareFileExtensionsLower('abc1.10.txt', 'abc1.2.txt') > 0, 'numbers with dots between them are treated as two separate numbers, not one decimal number');
        assert(compareFileExtensionsLower('abc2.txt2', 'abc1.txt10') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsLower('txt.abc1', 'txt.abc1') === 0, 'equal extensions with numbers should be equal');
        assert(compareFileExtensionsLower('txt.abc1', 'txt.abc2') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsLower('txt.abc2', 'txt.abc10') < 0, 'extensions with numbers should be in numerical order even when they are multiple digits long');
        assert(compareFileExtensionsLower('a.ext1', 'b.ext1') < 0, 'if equal extensions with numbers, full filenames should be compared');
        assert(compareFileExtensionsLower('abc.txt01', 'abc.txt1') > 0, 'extensions with equal numbers should be in shortest-first order');
        assert(compareFileExtensionsLower('abc02.txt', 'abc002.txt') < 0, 'filenames with equivalent numbers and leading zeros sort shortest string first');
        assert(compareFileExtensionsLower('txt.abc01', 'txt.abc1') > 0, 'extensions with equivalent numbers sort shortest extension first');
        assert(compareFileExtensionsLower('a.ext1', 'b.Ext1') < 0, 'if extensions with numbers are equal except for case, full filenames should be compared');
        assert(compareFileExtensionsLower('a.ext1', 'a.Ext1') === compareLocale('a.ext1', 'a.Ext1'), 'if extensions with numbers are equal except for case, filenames are sorted in locale order');
        //
        // Comparisons with different results than compareFileExtensionsDefault
        //
        // name-only comparisons
        assert(compareFileExtensionsLower('z', 'A') < 0, 'z comes before A');
        assert(compareFileExtensionsLower('a', 'A') < 0, 'the same letter sorts lowercase first');
        assert(compareFileExtensionsLower('â', 'Â') < 0, 'the same accented letter sorts lowercase first');
        assert.deepStrictEqual(['artichoke', 'Artichoke', 'art', 'Art'].sort(compareFileExtensionsLower), ['art', 'artichoke', 'Art', 'Artichoke'], 'names with the same root and different cases sort lowercase names first');
        assert.deepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileExtensionsLower), ['email', 'émail', 'Email', 'Émail'], 'the same base characters with different case or accents sort lowercase names first');
        // name plus extension comparisons
        assert(compareFileExtensionsLower('a.md', 'A.md') < 0, 'case differences in names sort lowercase first');
        assert(compareFileExtensionsLower('art01', 'Art01') < 0, 'a numerically equivalent word of a different case sorts lowercase first');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileExtensionsLower), ['a10.txt', 'a20.txt', 'A2.txt', 'A100.txt'], 'filenames with number and case differences group by case then sort by number');
        assert(compareFileExtensionsLower('aggregate.go', 'aggregate_repo.go') > 0, 'when extensions are equal, compares full filenames');
    });
    test('compareFileNamesUnicode', () => {
        //
        // Comparisons with the same results as compareFileNamesDefault
        //
        // name-only comparisons
        assert(compareFileNamesUnicode(null, null) === 0, 'null should be equal');
        assert(compareFileNamesUnicode(null, 'abc') < 0, 'null should be come before real values');
        assert(compareFileNamesUnicode('', '') === 0, 'empty should be equal');
        assert(compareFileNamesUnicode('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileNamesUnicode('z', 'A') > 0, 'z comes after A');
        // name plus extension comparisons
        assert(compareFileNamesUnicode('file.ext', 'file.ext') === 0, 'equal full names should be equal');
        assert(compareFileNamesUnicode('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
        assert(compareFileNamesUnicode('file.aaa', 'file.bbb') < 0, 'files with equal names should be compared by extensions');
        assert(compareFileNamesUnicode('bbb.aaa', 'aaa.bbb') > 0, 'files should be compared by names even if extensions compare differently');
        // dotfile comparisons
        assert(compareFileNamesUnicode('.abc', '.abc') === 0, 'equal dotfile names should be equal');
        assert(compareFileNamesUnicode('.env.', '.gitattributes') < 0, 'filenames starting with dots and with extensions should still sort properly');
        assert(compareFileNamesUnicode('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
        assert(compareFileNamesUnicode('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
        // dotfile vs non-dotfile comparisons
        assert(compareFileNamesUnicode(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileNamesUnicode('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
        assert(compareFileNamesUnicode('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
        assert(compareFileNamesUnicode('.md', 'A.MD') < 0, 'dotfiles sort before uppercase files');
        assert(compareFileNamesUnicode('.MD', 'a.md') < 0, 'dotfiles sort before lowercase files');
        // numeric comparisons
        assert(compareFileNamesUnicode('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileNamesUnicode('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileNamesUnicode('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileNamesUnicode('a.ext1', 'b.Ext1') < 0, 'if names are different and extensions with numbers are equal except for case, filenames are sorted by unicode full filename');
        assert(compareFileNamesUnicode('a.ext1', 'a.Ext1') > 0, 'if names are equal and extensions with numbers are equal except for case, filenames are sorted by unicode full filename');
        //
        // Comparisons with different results than compareFileNamesDefault
        //
        // name-only comparisons
        assert(compareFileNamesUnicode('Z', 'a') < 0, 'Z comes before a');
        assert(compareFileNamesUnicode('a', 'A') > 0, 'the same letter sorts uppercase first');
        assert(compareFileNamesUnicode('â', 'Â') > 0, 'the same accented letter sorts uppercase first');
        assert.deepStrictEqual(['artichoke', 'Artichoke', 'art', 'Art'].sort(compareFileNamesUnicode), ['Art', 'Artichoke', 'art', 'artichoke'], 'names with the same root and different cases sort uppercase first');
        assert.deepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileNamesUnicode), ['Email', 'email', 'Émail', 'émail'], 'the same base characters with different case or accents sort in unicode order');
        // name plus extension comparisons
        assert(compareFileNamesUnicode('aggregate.go', 'aggregate_repo.go') < 0, 'compares the whole name in unicode order, but dot comes before underscore');
        // dotfile comparisons
        assert(compareFileNamesUnicode('.aaa_env', '.aaa.env') > 0, 'an underscore in a dotfile name will sort after a dot');
        // numeric comparisons
        assert(compareFileNamesUnicode('abc2.txt', 'abc10.txt') > 0, 'filenames with numbers should be in unicode order even when they are multiple digits long');
        assert(compareFileNamesUnicode('abc02.txt', 'abc010.txt') > 0, 'filenames with numbers that have leading zeros sort in unicode order');
        assert(compareFileNamesUnicode('abc1.10.txt', 'abc1.2.txt') < 0, 'numbers with dots between them are sorted in unicode order');
        assert(compareFileNamesUnicode('abc02.txt', 'abc002.txt') > 0, 'filenames with equivalent numbers and leading zeros sort in unicode order');
        assert(compareFileNamesUnicode('abc.txt1', 'abc.txt01') > 0, 'same name plus extensions with equal numbers sort in unicode order');
        assert(compareFileNamesUnicode('art01', 'Art01') > 0, 'a numerically equivalent name of a different case compares uppercase first');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileNamesUnicode), ['A100.txt', 'A2.txt', 'a10.txt', 'a20.txt'], 'filenames with number and case differences sort in unicode order');
    });
    test('compareFileExtensionsUnicode', () => {
        //
        // Comparisons with the same result as compareFileExtensionsDefault
        //
        // name-only comparisons
        assert(compareFileExtensionsUnicode(null, null) === 0, 'null should be equal');
        assert(compareFileExtensionsUnicode(null, 'abc') < 0, 'null should come before real files without extensions');
        assert(compareFileExtensionsUnicode('', '') === 0, 'empty should be equal');
        assert(compareFileExtensionsUnicode('abc', 'abc') === 0, 'equal names should be equal');
        assert(compareFileExtensionsUnicode('z', 'A') > 0, 'z comes after A');
        // name plus extension comparisons
        assert(compareFileExtensionsUnicode('file.ext', 'file.ext') === 0, 'equal full filenames should be equal');
        assert(compareFileExtensionsUnicode('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
        assert(compareFileExtensionsUnicode('file.aaa', 'file.bbb') < 0, 'files with equal names should be compared by extensions');
        assert(compareFileExtensionsUnicode('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extension first');
        assert(compareFileExtensionsUnicode('a.md', 'b.MD') < 0, 'when extensions are the same except for case, the files sort by name');
        assert(compareFileExtensionsUnicode('a.MD', 'a.md') < 0, 'case differences in extensions sort in unicode order');
        // dotfile comparisons
        assert(compareFileExtensionsUnicode('.abc', '.abc') === 0, 'equal dotfiles should be equal');
        assert(compareFileExtensionsUnicode('.md', '.Gitattributes') > 0, 'dotfiles sort alphabetically regardless of case');
        assert(compareFileExtensionsUnicode('.env', '.aaa.env') > 0, 'dotfiles sort alphabetically when they contain multiple dots');
        assert(compareFileExtensionsUnicode('.env', '.env.aaa') < 0, 'dotfiles with the same root sort shortest first');
        // dotfile vs non-dotfile comparisons
        assert(compareFileExtensionsUnicode(null, '.abc') < 0, 'null should come before dotfiles');
        assert(compareFileExtensionsUnicode('.env', 'aaa.env') < 0, 'dotfiles come before filenames with extensions');
        assert(compareFileExtensionsUnicode('.MD', 'a.md') < 0, 'dotfiles sort before lowercase files');
        assert(compareFileExtensionsUnicode('.env', 'aaa') < 0, 'dotfiles come before filenames without extensions');
        assert(compareFileExtensionsUnicode('.md', 'A.MD') < 0, 'dotfiles sort before uppercase files');
        // numeric comparisons
        assert(compareFileExtensionsUnicode('1', '1') === 0, 'numerically equal full names should be equal');
        assert(compareFileExtensionsUnicode('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
        assert(compareFileExtensionsUnicode('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsUnicode('txt.abc1', 'txt.abc1') === 0, 'equal extensions with numbers should be equal');
        assert(compareFileExtensionsUnicode('txt.abc1', 'txt.abc2') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
        assert(compareFileExtensionsUnicode('a.ext1', 'b.ext1') < 0, 'if equal extensions with numbers, full filenames should be compared');
        //
        // Comparisons with different results than compareFileExtensionsDefault
        //
        // name-only comparisons
        assert(compareFileExtensionsUnicode('Z', 'a') < 0, 'Z comes before a');
        assert(compareFileExtensionsUnicode('a', 'A') > 0, 'the same letter sorts uppercase first');
        assert(compareFileExtensionsUnicode('â', 'Â') > 0, 'the same accented letter sorts uppercase first');
        assert.deepStrictEqual(['artichoke', 'Artichoke', 'art', 'Art'].sort(compareFileExtensionsUnicode), ['Art', 'Artichoke', 'art', 'artichoke'], 'names with the same root and different cases sort uppercase names first');
        assert.deepStrictEqual(['email', 'Email', 'émail', 'Émail'].sort(compareFileExtensionsUnicode), ['Email', 'email', 'Émail', 'émail'], 'the same base characters with different case or accents sort in unicode order');
        // name plus extension comparisons
        assert(compareFileExtensionsUnicode('a.MD', 'a.md') < 0, 'case differences in extensions sort by uppercase extension first');
        assert(compareFileExtensionsUnicode('a.md', 'A.md') > 0, 'case differences in names sort uppercase first');
        assert(compareFileExtensionsUnicode('art01', 'Art01') > 0, 'a numerically equivalent name of a different case sorts uppercase first');
        assert.deepStrictEqual(['a10.txt', 'A2.txt', 'A100.txt', 'a20.txt'].sort(compareFileExtensionsUnicode), ['A100.txt', 'A2.txt', 'a10.txt', 'a20.txt'], 'filenames with number and case differences sort in unicode order');
        assert(compareFileExtensionsUnicode('aggregate.go', 'aggregate_repo.go') < 0, 'when extensions are equal, compares full filenames in unicode order');
        // numeric comparisons
        assert(compareFileExtensionsUnicode('abc2.txt', 'abc10.txt') > 0, 'filenames with numbers should be in unicode order');
        assert(compareFileExtensionsUnicode('abc02.txt', 'abc010.txt') > 0, 'filenames with numbers that have leading zeros sort in unicode order');
        assert(compareFileExtensionsUnicode('abc1.10.txt', 'abc1.2.txt') < 0, 'numbers with dots between them sort in unicode order');
        assert(compareFileExtensionsUnicode('abc2.txt2', 'abc1.txt10') > 0, 'extensions with numbers should be in unicode order');
        assert(compareFileExtensionsUnicode('txt.abc2', 'txt.abc10') > 0, 'extensions with numbers should be in unicode order even when they are multiple digits long');
        assert(compareFileExtensionsUnicode('abc.txt01', 'abc.txt1') < 0, 'extensions with equal numbers should be in unicode order');
        assert(compareFileExtensionsUnicode('abc02.txt', 'abc002.txt') > 0, 'filenames with equivalent numbers and leading zeros sort in unicode order');
        assert(compareFileExtensionsUnicode('txt.abc01', 'txt.abc1') < 0, 'extensions with equivalent numbers sort in unicode order');
        assert(compareFileExtensionsUnicode('a.ext1', 'b.Ext1') < 0, 'if extensions with numbers are equal except for case, unicode full filenames should be compared');
        assert(compareFileExtensionsUnicode('a.ext1', 'a.Ext1') > 0, 'if extensions with numbers are equal except for case, unicode full filenames should be compared');
    });
    ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcGFyZXJzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9iYXNlL3Rlc3QvYnJvd3Nlci9jb21wYXJlcnMudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUNOLHFCQUFxQixFQUFFLDRCQUE0QixFQUFFLDBCQUEwQixFQUFFLDRCQUE0QixFQUFFLDBCQUEwQixFQUFFLGdCQUFnQixFQUFFLHVCQUF1QixFQUFFLHFCQUFxQixFQUFFLHVCQUF1QixFQUFFLHFCQUFxQixFQUMzUCxNQUFNLDJCQUEyQixDQUFDO0FBQ25DLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBRTdFLE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUNuRSxNQUFNLG9CQUFvQixHQUFHLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLGFBQWEsQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7QUFFeEcsS0FBSyxDQUFDLFdBQVcsRUFBRSxHQUFHLEVBQUU7SUFFdkIsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEdBQUcsRUFBRTtRQUU3QixFQUFFO1FBQ0YsK0RBQStEO1FBQy9ELEVBQUU7UUFFRix3QkFBd0I7UUFDeEIsTUFBTSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsc0JBQXNCLENBQUMsQ0FBQztRQUNuRSxNQUFNLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFB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