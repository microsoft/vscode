/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionType, getManifestCacheFileName, parseEnabledApiProposalNames } from '../../common/extensions.js';

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
			'extensions.builtin.en-88f0e12.cache',
			'extensions.user.cache',
			'extensions.user.en-88f0e12.cache',
		]);
	});

	test('name is safe to use as a file name', () => {
		assert.deepStrictEqual([
			getManifestCacheFileName(ExtensionType.System, '../evil'),
			getManifestCacheFileName(ExtensionType.System, 'a/b\\c'),
		].map(name => /^[a-z0-9.-]+$/.test(name)), [true, true]);
	});

	test('languages that only differ in case or separators get their own file', () => {
		const names = ['zh-cn', 'zh-CN', 'zh_CN', 'ZH-CN'].map(language => getManifestCacheFileName(ExtensionType.System, language));

		assert.deepStrictEqual(new Set(names.map(name => name.toLowerCase())).size, names.length, `expected distinct names, got ${names.join(', ')}`);
	});

});
