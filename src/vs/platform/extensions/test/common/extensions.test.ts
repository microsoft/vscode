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
			getManifestCacheFileName(ExtensionType.System, 'zh-cn'),
			getManifestCacheFileName(ExtensionType.User, undefined),
			getManifestCacheFileName(ExtensionType.User, 'en'),
		], [
			'extensions.builtin.cache',
			'extensions.builtin.en.cache',
			'extensions.builtin.zh-cn.cache',
			'extensions.user.cache',
			'extensions.user.en.cache',
		]);
	});

	test('a language is matched independently of its casing', () => {
		assert.deepStrictEqual([
			getManifestCacheFileName(ExtensionType.System, 'zh-CN'),
			getManifestCacheFileName(ExtensionType.System, 'ZH-CN'),
		], [
			'extensions.builtin.zh-cn.cache',
			'extensions.builtin.zh-cn.cache',
		]);
	});

	test('a language that is not a well formed locale is not put in the name', () => {
		assert.deepStrictEqual([
			'../evil',
			'a/b\\c',
			'zh_CN',
			'x'.repeat(1000),
			'',
			'-en',
		].map(language => getManifestCacheFileName(ExtensionType.System, language)), [
			'extensions.builtin.cache',
			'extensions.builtin.cache',
			'extensions.builtin.cache',
			'extensions.builtin.cache',
			'extensions.builtin.cache',
			'extensions.builtin.cache',
		]);
	});

	test('generated names are recognized, and only for their own extension type', () => {
		const names = [undefined, 'en', 'zh-cn'].map(language => getManifestCacheFileName(ExtensionType.System, language));

		assert.deepStrictEqual([
			names.every(name => isManifestCacheFileName(name, ExtensionType.System, false)),
			names.some(name => isManifestCacheFileName(name, ExtensionType.User, false)),
		], [true, false]);
	});

	test('a differently cased name is only recognized when path casing is ignored', () => {
		const name = 'Extensions.User.EN.Cache';

		assert.deepStrictEqual([
			isManifestCacheFileName(name, ExtensionType.User, true),
			isManifestCacheFileName(name, ExtensionType.User, false),
		], [true, false]);
	});

	test('unrelated file names are not recognized', () => {
		assert.deepStrictEqual([
			'extensions.json',
			'extensions.builtin.cache',
			'extensions.user.en.cache.bak',
			'my.extensions.user.en.cache',
		].map(name => isManifestCacheFileName(name, ExtensionType.User, false)), [false, false, false, false]);
	});

});
