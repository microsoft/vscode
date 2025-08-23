// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { expect } from 'chai';
import { Position, Range } from 'vscode';
import { getDedentedLines, getIndent, parsePosition, parseRange } from '../../../client/common/utils/text';

suite('parseRange()', () => {
    test('valid strings', async () => {
        const tests: [string, Range][] = [
            ['1:5-3:5', new Range(new Position(1, 5), new Position(3, 5))],
            ['1:5-3:3', new Range(new Position(1, 5), new Position(3, 3))],
            ['1:3-3:5', new Range(new Position(1, 3), new Position(3, 5))],
            ['1-3:5', new Range(new Position(1, 0), new Position(3, 5))],
            ['1-3', new Range(new Position(1, 0), new Position(3, 0))],
            ['1-1', new Range(new Position(1, 0), new Position(1, 0))],
            ['1', new Range(new Position(1, 0), new Position(1, 0))],
            [
                '1:3-',
                new Range(
                    new Position(1, 3),
                    new Position(0, 0), // ???
                ),
            ],
            ['1:3', new Range(new Position(1, 3), new Position(1, 3))],
            ['', new Range(new Position(0, 0), new Position(0, 0))],
            ['3-1', new Range(new Position(3, 0), new Position(1, 0))],
        ];
        for (const [raw, expected] of tests) {
            const result = parseRange(raw);

            expect(result).to.deep.equal(expected);
        }
    });
    test('valid numbers', async () => {
        const tests: [number, Range][] = [[1, new Range(new Position(1, 0), new Position(1, 0))]];
        for (const [raw, expected] of tests) {
            const result = parseRange(raw);

            expect(result).to.deep.equal(expected);
        }
    });
    test('bad strings', async () => {
        const tests: string[] = [
            '1-2-3',
            '1:4-2-3',
            '1-2:4-3',
            '1-2-3:4',

            '1:2:3',
            '1:2:3-4',
            '1-2:3:4',
            '1:2:3-4:5:6',

            '1-a',
            '1:2-a',
            '1-a:2',
            '1:2-a:2',
            'a-1',
            'a-b',
            'a',
            'a:1',
            'a:b',
        ];
        for (const raw of tests) {
            expect(() => parseRange(raw)).to.throw();
        }
    });
});

suite('parsePosition()', () => {
    test('valid strings', async () => {
        const tests: [string, Position][] = [
            ['1:5', new Position(1, 5)],
            ['1', new Position(1, 0)],
            ['', new Position(0, 0)],
        ];
        for (const [raw, expected] of tests) {
            const result = parsePosition(raw);

            expect(result).to.deep.equal(expected);
        }
    });
    test('valid numbers', async () => {
        const tests: [number, Position][] = [[1, new Position(1, 0)]];
        for (const [raw, expected] of tests) {
            const result = parsePosition(raw);

            expect(result).to.deep.equal(expected);
        }
    });
    test('bad strings', async () => {
        const tests: string[] = ['1:2:3', '1:a', 'a'];
        for (const raw of tests) {
            expect(() => parsePosition(raw)).to.throw();
        }
    });
});

suite('getIndent()', () => {
    const testsData = [
        { line: 'text', expected: '' },
        { line: ' text', expected: ' ' },
        { line: '  text', expected: '  ' },
        { line: '	tabulatedtext', expected: '' },
    ];

    testsData.forEach((testData) => {
        test(`getIndent when line is ${testData.line}`, () => {
            const indent = getIndent(testData.line);

            expect(indent).equal(testData.expected);
        });
    });
});

suite('getDedentedLines()', () => {
    const testsData = [
        { text: '', expected: [] },
        { text: '\n', expected: Error, exceptionMessage: 'expected "first" line to not be blank' },
        { text: 'line1\n', expected: Error, exceptionMessage: 'expected actual first line to be blank' },
        {
            text: '\n  line2\n line3',
            expected: Error,
            exceptionMessage: 'line 1 has less indent than the "first" line',
        },
        {
            text: '\n  line2\n  line3',
            expected: ['line2', 'line3'],
        },
        {
            text: '\n  line2\n     line3',
            expected: ['line2', '   line3'],
        },
    ];

    testsData.forEach((testData) => {
        test(`getDedentedLines when line is ${testData.text}`, () => {
            if (Array.isArray(testData.expected)) {
                const dedentedLines = getDedentedLines(testData.text);
                expect(dedentedLines).to.deep.equal(testData.expected);
            } else {
                expect(() => getDedentedLines(testData.text)).to.throw(testData.expected, testData.exceptionMessage);
            }
        });
    });
});
