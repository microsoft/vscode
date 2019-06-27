/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import 'vs/workbench/services/keybinding/browser/keyboardLayouts/en.darwin'; // 15%
import 'vs/workbench/services/keybinding/browser/keyboardLayouts/de.darwin';
import { KeyboardLayoutContribution } from 'vs/workbench/services/keybinding/browser/keyboardLayouts/_.contribution';
import { BrowserKeyboardMapperFactoryBase } from '../browser/keymapService';
import { KeymapInfo, IKeymapInfo } from '../common/keymapInfo';

class TestKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
	public static readonly INSTANCE = new TestKeyboardMapperFactory();

	constructor() {
		super();

		let keymapInfos: IKeymapInfo[] = KeyboardLayoutContribution.INSTANCE.layoutInfos;
		this._keymapInfos.push(...keymapInfos.map(info => (new KeymapInfo(info.layout, info.secondaryLayouts, info.mapping, info.isUserKeyboardLayout))));
		this._mru = this._keymapInfos;
		this._initialized = true;
		this.onKeyboardLayoutChanged();
	}
}


suite('keyboard layout loader', () => {

	test('load default US keyboard layout', () => {
		assert.notEqual(TestKeyboardMapperFactory.INSTANCE.activeKeyboardLayout, null);
		assert.equal(TestKeyboardMapperFactory.INSTANCE.activeKeyboardLayout!.isUSStandard, true);
	});

	test('isKeyMappingActive', () => {
		assert.equal(TestKeyboardMapperFactory.INSTANCE.isKeyMappingActive({
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

		assert.equal(TestKeyboardMapperFactory.INSTANCE.isKeyMappingActive({
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

		assert.equal(TestKeyboardMapperFactory.INSTANCE.isKeyMappingActive({
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
		TestKeyboardMapperFactory.INSTANCE.setActiveKeyMapping({
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
		assert.equal(!!TestKeyboardMapperFactory.INSTANCE.activeKeyboardLayout!.isUSStandard, false);
		assert.equal(TestKeyboardMapperFactory.INSTANCE.isKeyMappingActive({
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

		TestKeyboardMapperFactory.INSTANCE.setUSKeyboardLayout();
		assert.equal(TestKeyboardMapperFactory.INSTANCE.activeKeyboardLayout!.isUSStandard, true);
	});

	test('Switch keyboard layout info', () => {
		TestKeyboardMapperFactory.INSTANCE.setKeyboardLayout('com.apple.keylayout.German');
		assert.equal(!!TestKeyboardMapperFactory.INSTANCE.activeKeyboardLayout!.isUSStandard, false);
		assert.equal(TestKeyboardMapperFactory.INSTANCE.isKeyMappingActive({
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

		TestKeyboardMapperFactory.INSTANCE.setUSKeyboardLayout();
		assert.equal(TestKeyboardMapperFactory.INSTANCE.activeKeyboardLayout!.isUSStandard, true);
	});
});