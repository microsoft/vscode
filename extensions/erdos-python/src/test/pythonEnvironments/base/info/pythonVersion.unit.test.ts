// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as assert from 'assert';

import { PythonReleaseLevel, PythonVersion } from '../../../../client/pythonEnvironments/base/info';
import {
    compareSemVerLikeVersions,
    getEmptyVersion,
    getShortVersionString,
    parseVersion,
} from '../../../../client/pythonEnvironments/base/info/pythonVersion';

export function ver(
    major: number,
    minor: number | undefined,
    micro: number | undefined,
    level?: string,
    serial?: number,
): PythonVersion {
    const version: PythonVersion = {
        major,
        minor: minor === undefined ? -1 : minor,
        micro: micro === undefined ? -1 : micro,
        release: undefined,
    };
    if (level !== undefined) {
        version.release = {
            serial: serial!,
            level: level as PythonReleaseLevel,
        };
    }
    return version;
}

const VERSION_STRINGS: [string, PythonVersion][] = [
    ['0.9.2b2', ver(0, 9, 2, 'beta', 2)],
    ['3.3.1', ver(3, 3, 1)], // final
    ['3.9.0rc1', ver(3, 9, 0, 'candidate', 1)],
    ['2.7.11a3', ver(2, 7, 11, 'alpha', 3)],
];

suite('pyenvs info - getShortVersionString', () => {
    for (const data of VERSION_STRINGS) {
        const [expected, info] = data;
        test(`conversion works for '${expected}'`, () => {
            const result = getShortVersionString(info);

            assert.strictEqual(result, expected);
        });
    }

    test('conversion works for final', () => {
        const expected = '3.3.1';
        const info = ver(3, 3, 1, 'final', 0);

        const result = getShortVersionString(info);

        assert.strictEqual(result, expected);
    });
});

suite('pyenvs info - parseVersion', () => {
    suite('full versions (short)', () => {
        VERSION_STRINGS.forEach((data) => {
            const [text, expected] = data;
            test(`conversion works for '${text}'`, () => {
                const result = parseVersion(text);

                assert.deepEqual(result, expected);
            });
        });
    });

    suite('full versions (long)', () => {
        [
            ['0.9.2-beta2', ver(0, 9, 2, 'beta', 2)],
            ['3.3.1-final', ver(3, 3, 1, 'final', 0)],
            ['3.3.1-final0', ver(3, 3, 1, 'final', 0)],
            ['3.9.0-candidate1', ver(3, 9, 0, 'candidate', 1)],
            ['2.7.11-alpha3', ver(2, 7, 11, 'alpha', 3)],
            ['0.9.2.beta.2', ver(0, 9, 2, 'beta', 2)],
            ['3.3.1.final.0', ver(3, 3, 1, 'final', 0)],
            ['3.9.0.candidate.1', ver(3, 9, 0, 'candidate', 1)],
            ['2.7.11.alpha.3', ver(2, 7, 11, 'alpha', 3)],
        ].forEach((data) => {
            const [text, expected] = data as [string, PythonVersion];
            test(`conversion works for '${text}'`, () => {
                const result = parseVersion(text);

                assert.deepEqual(result, expected);
            });
        });
    });

    suite('partial versions', () => {
        [
            ['3.7.1', ver(3, 7, 1)],
            ['3.7', ver(3, 7, -1)],
            ['3', ver(3, -1, -1)],
            ['37', ver(3, 7, -1)], // not 37
            ['371', ver(3, 71, -1)], // not 3.7.1
            ['3102', ver(3, 102, -1)], // not 3.10.2
            ['2.7', ver(2, 7, -1)],
            ['2', ver(2, -1, -1)], // not 2.7
            ['27', ver(2, 7, -1)],
        ].forEach((data) => {
            const [text, expected] = data as [string, PythonVersion];
            test(`conversion works for '${text}'`, () => {
                const result = parseVersion(text);

                assert.deepEqual(result, expected);
            });
        });
    });

    suite('other forms', () => {
        [
            // prefixes
            ['python3', ver(3, -1, -1)],
            ['python3.8', ver(3, 8, -1)],
            ['python3.8.1', ver(3, 8, 1)],
            ['python3.8.1b2', ver(3, 8, 1, 'beta', 2)],
            ['python-3', ver(3, -1, -1)],
            // release ignored (missing micro)
            ['python3.8b2', ver(3, 8, -1)],
            ['python38b2', ver(3, 8, -1)],
            ['python381b2', ver(3, 81, -1)], // not 3.8.1
            // suffixes
            ['python3.exe', ver(3, -1, -1)],
            ['python3.8.exe', ver(3, 8, -1)],
            ['python3.8.1.exe', ver(3, 8, 1)],
            ['python3.8.1b2.exe', ver(3, 8, 1, 'beta', 2)],
            ['3.8.1.build123.revDEADBEEF', ver(3, 8, 1)],
            ['3.8.1b2.build123.revDEADBEEF', ver(3, 8, 1, 'beta', 2)],
            // dirnames
            ['/x/y/z/python38/bin/python', ver(3, 8, -1)],
            ['/x/y/z/python/38/bin/python', ver(3, 8, -1)],
            ['/x/y/z/python/38/bin/python', ver(3, 8, -1)],
        ].forEach((data) => {
            const [text, expected] = data as [string, PythonVersion];
            test(`conversion works for '${text}'`, () => {
                const result = parseVersion(text);

                assert.deepEqual(result, expected);
            });
        });
    });

    test('empty string results in empty version', () => {
        const expected = getEmptyVersion();

        const result = parseVersion('');

        assert.deepEqual(result, expected);
    });

    suite('bogus input', () => {
        [
            // errant dots
            'py.3.7',
            'py3.7.',
            'python.3',
            // no version
            'spam',
            'python.exe',
            'python',
        ].forEach((text) => {
            test(`conversion does not work for '${text}'`, () => {
                assert.throws(() => parseVersion(text));
            });
        });
    });
});

suite('pyenvs info - compareSemVerLikeVersions', () => {
    const testData = [
        {
            v1: { major: 2, minor: 7, patch: 19 },
            v2: { major: 3, minor: 7, patch: 4 },
            expected: -1,
        },
        {
            v1: { major: 2, minor: 7, patch: 19 },
            v2: { major: 2, minor: 7, patch: 19 },
            expected: 0,
        },
        {
            v1: { major: 3, minor: 7, patch: 4 },
            v2: { major: 2, minor: 7, patch: 19 },
            expected: 1,
        },
        {
            v1: { major: 3, minor: 8, patch: 1 },
            v2: { major: 3, minor: 9, patch: 1 },
            expected: -1,
        },
        {
            v1: { major: 3, minor: 9, patch: 1 },
            v2: { major: 3, minor: 9, patch: 1 },
            expected: 0,
        },
        {
            v1: { major: 3, minor: 9, patch: 1 },
            v2: { major: 3, minor: 8, patch: 1 },
            expected: 1,
        },
        {
            v1: { major: 3, minor: 9, patch: 0 },
            v2: { major: 3, minor: 9, patch: 1 },
            expected: -1,
        },
        {
            v1: { major: 3, minor: 9, patch: 1 },
            v2: { major: 3, minor: 9, patch: 1 },
            expected: 0,
        },
        {
            v1: { major: 3, minor: 9, patch: 1 },
            v2: { major: 3, minor: 9, patch: 0 },
            expected: 1,
        },
    ];

    testData.forEach((data) => {
        test(`Compare versions ${JSON.stringify(data.v1)} and ${JSON.stringify(data.v2)}`, () => {
            const actual = compareSemVerLikeVersions(data.v1, data.v2);
            assert.deepStrictEqual(actual, data.expected);
        });
    });
});
