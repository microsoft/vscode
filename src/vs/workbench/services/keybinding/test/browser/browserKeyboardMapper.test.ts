/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import '../../browser/keyboardLayouts/en.darwin.js';
import '../../browser/keyboardLayouts/de.darwin.js';
import '../../browser/keyboardLayouts/en.win.js';
import '../../browser/keyboardLayouts/jp.win.js';
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
import { IKeyboardMapping, IWindowsKeyboardLayoutInfo } from '../../../../../platform/keyboardLayout/common/keyboardLayout.js';

type LayoutPlatform = 'mac' | 'windows';

function getLayoutPlatform(info: IKeymapInfo): LayoutPlatform {
	return (info.layout as IWindowsKeyboardLayoutInfo).name ? 'windows' : 'mac';
}

class TestKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
	constructor(configurationService: IConfigurationService, notificationService: INotificationService, storageService: IStorageService, commandService: ICommandService, layoutPlatform: LayoutPlatform = 'mac') {
		// super(notificationService, storageService, commandService);
		super(configurationService);

		const keymapInfos: IKeymapInfo[] = KeyboardLayoutContribution.INSTANCE.layoutInfos.filter(info => getLayoutPlatform(info) === layoutPlatform);
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

/**
 * Builds a mapping shaped like the one `navigator.keyboard.getLayoutMap()` yields (only `value` is known).
 */
function toBrowserLayoutMap(values: { [code: string]: string }): IKeyboardMapping {
	const result: IKeyboardMapping = {};
	for (const code in values) {
		result[code] = { value: values[code], withShift: '', withAltGr: '', withShiftAltGr: '' };
	}
	return result;
}

const LETTERS_AND_DIGITS: { [code: string]: string } = {
	KeyA: 'a', KeyB: 'b', KeyC: 'c', KeyD: 'd', KeyE: 'e', KeyF: 'f', KeyG: 'g', KeyH: 'h', KeyI: 'i', KeyJ: 'j', KeyK: 'k', KeyL: 'l', KeyM: 'm',
	KeyN: 'n', KeyO: 'o', KeyP: 'p', KeyQ: 'q', KeyR: 'r', KeyS: 's', KeyT: 't', KeyU: 'u', KeyV: 'v', KeyW: 'w', KeyX: 'x', KeyY: 'y', KeyZ: 'z',
	Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5', Digit6: '6', Digit7: '7', Digit8: '8', Digit9: '9', Digit0: '0',
	Comma: ',', Period: '.', Slash: '/',
};

// What Chromium on Windows reports for the Japanese layout (KBDJPN, 106/109 keys). Chromium special-cases
// HKL 0x04110411: IntlYen is reported as the yen sign and Backquote as the hankaku/zenkaku label.
const WIN_JAPANESE_BROWSER_LAYOUT_MAP = toBrowserLayoutMap({
	...LETTERS_AND_DIGITS,
	Backquote: '\u534a\u89d2/\u5168\u89d2',
	Minus: '-',
	Equal: '^',
	IntlYen: '\u00a5',
	BracketLeft: '@',
	BracketRight: '[',
	Backslash: ']',
	Semicolon: ';',
	Quote: ':',
	IntlRo: '\\',
});

const WIN_US_BROWSER_LAYOUT_MAP = toBrowserLayoutMap({
	...LETTERS_AND_DIGITS,
	Backquote: '`',
	Minus: '-',
	Equal: '=',
	BracketLeft: '[',
	BracketRight: ']',
	Backslash: '\\',
	Semicolon: ';',
	Quote: '\'',
	IntlBackslash: '\\',
});

suite('keyboard layout loader (Windows layouts)', () => {
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

		instance = new TestKeyboardMapperFactory(configurationService, notitifcationService, storageService, commandService, 'windows');
		ds.add(instance);
	});

	teardown(() => {
		instantiationService.dispose();
	});

	function layoutName(): string | undefined {
		return (instance.activeKeyboardLayout as IWindowsKeyboardLayoutInfo | null)?.name;
	}

	test('detects the Japanese (JIS) layout from the browser layout map', () => {
		assert.strictEqual((instance.getMatchedKeymapInfo(WIN_JAPANESE_BROWSER_LAYOUT_MAP)!.result.layout as IWindowsKeyboardLayoutInfo).name, '00000411');

		instance.setActiveKeyMapping(WIN_JAPANESE_BROWSER_LAYOUT_MAP);
		assert.strictEqual(layoutName(), '00000411');
		assert.strictEqual(!!instance.activeKeyboardLayout!.isUSStandard, false);
	});

	test('stays on the Japanese layout when the same browser layout map is reported again', () => {
		instance.setActiveKeyMapping(WIN_JAPANESE_BROWSER_LAYOUT_MAP);
		// Chromium's special values for IntlYen and Backquote never match exactly, so the map is never "active"
		// and gets re-applied (e.g. on 'layoutchange'). That must not switch to another layout.
		assert.strictEqual(instance.isKeyMappingActive(WIN_JAPANESE_BROWSER_LAYOUT_MAP), false);
		instance.setActiveKeyMapping(WIN_JAPANESE_BROWSER_LAYOUT_MAP);
		assert.strictEqual(layoutName(), '00000411');
	});

	test('detects the Japanese (JIS) layout from a single key event (no navigator.keyboard)', () => {
		// Browsers without navigator.keyboard (e.g. Firefox) match the code and key of one keydown event.
		assert.strictEqual((instance.getMatchedKeymapInfo(toBrowserLayoutMap({ BracketLeft: '@' }))!.result.layout as IWindowsKeyboardLayoutInfo).name, '00000411');
		assert.strictEqual((instance.getMatchedKeymapInfo(toBrowserLayoutMap({ BracketLeft: '[' }))!.result.layout as IWindowsKeyboardLayoutInfo).name, '00000409');
	});

	test('keeps US when the browser layout map is US, even with the Japanese IME placeholders', () => {
		assert.strictEqual((instance.getMatchedKeymapInfo(WIN_US_BROWSER_LAYOUT_MAP)!.result.layout as IWindowsKeyboardLayoutInfo).name, '00000409');

		// Japanese IME on a 101/102-key keyboard: the HKL is still 0x04110411, so Chromium can report its special values.
		const usKeyboardWithJapaneseIme = toBrowserLayoutMap({
			...LETTERS_AND_DIGITS,
			Backquote: '\u534a\u89d2/\u5168\u89d2',
			Minus: '-',
			Equal: '=',
			IntlYen: '\u00a5',
			BracketLeft: '[',
			BracketRight: ']',
			Backslash: '\\',
			Semicolon: ';',
			Quote: '\'',
			IntlBackslash: '\\',
		});
		assert.strictEqual((instance.getMatchedKeymapInfo(usKeyboardWithJapaneseIme)!.result.layout as IWindowsKeyboardLayoutInfo).name, '00000409');
	});

	test('keyboard.layout can select the Japanese layout by name', () => {
		instance.setKeyboardLayout('00000411');
		assert.strictEqual(layoutName(), '00000411');
		// These are the native-keymap values stored in jp.win.ts (Chromium reports the yen sign for IntlYen instead).
		assert.strictEqual(instance.isKeyMappingActive(toBrowserLayoutMap({ IntlRo: '\\', IntlYen: '\\', Equal: '^', BracketLeft: '@' })), true);
	});
});
