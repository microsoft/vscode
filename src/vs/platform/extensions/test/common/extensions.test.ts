/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionType, getManifestCacheFileName, isManifestCacheFileName, parseEnabledApiProposalNames } from '../../common/extensions.js';

suite('Parsing Enabled Api Proposals', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('parsingEnabledApiProposals', () => {
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@1']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@randomstring']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@1234']));
		assert.deepStrictEqual(['activeComment', 'commentsDraftState'], parseEnabledApiProposalNames(['activeComment', 'commentsDraftState@1234_random']));
	});

});

suite('Manifest Cache File Name', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('name is scoped to extension type and language', () => {
		assert.deepStrictEqual([
			getManifestCacheFileName(ExtensionType.System, undefined),
			getManifestCacheFileName(ExtensionType.System, 'en'),
			getManifestCacheFileName(ExtensionType.User, undefined),
			getManifestCacheFileName(ExtensionType.User, 'en'),
		], [
			'extensions.builtin.cache',
			'extensions.builtin.en-094b0fe0e302.cache',
			'extensions.user.cache',
			'extensions.user.en-094b0fe0e302.cache',
		]);
	});

	test('name is safe to use as a file name', () => {
		assert.deepStrictEqual([
			getManifestCacheFileName(ExtensionType.System, '../evil'),
			getManifestCacheFileName(ExtensionType.System, 'a/b\\c'),
		].map(name => /^[a-z0-9.-]+$/.test(name)), [true, true]);
	});

	test('name stays within a path component length limit for any language', () => {
		const names = ['en', 'x'.repeat(1000), '/'.repeat(1000)].map(language => getManifestCacheFileName(ExtensionType.System, language));

		assert.deepStrictEqual(names.map(name => name.length <= 255), [true, true, true]);
	});

	test('languages that only differ in case or separators get their own file', () => {
		const names = ['zh-cn', 'zh-CN', 'zh_CN', 'ZH-CN'].map(language => getManifestCacheFileName(ExtensionType.System, language));

		assert.deepStrictEqual(new Set(names.map(name => name.toLowerCase())).size, names.length, `expected distinct names, got ${names.join(', ')}`);
	});

	test('languages that sanitize to the same readable part get their own file', () => {
		// These collide both in the readable part and under a 32 bit hash
		const names = ['!@', '"!'].map(language => getManifestCacheFileName(ExtensionType.System, language));

		assert.deepStrictEqual(new Set(names.map(name => name.toLowerCase())).size, names.length, `expected distinct names, got ${names.join(', ')}`);
	});

	test('generated names are recognized, and only for their own extension type', () => {
		const names = [undefined, 'en', 'zh-CN'].map(language => getManifestCacheFileName(ExtensionType.System, language));

		assert.deepStrictEqual([
			names.every(name => isManifestCacheFileName(name, ExtensionType.System, false)),
			names.some(name => isManifestCacheFileName(name, ExtensionType.User, false)),
		], [true, false]);
	});

	test('a differently cased name is only recognized when path casing is ignored', () => {
		const name = 'Extensions.User.EN-094B0FE0E302.Cache';

		assert.deepStrictEqual([
			isManifestCacheFileName(name, ExtensionType.User, true),
			isManifestCacheFileName(name, ExtensionType.User, false),
		], [true, false]);
	});

	test('unrelated file names are not recognized', () => {
		assert.deepStrictEqual([
			'extensions.json',
			'extensions.builtin.cache',
			'extensions.user.en-094b0fe0e302.cache.bak',
			'my.extensions.user.en-094b0fe0e302.cache',
		].map(name => isManifestCacheFileName(name, ExtensionType.User, false)), [false, false, false, false]);
	});

});
