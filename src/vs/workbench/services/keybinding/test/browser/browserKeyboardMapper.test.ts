/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import 'vs/workbench/services/keybinding/browser/keyboardLayouts/en.darwin';
import 'vs/workbench/services/keybinding/browser/keyboardLayouts/de.darwin';
import { KeyboardLayoutContribution } from 'vs/workbench/services/keybinding/browser/keyboardLayouts/_.contribution';
import { BrowserKeyboardMapperFactoryBase } from 'vs/workbench/services/keybinding/browser/keyboardLayoutService';
import { KeymapInfo, IKeymapInfo } from 'vs/workbench/services/keybinding/common/keymapInfo';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { TestNotificationService } from 'vs/platform/notification/test/common/testNotificationService';
import { TestStorageService } from 'vs/workbench/test/common/workbenchTestServices';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

class TestKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
	constructor(configurationService: IConfigurationService, notificationService: INotificationService, storageService: IStorageService, commandService: ICommandService) {
		// super(notificationService, storageService, commandService);
		super(configurationService);

		const keymapInfos: IKeymapInfo[] = KeyboardLayoutContribution.INSTANCE.layoutInfos;
		this._keymapInfos.push(...keymapInfos.map(info => (new KeymapInfo(info.layout, info.secondaryLayouts, info.mapping, info.isUserKeyboardLayout))));
		this._mru = this._keymapInfos;
		this._initialized = true;
		this.setLayoutFromBrowserAPI();
		const usLayout = this.getUSStandardLayout();
		if (usLayout) {
			this.setActiveKeyMapping(usLayout.mapping);
		}
	}
}

suite('keyboard layout loader', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;
	let instance: TestKeyboardMapperFactory;

	setup(() => {
		instantiationService = new TestInstantiationService();
		const storageService = new TestStorageService();
		const notitifcationService = instantiationService.stub(INotificationService, new TestNotificationService());
		const configurationService = instantiationService.stub(IConfigurationService, new TestConfigurationService());
		const commandService = instantiationService.stub(ICommandService, {});

		ds.add(instantiationService);
		ds.add(storageService);

		instance = new TestKeyboardMapperFactory(configurationService, notitifcationService, storageService, commandService);
		ds.add(instance);
	});

	teardown(() => {
		instantiationService.dispose();
	});

	test('load default US keyboard layout', () => {
		assert.notStrictEqual(instance.activeKeyboardLayout, null);
	});

	test('isKeyMappingActive', () => {
		instance.setUSKeyboardLayout();
		assert.strictEqual(instance.isKeyMappingActive({
			KeyA: {
				value: 'a',
				valueIsDeadKey: false,
				withShift: 'A',
				withShiftIsDeadKey: false,
				withAltGr: 'å',
				withAltGrIsDeadKey: false,
				withShiftAltGr: 'Å',
				withShiftAltGrIsDeadKey: false
			}
		}), true);

		assert.strictEqual(instance.isKeyMappingActive({
			KeyA: {
				value: 'a',
				valueIsDeadKey: false,
				withShift: 'A',
				withShiftIsDeadKey: false,
				withAltGr: 'å',
				withAltGrIsDeadKey: false,
				withShiftAltGr: 'Å',
				withShiftAltGrIsDeadKey: false
			},
			KeyZ: {
				value: 'z',
				valueIsDeadKey: false,
				withShift: 'Z',
				withShiftIsDeadKey: false,
				withAltGr: 'Ω',
				withAltGrIsDeadKey: false,
				withShiftAltGr: '¸',
				withShiftAltGrIsDeadKey: false
			}
		}), true);

		assert.strictEqual(instance.isKeyMappingActive({
			KeyZ: {
				value: 'y',
				valueIsDeadKey: false,
				withShift: 'Y',
				withShiftIsDeadKey: false,
				withAltGr: '¥',
				withAltGrIsDeadKey: false,
				withShiftAltGr: 'Ÿ',
				withShiftAltGrIsDeadKey: false
			},
		}), false);

	});

	test('Switch keymapping', () => {
		instance.setActiveKeyMapping({
			KeyZ: {
				value: 'y',
				valueIsDeadKey: false,
				withShift: 'Y',
				withShiftIsDeadKey: false,
				withAltGr: '¥',
				withAltGrIsDeadKey: false,
				withShiftAltGr: 'Ÿ',
				withShiftAltGrIsDeadKey: false
			}
		});
		assert.strictEqual(!!instance.activeKeyboardLayout!.isUSStandard, false);
		assert.strictEqual(instance.isKeyMappingActive({
			KeyZ: {
				value: 'y',
				valueIsDeadKey: false,
				withShift: 'Y',
				withShiftIsDeadKey: false,
				withAltGr: '¥',
				withAltGrIsDeadKey: false,
				withShiftAltGr: 'Ÿ',
				withShiftAltGrIsDeadKey: false
			},
		}), true);

		instance.setUSKeyboardLayout();
		assert.strictEqual(instance.activeKeyboardLayout!.isUSStandard, true);
	});

	test('Switch keyboard layout info', () => {
		instance.setKeyboardLayout('com.apple.keylayout.German');
		assert.strictEqual(!!instance.activeKeyboardLayout!.isUSStandard, false);
		assert.strictEqual(instance.isKeyMappingActive({
			KeyZ: {
				value: 'y',
				valueIsDeadKey: false,
				withShift: 'Y',
				withShiftIsDeadKey: false,
				withAltGr: '¥',
				withAltGrIsDeadKey: false,
				withShiftAltGr: 'Ÿ',
				withShiftAltGrIsDeadKey: false
			},
		}), true);

		instance.setUSKeyboardLayout();
		assert.strictEqual(instance.activeKeyboardLayout!.isUSStandard, true);
	});
});
