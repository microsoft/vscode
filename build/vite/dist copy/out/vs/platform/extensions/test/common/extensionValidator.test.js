/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { areApiProposalsCompatible, isValidExtensionVersion, isValidVersion, isValidVersionStr, normalizeVersion, parseVersion } from '../../common/extensionValidator.js';
suite('Extension Version Validator', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    const productVersion = '2021-05-11T21:54:30.577Z';
    test('isValidVersionStr', () => {
        assert.strictEqual(isValidVersionStr('0.10.0-dev'), true);
        assert.strictEqual(isValidVersionStr('0.10.0'), true);
        assert.strictEqual(isValidVersionStr('0.10.1'), true);
        assert.strictEqual(isValidVersionStr('0.10.100'), true);
        assert.strictEqual(isValidVersionStr('0.11.0'), true);
        assert.strictEqual(isValidVersionStr('x.x.x'), true);
        assert.strictEqual(isValidVersionStr('0.x.x'), true);
        assert.strictEqual(isValidVersionStr('0.10.0'), true);
        assert.strictEqual(isValidVersionStr('0.10.x'), true);
        assert.strictEqual(isValidVersionStr('^0.10.0'), true);
        assert.strictEqual(isValidVersionStr('*'), true);
        assert.strictEqual(isValidVersionStr('0.x.x.x'), false);
        assert.strictEqual(isValidVersionStr('0.10'), false);
        assert.strictEqual(isValidVersionStr('0.10.'), false);
    });
    test('parseVersion', () => {
        function assertParseVersion(version, hasCaret, hasGreaterEquals, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, preRelease) {
            const actual = parseVersion(version);
            const expected = { hasCaret, hasGreaterEquals, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, preRelease };
            assert.deepStrictEqual(actual, expected, 'parseVersion for ' + version);
        }
        assertParseVersion('0.10.0-dev', false, false, 0, true, 10, true, 0, true, '-dev');
        assertParseVersion('0.10.0', false, false, 0, true, 10, true, 0, true, null);
        assertParseVersion('0.10.1', false, false, 0, true, 10, true, 1, true, null);
        assertParseVersion('0.10.100', false, false, 0, true, 10, true, 100, true, null);
        assertParseVersion('0.11.0', false, false, 0, true, 11, true, 0, true, null);
        assertParseVersion('x.x.x', false, false, 0, false, 0, false, 0, false, null);
        assertParseVersion('0.x.x', false, false, 0, true, 0, false, 0, false, null);
        assertParseVersion('0.10.x', false, false, 0, true, 10, true, 0, false, null);
        assertParseVersion('^0.10.0', true, false, 0, true, 10, true, 0, true, null);
        assertParseVersion('^0.10.2', true, false, 0, true, 10, true, 2, true, null);
        assertParseVersion('^1.10.2', true, false, 1, true, 10, true, 2, true, null);
        assertParseVersion('*', false, false, 0, false, 0, false, 0, false, null);
        assertParseVersion('>=0.0.1', false, true, 0, true, 0, true, 1, true, null);
        assertParseVersion('>=2.4.3', false, true, 2, true, 4, true, 3, true, null);
        // Parse versions with HHMM date format
        assertParseVersion('1.10.0-202105111430', false, false, 1, true, 10, true, 0, true, '-202105111430');
        assertParseVersion('^1.10.0-202105112359', true, false, 1, true, 10, true, 0, true, '-202105112359');
    });
    test('normalizeVersion', () => {
        function assertNormalizeVersion(version, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, isMinimum, notBefore = 0) {
            const actual = normalizeVersion(parseVersion(version));
            const expected = { majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, isMinimum, notBefore };
            assert.deepStrictEqual(actual, expected, 'parseVersion for ' + version);
        }
        assertNormalizeVersion('0.10.0-dev', 0, true, 10, true, 0, true, false, 0);
        assertNormalizeVersion('0.10.0-222222222', 0, true, 10, true, 0, true, false, 0);
        assertNormalizeVersion('0.10.0-20210511', 0, true, 10, true, 0, true, false, new Date('2021-05-11T00:00:00Z').getTime());
        // Normalize versions with HHMM date format
        assertNormalizeVersion('1.10.0-202105111430', 1, true, 10, true, 0, true, false, new Date('2021-05-11T14:30:00Z').getTime());
        assertNormalizeVersion('1.10.0-202105112359', 1, true, 10, true, 0, true, false, new Date('2021-05-11T23:59:00Z').getTime());
        assertNormalizeVersion('1.10.0-202105110000', 1, true, 10, true, 0, true, false, new Date('2021-05-11T00:00:00Z').getTime());
        assertNormalizeVersion('0.10.0', 0, true, 10, true, 0, true, false);
        assertNormalizeVersion('0.10.1', 0, true, 10, true, 1, true, false);
        assertNormalizeVersion('0.10.100', 0, true, 10, true, 100, true, false);
        assertNormalizeVersion('0.11.0', 0, true, 11, true, 0, true, false);
        assertNormalizeVersion('x.x.x', 0, false, 0, false, 0, false, false);
        assertNormalizeVersion('0.x.x', 0, true, 0, false, 0, false, false);
        assertNormalizeVersion('0.10.x', 0, true, 10, true, 0, false, false);
        assertNormalizeVersion('^0.10.0', 0, true, 10, true, 0, false, false);
        assertNormalizeVersion('^0.10.2', 0, true, 10, true, 2, false, false);
        assertNormalizeVersion('^1.10.2', 1, true, 10, false, 2, false, false);
        assertNormalizeVersion('*', 0, false, 0, false, 0, false, false);
        assertNormalizeVersion('>=0.0.1', 0, true, 0, true, 1, true, true);
        assertNormalizeVersion('>=2.4.3', 2, true, 4, true, 3, true, true);
        assertNormalizeVersion('>=2.4.3', 2, true, 4, true, 3, true, true);
    });
    test('isValidVersion', () => {
        function testIsValidVersion(version, desiredVersion, expectedResult) {
            const actual = isValidVersion(version, productVersion, desiredVersion);
            assert.strictEqual(actual, expectedResult, 'extension - vscode: ' + version + ', desiredVersion: ' + desiredVersion + ' should be ' + expectedResult);
        }
        testIsValidVersion('0.10.0-dev', 'x.x.x', true);
        testIsValidVersion('0.10.0-dev', '0.x.x', true);
        testIsValidVersion('0.10.0-dev', '0.10.0', true);
        testIsValidVersion('0.10.0-dev', '0.10.2', false);
        testIsValidVersion('0.10.0-dev', '^0.10.2', false);
        testIsValidVersion('0.10.0-dev', '0.10.x', true);
        testIsValidVersion('0.10.0-dev', '^0.10.0', true);
        testIsValidVersion('0.10.0-dev', '*', true);
        testIsValidVersion('0.10.0-dev', '>=0.0.1', true);
        testIsValidVersion('0.10.0-dev', '>=0.0.10', true);
        testIsValidVersion('0.10.0-dev', '>=0.10.0', true);
        testIsValidVersion('0.10.0-dev', '>=0.10.1', false);
        testIsValidVersion('0.10.0-dev', '>=1.0.0', false);
        testIsValidVersion('0.10.0', 'x.x.x', true);
        testIsValidVersion('0.10.0', '0.x.x', true);
        testIsValidVersion('0.10.0', '0.10.0', true);
        testIsValidVersion('0.10.0', '0.10.2', false);
        testIsValidVersion('0.10.0', '^0.10.2', false);
        testIsValidVersion('0.10.0', '0.10.x', true);
        testIsValidVersion('0.10.0', '^0.10.0', true);
        testIsValidVersion('0.10.0', '*', true);
        testIsValidVersion('0.10.1', 'x.x.x', true);
        testIsValidVersion('0.10.1', '0.x.x', true);
        testIsValidVersion('0.10.1', '0.10.0', false);
        testIsValidVersion('0.10.1', '0.10.2', false);
        testIsValidVersion('0.10.1', '^0.10.2', false);
        testIsValidVersion('0.10.1', '0.10.x', true);
        testIsValidVersion('0.10.1', '^0.10.0', true);
        testIsValidVersion('0.10.1', '*', true);
        testIsValidVersion('0.10.100', 'x.x.x', true);
        testIsValidVersion('0.10.100', '0.x.x', true);
        testIsValidVersion('0.10.100', '0.10.0', false);
        testIsValidVersion('0.10.100', '0.10.2', false);
        testIsValidVersion('0.10.100', '^0.10.2', true);
        testIsValidVersion('0.10.100', '0.10.x', true);
        testIsValidVersion('0.10.100', '^0.10.0', true);
        testIsValidVersion('0.10.100', '*', true);
        testIsValidVersion('0.11.0', 'x.x.x', true);
        testIsValidVersion('0.11.0', '0.x.x', true);
        testIsValidVersion('0.11.0', '0.10.0', false);
        testIsValidVersion('0.11.0', '0.10.2', false);
        testIsValidVersion('0.11.0', '^0.10.2', false);
        testIsValidVersion('0.11.0', '0.10.x', false);
        testIsValidVersion('0.11.0', '^0.10.0', false);
        testIsValidVersion('0.11.0', '*', true);
        // Anything < 1.0.0 is compatible
        testIsValidVersion('1.0.0', 'x.x.x', true);
        testIsValidVersion('1.0.0', '0.x.x', true);
        testIsValidVersion('1.0.0', '0.10.0', false);
        testIsValidVersion('1.0.0', '0.10.2', false);
        testIsValidVersion('1.0.0', '^0.10.2', true);
        testIsValidVersion('1.0.0', '0.10.x', true);
        testIsValidVersion('1.0.0', '^0.10.0', true);
        testIsValidVersion('1.0.0', '1.0.0', true);
        testIsValidVersion('1.0.0', '^1.0.0', true);
        testIsValidVersion('1.0.0', '^2.0.0', false);
        testIsValidVersion('1.0.0', '*', true);
        testIsValidVersion('1.0.0', '>=0.0.1', true);
        testIsValidVersion('1.0.0', '>=0.0.10', true);
        testIsValidVersion('1.0.0', '>=0.10.0', true);
        testIsValidVersion('1.0.0', '>=0.10.1', true);
        testIsValidVersion('1.0.0', '>=1.0.0', true);
        testIsValidVersion('1.0.0', '>=1.1.0', false);
        testIsValidVersion('1.0.0', '>=1.0.1', false);
        testIsValidVersion('1.0.0', '>=2.0.0', false);
        testIsValidVersion('1.0.100', 'x.x.x', true);
        testIsValidVersion('1.0.100', '0.x.x', true);
        testIsValidVersion('1.0.100', '0.10.0', false);
        testIsValidVersion('1.0.100', '0.10.2', false);
        testIsValidVersion('1.0.100', '^0.10.2', true);
        testIsValidVersion('1.0.100', '0.10.x', true);
        testIsValidVersion('1.0.100', '^0.10.0', true);
        testIsValidVersion('1.0.100', '1.0.0', false);
        testIsValidVersion('1.0.100', '^1.0.0', true);
        testIsValidVersion('1.0.100', '^1.0.1', true);
        testIsValidVersion('1.0.100', '^2.0.0', false);
        testIsValidVersion('1.0.100', '*', true);
        testIsValidVersion('1.100.0', 'x.x.x', true);
        testIsValidVersion('1.100.0', '0.x.x', true);
        testIsValidVersion('1.100.0', '0.10.0', false);
        testIsValidVersion('1.100.0', '0.10.2', false);
        testIsValidVersion('1.100.0', '^0.10.2', true);
        testIsValidVersion('1.100.0', '0.10.x', true);
        testIsValidVersion('1.100.0', '^0.10.0', true);
        testIsValidVersion('1.100.0', '1.0.0', false);
        testIsValidVersion('1.100.0', '^1.0.0', true);
        testIsValidVersion('1.100.0', '^1.1.0', true);
        testIsValidVersion('1.100.0', '^1.100.0', true);
        testIsValidVersion('1.100.0', '^2.0.0', false);
        testIsValidVersion('1.100.0', '*', true);
        testIsValidVersion('1.100.0', '>=1.99.0', true);
        testIsValidVersion('1.100.0', '>=1.100.0', true);
        testIsValidVersion('1.100.0', '>=1.101.0', false);
        testIsValidVersion('2.0.0', 'x.x.x', true);
        testIsValidVersion('2.0.0', '0.x.x', false);
        testIsValidVersion('2.0.0', '0.10.0', false);
        testIsValidVersion('2.0.0', '0.10.2', false);
        testIsValidVersion('2.0.0', '^0.10.2', false);
        testIsValidVersion('2.0.0', '0.10.x', false);
        testIsValidVersion('2.0.0', '^0.10.0', false);
        testIsValidVersion('2.0.0', '1.0.0', false);
        testIsValidVersion('2.0.0', '^1.0.0', false);
        testIsValidVersion('2.0.0', '^1.1.0', false);
        testIsValidVersion('2.0.0', '^1.100.0', false);
        testIsValidVersion('2.0.0', '^2.0.0', true);
        testIsValidVersion('2.0.0', '*', true);
    });
    test('isValidExtensionVersion', () => {
        function testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, expectedResult) {
            const manifest = {
                name: 'test',
                publisher: 'test',
                version: '0.0.0',
                engines: {
                    vscode: desiredVersion
                },
                main: hasMain ? 'something' : undefined
            };
            const reasons = [];
            const actual = isValidExtensionVersion(version, productVersion, manifest, isBuiltin, reasons);
            assert.strictEqual(actual, expectedResult, 'version: ' + version + ', desiredVersion: ' + desiredVersion + ', desc: ' + JSON.stringify(manifest) + ', reasons: ' + JSON.stringify(reasons));
        }
        function testIsInvalidExtensionVersion(version, desiredVersion, isBuiltin, hasMain) {
            testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, false);
        }
        function testIsValidExtensionVersion(version, desiredVersion, isBuiltin, hasMain) {
            testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, true);
        }
        function testIsValidVersion(version, desiredVersion, expectedResult) {
            testExtensionVersion(version, desiredVersion, false, true, expectedResult);
        }
        // builtin are allowed to use * or x.x.x
        testIsValidExtensionVersion('0.10.0-dev', '*', true, true);
        testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', true, true);
        testIsValidExtensionVersion('0.10.0-dev', '0.x.x', true, true);
        testIsValidExtensionVersion('0.10.0-dev', '0.10.x', true, true);
        testIsValidExtensionVersion('1.10.0-dev', '1.x.x', true, true);
        testIsValidExtensionVersion('1.10.0-dev', '1.10.x', true, true);
        testIsValidExtensionVersion('0.10.0-dev', '*', true, false);
        testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', true, false);
        testIsValidExtensionVersion('0.10.0-dev', '0.x.x', true, false);
        testIsValidExtensionVersion('0.10.0-dev', '0.10.x', true, false);
        testIsValidExtensionVersion('1.10.0-dev', '1.x.x', true, false);
        testIsValidExtensionVersion('1.10.0-dev', '1.10.x', true, false);
        // normal extensions are allowed to use * or x.x.x only if they have no main
        testIsInvalidExtensionVersion('0.10.0-dev', '*', false, true);
        testIsInvalidExtensionVersion('0.10.0-dev', 'x.x.x', false, true);
        testIsInvalidExtensionVersion('0.10.0-dev', '0.x.x', false, true);
        testIsValidExtensionVersion('0.10.0-dev', '0.10.x', false, true);
        testIsValidExtensionVersion('1.10.0-dev', '1.x.x', false, true);
        testIsValidExtensionVersion('1.10.0-dev', '1.10.x', false, true);
        testIsValidExtensionVersion('0.10.0-dev', '*', false, false);
        testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', false, false);
        testIsValidExtensionVersion('0.10.0-dev', '0.x.x', false, false);
        testIsValidExtensionVersion('0.10.0-dev', '0.10.x', false, false);
        testIsValidExtensionVersion('1.10.0-dev', '1.x.x', false, false);
        testIsValidExtensionVersion('1.10.0-dev', '1.10.x', false, false);
        // extensions without "main" get no version check
        testIsValidExtensionVersion('0.10.0-dev', '>=0.9.1-pre.1', false, false);
        testIsValidExtensionVersion('0.10.0-dev', '*', false, false);
        testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', false, false);
        testIsValidExtensionVersion('0.10.0-dev', '0.x.x', false, false);
        testIsValidExtensionVersion('0.10.0-dev', '0.10.x', false, false);
        testIsValidExtensionVersion('1.10.0-dev', '1.x.x', false, false);
        testIsValidExtensionVersion('1.10.0-dev', '1.10.x', false, false);
        testIsValidExtensionVersion('0.10.0-dev', '*', false, false);
        testIsValidExtensionVersion('0.10.0-dev', 'x.x.x', false, false);
        testIsValidExtensionVersion('0.10.0-dev', '0.x.x', false, false);
        testIsValidExtensionVersion('0.10.0-dev', '0.10.x', false, false);
        testIsValidExtensionVersion('1.10.0-dev', '1.x.x', false, false);
        testIsValidExtensionVersion('1.10.0-dev', '1.10.x', false, false);
        // normal extensions with code
        testIsValidVersion('0.10.0-dev', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.10.0-dev', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.10.0-dev', '0.10.0', true);
        testIsValidVersion('0.10.0-dev', '0.10.2', false);
        testIsValidVersion('0.10.0-dev', '^0.10.2', false);
        testIsValidVersion('0.10.0-dev', '0.10.x', true);
        testIsValidVersion('0.10.0-dev', '^0.10.0', true);
        testIsValidVersion('0.10.0-dev', '*', false); // fails due to lack of specificity
        testIsValidVersion('0.10.0', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.10.0', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.10.0', '0.10.0', true);
        testIsValidVersion('0.10.0', '0.10.2', false);
        testIsValidVersion('0.10.0', '^0.10.2', false);
        testIsValidVersion('0.10.0', '0.10.x', true);
        testIsValidVersion('0.10.0', '^0.10.0', true);
        testIsValidVersion('0.10.0', '*', false); // fails due to lack of specificity
        testIsValidVersion('0.10.1', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.10.1', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.10.1', '0.10.0', false);
        testIsValidVersion('0.10.1', '0.10.2', false);
        testIsValidVersion('0.10.1', '^0.10.2', false);
        testIsValidVersion('0.10.1', '0.10.x', true);
        testIsValidVersion('0.10.1', '^0.10.0', true);
        testIsValidVersion('0.10.1', '*', false); // fails due to lack of specificity
        testIsValidVersion('0.10.100', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.10.100', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.10.100', '0.10.0', false);
        testIsValidVersion('0.10.100', '0.10.2', false);
        testIsValidVersion('0.10.100', '^0.10.2', true);
        testIsValidVersion('0.10.100', '0.10.x', true);
        testIsValidVersion('0.10.100', '^0.10.0', true);
        testIsValidVersion('0.10.100', '*', false); // fails due to lack of specificity
        testIsValidVersion('0.11.0', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.11.0', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('0.11.0', '0.10.0', false);
        testIsValidVersion('0.11.0', '0.10.2', false);
        testIsValidVersion('0.11.0', '^0.10.2', false);
        testIsValidVersion('0.11.0', '0.10.x', false);
        testIsValidVersion('0.11.0', '^0.10.0', false);
        testIsValidVersion('0.11.0', '*', false); // fails due to lack of specificity
        testIsValidVersion('1.0.0', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('1.0.0', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('1.0.0', '0.10.0', false);
        testIsValidVersion('1.0.0', '0.10.2', false);
        testIsValidVersion('1.0.0', '^0.10.2', true);
        testIsValidVersion('1.0.0', '0.10.x', true);
        testIsValidVersion('1.0.0', '^0.10.0', true);
        testIsValidVersion('1.0.0', '*', false); // fails due to lack of specificity
        testIsValidVersion('1.10.0', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('1.10.0', '1.x.x', true);
        testIsValidVersion('1.10.0', '1.10.0', true);
        testIsValidVersion('1.10.0', '1.10.2', false);
        testIsValidVersion('1.10.0', '^1.10.2', false);
        testIsValidVersion('1.10.0', '1.10.x', true);
        testIsValidVersion('1.10.0', '^1.10.0', true);
        testIsValidVersion('1.10.0', '*', false); // fails due to lack of specificity
        // Anything < 1.0.0 is compatible
        testIsValidVersion('1.0.0', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('1.0.0', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('1.0.0', '0.10.0', false);
        testIsValidVersion('1.0.0', '0.10.2', false);
        testIsValidVersion('1.0.0', '^0.10.2', true);
        testIsValidVersion('1.0.0', '0.10.x', true);
        testIsValidVersion('1.0.0', '^0.10.0', true);
        testIsValidVersion('1.0.0', '1.0.0', true);
        testIsValidVersion('1.0.0', '^1.0.0', true);
        testIsValidVersion('1.0.0', '^2.0.0', false);
        testIsValidVersion('1.0.0', '*', false); // fails due to lack of specificity
        testIsValidVersion('1.0.100', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('1.0.100', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('1.0.100', '0.10.0', false);
        testIsValidVersion('1.0.100', '0.10.2', false);
        testIsValidVersion('1.0.100', '^0.10.2', true);
        testIsValidVersion('1.0.100', '0.10.x', true);
        testIsValidVersion('1.0.100', '^0.10.0', true);
        testIsValidVersion('1.0.100', '1.0.0', false);
        testIsValidVersion('1.0.100', '^1.0.0', true);
        testIsValidVersion('1.0.100', '^1.0.1', true);
        testIsValidVersion('1.0.100', '^2.0.0', false);
        testIsValidVersion('1.0.100', '*', false); // fails due to lack of specificity
        testIsValidVersion('1.100.0', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('1.100.0', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('1.100.0', '0.10.0', false);
        testIsValidVersion('1.100.0', '0.10.2', false);
        testIsValidVersion('1.100.0', '^0.10.2', true);
        testIsValidVersion('1.100.0', '0.10.x', true);
        testIsValidVersion('1.100.0', '^0.10.0', true);
        testIsValidVersion('1.100.0', '1.0.0', false);
        testIsValidVersion('1.100.0', '^1.0.0', true);
        testIsValidVersion('1.100.0', '^1.1.0', true);
        testIsValidVersion('1.100.0', '^1.100.0', true);
        testIsValidVersion('1.100.0', '^2.0.0', false);
        testIsValidVersion('1.100.0', '*', false); // fails due to lack of specificity
        testIsValidVersion('2.0.0', 'x.x.x', false); // fails due to lack of specificity
        testIsValidVersion('2.0.0', '0.x.x', false); // fails due to lack of specificity
        testIsValidVersion('2.0.0', '0.10.0', false);
        testIsValidVersion('2.0.0', '0.10.2', false);
        testIsValidVersion('2.0.0', '^0.10.2', false);
        testIsValidVersion('2.0.0', '0.10.x', false);
        testIsValidVersion('2.0.0', '^0.10.0', false);
        testIsValidVersion('2.0.0', '1.0.0', false);
        testIsValidVersion('2.0.0', '^1.0.0', false);
        testIsValidVersion('2.0.0', '^1.1.0', false);
        testIsValidVersion('2.0.0', '^1.100.0', false);
        testIsValidVersion('2.0.0', '^2.0.0', true);
        testIsValidVersion('2.0.0', '*', false); // fails due to lack of specificity
        // date tags
        testIsValidVersion('1.10.0', '^1.10.0-20210511', true); // current date
        testIsValidVersion('1.10.0', '^1.10.0-20210510', true); // before date
        testIsValidVersion('1.10.0', '^1.10.0-20210512', false); // future date
        testIsValidVersion('1.10.1', '^1.10.0-20200101', true); // before date, but ahead version
        testIsValidVersion('1.11.0', '^1.10.0-20200101', true);
        // Test with HHMM date format
        testIsValidVersion('1.10.0', '^1.10.0-202105111400', true); // product at beginning of day, required time at 14:00
        testIsValidVersion('1.10.0', '^1.10.0-202105112359', false); // product at beginning of day, required time at 23:59
        testIsValidVersion('1.10.0', '^1.10.0-202105110000', true); // product at beginning of day, required time at 00:00
    });
    test('isValidExtensionVersion checks browser only extensions', () => {
        const manifest = {
            name: 'test',
            publisher: 'test',
            version: '0.0.0',
            engines: {
                vscode: '^1.45.0'
            },
            browser: 'something'
        };
        assert.strictEqual(isValidExtensionVersion('1.44.0', undefined, manifest, false, []), false);
    });
    test('areApiProposalsCompatible', () => {
        assert.strictEqual(areApiProposalsCompatible([]), true);
        assert.strictEqual(areApiProposalsCompatible([], ['hello']), true);
        assert.strictEqual(areApiProposalsCompatible([], {}), true);
        assert.strictEqual(areApiProposalsCompatible(['proposal1'], {}), true);
        assert.strictEqual(areApiProposalsCompatible(['proposal1'], { 'proposal1': { proposal: '' } }), true);
        assert.strictEqual(areApiProposalsCompatible(['proposal1'], { 'proposal1': { proposal: '', version: 1 } }), true);
        assert.strictEqual(areApiProposalsCompatible(['proposal1@1'], { 'proposal1': { proposal: '', version: 1 } }), true);
        assert.strictEqual(areApiProposalsCompatible(['proposal1'], { 'proposal2': { proposal: '' } }), true);
        assert.strictEqual(areApiProposalsCompatible(['proposal1', 'proposal2'], {}), true);
        assert.strictEqual(areApiProposalsCompatible(['proposal1', 'proposal2'], { 'proposal1': { proposal: '' } }), true);
        assert.strictEqual(areApiProposalsCompatible(['proposal2@1'], { 'proposal1': { proposal: '' } }), false);
        assert.strictEqual(areApiProposalsCompatible(['proposal1@1'], { 'proposal1': { proposal: '', version: 2 } }), false);
        assert.strictEqual(areApiProposalsCompatible(['proposal1@1'], { 'proposal1': { proposal: '' } }), false);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uVmFsaWRhdG9yLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25zL3Rlc3QvY29tbW9uL2V4dGVuc2lvblZhbGlkYXRvci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUVoRyxPQUFPLEVBQUUseUJBQXlCLEVBQXNDLHVCQUF1QixFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsRUFBRSxZQUFZLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUUvTSxLQUFLLENBQUMsNkJBQTZCLEVBQUUsR0FBRyxFQUFFO0lBRXpDLHVDQUF1QyxFQUFFLENBQUM7SUFFMUMsTUFBTSxjQUFjLEdBQUcsMEJBQTBCLENBQUM7SUFFbEQsSUFBSSxDQUFDLG1CQUFtQixFQUFFLEdBQUcsRUFBRTtRQUM5QixNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLFlBQVksQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzFELE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLFVBQVUsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3hELE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNyRCxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsUUFBUSxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0RCxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLFNBQVMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFakQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4RCxNQUFNLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3JELE1BQU0sQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFDdkQsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtRQUN6QixTQUFTLGtCQUFrQixDQUFDLE9BQWUsRUFBRSxRQUFpQixFQUFFLGdCQUF5QixFQUFFLFNBQWlCLEVBQUUsY0FBdUIsRUFBRSxTQUFpQixFQUFFLGNBQXVCLEVBQUUsU0FBaUIsRUFBRSxjQUF1QixFQUFFLFVBQXlCO1lBQ3ZQLE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNyQyxNQUFNLFFBQVEsR0FBbUIsRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLEVBQUUsU0FBUyxFQUFFLGNBQWMsRUFBRSxTQUFTLEVBQUUsY0FBYyxFQUFFLFNBQVMsRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLENBQUM7WUFFN0osTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxDQUFDO1FBQ3pFLENBQUM7UUFFRCxrQkFBa0IsQ0FBQyxZQUFZLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztRQUNuRixrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RSxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RSxrQkFBa0IsQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNqRixrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUU3RSxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RSxrQkFBa0IsQ0FBQyxPQUFPLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RSxrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM5RSxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RSxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RSxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM3RSxrQkFBa0IsQ0FBQyxHQUFHLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUxRSxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUM1RSxrQkFBa0IsQ0FBQyxTQUFTLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxJQUFJLEVB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cEUsc0JBQXNCLENBQUMsVUFBVSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3hFLHNCQUFzQixDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUVwRSxzQkFBc0IsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDckUsc0JBQXNCLENBQUMsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3BFLHNCQUFzQixDQUFDLFFBQVEsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNyRSxzQkFBc0IsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxLQUFLLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDdEUsc0JBQXNCLENBQUMsU0FBUyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3RFLHNCQUFzQixDQUFDLFNBQVMsRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2RSxzQkFBc0IsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEtBQUssRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLENBQUMsRUFBRSxL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