/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { INormalizedVersion, IParsedVersion, isValidExtensionVersion, isValidVersion, isValidVersionStr, normalizeVersion, parseVersion } from 'vs/platform/extensions/common/extensionValidator';

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
		function assertParseVersion(version: string, hasCaret: boolean, hasGreaterEquals: boolean, majorBase: number, majorMustEqual: boolean, minorBase: number, minorMustEqual: boolean, patchBase: number, patchMustEqual: boolean, preRelease: string | null): void {
			const actual = parseVersion(version);
			const expected: IParsedVersion = { hasCaret, hasGreaterEquals, majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, preRelease };

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
	});

	test('normalizeVersion', () => {
		function assertNormalizeVersion(version: string, majorBase: number, majorMustEqual: boolean, minorBase: number, minorMustEqual: boolean, patchBase: number, patchMustEqual: boolean, isMinimum: boolean, notBefore = 0): void {
			const actual = normalizeVersion(parseVersion(version));
			const expected: INormalizedVersion = { majorBase, majorMustEqual, minorBase, minorMustEqual, patchBase, patchMustEqual, isMinimum, notBefore };
			assert.deepStrictEqual(actual, expected, 'parseVersion for ' + version);
		}

		assertNormalizeVersion('0.10.0-dev', 0, true, 10, true, 0, true, false, 0);
		assertNormalizeVersion('0.10.0-222222222', 0, true, 10, true, 0, true, false, 0);
		assertNormalizeVersion('0.10.0-20210511', 0, true, 10, true, 0, true, false, new Date('2021-05-11T00:00:00Z').getTime());

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
		function testIsValidVersion(version: string, desiredVersion: string, expectedResult: boolean): void {
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

		function testExtensionVersion(version: string, desiredVersion: string, isBuiltin: boolean, hasMain: boolean, expectedResult: boolean): void {
			const manifest: IExtensionManifest = {
				name: 'test',
				publisher: 'test',
				version: '0.0.0',
				engines: {
					vscode: desiredVersion
				},
				main: hasMain ? 'something' : undefined
			};
			const reasons: string[] = [];
			const actual = isValidExtensionVersion(version, productVersion, manifest, isBuiltin, reasons);

			assert.strictEqual(actual, expectedResult, 'version: ' + version + ', desiredVersion: ' + desiredVersion + ', desc: ' + JSON.stringify(manifest) + ', reasons: ' + JSON.stringify(reasons));
		}

		function testIsInvalidExtensionVersion(version: string, desiredVersion: string, isBuiltin: boolean, hasMain: boolean): void {
			testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, false);
		}

		function testIsValidExtensionVersion(version: string, desiredVersion: string, isBuiltin: boolean, hasMain: boolean): void {
			testExtensionVersion(version, desiredVersion, isBuiltin, hasMain, true);
		}

		function testIsValidVersion(version: string, desiredVersion: string, expectedResult: boolean): void {
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
});
