// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';

import { verboseRegExp } from '../../../client/common/utils/regexp';

suite('Utils for regular expressions - verboseRegExp()', () => {
    test('whitespace removed in multiline pattern (example of typical usage)', () => {
        const regex = verboseRegExp(`
            ^
            (?:
                spam \\b .*
            ) |
            (?:
                eggs \\b .*
            )
            $
        `);

        expect(regex.source).to.equal('^(?:spam\\b.*)|(?:eggs\\b.*)$', 'mismatch');
    });

    const whitespaceTests = [
        ['spam eggs', 'spameggs'],
        [
            `spam
          eggs`,
            'spameggs',
        ],
        // empty
        ['  ', '(?:)'],
        [
            `
         `,
            '(?:)',
        ],
    ];
    for (const [pat, expected] of whitespaceTests) {
        test(`whitespace removed ("${pat}")`, () => {
            const regex = verboseRegExp(pat);

            expect(regex.source).to.equal(expected, 'mismatch');
        });
    }

    const noopPatterns = ['^(?:spam\\b.*)$', 'spam', '^spam$', 'spam$', '^spam'];
    for (const pat of noopPatterns) {
        test(`pattern not changed ("${pat}")`, () => {
            const regex = verboseRegExp(pat);

            expect(regex.source).to.equal(pat, 'mismatch');
        });
    }

    const emptyPatterns = [
        '',
        `
        `,
        '  ',
    ];
    for (const pat of emptyPatterns) {
        test(`no pattern ("${pat}")`, () => {
            const regex = verboseRegExp(pat);

            expect(regex.source).to.equal('(?:)', 'mismatch');
        });
    }
});
