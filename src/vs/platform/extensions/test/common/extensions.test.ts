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
			getManifestCacheFileName(ExtensionType.System, 'zh-CN'),
			getManifestCacheFileName(ExtensionType.User, undefined),
			getManifestCacheFileName(ExtensionType.User, 'pt-br'),
		], [
			'extensions.builtin.cache',
			'extensions.builtin.en.cache',
			'extensions.builtin.zh-cn.cache',
			'extensions.user.cache',
			'extensions.user.pt-br.cache',
		]);
	});

	test('language is reduced to characters that are safe in a file name', () => {
		assert.deepStrictEqual([
			getManifestCacheFileName(ExtensionType.System, '../evil'),
			getManifestCacheFileName(ExtensionType.System, 'a/b\\c'),
		], [
			'extensions.builtin.---evil.cache',
			'extensions.builtin.a-b-c.cache',
		]);
	});

});
