/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { EXTENSION_IDENTIFIER_PATTERN } from '../../common/extensionManagement.js';
import { ExtensionKey } from '../../common/extensionManagementUtil.js';
import { TargetPlatform } from '../../../extensions/common/extensions.js';

suite('Extension Identifier Pattern', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('extension identifier pattern', () => {
		const regEx = new RegExp(EXTENSION_IDENTIFIER_PATTERN);
		assert.strictEqual(true, regEx.test('publisher.name'));
		assert.strictEqual(true, regEx.test('publiSher.name'));
		assert.strictEqual(true, regEx.test('publisher.Name'));
		assert.strictEqual(true, regEx.test('PUBLISHER.NAME'));
		assert.strictEqual(true, regEx.test('PUBLISHEr.NAMe'));
		assert.strictEqual(true, regEx.test('PUBLISHEr.N-AMe'));
		assert.strictEqual(true, regEx.test('PUB-LISHEr.NAMe'));
		assert.strictEqual(true, regEx.test('PUB-LISHEr.N-AMe'));
		assert.strictEqual(true, regEx.test('PUBLISH12Er90.N-A54Me123'));
		assert.strictEqual(true, regEx.test('111PUBLISH12Er90.N-1111A54Me123'));
		assert.strictEqual(false, regEx.test('publishername'));
		assert.strictEqual(false, regEx.test('-publisher.name'));
		assert.strictEqual(false, regEx.test('publisher.-name'));
		assert.strictEqual(false, regEx.test('-publisher.-name'));
		assert.strictEqual(false, regEx.test('publ_isher.name'));
		assert.strictEqual(false, regEx.test('publisher._name'));
	});

	test('extension key', () => {
		assert.strictEqual(new ExtensionKey({ id: 'pub.extension-name' }, '1.0.1').toString(), 'pub.extension-name-1.0.1');
		assert.strictEqual(new ExtensionKey({ id: 'pub.extension-name' }, '1.0.1', TargetPlatform.UNDEFINED).toString(), 'pub.extension-name-1.0.1');
		assert.strictEqual(new ExtensionKey({ id: 'pub.extension-name' }, '1.0.1', TargetPlatform.WIN32_X64).toString(), `pub.extension-name-1.0.1-${TargetPlatform.WIN32_X64}`);
	});

	test('extension key parsing', () => {
		assert.strictEqual(ExtensionKey.parse('pub.extension-name'), null);
		assert.strictEqual(ExtensionKey.parse('pub.extension-name@1.2.3'), null);
		assert.strictEqual(ExtensionKey.parse('pub.extension-name-1.0.1')?.toString(), 'pub.extension-name-1.0.1');
		assert.strictEqual(ExtensionKey.parse('pub.extension-name-1.0.1-win32-x64')?.toString(), 'pub.extension-name-1.0.1-win32-x64');
	});
});
