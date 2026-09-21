/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { GheParseResultKind, parseGheInstanceInput } from '../../common/onboardingTypes.js';

suite('parseGheInstanceInput', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('empty input returns Empty', () => {
		assert.deepStrictEqual(parseGheInstanceInput(''), { kind: GheParseResultKind.Empty });
		assert.deepStrictEqual(parseGheInstanceInput('   '), { kind: GheParseResultKind.Empty });
	});

	test('single word returns SingleWord with resolved URI', () => {
		assert.deepStrictEqual(parseGheInstanceInput('octocat'), { kind: GheParseResultKind.SingleWord, resolvedUri: 'https://octocat.ghe.com' });
		assert.deepStrictEqual(parseGheInstanceInput('my-org'), { kind: GheParseResultKind.SingleWord, resolvedUri: 'https://my-org.ghe.com' });
	});

	test('single word with surrounding whitespace is trimmed', () => {
		assert.deepStrictEqual(parseGheInstanceInput('  octocat  '), { kind: GheParseResultKind.SingleWord, resolvedUri: 'https://octocat.ghe.com' });
	});

	test('single word with numbers returns SingleWord', () => {
		assert.deepStrictEqual(parseGheInstanceInput('org123'), { kind: GheParseResultKind.SingleWord, resolvedUri: 'https://org123.ghe.com' });
	});

	test('single word with underscores is invalid (not valid DNS)', () => {
		assert.deepStrictEqual(parseGheInstanceInput('my_org'), { kind: GheParseResultKind.Invalid });
	});

	test('full URI with https prefix returns FullUri', () => {
		assert.deepStrictEqual(parseGheInstanceInput('https://octocat.ghe.com'), { kind: GheParseResultKind.FullUri, resolvedUri: 'https://octocat.ghe.com' });
		assert.deepStrictEqual(parseGheInstanceInput('https://octocat.ghe.com/'), { kind: GheParseResultKind.FullUri, resolvedUri: 'https://octocat.ghe.com/' });
	});

	test('full URI without https prefix gets it prepended', () => {
		assert.deepStrictEqual(parseGheInstanceInput('octocat.ghe.com'), { kind: GheParseResultKind.FullUri, resolvedUri: 'https://octocat.ghe.com' });
		assert.deepStrictEqual(parseGheInstanceInput('sub.octocat.ghe.com'), { kind: GheParseResultKind.FullUri, resolvedUri: 'https://sub.octocat.ghe.com' });
	});

	test('full URI with subdomain returns FullUri', () => {
		assert.deepStrictEqual(parseGheInstanceInput('https://sub.domain.ghe.com'), { kind: GheParseResultKind.FullUri, resolvedUri: 'https://sub.domain.ghe.com' });
	});

	test('invalid input returns Invalid', () => {
		assert.deepStrictEqual(parseGheInstanceInput('not a valid url'), { kind: GheParseResultKind.Invalid });
		assert.deepStrictEqual(parseGheInstanceInput('https://github.com'), { kind: GheParseResultKind.Invalid });
		assert.deepStrictEqual(parseGheInstanceInput('https://octocat.example.com'), { kind: GheParseResultKind.Invalid });
		assert.deepStrictEqual(parseGheInstanceInput('http://octocat.ghe.com'), { kind: GheParseResultKind.Invalid });
		assert.deepStrictEqual(parseGheInstanceInput('ftp://octocat.ghe.com'), { kind: GheParseResultKind.Invalid });
	});

	test('input with numbers in domain is valid', () => {
		assert.deepStrictEqual(parseGheInstanceInput('https://org123.ghe.com'), { kind: GheParseResultKind.FullUri, resolvedUri: 'https://org123.ghe.com' });
	});

	test('single word with only hyphens returns SingleWord', () => {
		assert.deepStrictEqual(parseGheInstanceInput('my-long-org-name'), { kind: GheParseResultKind.SingleWord, resolvedUri: 'https://my-long-org-name.ghe.com' });
	});

	test('URI with trailing slash is valid', () => {
		assert.deepStrictEqual(parseGheInstanceInput('https://octocat.ghe.com/'), { kind: GheParseResultKind.FullUri, resolvedUri: 'https://octocat.ghe.com/' });
	});

	test('URI with path segments is invalid', () => {
		assert.deepStrictEqual(parseGheInstanceInput('https://octocat.ghe.com/api/v3'), { kind: GheParseResultKind.Invalid });
	});
});
