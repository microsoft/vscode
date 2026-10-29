/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { StorageScope } from '../../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../test/common/workbenchTestServices.js';
import {
	BrowserDevicePresetManager,
	DEFAULT_BROWSER_DEVICE_PRESETS
} from '../../../electron-browser/features/browserEditorEmulationFeatures.js';

suite('Browser Editor Emulation - Custom Device Presets', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('built-in presets list is populated', () => {
		assert.strictEqual(DEFAULT_BROWSER_DEVICE_PRESETS.length, 4);
		assert.deepStrictEqual(DEFAULT_BROWSER_DEVICE_PRESETS.map(p => p.name), [
			'iPhone 15 Pro',
			'iPhone SE',
			'Pixel 8',
			'iPad Mini'
		]);
	});

	test('custom presets are empty initially and return only built-in presets in getAllPresets()', () => {
		const storageService = disposables.add(new TestStorageService());
		const configService = new TestConfigurationService();
		const manager = disposables.add(new BrowserDevicePresetManager(storageService, configService));

		assert.strictEqual(manager.getCustomPresets().length, 0);
		assert.strictEqual(manager.getAllPresets().length, 4);
	});

	test('addCustomPreset persists to profile storage and fires onDidChangeCustomPresets', () => {
		const storageService = disposables.add(new TestStorageService());
		const configService = new TestConfigurationService();
		const manager = disposables.add(new BrowserDevicePresetManager(storageService, configService));

		let changeCount = 0;
		disposables.add(manager.onDidChangeCustomPresets(() => changeCount++));

		const added = manager.addCustomPreset({
			name: 'iPhone Pro Max',
			width: 430,
			height: 932,
			deviceScaleFactor: 3,
			mobile: true,
		});

		assert.strictEqual(changeCount, 1);
		assert.strictEqual(added.name, 'iPhone Pro Max');
		assert.strictEqual(added.isCustom, true);
		assert.ok(added.id);
		assert.deepStrictEqual(added.device, {
			width: 430,
			height: 932,
			deviceScaleFactor: 3,
			mobile: true,
			userAgent: undefined,
		});

		assert.strictEqual(manager.getCustomPresets().length, 1);
		assert.strictEqual(manager.getAllPresets().length, 5);

		// Verify persisted in storage
		const raw = storageService.get(BrowserDevicePresetManager.STORAGE_KEY, StorageScope.PROFILE);
		assert.ok(raw);
		const parsed = JSON.parse(raw);
		assert.strictEqual(parsed.length, 1);
		assert.strictEqual(parsed[0].name, 'iPhone Pro Max');
		assert.strictEqual(parsed[0].width, 430);
		assert.strictEqual(parsed[0].height, 932);
		assert.strictEqual(parsed[0].deviceScaleFactor, 3);
		assert.strictEqual(parsed[0].mobile, true);
	});

	test('custom presets survive manager re-creation (restored from storage)', () => {
		const storageService = disposables.add(new TestStorageService());
		const configService = new TestConfigurationService();
		const manager1 = disposables.add(new BrowserDevicePresetManager(storageService, configService));

		manager1.addCustomPreset({
			name: 'Samsung Galaxy',
			width: 360,
			height: 780,
			deviceScaleFactor: 2,
			mobile: true,
		});
		manager1.addCustomPreset({
			name: 'Laptop Full HD',
			width: 1920,
			height: 1080,
			mobile: false,
		});

		// Create a new manager instance backed by the same storage service
		const manager2 = disposables.add(new BrowserDevicePresetManager(storageService, configService));
		const custom = manager2.getCustomPresets();
		assert.strictEqual(custom.length, 2);
		assert.strictEqual(custom[0].name, 'Samsung Galaxy');
		assert.strictEqual(custom[0].device?.width, 360);
		assert.strictEqual(custom[0].device?.height, 780);
		assert.strictEqual(custom[0].device?.deviceScaleFactor, 2);
		assert.strictEqual(custom[0].device?.mobile, true);

		assert.strictEqual(custom[1].name, 'Laptop Full HD');
		assert.strictEqual(custom[1].device?.width, 1920);
		assert.strictEqual(custom[1].device?.height, 1080);
		assert.strictEqual(custom[1].device?.mobile, false);

		assert.strictEqual(manager2.getAllPresets().length, 6);
	});

	test('updateCustomPreset updates properties and persists changes', () => {
		const storageService = disposables.add(new TestStorageService());
		const configService = new TestConfigurationService();
		const manager = disposables.add(new BrowserDevicePresetManager(storageService, configService));

		const added = manager.addCustomPreset({
			name: 'iPad Air',
			width: 820,
			height: 1180,
			mobile: true,
		});

		let changeCount = 0;
		disposables.add(manager.onDidChangeCustomPresets(() => changeCount++));

		const success = manager.updateCustomPreset(added.id!, {
			name: 'iPad Air 11-inch',
			width: 834,
			height: 1194,
			deviceScaleFactor: 2,
		});

		assert.strictEqual(success, true);
		assert.strictEqual(changeCount, 1);

		const updated = manager.getCustomPresets().find(p => p.id === added.id);
		assert.ok(updated);
		assert.strictEqual(updated.name, 'iPad Air 11-inch');
		assert.strictEqual(updated.device?.width, 834);
		assert.strictEqual(updated.device?.height, 1194);
		assert.strictEqual(updated.device?.deviceScaleFactor, 2);
		assert.strictEqual(updated.device?.mobile, true); // preserved
	});

	test('updateCustomPreset returns false for unknown id', () => {
		const storageService = disposables.add(new TestStorageService());
		const configService = new TestConfigurationService();
		const manager = disposables.add(new BrowserDevicePresetManager(storageService, configService));

		const success = manager.updateCustomPreset('unknown-id', { name: 'Nonexistent' });
		assert.strictEqual(success, false);
	});

	test('deleteCustomPreset removes preset and updates storage', () => {
		const storageService = disposables.add(new TestStorageService());
		const configService = new TestConfigurationService();
		const manager = disposables.add(new BrowserDevicePresetManager(storageService, configService));

		const added1 = manager.addCustomPreset({ name: 'Device A', width: 400, height: 800 });
		const added2 = manager.addCustomPreset({ name: 'Device B', width: 500, height: 900 });

		assert.strictEqual(manager.getCustomPresets().length, 2);

		let changeCount = 0;
		disposables.add(manager.onDidChangeCustomPresets(() => changeCount++));

		const deleted = manager.deleteCustomPreset(added1.id!);
		assert.strictEqual(deleted, true);
		assert.strictEqual(changeCount, 1);
		assert.strictEqual(manager.getCustomPresets().length, 1);
		assert.strictEqual(manager.getCustomPresets()[0].name, 'Device B');

		const deletedAgain = manager.deleteCustomPreset(added1.id!);
		assert.strictEqual(deletedAgain, false);
		assert.strictEqual(changeCount, 1);
	});

	test('merges presets from configuration setting', async () => {
		const storageService = disposables.add(new TestStorageService());
		const configService = new TestConfigurationService({
			'workbench.browser.customDevicePresets': [
				{ name: 'Configured Laptop', width: 1366, height: 768, mobile: false }
			]
		});
		const manager = disposables.add(new BrowserDevicePresetManager(storageService, configService));

		const custom = manager.getCustomPresets();
		assert.strictEqual(custom.length, 1);
		assert.strictEqual(custom[0].name, 'Configured Laptop');
		assert.strictEqual(custom[0].device?.width, 1366);
		assert.strictEqual(custom[0].device?.height, 768);

		let changeCount = 0;
		disposables.add(manager.onDidChangeCustomPresets(() => changeCount++));

		await configService.setUserConfiguration('workbench.browser.customDevicePresets', [
			{ name: 'Configured Laptop', width: 1366, height: 768, mobile: false },
			{ name: 'Configured Tablet', width: 800, height: 1280, mobile: true }
		]);

		assert.strictEqual(changeCount, 1);
		assert.strictEqual(manager.getCustomPresets().length, 2);
	});

	test('clamps invalid dimensions and DPR values', () => {
		const storageService = disposables.add(new TestStorageService());
		const configService = new TestConfigurationService();
		const manager = disposables.add(new BrowserDevicePresetManager(storageService, configService));

		const added = manager.addCustomPreset({
			name: '  Trimmed Device  ',
			width: -100, // below min
			height: 20000, // above max
			deviceScaleFactor: 50, // above max 8
		});

		assert.strictEqual(added.name, 'Trimmed Device');
		assert.strictEqual(added.device?.width, 1);
		assert.strictEqual(added.device?.height, 9999);
		assert.strictEqual(added.device?.deviceScaleFactor, 8);
	});
});
