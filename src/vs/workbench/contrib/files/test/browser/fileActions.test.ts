/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../../platform/files/common/files.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService } from '../../../../test/common/workbenchTestServices.js';
import { cutFileHandler, incrementFileName, pasteFileHandler } from '../../browser/fileActions.js';
import { IExplorerService } from '../../browser/files.js';
import { ExplorerItem } from '../../common/explorerModel.js';

suite('Files - Paste', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('cut reports an existing destination without claiming the source was deleted (#206471)', async () => {
		const configurationService = new TestConfigurationService({ explorer: { incrementalNaming: 'simple' } });
		const instantiationService = workbenchInstantiationService({ configurationService: () => configurationService }, disposables);
		const fileService = instantiationService.get(IFileService);
		const clipboardService = new TestClipboardService();
		instantiationService.stub(IClipboardService, clipboardService);
		const notification = instantiationService.spy(INotificationService, 'error');

		const source = new ExplorerItem(URI.file('/workspace/some-file'), fileService, configurationService, NullFilesConfigurationService, undefined, false);
		const destination = new ExplorerItem(URI.file('/workspace/some-folder'), fileService, configurationService, NullFilesConfigurationService, undefined, true);
		const error = new FileOperationError('The target already exists at the destination.', FileOperationResult.FILE_MOVE_CONFLICT);
		let context = [source];
		instantiationService.stub(IExplorerService, {
			getContext: () => context,
			getEditable: () => undefined,
			setToCopy: async items => {
				await clipboardService.writeResources(items.map(item => item.resource));
			},
			applyBulkEdit: async () => { throw error; }
		});

		await instantiationService.invokeFunction(cutFileHandler);
		context = [destination];
		await instantiationService.invokeFunction(pasteFileHandler);

		assert.deepStrictEqual(notification.args, [[error.message]]);
	});
});

suite('Files - Increment file name simple', () => {

	test('Increment file name without any version', function () {
		const name = 'test.js';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, 'test copy.js');
	});

	test('Increment file name with suffix version', function () {
		const name = 'test copy.js';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, 'test copy 2.js');
	});

	test('Increment file name with suffix version with leading zeros', function () {
		const name = 'test copy 005.js';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, 'test copy 6.js');
	});

	test('Increment file name with suffix version, too big number', function () {
		const name = 'test copy 9007199254740992.js';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, 'test copy 9007199254740992 copy.js');
	});

	test('Increment file name with just version in name', function () {
		const name = 'copy.js';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, 'copy copy.js');
	});

	test('Increment file name with just version in name, v2', function () {
		const name = 'copy 2.js';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, 'copy 2 copy.js');
	});

	test('Increment file name without any extension or version', function () {
		const name = 'test';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, 'test copy');
	});

	test('Increment file name without any extension or version, trailing dot', function () {
		const name = 'test.';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, 'test copy.');
	});

	test('Increment file name without any extension or version, leading dot', function () {
		const name = '.test';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, '.test copy');
	});

	test('Increment file name without any extension or version, leading dot v2', function () {
		const name = '..test';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, '. copy.test');
	});

	test('Increment file name without any extension but with suffix version', function () {
		const name = 'test copy 5';
		const result = incrementFileName(name, false, 'simple');
		assert.strictEqual(result, 'test copy 6');
	});

	test('Increment folder name without any version', function () {
		const name = 'test';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'test copy');
	});

	test('Increment folder name with suffix version', function () {
		const name = 'test copy';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'test copy 2');
	});

	test('Increment folder name with suffix version, leading zeros', function () {
		const name = 'test copy 005';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'test copy 6');
	});

	test('Increment folder name with suffix version, too big number', function () {
		const name = 'test copy 9007199254740992';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'test copy 9007199254740992 copy');
	});

	test('Increment folder name with just version in name', function () {
		const name = 'copy';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'copy copy');
	});

	test('Increment folder name with just version in name, v2', function () {
		const name = 'copy 2';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'copy 2 copy');
	});

	test('Increment folder name "with extension" but without any version', function () {
		const name = 'test.js';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'test.js copy');
	});

	test('Increment folder name "with extension" and with suffix version', function () {
		const name = 'test.js copy 5';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'test.js copy 6');
	});

	test('Increment file/folder name with suffix version, special case 1', function () {
		const name = 'test copy 0';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'test copy');
	});

	test('Increment file/folder name with suffix version, special case 2', function () {
		const name = 'test copy 1';
		const result = incrementFileName(name, true, 'simple');
		assert.strictEqual(result, 'test copy 2');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});

suite('Files - Increment file name smart', () => {

	test('Increment file name without any version', function () {
		const name = 'test.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'test.1.js');
	});

	test('Increment folder name without any version', function () {
		const name = 'test';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, 'test.1');
	});

	test('Increment file name with suffix version', function () {
		const name = 'test.1.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'test.2.js');
	});

	test('Increment file name with suffix version with trailing zeros', function () {
		const name = 'test.001.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'test.002.js');
	});

	test('Increment file name with suffix version with trailing zeros, changing length', function () {
		const name = 'test.009.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'test.010.js');
	});

	test('Increment file name with suffix version with `-` as separator', function () {
		const name = 'test-1.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'test-2.js');
	});

	test('Increment file name with suffix version with `-` as separator, trailing zeros', function () {
		const name = 'test-001.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'test-002.js');
	});

	test('Increment file name with suffix version with `-` as separator, trailing zeros, changnig length', function () {
		const name = 'test-099.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'test-100.js');
	});

	test('Increment file name with suffix version with `_` as separator', function () {
		const name = 'test_1.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'test_2.js');
	});

	test('Increment folder name with suffix version', function () {
		const name = 'test.1';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, 'test.2');
	});

	test('Increment folder name with suffix version, trailing zeros', function () {
		const name = 'test.001';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, 'test.002');
	});

	test('Increment folder name with suffix version with `-` as separator', function () {
		const name = 'test-1';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, 'test-2');
	});

	test('Increment folder name with suffix version with `_` as separator', function () {
		const name = 'test_1';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, 'test_2');
	});

	test('Increment file name with suffix version, too big number', function () {
		const name = 'test.9007199254740992.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'test.9007199254740992.1.js');
	});

	test('Increment folder name with suffix version, too big number', function () {
		const name = 'test.9007199254740992';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, 'test.9007199254740992.1');
	});

	test('Increment file name with prefix version', function () {
		const name = '1.test.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, '2.test.js');
	});

	test('Increment file name with just version in name', function () {
		const name = '1.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, '2.js');
	});

	test('Increment file name with just version in name, too big number', function () {
		const name = '9007199254740992.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, '9007199254740992.1.js');
	});

	test('Increment file name with prefix version, trailing zeros', function () {
		const name = '001.test.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, '002.test.js');
	});

	test('Increment file name with prefix version with `-` as separator', function () {
		const name = '1-test.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, '2-test.js');
	});

	test('Increment file name with prefix version with `_` as separator', function () {
		const name = '1_test.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, '2_test.js');
	});

	test('Increment file name with prefix version, too big number', function () {
		const name = '9007199254740992.test.js';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, '9007199254740992.test.1.js');
	});

	test('Increment file name with just version and no extension', function () {
		const name = '001004';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, '001005');
	});

	test('Increment file name with just version and no extension, too big number', function () {
		const name = '9007199254740992';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, '9007199254740992.1');
	});

	test('Increment file name with no extension and no version', function () {
		const name = 'file';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'file1');
	});

	test('Increment file name with no extension', function () {
		const name = 'file1';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'file2');
	});

	test('Increment file name with no extension, too big number', function () {
		const name = 'file9007199254740992';
		const result = incrementFileName(name, false, 'smart');
		assert.strictEqual(result, 'file9007199254740992.1');
	});

	test('Increment folder name with prefix version', function () {
		const name = '1.test';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, '2.test');
	});

	test('Increment folder name with prefix version, too big number', function () {
		const name = '9007199254740992.test';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, '9007199254740992.test.1');
	});

	test('Increment folder name with prefix version, trailing zeros', function () {
		const name = '001.test';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, '002.test');
	});

	test('Increment folder name with prefix version  with `-` as separator', function () {
		const name = '1-test';
		const result = incrementFileName(name, true, 'smart');
		assert.strictEqual(result, '2-test');
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
