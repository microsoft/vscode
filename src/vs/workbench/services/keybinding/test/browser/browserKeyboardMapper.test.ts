/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import '../../browser/keyboardLayouts/en.darwin.js';
import '../../browser/keyboardLayouts/de.darwin.js';
import { KeyboardLayoutContribution } from '../../browser/keyboardLayouts/_.contribution.js';
import { BrowserKeyboardMapperFactoryBase } from '../../browser/keyboardLayoutService.js';
import { KeymapInfo, IKeymapInfo } from '../../common/keymapInfo.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getKeyboardLayoutId } from '../../../../../platform/keyboardLayout/common/keyboardLayout.js';
import { CachedKeyboardMapper } from '../../../../../platform/keyboardLayout/common/keyboardMapper.js';

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

class TestLoadingKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
	constructor(configurationService: IConfigurationService) {
		super(configurationService);
	}

	loadKeymapInfos(): void {
		this._onKeymapInfosLoaded(KeyboardLayoutContribution.INSTANCE.layoutInfos);
	}
}

suite('keyboard layout loader with keyboard.layout setting', () => {
	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	function createFactory(layout: string): { instance: TestLoadingKeyboardMapperFactory; fired: () => number } {
		const instance = ds.add(new TestLoadingKeyboardMapperFactory(new TestConfigurationService({ 'keyboard.layout': layout })));
		let fired = 0;
		ds.add(instance.onDidChangeKeyboardMapper(() => fired++));
		return { instance, fired: () => fired };
	}

	test('applies the configured keyboard layout once layouts are loaded', () => {
		const { instance, fired } = createFactory('com.apple.keylayout.German');
		assert.strictEqual(instance.activeKeyboardLayout, null);

		instance.loadKeymapInfos();
		assert.strictEqual(getKeyboardLayoutId(instance.activeKeyboardLayout!), 'com.apple.keylayout.German');
		assert.strictEqual(fired(), 1);
		assert.ok(instance.getKeyboardMapper() instanceof CachedKeyboardMapper);
	});

	test('applies the configured keyboard layout when it is the first loaded layout', () => {
		const firstLayoutId = getKeyboardLayoutId(KeyboardLayoutContribution.INSTANCE.layoutInfos[0].layout);
		const { instance, fired } = createFactory(firstLayoutId);

		instance.loadKeymapInfos();
		assert.strictEqual(getKeyboardLayoutId(instance.activeKeyboardLayout!), firstLayoutId);
		assert.strictEqual(fired(), 1);
		assert.ok(instance.getKeyboardMapper() instanceof CachedKeyboardMapper);
	});

	test('setKeyboardLayout reports whether the layout was found', () => {
		const { instance } = createFactory('autodetect');
		instance.loadKeymapInfos();

		assert.strictEqual(instance.setKeyboardLayout('com.example.unknown'), false);
		assert.strictEqual(instance.setKeyboardLayout('com.apple.keylayout.German'), true);
		assert.strictEqual(getKeyboardLayoutId(instance.activeKeyboardLayout!), 'com.apple.keylayout.German');
	});
});
